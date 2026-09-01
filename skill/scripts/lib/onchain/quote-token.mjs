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
    // Number(null) and Number("") are 0, and 0 < THIN_QUOTE_HOLDERS, so coercing a
    // field the source left empty would report a concrete "thinly held" finding about a
    // holder count nobody ever returned. A missing count stays unknown.
    const rawHoldersCount = token.holders_count;
    const holdersCount =
      typeof rawHoldersCount === "number" || (typeof rawHoldersCount === "string" && rawHoldersCount.trim() !== "")
        ? Number(rawHoldersCount)
        : NaN;
    const isStablecoin = symbol ? STABLE_SYMBOLS.has(symbol.toUpperCase()) : null;
    const isVerified = contractResult.ok ? Boolean(contractResult.data?.is_verified) : null;

    return {
      address,
      // The token row was read; whether its identity was actually established is a
      // separate question, and partially_resolved is how that shows up next to the
      // priceReference derived from it.
      status: symbol && contractResult.ok ? "resolved" : "partially_resolved",
      contractLookup: contractResult.ok ? "ok" : contractResult.errorKind || contractResult.status || "error",
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
      // A check that did not run is a reason to distrust the valuation in its own right.
      // Listing only the checks that came back negative would let a failed lookup produce
      // an empty risk list, which reads as a clean quote side.
      quoteRisks: [
        ...(isStablecoin === false ? ["price_denominated_in_floating_asset"] : []),
        ...(isStablecoin === null ? ["quote_token_symbol_unknown"] : []),
        ...(isVerified === false ? ["quote_token_source_unverified"] : []),
        ...(isVerified === null ? ["quote_token_verification_unknown"] : []),
        ...(Number.isFinite(holdersCount)
          ? holdersCount < THIN_QUOTE_HOLDERS
            ? ["quote_token_thinly_held"]
            : []
          : ["quote_token_holder_count_unknown"]),
      ],
      note:
        "priceUsd, fdv and marketCap for the base token are quoted through this asset. priceReference=floating_asset means those USD figures move with it and are not a claim about the base token alone. priceReference=unknown means the quote side was never identified, which is not the same as a stable one. quoteRisks entries are reasons to distrust the quoted valuation, not findings about the base token's own contract; the *_unknown entries are checks that did not run, and an empty list means every check ran and came back clean.",
    };
  }

  return { resolve };
}
