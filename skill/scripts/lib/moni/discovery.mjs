import { normalizeEvents, normalizeGlobalSmartMentions, normalizeProjects, responseShape } from "./normalize.mjs";

export const MONI_DISCOVERY_FEEDS = new Set(["projects", "events", "smart-mentions"]);
export const MONI_DISCOVERY_TIMEFRAMES = new Set(["H1", "H24", "D7", "D30", "D90", "D180", "Y1"]);

const EVENT_SORT = {
  H1: "1h",
  H24: "24h",
  D7: "7d",
  D30: "1m",
  D90: "newest",
  D180: "newest",
  Y1: "newest",
};

function definition(feed, { limit, timeframe, chain, search }) {
  if (feed === "projects") {
    return {
      path: "projects/",
      query: { limit, feedTimeframe: timeframe, changesTimeframe: "H24", chains: chain },
      normalize: normalizeProjects,
    };
  }
  if (feed === "events") {
    return {
      path: "events/list/",
      query: { limit, sortBy: EVENT_SORT[timeframe], search },
      normalize: normalizeEvents,
    };
  }
  return {
    path: "smart_mentions/feed/",
    query: { limit, feedTimeframe: timeframe, changesTimeframe: "H24", followingsChains: chain, onlyCurated: true },
    normalize: normalizeGlobalSmartMentions,
  };
}

export async function probeMoniDiscovery({ client, feed, limit = 20, timeframe = "D30", chain = null, search = null }) {
  if (!MONI_DISCOVERY_FEEDS.has(feed)) throw new TypeError("Invalid discovery feed");
  if (!MONI_DISCOVERY_TIMEFRAMES.has(timeframe)) throw new TypeError("Invalid discovery timeframe");
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new TypeError("Discovery limit must be 1-100");

  const request = definition(feed, { limit, timeframe, chain, search });
  let result;
  try {
    result = await client.request(feed, request.path, { query: request.query, estimatedPoints: limit });
  } catch (error) {
    result = {
      ok: false,
      name: feed,
      endpoint: request.path,
      estimatedPoints: limit,
      attempts: 0,
      latencyMs: 0,
      errorKind: "adapter_error",
      error: String(error?.message || error || "Unexpected Moni adapter error").slice(0, 240),
    };
  }

  const items = result.ok ? request.normalize(result.data) : [];
  return {
    provider: "moni",
    schemaVersion: "1",
    generatedAt: new Date().toISOString(),
    feed,
    coverage: {
      status: result.ok ? "complete" : result.errorKind || "failed",
      httpStatus: result.statusCode ?? null,
      attempts: result.attempts,
      latencyMs: result.latencyMs,
      cacheHit: result.cacheHit || false,
      responseShape: result.ok ? responseShape(result.data) : null,
      detail: result.ok ? null : result.error,
    },
    filters: { limit, timeframe, chain, search },
    items,
    provenance: {
      endpoint: result.endpoint,
      itemsReturned: items.length,
      estimatedPointsMaximum: limit,
      estimatedPointsBillable: result.ok && !result.cacheHit ? items.length : 0,
    },
    evidencePolicy:
      "This is a discovery lead feed, not token verification. Verify project identity, CA, chain activity, contract and LP evidence independently before scoring.",
  };
}
