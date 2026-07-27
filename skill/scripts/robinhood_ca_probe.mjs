#!/usr/bin/env node
const CA = (process.argv[2] || "").trim();

const API = {
  dexToken: (ca) => `https://api.dexscreener.com/latest/dex/tokens/${ca}`,
  dexOrders: (ca) => `https://api.dexscreener.com/orders/v1/robinhood/${ca}`,
  token: (ca) => `https://robinhoodchain.blockscout.com/api/v2/tokens/${ca}`,
  counters: (ca) => `https://robinhoodchain.blockscout.com/api/v2/tokens/${ca}/counters`,
  contract: (ca) => `https://robinhoodchain.blockscout.com/api/v2/smart-contracts/${ca}`,
  address: (addr) => `https://robinhoodchain.blockscout.com/api/v2/addresses/${addr}`,
  addressTxs: (addr) => `https://robinhoodchain.blockscout.com/api/v2/addresses/${addr}/transactions`,
  txLogs: (hash) => `https://robinhoodchain.blockscout.com/api/v2/transactions/${hash}/logs`,
  nftInstance: (pm, id) => `https://robinhoodchain.blockscout.com/api/v2/tokens/${pm}/instances/${id}`,
};

function isAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

async function getJson(url) {
  try {
    const res = await fetch(url, { headers: { "user-agent": "robinhood-chain-narrative-radar/1.1" } });
    if (!res.ok) return { ok: false, status: res.status, error: await res.text() };
    return { ok: true, data: await res.json() };
  } catch (error) {
    return { ok: false, error: String(error?.message || error) };
  }
}

function pickMainPair(pairs = []) {
  const robin = pairs.filter((p) => p.chainId === "robinhood");
  return robin.sort((a, b) => Number(b?.liquidity?.usd || 0) - Number(a?.liquidity?.usd || 0))[0] || null;
}

function findDecodedArg(args = [], name) {
  const row = args.find((x) => x?.[1]?.name === name);
  return row ? row[0] : null;
}

