export const PRICE_OUTLIER_RATIO = 10;

const round2 = (number) => Math.round(number * 100) / 100;

function median(values) {
  if (!values.length) return null;
  const sorted = values.slice().sort((left, right) => left - right);
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function pairAnomalyReason(pair, medianPrice) {
  const price = Number(pair?.priceUsd);
  if (!Number.isFinite(price) || price <= 0) return "no_usable_price";
  if (pair?.fdv == null && pair?.marketCap == null) return "no_fdv_or_market_cap";
  if (medianPrice != null && medianPrice > 0) {
    const ratio = price > medianPrice ? price / medianPrice : medianPrice / price;
    if (ratio > PRICE_OUTLIER_RATIO) return "price_outlier_vs_median";
  }
  return null;
}

function anomalousPair(pair, reason) {
  return {
    pairAddress: pair?.pairAddress,
    dexId: pair?.dexId,
    reason,
    priceUsd: pair?.priceUsd ?? null,
    liquidityUsd: pair?.liquidity?.usd ?? null,
  };
}

export function createDexAnalyzer({ sanitizeText, sanitizeUrl }) {
  function screenPairs(pairs = [], ca = "") {
    const normalizedCa = String(ca).toLowerCase();
    const onChain = pairs.filter((pair) => pair?.chainId === "robinhood");
    const sideOf = (pair) =>
      String(pair?.baseToken?.address || "").toLowerCase() === normalizedCa
        ? "base"
        : String(pair?.quoteToken?.address || "").toLowerCase() === normalizedCa
          ? "quote"
          : "unrelated";

    const basePairs = [];
    const quotePairs = [];
    let unrelatedDropped = 0;
    for (const pair of onChain) {
      const side = normalizedCa ? sideOf(pair) : "base";
      if (side === "base") basePairs.push(pair);
      else if (side === "quote") quotePairs.push(pair);
      else unrelatedDropped += 1;
    }

    const crossChainPairs = pairs
      .filter((pair) => pair?.chainId && pair.chainId !== "robinhood")
      .slice(0, 8)
      .map((pair) => ({
        chainId: pair.chainId,
        dexId: pair.dexId,
        url: sanitizeUrl(pair.url, "dex.crossChainPairs.url"),
        liquidityUsd: pair?.liquidity?.usd ?? null,
        pairCreatedAt: pair?.pairCreatedAt ?? null,
        tokenSide: normalizedCa ? sideOf(pair) : null,
      }));

    const sideEvidence = {
      tokenSide: basePairs.length ? "base" : quotePairs.length ? "quote_only" : "none",
      basePairs: basePairs.length,
      quoteSidePairs: quotePairs.map((pair) => ({
        pairAddress: pair?.pairAddress || null,
        pricesToken: sanitizeText(pair?.baseToken?.symbol, "dex.quoteSidePairs.symbol", 32),
        liquidityUsd: pair?.liquidity?.usd ?? null,
      })),
      unrelatedPairsDropped: unrelatedDropped,
      crossChainPairs,
      sideNote:
        "Only pairs where the queried CA is the base token feed mainPair, aggregate and the median. tokenSide=quote_only means every Robinhood Chain pair prices some other token against this one, so this probe has no price for the token itself: do not quote priceUsd, fdv or marketCap. crossChainPairs share the address but not the chain and prove nothing about this token.",
    };

    const referencePrices = basePairs
      .filter((pair) => pair?.fdv != null || pair?.marketCap != null)
      .map((pair) => Number(pair?.priceUsd))
      .filter((number) => Number.isFinite(number) && number > 0);
    const medianPrice = median(referencePrices);
    const healthy = [];
    const anomalous = [];
    for (const pair of basePairs) {
      const reason = pairAnomalyReason(pair, medianPrice);
      if (reason) anomalous.push(anomalousPair(pair, reason));
      else healthy.push(pair);
    }
    healthy.sort((left, right) => Number(right?.liquidity?.usd || 0) - Number(left?.liquidity?.usd || 0));

    if (!healthy.length && basePairs.length) {
      const fallback = basePairs
        .slice()
        .sort((left, right) => Number(right?.liquidity?.usd || 0) - Number(left?.liquidity?.usd || 0))[0];
      return {
        ...sideEvidence,
        mainPair: fallback,
        healthy: [],
        anomalous,
        medianPrice,
        screening: "fallback_all_pairs_anomalous",
      };
    }

    return {
      ...sideEvidence,
      mainPair: healthy[0] || null,
      healthy,
      anomalous,
      medianPrice,
      screening: basePairs.length === 0 ? "no_base_side_pair" : anomalous.length ? "screened_outliers" : "clean",
    };
  }

  return { screenPairs };
}

export function aggregatePairs(healthy = []) {
  if (!healthy.length) return null;
  let liquidityUsd = 0;
  let volume24h = 0;
  let buys24h = 0;
  let sells24h = 0;
  let earliest = null;
  for (const pair of healthy) {
    liquidityUsd += Number(pair?.liquidity?.usd || 0);
    volume24h += Number(pair?.volume?.h24 || 0);
    buys24h += Number(pair?.txns?.h24?.buys || 0);
    sells24h += Number(pair?.txns?.h24?.sells || 0);
    const created = Number(pair?.pairCreatedAt);
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

export function summarizeOrders(data) {
  const orders = data?.orders || [];
  return {
    tokenProfileApproved: orders.some((order) => order.type === "tokenProfile" && order.status === "approved"),
    orders: orders.map((order) => ({
      type: order.type,
      status: order.status,
      paymentTimestamp: order.paymentTimestamp,
      paidAt: order.paymentTimestamp ? new Date(order.paymentTimestamp).toISOString() : null,
    })),
    boosts: data?.boosts || [],
  };
}
