import { findDecodedArg, isAddress } from "./evm.mjs";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const DEAD_ADDRESS = "0x000000000000000000000000000000000000dead";
const V4_POOL_MANAGER = "0x8366a39CC670B4001A1121B8F6A443A643e40951";

const HOLDER_ROLES = {
  burn_zero_address: "burn",
  burn_dead_address: "burn",
  uniswap_v4_pool_manager: "liquidity",
  bonding_curve: "liquidity",
  launch_pool: "liquidity",
  v4_position_manager: "liquidity",
  lp_position_locker: "liquidity",
  launchpad_factory: "liquidity",
  launch_deployer: "insider",
  fee_wallet: "insider",
};

const round2 = (number) => Math.round(number * 100) / 100;

export function infrastructureAddresses(pons, contractData) {
  const addresses = new Map();
  const add = (address, label) => {
    const key = String(address || "").toLowerCase();
    if (isAddress(address) && !addresses.has(key)) addresses.set(key, label);
  };
  add(ZERO_ADDRESS, "burn_zero_address");
  add(DEAD_ADDRESS, "burn_dead_address");
  add(V4_POOL_MANAGER, "uniswap_v4_pool_manager");
  add(pons?.deployer, "launch_deployer");
  add(pons?.launchFactory, "launchpad_factory");
  add(pons?.tokenLaunched?.curve, "bonding_curve");
  add(pons?.tokenLaunched?.pool, "launch_pool");
  add(pons?.positionManager, "v4_position_manager");
  add(pons?.nftOwner?.owner, "lp_position_locker");
  add(findDecodedArg(contractData?.decoded_constructor_args || [], "feeWallet_"), "fee_wallet");
  return addresses;
}

export function summarizeHolders(result, totalSupply, infrastructure, sanitizeText) {
  if (!result.ok) {
    return {
      status: "unknown_source_failed",
      error: result.error || result.status,
      note:
        "Holder distribution was never retrieved. This is a check that did not run, not a clean result: do not describe concentration as acceptable.",
    };
  }
  let supply = null;
  try {
    supply = BigInt(String(totalSupply ?? "").trim() || "0");
  } catch {
    supply = null;
  }
  const percentage = (value) => {
    if (!supply || supply <= 0n) return null;
    try {
      return Number((BigInt(String(value)) * 1000000n) / supply) / 10000;
    } catch {
      return null;
    }
  };
  const rows = (result.data?.items || []).map((item) => {
    const address = item?.address?.hash || null;
    const known = infrastructure.get(String(address || "").toLowerCase()) || null;
    return {
      address,
      pct: percentage(item?.value),
      role: known ? HOLDER_ROLES[known] || "known" : "unlabelled",
      label: known || sanitizeText(item?.address?.name, "holders.label", 60) || null,
      isContract: Boolean(item?.address?.is_contract),
    };
  });
  const parked = (row) => row.role === "liquidity" || row.role === "burn";
  const sum = (list) => round2(list.reduce((number, row) => number + (Number(row.pct) || 0), 0));
  const concentrating = rows.filter((row) => !parked(row));
  const top10 = rows.slice(0, 10);
  const top10Concentrating = concentrating.slice(0, 10);
  return {
    status: "ok",
    supplyKnown: Boolean(supply && supply > 0n),
    holdersReturned: rows.length,
    pooledOrBurnedPct: sum(rows.filter(parked)),
    insiderPct: sum(rows.filter((row) => row.role === "insider")),
    top10Pct: sum(top10),
    top10ConcentrationPct: sum(top10Concentrating),
    top10,
    top10Concentrating,
    note:
      "Percentages are share of total supply, from the top holders page (one page, sorted descending, so the top 10 is exact whenever holdersReturned is at least 10). Quote top10ConcentrationPct, not top10Pct: on a launchpad token the pool manager, bonding curve, locker and burn address hold most of the supply by design and are not whales. The deployer and fee wallet are insiders and stay in the count. Unlabelled contract holders may still be infrastructure this probe does not know about: check before calling one a whale.",
  };
}

export function createOnchainLiquidityProbe({ blockscout, sanitizeText }) {
  return async function probeOnchainLiquidity(address, role, ca, quoteToken) {
    if (!isAddress(address)) return null;
    const result = await blockscout.tokenBalances(address);
    if (!result.ok) return { address, role, status: "unknown_source_failed", error: result.error || result.status };
    const items = Array.isArray(result.data) ? result.data : result.data?.items || [];
    const normalizedCa = String(ca || "").toLowerCase();
    const normalizedQuote = String(quoteToken || "").toLowerCase();
    const rows = items.map((balance) => {
      const tokenAddress = balance?.token?.address_hash || balance?.token?.address || null;
      const normalizedAddress = String(tokenAddress || "").toLowerCase();
      return {
        symbol: sanitizeText(balance?.token?.symbol, "onchainLiquidity.symbol", 32),
        tokenAddress,
        decimals: balance?.token?.decimals ?? null,
        value: balance?.value ?? null,
        relation:
          normalizedAddress && normalizedAddress === normalizedCa
            ? "queried_token"
            : normalizedAddress && normalizedQuote && normalizedAddress === normalizedQuote
              ? "quote_asset"
              : "unrelated",
      };
    });
    const rank = { queried_token: 0, quote_asset: 1, unrelated: 2 };
    rows.sort((left, right) => rank[left.relation] - rank[right.relation]);
    return {
      address,
      role,
      status: "ok",
      balancesReturned: rows.length,
      balances: rows.slice(0, 8),
      note:
        "Raw balances held by this address: not a price, and not exit liquidity. Only queried_token and quote_asset belong to this market. Entries marked unrelated were sent here by somebody else -- pool and curve addresses collect airdrop spam -- and must never be read as liquidity. On a bonding curve the quote balance is the current reserve, not what a holder could actually exit into.",
    };
  };
}
