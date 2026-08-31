import { isAddress } from "./evm.mjs";

// Symbols whose USD value is pegged by design. Anything outside this set is treated as
// a floating asset, because the risk being reported is "the USD price is derived from
// something that can move or be manipulated", and an unknown symbol is not evidence of
// a peg. Membership is by symbol only: a look-alike symbol on a fake token still has to
// pass the holder and verification checks reported alongside it.
const STABLE_SYMBOLS = new Set(["USDG", "USDC", "USDT", "DAI", "FRAX", "USDS", "PYUSD", "USDE", "LUSD", "TUSD"]);

// A pool priced against a thin or unverified quote token can be moved by whoever
// controls that token, so the base token's quoted market cap is only as trustworthy as
// its quote side.
const THIN_QUOTE_HOLDERS = 500;

export function createQuoteTokenAnalyzer({ blockscout, sanitizeText }) {
  async function resolve(address) {
    if (!isAddress(address)) {
      return {
        address: null,
        status: "unknown_no_quote_token",
        note: "No quote token was identified for the main pool, so priceUsd, fdv and marketCap could not be checked against what they are denominated in.",
      };
    }

    const [tokenResult, contractResult] = await Promise.all([blockscout.token(address), blockscout.contract(address)]);
    if (!tokenResult.ok) {
      return {
        address,
        status: "unknown_lookup_failed",
        error: tokenResult.error || tokenResult.status,
        note: "The quote token could not be read, so nothing about the price denomination was verified. Do not treat the USD figures as confirmed.",
      };
    }

    const token = tokenResult.data || {};
    const symbol = sanitizeText(token.symbol, "quoteToken.symbol", 32);
    const holdersCount = Number(token.holders_count);
    const isStablecoin = symbol ? STABLE_SYMBOLS.has(symbol.toUpperCase()) : null;
    const isVerified = contractResult.ok ? Boolean(contractResult.data?.is_verified) : null;

    return {
      address,
      status: "resolved",
      symbol,
      name: sanitizeText(token.name, "quoteToken.name", 120),
      holdersCount: Number.isFinite(holdersCount) ? holdersCount : null,
      isVerified,
      contractName: contractResult.ok ? sanitizeText(contractResult.data?.name, "quoteToken.contractName", 80) : null,
      isStablecoin,
      // The whole point of resolving the quote token: when it is not a stablecoin, the
      // token's USD price is a derived number that moves with an asset the project does
      // not control, and fdv/marketCap inherit that movement.
      priceReference: isStablecoin === null ? "unknown" : isStablecoin ? "stablecoin" : "floating_asset",
      quoteRisks: [
        ...(isStablecoin === false ? ["price_denominated_in_floating_asset"] : []),
        ...(isVerified === false ? ["quote_token_source_unverified"] : []),
        ...(Number.isFinite(holdersCount) && holdersCount < THIN_QUOTE_HOLDERS ? ["quote_token_thinly_held"] : []),
      ],
      note:
        "priceUsd, fdv and marketCap for the base token are quoted through this asset. priceReference=floating_asset means those USD figures move with it and are not a claim about the base token alone. quoteRisks entries are reasons to distrust the quoted valuation, not findings about the base token's own contract.",
    };
  }

  return { resolve };
}
