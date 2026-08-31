const X_RESERVED_PATHS = new Set([
  "i",
  "search",
  "hashtag",
  "home",
  "explore",
  "notifications",
  "messages",
  "settings",
  "intent",
  "share",
  "status",
  "compose",
  "login",
  "signup",
]);

export function hostname(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    return /^[a-z0-9][a-z0-9.-]{0,252}$/.test(host) ? host : null;
  } catch {
    return null;
  }
}

export function xHandle(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!/(^|\.)x\.com$|(^|\.)twitter\.com$/.test(url.hostname)) return null;
    const part = url.pathname.split("/").filter(Boolean)[0];
    if (!part || X_RESERVED_PATHS.has(part.toLowerCase())) return null;
    return /^[A-Za-z0-9_]{1,15}$/.test(part) ? part : null;
  } catch {
    return null;
  }
}

const unique = (values) => [...new Set(values.filter(Boolean))];

function queryTerm(value) {
  const term = String(value || "").replace(/["\\<>]/g, " ").replace(/\s{2,}/g, " ").trim();
  return term.length > 60 ? term.slice(0, 60) : term || null;
}

export function buildNarrativeSearch({ ca, tokenName: rawName, symbol: rawSymbol, websites = [], socials = [] }) {
  const domains = unique(websites.map((website) => hostname(website.url || website)));
  const handles = unique(socials.map((social) => xHandle(social.url || social)));
  const tokenName = queryTerm(rawName);
  const cleanSymbol = queryTerm(String(rawSymbol || "").replace(/^\$/, ""));
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
    ...domains.map((domain) => `"${domain}" "${cleanSymbol || tokenName || ca}"`),
    ...handles.map((handle) => `"${handle}" "${ca}"`),
    ...handles.map((handle) => `"${handle}" "Robinhood Chain"`),
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
