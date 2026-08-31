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

// DexScreener sometimes reports a pool whose base reserve has collapsed to dust
// (order 1e-18). Its priceUsd and liquidity.usd then blow up by ~20 orders of
// magnitude, and ranking on raw liquidity hands that pool back as the main pair,
// which corrupts every downstream number: price, market cap, liquidity, age.
// Screen those out before ranking, but keep them in the output - a pool dropped
// without saying so is its own kind of misleading.
const PRICE_OUTLIER_RATIO = 10;

const round2 = (n) => Math.round(n * 100) / 100;

function median(values) {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function pairAnomalyReason(pair, medianPrice) {
  const price = Number(pair?.priceUsd);
  if (!Number.isFinite(price) || price <= 0) return "no_usable_price";
  // DexScreener omits fdv/marketCap exactly when it cannot reconcile a pool's
  // reserves, so their absence is the cheapest tell for a broken quote.
  if (pair?.fdv == null && pair?.marketCap == null) return "no_fdv_or_market_cap";
  if (medianPrice != null && medianPrice > 0) {
    const ratio = price > medianPrice ? price / medianPrice : medianPrice / price;
    if (ratio > PRICE_OUTLIER_RATIO) return "price_outlier_vs_median";
  }
  return null;
}

function summarizeAnomalousPair(pair, reason) {
  return {
    pairAddress: pair?.pairAddress,
    dexId: pair?.dexId,
    reason,
    priceUsd: pair?.priceUsd ?? null,
    liquidityUsd: pair?.liquidity?.usd ?? null,
  };
}

// Returns the ranked healthy pairs plus the rejects, so the caller can report both.
function screenPairs(pairs = []) {
  const robin = pairs.filter((p) => p?.chainId === "robinhood");
  // Reference price comes only from pairs that carry an FDV: a dust pool reports
  // none, so it cannot drag the median it is about to be measured against.
  const referencePrices = robin
    .filter((p) => p?.fdv != null || p?.marketCap != null)
    .map((p) => Number(p?.priceUsd))
    .filter((n) => Number.isFinite(n) && n > 0);
  const medianPrice = median(referencePrices);

  const healthy = [];
  const anomalous = [];
  for (const pair of robin) {
    const reason = pairAnomalyReason(pair, medianPrice);
    if (reason) anomalous.push(summarizeAnomalousPair(pair, reason));
    else healthy.push(pair);
  }
  healthy.sort((a, b) => Number(b?.liquidity?.usd || 0) - Number(a?.liquidity?.usd || 0));

  // Every pool screened out: fall back to the old ranking rather than returning
  // no pair at all, but say so, because the numbers are then untrustworthy.
  if (!healthy.length && robin.length) {
    const fallback = robin
      .slice()
      .sort((a, b) => Number(b?.liquidity?.usd || 0) - Number(a?.liquidity?.usd || 0))[0];
    return { mainPair: fallback, healthy: [], anomalous, medianPrice, screening: "fallback_all_pairs_anomalous" };
  }

  return {
    mainPair: healthy[0] || null,
    healthy,
    anomalous,
    medianPrice,
    screening: anomalous.length ? "screened_outliers" : "clean",
  };
}

// A single mainPair understates market structure when liquidity is split across
// many pools, which is the normal case on Robinhood Chain.
function aggregatePairs(healthy = []) {
  if (!healthy.length) return null;
  let liquidityUsd = 0;
  let volume24h = 0;
  let buys24h = 0;
  let sells24h = 0;
  let earliest = null;
  for (const p of healthy) {
    liquidityUsd += Number(p?.liquidity?.usd || 0);
    volume24h += Number(p?.volume?.h24 || 0);
    buys24h += Number(p?.txns?.h24?.buys || 0);
    sells24h += Number(p?.txns?.h24?.sells || 0);
    const created = Number(p?.pairCreatedAt);
    if (Number.isFinite(created) && created > 0 && (earliest === null || created < earliest)) earliest = created;
  }
  return {
    pairCount: healthy.length,
    liquidityUsd: round2(liquidityUsd),
    volume24h: round2(volume24h),
    txns24h: { buys: buys24h, sells: sells24h },
    earliestPairCreatedAt: earliest,
    earliestPairCreatedAtIso: earliest === null ? null : new Date(earliest).toISOString(),
  };
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

function hostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function xHandle(url) {
  try {
    const u = new URL(url);
    if (!/(^|\.)x\.com$|(^|\.)twitter\.com$/.test(u.hostname)) return null;
    const part = u.pathname.split("/").filter(Boolean)[0];
    if (!part || ["i", "search", "hashtag"].includes(part)) return null;
    return part;
  } catch {
    return null;
  }
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function buildNarrativeSearch({ ca, tokenName, symbol, websites = [], socials = [] }) {
  const domains = unique(websites.map((w) => hostname(w.url || w)));
  const handles = unique(socials.map((s) => xHandle(s.url || s)));
  const cleanSymbol = String(symbol || "").replace(/^\$/, "");
  const conceptBase = tokenName || cleanSymbol || ca;
  const queries = [
    `"${ca}"`,
    tokenName && `"${tokenName}" "Robinhood Chain"`,
    cleanSymbol && `"$${cleanSymbol}" "Robinhood Chain"`,
    cleanSymbol && `"${cleanSymbol}" "Robinhood"`,
    tokenName && `"${tokenName}" Robinhood meme`,
    tokenName && `"${tokenName}" token`,
    tokenName && `"${tokenName}" scam`,
    cleanSymbol && `"$${cleanSymbol}" crypto`,
    `${conceptBase} RWA stock token`,
    `${conceptBase} AI agent Hyperliquid`,
    `${conceptBase} tokenized stocks`,
    ...domains.map((d) => `"${d}" "${cleanSymbol || tokenName || ca}"`),
    ...handles.map((h) => `"${h}" "${ca}"`),
    ...handles.map((h) => `"${h}" "Robinhood Chain"`),
    `site:x.com "${ca}"`,
    cleanSymbol && `site:x.com "$${cleanSymbol}" "Robinhood"`,
  ];
  return {
    tokenName,
    symbol: cleanSymbol || null,
    domains,
    xHandles: handles,
    queries: unique(queries),
    evidenceLabels: [
      "official_self_claim",
      "independent_ecosystem",
      "community_social",
      "same_name_noise",
      "product_proof",
      "market_only",
      "negative_signal",
    ],
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
  let launchTx = txs.find((tx) =>
    tx?.to?.hash?.toLowerCase() === launchFactory.toLowerCase() &&
    String(tx?.method || "").toLowerCase().includes("launchtoken")
  );
  const creationTxHash = addressData?.creation_transaction_hash || null;
  if (!launchTx?.hash && creationTxHash) {
    const creationTxRes = await getJson(`https://robinhoodchain.blockscout.com/api/v2/transactions/${creationTxHash}`);
    const creationTx = creationTxRes.ok ? creationTxRes.data : null;
    if (
      creationTx?.to?.hash?.toLowerCase() === launchFactory.toLowerCase() &&
      String(creationTx?.method || "").toLowerCase().includes("launchtoken")
    ) {
      launchTx = { hash: creationTxHash };
    }
  }
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

  const pairScreen = dexRes.ok ? screenPairs(dexRes.data?.pairs || []) : null;
  const mainPair = pairScreen?.mainPair || null;
  const tokenName = mainPair?.baseToken?.name || (tokenRes.ok ? tokenRes.data?.name : null);
  const tokenSymbol = mainPair?.baseToken?.symbol || (tokenRes.ok ? tokenRes.data?.symbol : null);
  const websites = mainPair?.info?.websites || [];
  const socials = mainPair?.info?.socials || [];
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
      mainPairScreening: pairScreen?.screening ?? null,
      screeningNote:
        "mainPair is the deepest pool left after dropping pools with no usable price, no fdv/marketCap, or a price more than " +
        PRICE_OUTLIER_RATIO +
        "x off the median. screening=fallback_all_pairs_anomalous means nothing passed and mainPair's numbers are unreliable.",
      anomalousPairs: pairScreen?.anomalous ?? [],
      aggregate: aggregatePairs(pairScreen?.healthy || []),
      aggregateNote:
        "Summed across screened Robinhood Chain pools. Prefer this over mainPair when liquidity is split across many pools.",
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
    narrativeSearch: buildNarrativeSearch({ ca: CA, tokenName, symbol: tokenSymbol, websites, socials }),
  };

  console.log(JSON.stringify(out, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
