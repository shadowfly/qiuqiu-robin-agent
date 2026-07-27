# Qiuqiu Robin Agent

Qiuqiu Robin Agent is a CA-first research skill for Robinhood Chain tokens. It helps an AI agent quickly inspect a token contract address, collect market and social evidence, check DexScreener paid profile status, review Blockscout contract data, identify launchpad and LP-lock evidence, and classify the token's Robinhood Chain narrative.

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
bash skill/scripts/run_robinhood_chain_narrative_radar.sh quick <ROBINHOOD_CHAIN_TOKEN_CA>
```

Example:

```bash
bash skill/scripts/run_robinhood_chain_narrative_radar.sh quick 0x6a98c4145cc8ea5a779118a31308929e5dda8a1a
```

The script outputs JSON first, then a manual evidence checklist.

## Output Highlights

The probe returns structured JSON with:

- `dex.mainPair`: pair URL, price, FDV, market cap, liquidity, volume, buy/sell transactions, pair creation time, websites, socials.
- `dex.paid`: DexScreener tokenProfile order status and boost data.
- `blockscout.token`: token name, symbol, holders, supply, and metadata.
- `blockscout.contract`: verified source status and decoded constructor arguments.
- `contractRisk.heuristicFlags`: source-code risk keywords.
- `launchpad.pons`: Pons launch transaction, tokenId, LP NFT owner, locker contract, and locker risk signals.
- `narrativeSearch`: generated web/social searches and evidence labels based on CA, token name, symbol, domain, X handle, and Robinhood/RWA/AI concept terms.

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
mkdir -p ~/.codex/skills/qiuqiu-robin-agent
cp -R skill/* ~/.codex/skills/qiuqiu-robin-agent/
```

The callable skill name inside `SKILL.md` is:

```text
robinhood-chain-narrative-radar
```

## License

MIT
