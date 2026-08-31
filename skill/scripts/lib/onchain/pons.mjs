import { stripSolidityComments } from "./contract-risk.mjs";
import { addressTopic, decodedParams, eventForToken, eventsNamed, findDecodedArg, isAddress, sameId } from "./evm.mjs";

// keccak256("PoolGraduated(address,uint256,uint256,uint256)"), the launch manager's
// signal that a graduated token's pool exists and its position was locked. The token
// is the first indexed argument, so topic0 + topic1 finds the exact transaction.
const POOL_GRADUATED_TOPIC = "0x0a44ef75df69c534f43cd6c1aa3ef8983065fe5fe79ef9e79f6494e6f258c259";

export function createPonsAnalyzer({ blockscout, sanitizeText }) {
  async function findLaunchTx(ca, deployer, launchFactory, addressData) {
    const creationTxHash = addressData?.creation_transaction_hash || null;
    if (creationTxHash) {
      const logsResult = await blockscout.transactionLogs(creationTxHash);
      if (logsResult.ok) {
        const logs = logsResult.data?.items || [];
        if (eventForToken(logs, "TokenLaunched", ca)) return { hash: creationTxHash, logs, via: "creation_tx" };
      }
    }
    if (!isAddress(deployer)) return null;

    const isCandidate = (transaction) =>
      transaction?.hash &&
      ((isAddress(launchFactory) && transaction?.to?.hash?.toLowerCase() === launchFactory.toLowerCase()) ||
        /launch/i.test(String(transaction?.method || "")));

    let pageParams = null;
    let inspected = 0;
    let pagesScanned = 0;
    for (let page = 0; page < 4; page += 1) {
      const query = pageParams
        ? "?" + new URLSearchParams(Object.entries(pageParams).filter(([, value]) => value !== null && value !== undefined))
        : "";
      const transactionsResult = await blockscout.addressTransactions(deployer, query);
      if (!transactionsResult.ok) break;
      pagesScanned += 1;
      for (const transaction of (transactionsResult.data?.items || []).filter(isCandidate)) {
        if (inspected >= 20) break;
        inspected += 1;
        const logsResult = await blockscout.transactionLogs(transaction.hash);
        if (!logsResult.ok) continue;
        const logs = logsResult.data?.items || [];
        if (eventForToken(logs, "TokenLaunched", ca)) {
          return { hash: transaction.hash, logs, via: "deployer_tx_scan", pagesScanned, txsInspected: inspected };
        }
      }
      pageParams = transactionsResult.data?.next_page_params;
      if (!pageParams || inspected >= 20) break;
    }
    return null;
  }

  async function inspectLocker(positionManager, positionId) {
    if (!positionId || !isAddress(positionManager)) {
      return { nftOwner: null, lockerContract: null, lockerRisk: null };
    }
    const nftResult = await blockscout.nftInstance(positionManager, positionId);
    const nftOwner = nftResult.ok
      ? {
          owner: nftResult.data?.owner?.hash || null,
          ownerName: sanitizeText(nftResult.data?.owner?.name, "pons.nftOwner.ownerName", 80),
          ownerVerified: nftResult.data?.owner?.is_verified || false,
        }
      : { error: nftResult.error || nftResult.status };

    let lockerContract = null;
    let lockerRisk = null;
    if (isAddress(nftOwner.owner)) {
      const lockerResult = await blockscout.contract(nftOwner.owner);
      if (lockerResult.ok) {
        const source = lockerResult.data?.source_code || "";
        const code = stripSolidityComments(source);
        lockerContract = {
          address: nftOwner.owner,
          name: sanitizeText(lockerResult.data?.name, "pons.lockerContract.name", 80),
          isVerified: lockerResult.data?.is_verified,
          owner: findDecodedArg(lockerResult.data?.decoded_constructor_args || [], "initialOwner"),
        };
        const exitChecks = [
          ["exit_function", /function\s+(withdraw|unlock|release|rescue|emergency)\w*\s*\(/i],
          ["decrease_liquidity", /decreaseLiquidity|burnPosition|\bmodifyLiquidit(y|ies)\s*\(/i],
          [
            "position_transfer_out",
            /\.(safe)?[Tt]ransferFrom\s*\(\s*address\s*\(\s*this\s*\)|IERC721\s*\([^)]*\)\s*\.\s*(safe)?[Tt]ransfer/,
          ],
          ["grants_nft_approval", /setApprovalForAll\s*\(|IERC721\s*\([^)]*\)\s*\.\s*approve\s*\(/i],
          ["arbitrary_call", /delegatecall|\.call\s*\{|function\s+execute\s*\(/i],
        ];
        const exitSurfaces = exitChecks.filter(([, pattern]) => pattern.test(code)).map(([name]) => name);
        lockerRisk = {
          sourceAvailable: Boolean(source),
          hasWithdrawOrUnlock: exitSurfaces.length > 0,
          exitSurfaces,
          hasCollectFees: /function\s+collectFees\s*\(/.test(code),
          hasOwnerFeeControl: /function\s+set(FeeRedirect|FeeCollector|ProtocolFee\w*|Fee\w*)\s*\([^)]*\)[^{]*onlyOwner/i.test(
            code
          ),
          saysPermanentCustody: /permanent|Permanently holds/i.test(source),
          note:
            "exitSurfaces lists which patterns matched. Empty means the verified source exposes no way to move the position out or cut the liquidity. sourceAvailable=false means nothing was checked.",
        };
      } else {
        lockerContract = { address: nftOwner.owner, error: lockerResult.errorKind || lockerResult.status };
      }
    }
    return { nftOwner, lockerContract, lockerRisk };
  }

  // Pull pool, position, locker and locked-supply evidence out of one transaction's
  // logs. Every launchpad generation emits the same events; they differ only in
  // which transaction carries them, so the reading is shared.
  function readPoolEvidence(ca, logs) {
    const poolGraduated = eventForToken(logs, "PoolGraduated", ca);
    const positionLocked = eventForToken(logs, "PositionLocked", ca);
    const poolRegistered = eventForToken(logs, "PoolRegistered", ca);
    const permanentlyLocked = eventForToken(logs, "GraduationTokensPermanentlyLocked", ca);
    const supplyLocked = eventForToken(logs, "TokenSupplyLocked", ca);
    const initialize =
      eventsNamed(logs, "Initialize").find((log) => {
        const parameters = decodedParams(log);
        return [parameters.currency0, parameters.currency1].some(
          (currency) => isAddress(currency) && currency.toLowerCase() === ca.toLowerCase()
        );
      }) || null;

    const graduated = decodedParams(poolGraduated);
    const locked = decodedParams(positionLocked);
    const registered = decodedParams(poolRegistered);
    const initialized = decodedParams(initialize);
    const positionId = graduated.positionId || locked.tokenId || null;
    const poolId = registered.poolId || initialized.id || null;
    // On Uniswap v4 the position lives inside the singleton PoolManager, so the only
    // pointer back to the manager that minted it is the sender of the ModifyLiquidity
    // whose salt is the position id.
    const modify =
      eventsNamed(logs, "ModifyLiquidity").find((log) => {
        const parameters = decodedParams(log);
        return (
          sameId(parameters.salt, positionId) &&
          (!poolId || String(parameters.id || "").toLowerCase() === String(poolId).toLowerCase())
        );
      }) || null;

    return {
      poolId,
      positionId,
      positionManager: decodedParams(modify).sender || null,
      hooks: initialized.hooks || null,
      quoteToken: registered.quoteToken || null,
      permanentlyLockedAmount: permanentlyLocked ? decodedParams(permanentlyLocked).amount : null,
      supplyLockedAmount: supplyLocked ? decodedParams(supplyLocked).amount : null,
    };
  }

  // Pons V2 graduation is not atomic. CurveCompleted only sweeps the curve's proceeds
  // to the launch manager; the Uniswap v4 pool is initialized and its position locked
  // in a separate, later transaction. Reading the CurveCompleted transaction alone
  // finds no pool, no position and no lock, which reports a correctly locked token as
  // unverified. PoolGraduated indexes the token, so one topic lookup lands on the
  // transaction that actually holds the evidence, whichever transaction that is.
  async function findGraduationTxByTopic(ca) {
    if (typeof blockscout.logsByTopic !== "function") return null;
    const topic = addressTopic(ca);
    if (!topic) return null;
    const result = await blockscout.logsByTopic(POOL_GRADUATED_TOPIC, topic);
    if (!result.ok || !Array.isArray(result.data?.result)) return null;
    const hashes = result.data.result.map((row) => row?.transactionHash).filter(Boolean);
    return hashes[0] || null;
  }

  async function traceGraduation(ca, curve) {
    const poolGraduatedTx = await findGraduationTxByTopic(ca);
    if (poolGraduatedTx) {
      const logsResult = await blockscout.transactionLogs(poolGraduatedTx);
      if (logsResult.ok) {
        return {
          status: "graduated",
          curve,
          graduationTx: poolGraduatedTx,
          poolEvidenceFrom: "pool_graduated_event",
          ...readPoolEvidence(ca, logsResult.data?.items || []),
        };
      }
    }

    const maxLogPages = 3;
    let query = "";
    let completed = null;
    let pagesScanned = 0;
    let morePages = false;
    while (pagesScanned < maxLogPages) {
      const logsResult = await blockscout.addressLogs(curve, query);
      if (!logsResult.ok) {
        if (pagesScanned === 0) {
          return { status: "curve_logs_unavailable", curve, detail: logsResult.errorKind || logsResult.status };
        }
        break;
      }
      pagesScanned += 1;
      const items = logsResult.data?.items || [];
      completed = eventsNamed(items, "CurveCompleted")[0] || null;
      if (completed) break;
      const next = logsResult.data?.next_page_params;
      morePages = Boolean(next);
      if (!next) break;
      query = "?" + new URLSearchParams(next).toString();
    }
    if (!completed) {
      return {
        status: "not_graduated",
        curve,
        pagesScanned,
        morePages,
        note:
          "No CurveCompleted event on the bonding curve. The token still trades on the curve: the launchpad has not created a Uniswap pool, so there is no LP position and nothing to lock. If morePages is true the scan was bounded and the event could be older.",
      };
    }

    const graduationTxHash = completed.transaction_hash || completed.tx_hash || null;
    if (!graduationTxHash) return { status: "graduation_tx_unknown", curve };
    const graduationResult = await blockscout.transactionLogs(graduationTxHash);
    if (!graduationResult.ok) {
      return {
        status: "graduation_logs_unavailable",
        curve,
        graduationTx: graduationTxHash,
        detail: graduationResult.errorKind,
      };
    }
    // Older launchpad generations do graduate atomically, so the CurveCompleted
    // transaction can still carry the pool evidence. Anything missing here stays
    // null and surfaces as an unknown_* poolMatch rather than a false lock claim.
    return {
      status: "graduated",
      curve,
      graduationTx: graduationTxHash,
      poolEvidenceFrom: "curve_completed_tx",
      ...readPoolEvidence(ca, graduationResult.data?.items || []),
    };
  }

  async function probe(ca, contractData, addressData, mainPair) {
    const decodedArgs = contractData?.decoded_constructor_args || [];
    const deployer = findDecodedArg(decodedArgs, "deployer_");
    const launchFactory = addressData?.creator_address_hash || null;
    if (!isAddress(deployer) && !isAddress(launchFactory)) return null;

    const launch = await findLaunchTx(ca, deployer, launchFactory, addressData);
    if (!launch) {
      return {
        deployer,
        launchFactory,
        foundLaunchTx: false,
        blockedBy: addressData ? null : "blockscout_address_source_failed",
        note: addressData
          ? "No TokenLaunched event naming this CA was found in the contract creation tx or in the deployer's recent transactions. Treat launchpad origin and LP status as unverified."
          : "The Blockscout address source failed, so the creation transaction is unknown and the launch trace never started. This is a check that did not run, not evidence that the token has no launchpad origin or no LP lock.",
      };
    }

    const launched = decodedParams(eventForToken(launch.logs, "TokenLaunched", ca));
    const locked = decodedParams(eventForToken(launch.logs, "PositionLocked", ca));
    const feeRedirect = decodedParams(eventForToken(launch.logs, "FeeRedirectUpdated", ca));
    const curve = isAddress(launched.curve) ? launched.curve : null;
    const launchModel = curve ? "bonding_curve" : launched.positionId || locked.positionId ? "direct_lp" : "unknown";

    let graduation = null;
    let positionId = launched.positionId || locked.positionId || null;
    let positionManager =
      launched.positionManager || locked.positionManager || findDecodedArg(decodedArgs, "positionManager_") || null;
    let lockedPoolRef = launched.pool || locked.pool || null;

    if (launchModel === "bonding_curve") {
      graduation = await traceGraduation(ca, curve);
      if (graduation.status === "graduated") {
        positionId = graduation.positionId || positionId;
        positionManager = graduation.positionManager || positionManager;
        lockedPoolRef = graduation.poolId || lockedPoolRef;
      }
    }

    const restrictionsEndBlock = launched.restrictionsEndBlock ?? launched.restrictionEndBlock ?? null;
    let restrictionWindow = null;
    if (restrictionsEndBlock !== null && restrictionsEndBlock !== undefined) {
      const end = Number(restrictionsEndBlock);
      const statsResult = await blockscout.stats();
      const latest = statsResult.ok ? Number(statsResult.data?.total_blocks) : NaN;
      restrictionWindow = {
        restrictionsEndBlock: Number.isFinite(end) ? end : String(restrictionsEndBlock),
        approxLatestBlock: Number.isFinite(latest) ? latest : null,
        expired: Number.isFinite(latest) && Number.isFinite(end) ? latest > end : null,
        note:
          "approxLatestBlock is the chain's total block count, which tracks height to within a block. expired=true means the launch-window limit no longer applies, so a sell_limit keyword hit is historical. expired=null means the check did not run: do not assume either way.",
      };
    }

    const { nftOwner, lockerContract, lockerRisk } = await inspectLocker(positionManager, positionId);

    const dexPool = mainPair?.pairAddress || null;
    const lockerHoldsNft = Boolean(nftOwner && isAddress(nftOwner.owner)) && lockerContract?.isVerified === true;
    const noWithdrawSurface = lockerRisk ? lockerRisk.hasWithdrawOrUnlock === false : null;

    let poolMatch;
    if (launchModel === "bonding_curve" && graduation?.status === "not_graduated") {
      poolMatch = dexPool ? "dex_pool_not_from_launchpad" : "no_pool_yet_still_on_curve";
    } else if (launchModel === "bonding_curve" && graduation?.status !== "graduated") {
      poolMatch = "unknown_graduation_not_traced";
    } else if (!lockedPoolRef) poolMatch = "unknown_no_pool_in_evidence";
    else if (!dexPool) poolMatch = "unknown_no_dex_main_pair";
    else if (String(lockedPoolRef).toLowerCase() === String(dexPool).toLowerCase()) {
      poolMatch = "main_pool_lock_verified";
    } else poolMatch = "different_pool_locked";

    const lpLockVerification = {
      poolMatch,
      launchModel,
      lockedPool: lockedPoolRef,
      dexMainPair: dexPool,
      dexId: mainPair?.dexId || null,
      dexLabels: mainPair?.labels || null,
      lockerHoldsNft,
      noWithdrawSurface,
      claimAllowed: poolMatch === "main_pool_lock_verified" && lockerHoldsNft && noWithdrawSurface === true,
      note:
        "Do not write 'LP locked' unless claimAllowed is true. main_pool_lock_verified means the pool the position was locked in is the same pool DexScreener shows as the main pair (on Uniswap v4 both are the 32-byte poolId). different_pool_locked is a red flag: something is locked, but not the pool people trade against. no_pool_yet_still_on_curve means the token has not graduated off the bonding curve, so there is no LP to lock. dex_pool_not_from_launchpad is a red flag: the token is still on the curve, yet DexScreener already lists a pool, so that pool was opened by someone else and carries no launchpad lock at all -- check its liquidity depth before treating any quoted price as real. Any unknown_* means the link was never proven: report LP as unverified, never as safe.",
    };

    return {
      deployer,
      launchFactory,
      foundLaunchTx: true,
      launchTx: launch.hash,
      launchTxFoundVia: launch.via,
      launchModel,
      lpLockVerification,
      restrictionWindow,
      tokenLaunched: launched,
      positionLocked: locked,
      feeRedirect,
      graduation,
      positionId,
      positionManager,
      nftOwner,
      lockerContract,
      lockerRisk,
    };
  }

  return { probe };
}
