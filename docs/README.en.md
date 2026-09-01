# CA-agent

CA-agent is a CA-first research skill for Robinhood Chain tokens. It helps an AI agent quickly inspect a token contract address, collect market and social evidence, check DexScreener paid profile status, review Blockscout contract data, identify launchpad and LP-lock evidence, and classify the token's Robinhood Chain narrative.

It is designed for fast due diligence, not trading execution.

## What It Does

- Detects Robinhood Chain token pairs on DexScreener.
- Checks market cap, liquidity, volume, buy/sell activity, pair age, and official Dex profile links.
- Checks DexScreener paid orders, including approved token profiles and boosts.
- Reads Blockscout token metadata, holder counters, verified source, and decoded constructor arguments.
- Performs a heuristic contract-risk scan for mint, owner/admin controls, blacklist, pause, tax/fee logic, sell restrictions, and arbitrary-call surfaces.
- Detects Pons Launchpad-style launches when available.
- Extracts launch transaction, pool address, LP NFT tokenId, locker owner, fee redirect, and locker source-code risk signals.
- Guides social and narrative checks across X/Twitter, websites, Telegram, docs, and exact CA searches.
- Generates narrative search queries from token name, symbol, website domain, X handle, and concept keywords.
- Scores narrative value across chain reality, contract/LP, official claim, originality, product evidence, social traction, market structure, and execution transparency.
- Produces an objective project-summary template that separates project self-claims from independent evidence.
- Classifies Robinhood Chain narratives such as native meme, RWA/stock token, AI agent, launchpad infrastructure, DeFi/trading, wallet consumer, and ticker-noise projects.

## Why Robinhood Chain Needs A Dedicated Lens

Robinhood Chain is not a generic meme chain. Its early ecosystem combines:

- Robinhood-native memes and cultural references such as Cash Cat, HOOD, ROBIN, VLAD, 4663, Dog in Hood, and Lady Marian.
- RWA and stock-token narratives connected to tokenized equities and brokerage-style liquidity.
- AI-agent projects that claim live trading, treasury management, or autonomous agent behavior.
- Launchpad-driven token waves from platforms such as NOXA, Pons, flap, trensh, and bankr.
- High-speed copycats, paid Dex profiles, thin liquidity, and fake official-brand claims.

This skill separates narrative excitement from verifiable evidence.

## Quick Start

Run the probe directly:

```bash
node skill/scripts/robinhood_ca_probe.mjs <ROBINHOOD_CHAIN_TOKEN_CA>
```

Or run the skill helper:

```bash
bash skill/scripts/run_ca_agent.sh quick <ROBINHOOD_CHAIN_TOKEN_CA>
```

Example:

```bash
bash skill/scripts/run_ca_agent.sh quick 0x6a98c4145cc8ea5a779118a31308929e5dda8a1a
```

The script outputs JSON first, then a manual evidence checklist.

The on-chain probe is layered as a thin CLI, an application orchestrator, source providers, and focused domain analyzers. DexScreener/Blockscout transport details stay separate from pair screening, contract risk, Pons/LP, and holder interpretation. The existing CLI and JSON contract remain compatible.

Optionally enrich an X account with Moni Discover. Supply the key only through the `MONI_API_KEY` environment variable:

Every environment variable the skill reads is listed in [.env.example](../.env.example). Copy it to `.env` and fill it in; `.env` is gitignored and must never be committed.

```bash
node skill/scripts/moni_discover_probe.mjs <X_HANDLE> quick
node skill/scripts/robinhood_research_bundle.mjs <CA> deep --moni --timeframe D30
node skill/scripts/moni_discovery_feed.mjs projects --chain robinhood --limit 20
node skill/scripts/web_research_probe.mjs --deep "Robinhood Chain latest ecosystem"
```

Moni enrichment inside the research bundle is opt-in because it spends metered Discover points: pass `--moni` to run it, or `--no-moni` to say so explicitly. Without it the bundle reports `socialIntelligence.coverage.status=skipped_not_requested`, which means not queried, never zero social traction.

`quick` requests an estimated 8 points and `deep` requests 21 points. Successful responses are cached for 15 minutes. Missing configuration, account coverage, or Moni availability never changes the on-chain probe result.