function contractRisk(source = "") {
  const s = String(source || "");
  const checks = [
    ["mint", /\bmint\s*\(|_mint\s*\(|function\s+mint\b/i],
    ["owner_admin", /\bonlyOwner\b|\bowner\(\)|Ownable|AccessControl|DEFAULT_ADMIN_ROLE/i],
    ["blacklist", /blacklist|blocklist|isBlacklisted|blocked/i],
    ["pause", /Pausable|pause\s*\(|paused\b|whenNotPaused/i],
    ["tax_fee", /buyTax|sellTax|setTax|setFee|transferTax|marketingFee|feeBps/i],
    ["sell_limit", /maxTx|maxWallet|cooldown|antiBot|restrictionBlocks|sell/i],
    ["arbitrary_call", /functionCall|delegatecall|call\{value|execute\s*\(/i],
  ];
  return Object.fromEntries(checks.map(([name, re]) => [name, re.test(s)]));
}

function stripSolidityComments(source = "") {
  return String(source || "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}

function summarizeOrders(data) {
  const orders = data?.orders || [];
  return {
    tokenProfileApproved: orders.some((o) => o.type === "tokenProfile" && o.status === "approved"),
    orders: orders.map((o) => ({
      type: o.type,
      status: o.status,
      paymentTimestamp: o.paymentTimestamp,
      paidAt: o.paymentTimestamp ? new Date(o.paymentTimestamp).toISOString() : null,
    })),
    boosts: data?.boosts || [],
  };
}

function decodedParams(log) {
  return Object.fromEntries((log?.decoded?.parameters || []).map((p) => [p.name, p.value]));
}

async function probePonsLaunch(ca, contractData, addressData) {
  const decodedArgs = contractData?.decoded_constructor_args || [];
  const deployer = findDecodedArg(decodedArgs, "deployer_");
  const launchFactory = addressData?.creator_address_hash || null;
  if (!isAddress(deployer) || !isAddress(launchFactory)) return null;

  const txsRes = await getJson(API.addressTxs(deployer));
  const txs = txsRes.ok ? txsRes.data?.items || [] : [];
  const launchTx = txs.find((tx) =>
    tx?.to?.hash?.toLowerCase() === launchFactory.toLowerCase() &&
    String(tx?.method || "").toLowerCase().includes("launchtoken")
  );
  if (!launchTx?.hash) {
    return { deployer, launchFactory, foundLaunchTx: false };
  }

  const logsRes = await getJson(API.txLogs(launchTx.hash));
  const logs = logsRes.ok ? logsRes.data?.items || [] : [];
  const tokenLogs = logs.filter((log) => JSON.stringify(log).toLowerCase().includes(ca.toLowerCase()));
  const tokenLaunched = tokenLogs.find((log) => log?.decoded?.method_call?.startsWith("TokenLaunched("));
  const positionLocked = tokenLogs.find((log) => log?.decoded?.method_call?.startsWith("PositionLocked("));
  const feeRedirect = tokenLogs.find((log) => log?.decoded?.method_call?.startsWith("FeeRedirectUpdated("));
  const launched = decodedParams(tokenLaunched);
  const locked = decodedParams(positionLocked);
  const positionId = launched.positionId || locked.positionId || null;
  const positionManager = launched.positionManager || locked.positionManager || findDecodedArg(decodedArgs, "positionManager_");
  let nftOwner = null;
  let lockerContract = null;
  let lockerRisk = null;

  if (positionId && isAddress(positionManager)) {
    const nftRes = await getJson(API.nftInstance(positionManager, positionId));
    nftOwner = nftRes.ok ? {
      owner: nftRes.data?.owner?.hash || null,
      ownerName: nftRes.data?.owner?.name || null,
      ownerVerified: nftRes.data?.owner?.is_verified || false,
    } : { error: nftRes.error || nftRes.status };
    if (isAddress(nftOwner.owner)) {
      const lockerRes = await getJson(API.contract(nftOwner.owner));
      if (lockerRes.ok) {
        const source = lockerRes.data?.source_code || "";
        const code = stripSolidityComments(source);
        lockerContract = {
          name: lockerRes.data?.name,
          isVerified: lockerRes.data?.is_verified,
          owner: findDecodedArg(lockerRes.data?.decoded_constructor_args || [], "initialOwner"),
        };
        lockerRisk = {
          hasWithdrawOrUnlock: /function\s+(withdraw|unlock|decreaseLiquidity)\b|\.decreaseLiquidity\s*\(|\.safeTransferFrom\s*\(|\.transferFrom\s*\(|delegatecall|function\s+execute\b/i.test(code),
          hasCollectFees: /function\s+collectFees\s*\(/.test(code),
          saysPermanentCustody: /permanent|Permanently holds/i.test(source),
        };
      }
    }
  }

  return {
    deployer,
    launchFactory,
    foundLaunchTx: true,
    launchTx: launchTx.hash,
    tokenLaunched: launched,
    positionLocked: locked,
    feeRedirect: decodedParams(feeRedirect),
    positionId,
    positionManager,
    nftOwner,
    lockerContract,
    lockerRisk,
  };
}

async function main() {
  if (!isAddress(CA)) {
    console.error("Usage: robinhood_ca_probe.mjs <0x...40 hex CA>");
    process.exit(2);
  }

  const [dexRes, ordersRes, tokenRes, countersRes, contractRes, addressRes] = await Promise.all([
    getJson(API.dexToken(CA)),
    getJson(API.dexOrders(CA)),
    getJson(API.token(CA)),
    getJson(API.counters(CA)),
    getJson(API.contract(CA)),
    getJson(API.address(CA)),
  ]);

  const mainPair = dexRes.ok ? pickMainPair(dexRes.data?.pairs || []) : null;
  const contractData = contractRes.ok ? contractRes.data : null;
  const addressData = addressRes.ok ? addressRes.data : null;
  const pons = contractData ? await probePonsLaunch(CA, contractData, addressData) : null;
  const source = contractData?.source_code || "";

  const out = {
    ca: CA,
    generatedAt: new Date().toISOString(),
    dex: {
      ok: dexRes.ok,
      mainPair: mainPair ? {
        url: mainPair.url,
        pairAddress: mainPair.pairAddress,
        dexId: mainPair.dexId,
        labels: mainPair.labels,
        priceUsd: mainPair.priceUsd,
        fdv: mainPair.fdv,
        marketCap: mainPair.marketCap,
        liquidityUsd: mainPair.liquidity?.usd,
        volume24h: mainPair.volume?.h24,
        txns24h: mainPair.txns?.h24,
        pairCreatedAt: mainPair.pairCreatedAt,
        pairCreatedAtIso: mainPair.pairCreatedAt ? new Date(mainPair.pairCreatedAt).toISOString() : null,
        websites: mainPair.info?.websites || [],
        socials: mainPair.info?.socials || [],
      } : null,
      paid: ordersRes.ok ? summarizeOrders(ordersRes.data) : { ok: false, error: ordersRes.error || ordersRes.status },
    },
    blockscout: {
      token: tokenRes.ok ? tokenRes.data : { ok: false, error: tokenRes.error || tokenRes.status },
      counters: countersRes.ok ? countersRes.data : { ok: false, error: countersRes.error || countersRes.status },
      address: addressRes.ok ? {
        creator: addressRes.data?.creator_address_hash,
        isContract: addressRes.data?.is_contract,
        isVerified: addressRes.data?.is_verified,
        name: addressRes.data?.name,
      } : { ok: false, error: addressRes.error || addressRes.status },
      contract: contractData ? {
        name: contractData.name,
        isVerified: contractData.is_verified,
        compiler: contractData.compiler_version,
        decodedConstructorArgs: contractData.decoded_constructor_args,
      } : { ok: false, error: contractRes.error || contractRes.status },
    },
    contractRisk: {
      sourceAvailable: Boolean(source),
      heuristicFlags: contractRisk(source),
      note: "Heuristic only. Read source manually before final safety claims.",
    },
    launchpad: {
      pons,
    },
    nextSearches: [
      `"${CA}"`,
      `"${mainPair?.baseToken?.symbol || ""}" "Robinhood Chain"`,
      ...(mainPair?.info?.socials || []).map((s) => s.url).filter(Boolean),
      ...(mainPair?.info?.websites || []).map((w) => w.url).filter(Boolean),
    ].filter(Boolean),
  };

  console.log(JSON.stringify(out, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
