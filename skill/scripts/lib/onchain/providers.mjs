const DEX_BASE = "https://api.dexscreener.com";
const BLOCKSCOUT_HOST = "https://robinhoodchain.blockscout.com";
const BLOCKSCOUT_BASE = `${BLOCKSCOUT_HOST}/api/v2`;

export function createDexScreenerProvider(http) {
  return {
    tokenPairs: (ca) => http.getJson(`${DEX_BASE}/latest/dex/tokens/${ca}`),
    paidOrders: (ca) => http.getJson(`${DEX_BASE}/orders/v1/robinhood/${ca}`),
  };
}

export function createBlockscoutProvider(http) {
  const get = (path) => http.getJson(`${BLOCKSCOUT_BASE}/${path}`);
  return {
    token: (ca) => get(`tokens/${ca}`),
    tokenCounters: (ca) => get(`tokens/${ca}/counters`),
    contract: (address) => get(`smart-contracts/${address}`),
    address: (address) => get(`addresses/${address}`),
    addressTransactions: (address, query = "") => get(`addresses/${address}/transactions${query}`),
    addressLogs: (address, query = "") => get(`addresses/${address}/logs${query}`),
    transactionLogs: (hash) => get(`transactions/${hash}/logs`),
    nftInstance: (positionManager, id) => get(`tokens/${positionManager}/instances/${id}`),
    tokenHolders: (ca) => get(`tokens/${ca}/holders`),
    tokenBalances: (address) => get(`addresses/${address}/token-balances`),
    stats: () => get("stats"),
    // Topic-filtered log search over the whole chain. The v2 API exposes no topic
    // filter and only pages logs per address, so an event a few thousand blocks
    // back on a busy shared contract is unreachable there in any bounded number of
    // requests. This is Blockscout's Etherscan-compatible endpoint, which answers
    // "where was this event emitted for this token" in one call. A miss returns
    // HTTP 200 with status "0" and an empty result: that is an answer, not a fault.
    logsByTopic: (topic0, topic1 = null) => {
      const query = new URLSearchParams({ module: "logs", action: "getLogs", fromBlock: "0", toBlock: "latest", topic0 });
      if (topic1) {
        query.set("topic1", topic1);
        query.set("topic0_1_opr", "and");
      }
      return http.getJson(`${BLOCKSCOUT_HOST}/api?${query}`);
    },
  };
}