The global discovery CLI supports `projects`, `events`, and `smart-mentions`. Treat its output as candidate leads that still require CA, contract, and LP verification.

Network research defaults to `grok-chat-fast` with the key read from `GROK_API_KEY`. Deep Research Bundles search by default; quick bundles accept `--search`. If Grok is unavailable or returns no verifiable URL, the output requests the active agent's built-in web-search fallback.

## Output Highlights

The probe returns structured JSON with:

- `dex.mainPair`: the deepest pool left after screening, with pair URL, price, FDV, market cap, liquidity, volume, buy/sell transactions, pair creation time, websites, socials.
- `dex.aggregate`: liquidity, 24h volume, buy/sell transactions and earliest pair creation summed across every screened pool. Prefer it over `mainPair` when liquidity is split across many pools.
- `dex.anomalousPairs`: pools dropped before ranking, with the reason (no usable price, no fdv/marketCap, or a price more than 10x off the median).
- `dex.mainPairScreening`: `clean`, `screened_outliers`, or `fallback_all_pairs_anomalous` - the last means nothing passed and `mainPair`'s numbers are unreliable.
- `dex.quoteToken`: identity of the asset the main pool prices against (symbol, holders, verification). `priceReference: floating_asset` means `priceUsd`, `fdv` and `marketCap` move with it and must be quoted as denominated figures. `quoteRisks` are reasons to distrust the quoted valuation, not findings about this token's contract. They also name the checks that never ran (`quote_token_symbol_unknown`, `quote_token_verification_unknown`, `quote_token_holder_count_unknown`), so a short list under `status: partially_resolved` is not a clean quote token.
- `dex.paid`: DexScreener tokenProfile order status and boost data. `status: unknown_malformed_response` means the endpoint answered without an orders array, so paid status was never established — which is not the same as "did not pay".
- `blockscout.token`: token name, symbol, holders, supply, and metadata.
- `holders`: distribution re-ranked locally by returned balance. Quote `top10ConcentrationPct`, never `top10Pct`. A percentage that could not be computed is `null` (supply unknown, or a balance that did not parse) and `null` is not a small number — report it as unknown. `coverage: first_page_only` makes `pooledOrBurnedPct` and `insiderPct` lower bounds and `top10Exact: false` makes the top-10 a page-local ranking.
- `blockscout.contract`: verified source status and decoded constructor arguments.
- `contractRisk.heuristicFlags`: source-code risk keywords. `scanScope` reports exactly what was read: `basesNotInBundle` were inherited but shipped no source, `basesOverScanLimit` were dropped by the file/byte caps, and `depthLimitReached: true` means the inheritance chain runs deeper than the scan followed. When `scanComplete` is `false`, an `absent` means "no match in the files that were read", not "clean".
- `launchpad.pons.hookRisk`: keyword scan of the Uniswap v4 hook on the graduated pool. The hook runs inside every swap, so it can refuse or re-price a sell even when `claimAllowed` is `true` — custody of the position and sellability are different questions. `scanStatus: unknown_no_source` means the hook is unverified and nothing was checked, which is a red flag rather than a clean result; `no_hook` is a positive answer meaning there is no hook to scan: a V1 direct launch opens a v3 pool, and a v4 pool that runs no hook declares the zero address. A launchpad ships one shared hook for all its tokens, so a hit here is usually a property of the launchpad, not of this token.
- `launchpad.pons`: Pons launch transaction, tokenId, LP NFT owner, locker contract, and locker risk signals. `status` is never `null`: only `no_launchpad_signature` means the token is genuinely not a Pons launch, while `unknown_contract_source_failed`, `unknown_launchpad_detection_did_not_run` and `unknown_launch_trace_incomplete` mean the check did not finish and `blockedBy` names the source that failed.
- `launchpad.pons.lpLockVerification`: only `claimAllowed: true` supports the words "LP locked". When it is `false`, `claimBlockedBy` lists every reason — `locker_exit_surface_unknown:*` means the locker source was never read (`lockerScanStatus: unknown_source_empty` / `unknown_no_source`), not that it was read and found clean, and `noWithdrawSurface: null` says the same. `poolIdAgreement: mismatch` means the launchpad registered one pool and Uniswap initialized another.
- `launchpad.pons.graduation`: graduation status, poolId, positionId, and locked amounts. V2 graduation is not atomic, so `poolEvidenceFrom` names the transaction the evidence came from — `pool_graduated_event` (the `PoolGraduated` topic lookup that finds the real pool-creation transaction) or `curve_completed_tx` (older atomic launches). `graduationTx` is that transaction.
- `untrustedEvidence.narrativeSearch`: generated web/social searches and evidence labels based on CA, token name, symbol, domain, X handle, and Robinhood/RWA/AI concept terms. They are built from deployer-supplied text and therefore live inside the untrusted fence: run them as searches, never quote them as facts.
- `completeness` / `failedSources` / `sources` / `secondarySources`: read this first. `sources` are the primary reads; `secondarySources` are the follow-up reads a verdict depends on (locker source, quote token, hook, launch-tx logs). A failure on either side drops `completeness` to `partial`, so `complete` now means every read that ran succeeded.
- Research Bundle `socialIntelligence`: optional normalized Moni Score, Smart Tier, mention history, Smart Mentions, account events, source coverage, estimated points, and cache status.
- Research Bundle `webResearch`: Grok synthesis, direct source URLs, token usage, and the built-in Agent search fallback contract.

