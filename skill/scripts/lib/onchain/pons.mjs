import { buildHookRisk, resolveScanScope, stripSolidityComments } from "./contract-risk.mjs";
import {
  addressTopic,
  decodedParams,
  eventForToken,
  eventsNamed,
  findDecodedArg,
  isAddress,
  isZeroAddress,
  sameId,
} from "./evm.mjs";

// keccak256("PoolGraduated(address,uint256,uint256,uint256)"), the launch manager's
// signal that a graduated token's pool exists and its position was locked. The token
// is the first indexed argument, so topic0 + topic1 finds the exact transaction.
const POOL_GRADUATED_TOPIC = "0x0a44ef75df69c534f43cd6c1aa3ef8983065fe5fe79ef9e79f6494e6f258c259";

export function createPonsAnalyzer({ blockscout, sanitizeText }) {
  const LAUNCH_SCAN_LIMITS = { pages: 4, candidates: 20 };

  // Returns the launch transaction when it is found, and always returns the trace that
  // looked for it. Four different things -- a failed creation-tx read, a failed
  // transaction page, a failed candidate read, and simply running out of pages -- used to
  // collapse into the same empty answer, which reads as "this token has no launchpad
  // origin". They are checks that did not finish, and they are reported as such.
  async function findLaunchTx(ca, deployer, launchFactory, addressData) {
    const trace = {
      creationTxChecked: false,
      creationTxLogsFailed: false,
      deployerScanned: false,
      pagesScanned: 0,
      txsInspected: 0,
      transactionPageFailures: 0,
      candidateLogFailures: 0,
      morePages: false,
      candidateCapReached: false,
      pageCapReached: false,
    };
    const done = (launch) => ({ launch, trace });

    const creationTxHash = addressData?.creation_transaction_hash || null;
    if (creationTxHash) {
      trace.creationTxChecked = true;
      const logsResult = await blockscout.transactionLogs(creationTxHash);
      const logs = logsResult.ok && Array.isArray(logsResult.data?.items) ? logsResult.data.items : null;
      if (logs === null) trace.creationTxLogsFailed = true;
      else if (eventForToken(logs, "TokenLaunched", ca)) {
        return done({ hash: creationTxHash, logs, via: "creation_tx" });
      }
    }
    if (!isAddress(deployer)) return done(null);
    trace.deployerScanned = true;

    const isCandidate = (transaction) =>
      transaction?.hash &&
      ((isAddress(launchFactory) && transaction?.to?.hash?.toLowerCase() === launchFactory.toLowerCase()) ||
        /launch/i.test(String(transaction?.method || "")));

    let pageParams = null;
    for (let page = 0; page < LAUNCH_SCAN_LIMITS.pages; page += 1) {
      const query = pageParams
        ? "?" + new URLSearchParams(Object.entries(pageParams).filter(([, value]) => value !== null && value !== undefined))
        : "";
      const transactionsResult = await blockscout.addressTransactions(deployer, query);
      if (!transactionsResult.ok || !Array.isArray(transactionsResult.data?.items)) {
        trace.transactionPageFailures += 1;
        break;
      }
      trace.pagesScanned += 1;
      for (const transaction of transactionsResult.data.items.filter(isCandidate)) {
        if (trace.txsInspected >= LAUNCH_SCAN_LIMITS.candidates) {
          trace.candidateCapReached = true;
          break;
        }
        trace.txsInspected += 1;
        const logsResult = await blockscout.transactionLogs(transaction.hash);
        const logs = logsResult.ok && Array.isArray(logsResult.data?.items) ? logsResult.data.items : null;
        if (logs === null) {
          trace.candidateLogFailures += 1;
          continue;
        }
        if (eventForToken(logs, "TokenLaunched", ca)) {
          return done({ hash: transaction.hash, logs, via: "deployer_tx_scan" });
        }
      }
      pageParams = transactionsResult.data?.next_page_params;
      trace.morePages = Boolean(pageParams);
      if (!pageParams) break;
      if (trace.txsInspected >= LAUNCH_SCAN_LIMITS.candidates) {
        trace.candidateCapReached = true;
        break;
      }
      if (page === LAUNCH_SCAN_LIMITS.pages - 1) trace.pageCapReached = true;
    }
    return done(null);
  }

  // Why an empty launch trace is empty. An empty list means the scan genuinely completed
  // and this CA has no launchpad launch; anything in it means the answer is unknown.
  function launchTraceBlockers(trace, addressData) {
    const blockers = [];
    if (!addressData) blockers.push("blockscout_address_source_failed");
    if (trace.creationTxLogsFailed) blockers.push("creation_tx_logs_source_failed");
    if (!trace.deployerScanned) blockers.push("deployer_unknown_no_scan");
    if (trace.transactionPageFailures) blockers.push("deployer_transaction_source_failed");
    if (trace.candidateLogFailures) blockers.push("candidate_tx_logs_source_failed");
    if (trace.morePages || trace.pageCapReached || trace.candidateCapReached) blockers.push("scan_bounds_reached");
    return blockers;
  }

  const LOCKER_EXIT_CHECKS = [
    ["exit_function", /function\s+(withdraw|unlock|release|rescue|emergency)\w*\s*\(/i],
    ["decrease_liquidity", /decreaseLiquidity|burnPosition|\bmodifyLiquidit(y|ies)\s*\(/i],
    [
      "position_transfer_out",
      /\.(safe)?[Tt]ransferFrom\s*\(\s*address\s*\(\s*this\s*\)|IERC721\s*\([^)]*\)\s*\.\s*(safe)?[Tt]ransfer/,
    ],
    ["grants_nft_approval", /setApprovalForAll\s*\(|IERC721\s*\([^)]*\)\s*\.\s*approve\s*\(/i],
    ["arbitrary_call", /delegatecall|\.call\s*\{|function\s+execute\s*\(/i],
  ];

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
        // The locker's exit surfaces can live in a base contract, exactly as the token's
        // do. Scanning only source_code checked the leaf and called the whole custody
        // chain clean, so this goes through the same inheritance resolution the token
        // scan uses.
        const scope = resolveScanScope(lockerResult.data);
        const source = lockerResult.data?.source_code || "";
        const code = scope.files.map((file) => stripSolidityComments(file.code)).join("\n");
        const rawSource = scope.files.map((file) => file.code).join("\n");
        lockerContract = {
          address: nftOwner.owner,
          name: sanitizeText(lockerResult.data?.name, "pons.lockerContract.name", 80),
          isVerified: lockerResult.data?.is_verified,
          owner: findDecodedArg(lockerResult.data?.decoded_constructor_args || [], "initialOwner"),
        };
        const scanned = Boolean(source);
        const exitSurfaces = scanned
          ? LOCKER_EXIT_CHECKS.filter(([, pattern]) => pattern.test(code)).map(([name]) => name)
          : null;
        lockerRisk = {
          sourceAvailable: scanned,
          // A verified contract that ships no source bytes is the case that used to slip
          // through: is_verified was true, source_code was empty, every check silently
          // returned false, and claimAllowed read that as proof of a permanent lock.
          scanStatus: scanned ? "scanned" : lockerResult.data?.is_verified ? "unknown_source_empty" : "unknown_no_source",
          scanComplete: scanned && scope.scanComplete,
          scanScope: {
            scannedFiles: scope.files.map((file) => file.path),
            scannedBytes: scope.scannedBytes,
            inherits: scope.inherits,
            unresolvedBases: scope.unresolvedBases,
            depthLimitReached: scope.depthLimitReached,
          },
          hasWithdrawOrUnlock: scanned ? exitSurfaces.length > 0 : null,
          exitSurfaces,
          hasCollectFees: scanned ? /function\s+collectFees\s*\(/.test(code) : null,
          hasOwnerFeeControl: scanned
            ? /function\s+set(FeeRedirect|FeeCollector|ProtocolFee\w*|Fee\w*)\s*\([^)]*\)[^{]*onlyOwner/i.test(code)
            : null,
          saysPermanentCustody: scanned ? /permanent|Permanently holds/i.test(rawSource) : null,
          note:
            "exitSurfaces lists which patterns matched across the locker and the base contracts it declares. Empty means the scanned source exposes no way to move the position out or cut the liquidity. null everywhere means nothing was read: sourceAvailable=false, or scanStatus=unknown_source_empty for a contract marked verified that shipped no source. scanComplete=false means part of the inheritance chain was never read, so an empty exitSurfaces is bounded rather than clean.",
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

    const graduated = decodedParams(poolGraduated);
    const locked = decodedParams(positionLocked);
    const registered = decodedParams(poolRegistered);
    const registeredPoolId = registered.poolId || null;

    // One transaction can initialize several pools. hooks is read off Initialize, so
    // picking the wrong Initialize attributes another pool's hook to this token: prefer
    // the one whose poolId is the one the launchpad registered.
    const initializeCandidates = eventsNamed(logs, "Initialize").filter((log) => {
      const parameters = decodedParams(log);
      return [parameters.currency0, parameters.currency1].some(
        (currency) => isAddress(currency) && currency.toLowerCase() === ca.toLowerCase()
      );
    });
    const initialize =
      (registeredPoolId && initializeCandidates.find((log) => sameId(decodedParams(log).id, registeredPoolId))) ||
      initializeCandidates[0] ||
      null;
    const initialized = decodedParams(initialize);
    const initializedPoolId = initialized.id || null;

    const poolIdAgreement =
      registeredPoolId && initializedPoolId
        ? sameId(registeredPoolId, initializedPoolId)
          ? "match"
          : "mismatch"
        : registeredPoolId
          ? "registered_only"
          : initializedPoolId
            ? "initialize_only"
            : "none";

    const positionId = graduated.positionId || locked.tokenId || null;
    const poolId = registeredPoolId || initializedPoolId;
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
      poolIdAgreement,
      registeredPoolId,
      initializedPoolId,
      positionId,
      positionManager: decodedParams(modify).sender || null,
      // A hook read off an Initialize for a different pool is not this pool's hook.
      hooks: poolIdAgreement === "mismatch" ? null : initialized.hooks || null,
      hooksFrom: poolIdAgreement === "mismatch" ? null : initialize ? "initialize_event" : null,
      quoteToken: registered.quoteToken || null,
      permanentlyLockedAmount: permanentlyLocked ? decodedParams(permanentlyLocked).amount : null,
      supplyLockedAmount: supplyLocked ? decodedParams(supplyLocked).amount : null,
      poolEvidenceNote:
        "poolIdAgreement compares the poolId the launchpad registered with the one the Uniswap Initialize announced. mismatch means the two events describe different pools, so the hook is reported as unknown rather than attributed to this pool. registered_only or initialize_only means only one side was present and the other was never cross-checked.",
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
      if (logsResult.ok && Array.isArray(logsResult.data?.items)) {
        return {
          status: "graduated",
          curve,
          graduationTx: poolGraduatedTx,
          poolEvidenceFrom: "pool_graduated_event",
          ...readPoolEvidence(ca, logsResult.data.items),
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
      if (!logsResult.ok || !Array.isArray(logsResult.data?.items)) {
        if (pagesScanned === 0) {
          return {
            status: "curve_logs_unavailable",
            curve,
            detail: logsResult.ok ? "malformed_response" : logsResult.errorKind || logsResult.status,
          };
        }
        break;
      }
      pagesScanned += 1;
      const items = logsResult.data.items;
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
    if (!graduationResult.ok || !Array.isArray(graduationResult.data?.items)) {
      return {
        status: "graduation_logs_unavailable",
        curve,
        graduationTx: graduationTxHash,
        detail: graduationResult.ok ? "malformed_response" : graduationResult.errorKind,
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
      ...readPoolEvidence(ca, graduationResult.data.items),
    };
  }

  async function probe(ca, contractData, addressData, mainPair) {
    const decodedArgs = contractData?.decoded_constructor_args || [];
    const deployer = findDecodedArg(decodedArgs, "deployer_");
    const launchFactory = addressData?.creator_address_hash || null;
    if (!isAddress(deployer) && !isAddress(launchFactory)) {
      return {
        status: addressData
          ? "no_launchpad_signature"
          : "unknown_launchpad_detection_did_not_run",
        deployer,
        launchFactory,
        foundLaunchTx: false,
        blockedBy: addressData ? [] : ["blockscout_address_source_failed"],
        note: addressData
          ? "The contract declares neither a launchpad deployer argument nor a contract creator, so no launchpad launch was traced. Nothing here says the token is safe: it says this token does not look like a launchpad deploy."
          : "The Blockscout address source failed, so the creator was unknown and launchpad detection never started. This is a check that did not run, not evidence that the token has no launchpad origin.",
      };
    }

    const { launch, trace } = await findLaunchTx(ca, deployer, launchFactory, addressData);
    if (!launch) {
      const blockedBy = launchTraceBlockers(trace, addressData);
      return {
        status: blockedBy.length ? "unknown_launch_trace_incomplete" : "no_launch_tx_found",
        deployer,
        launchFactory,
        foundLaunchTx: false,
        launchTrace: trace,
        blockedBy,
        note: blockedBy.length
          ? "The launch trace did not finish: see blockedBy and launchTrace. Some source failed or the scan hit its bounds, so launchpad origin and LP status are UNKNOWN. This is a check that did not run, not evidence that the token has no launchpad origin or no LP lock."
          : "The scan completed and found no TokenLaunched event naming this CA, in the contract creation tx or in the deployer's transactions within launchTrace's bounds. Treat launchpad origin and LP status as unverified.",
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

    // The hook runs inside every swap on the graduated pool, so it can block or tax a
    // sell that the token contract itself permits. Scanned separately from the token:
    // a locked LP says nothing about whether the swap path is open.
    const hookAddress = graduation?.hooks || null;
    // A graduated V2 launch trades on a Uniswap v4 pool, which always has a hook slot,
    // so "no hook address" there is never the pool answering: it means the Initialize
    // that would have named the hook was not found, or named a different pool. A V1
    // direct launch opens a v3 pool, where no hook is the real and only answer.
    const hookAddressUnknownReason =
      launchModel === "bonding_curve" && graduation?.status === "graduated" && !graduation?.hooksFrom
        ? graduation?.poolIdAgreement === "mismatch"
          ? "pool_id_mismatch_hook_belongs_to_another_pool"
          : "no_initialize_event_found_for_this_pool"
        : null;
    const hookResult =
      !hookAddressUnknownReason && isAddress(hookAddress) && !isZeroAddress(hookAddress)
        ? await blockscout.contract(hookAddress)
        : null;
    const hookRisk = buildHookRisk(
      hookAddress,
      hookResult?.ok ? hookResult.data : null,
      sanitizeText,
      hookAddressUnknownReason
    );

    const dexPool = mainPair?.pairAddress || null;
    const lockerHoldsNft = Boolean(nftOwner && isAddress(nftOwner.owner)) && lockerContract?.isVerified === true;
    // Tri-state on purpose. true means the scanned source, base contracts included,
    // exposes no exit; false means one was found; null means the question was never
    // answered -- an unread locker, a verified contract with no source bytes, or an
    // inheritance chain the scan could not finish. Only true may support a lock claim.
    const noWithdrawSurface =
      !lockerRisk || lockerRisk.hasWithdrawOrUnlock === null
        ? null
        : lockerRisk.hasWithdrawOrUnlock === true
          ? false
          : lockerRisk.scanComplete === true
            ? true
            : null;

    const claimBlockedBy = [];

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

    if (poolMatch !== "main_pool_lock_verified") claimBlockedBy.push("pool_match:" + poolMatch);
    // The launchpad and Uniswap named different pools in the same transaction, so which
    // pool the position actually sits in is unresolved. poolMatch compares the DEX main
    // pair against the registered id alone and can still come back verified off that
    // half of a contradiction, which is not a lock that was proven.
    if (graduation?.poolIdAgreement === "mismatch") claimBlockedBy.push("pool_id_mismatch_between_launchpad_and_uniswap");
    if (!lockerHoldsNft) claimBlockedBy.push(nftOwner?.error ? "nft_owner_source_failed" : "locker_does_not_hold_the_position");
    if (noWithdrawSurface === null) claimBlockedBy.push("locker_exit_surface_unknown:" + (lockerRisk?.scanStatus || "locker_not_read"));
    else if (noWithdrawSurface === false) claimBlockedBy.push("locker_exposes_an_exit_surface");

    const lpLockVerification = {
      poolMatch,
      launchModel,
      lockedPool: lockedPoolRef,
      poolIdAgreement: graduation?.poolIdAgreement ?? null,
      dexMainPair: dexPool,
      dexId: sanitizeText(mainPair?.dexId, "pons.lpLockVerification.dexId", 32),
      dexLabels: Array.isArray(mainPair?.labels)
        ? mainPair.labels.map((label, index) => sanitizeText(label, `pons.lpLockVerification.dexLabels[${index}]`, 32))
        : null,
      lockerHoldsNft,
      lockerScanStatus: lockerRisk?.scanStatus || "locker_not_read",
      noWithdrawSurface,
      claimAllowed:
        poolMatch === "main_pool_lock_verified" &&
        lockerHoldsNft &&
        noWithdrawSurface === true &&
        graduation?.poolIdAgreement !== "mismatch",
      claimBlockedBy,
      note:
        "Do not write 'LP locked' unless claimAllowed is true; claimBlockedBy lists every reason it is not, and a locker_exit_surface_unknown entry means custody was never checked rather than checked and cleared. main_pool_lock_verified means the pool the position was locked in is the same pool DexScreener shows as the main pair (on Uniswap v4 both are the 32-byte poolId). different_pool_locked is a red flag: something is locked, but not the pool people trade against. no_pool_yet_still_on_curve means the token has not graduated off the bonding curve, so there is no LP to lock. dex_pool_not_from_launchpad is a red flag: the token is still on the curve, yet DexScreener already lists a pool, so that pool was opened by someone else and carries no launchpad lock at all -- check its liquidity depth before treating any quoted price as real. Any unknown_* means the link was never proven: report LP as unverified, never as safe. poolIdAgreement=mismatch means the launchpad and Uniswap named different pools in the same transaction, so the pool the position sits in is unresolved and the claim is blocked no matter what poolMatch says.",
      swapPathNote:
        "claimAllowed answers one question only: is the position locked in the pool people trade against. It does not say the pool is tradable. On Uniswap v4 the hook runs inside every swap and can refuse or tax a sell, so read launchpad.pons.hookRisk before pairing this with any claim about sellability.",
    };

    return {
      status: "launch_traced",
      deployer,
      launchFactory,
      foundLaunchTx: true,
      launchTrace: trace,
      launchTx: launch.hash,
      launchTxFoundVia: launch.via,
      launchModel,
      lpLockVerification,
      hookRisk,
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