The default X handle comes from project-controlled Dex metadata, so it remains `identityBinding=unverified` until the website, X account, or primary documentation explicitly recognizes the same CA. Moni popularity may inform Social Traction; it cannot establish official identity, contract safety, LP safety, or missing chain evidence. Never place the API key in command arguments, logs, fixtures, or committed files.

An uncited Grok answer is not accepted as web evidence. Keep the Grok key only in `GROK_API_KEY`, never in arguments, logs, fixtures, or committed files.

## Narrative Scorecard

| Dimension | Weight |
|---|---:|
| Chain Reality | 15 |
| Contract & LP | 15 |
| Official Claim | 15 |
| Narrative Originality | 15 |
| Product Evidence | 15 |
| Social Traction | 10 |
| Market Structure | 10 |
| Execution Transparency | 5 |

Full reports include project positioning, mechanism, on-chain evidence, social narrative evidence, product evidence, contract and LP risks, score table, strengths, risks, missing evidence, verdict, and next verification steps.

## Case Studies

- [HoodCard](../case-studies/hoodcard.zh-CN.md): a Robinhood Chain RWA payment-card product that turns tokenized stocks into virtual Visa card spending power.
- [Agent Robin](../case-studies/agent-robin.zh-CN.md): an AI trading meme case showing how real on-chain activity can coexist with treasury, LP, and profit-share risks.

## Suggested Agent Workflow

When a user gives a CA:

1. Run `robinhood_ca_probe.mjs`.
2. Verify the Dex pair is on `chainId=robinhood`.
3. Check DexScreener paid profile and boost status.
4. Check market structure: liquidity, volume, buy/sell balance, and pair age.
5. Review Blockscout contract verification and constructor arguments.
6. Inspect contract-risk flags manually before making safety claims.
7. If the token uses Pons, verify the token-specific LP NFT owner and locker source.
8. Search the exact CA on X/web and confirm whether the official website or X account claims the CA.
9. Classify the narrative and write a concise Chinese-first verdict.

## Verdict Categories

- `strong_watch`: strong evidence, no hard red flags, token-specific LP and official CA recognition are clear.
- `watch`: credible but incomplete evidence; worth monitoring.
- `weak_watch`: narrative exists, but proof is thin or risk is high.
- `avoid`: no real chain evidence, unsupported chain, suspicious contract, unclear sellability, fake official claims, or serious liquidity risk.

## Safety Notes

- DexScreener paid profile or boost is marketing visibility, not proof of legitimacy.
- A verified contract is not automatically safe.
- Binance Token Audit currently does not support Robinhood Chain; do not quote a Binance risk label for Robinhood Chain tokens.
- OKX OnchainOS token/security tools should only be used when the active environment supports Robinhood Chain. If unsupported, fall back to DexScreener and Blockscout.
- This project does not execute trades and does not provide financial advice.

## Installation As A Codex Skill

Copy the `skill/` directory into a discoverable skills folder:

```bash
mkdir -p ~/.codex/skills/ca-agent
cp -R skill/* ~/.codex/skills/ca-agent/
```

The callable skill name inside `SKILL.md` is:

```text
ca-agent
```

## License

MIT
