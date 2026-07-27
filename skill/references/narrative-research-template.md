# Narrative Research And Objective Summary Template

Use this reference when a user asks whether a Robinhood Chain token's concept, name, meme, RWA story, AI-agent product, launchpad origin, or social narrative has value.

## Search Goals

Do not only search the CA. Search the project's meaning.

Required query groups:

1. Exact identity:
   - `"<CA>"`
   - `"<token name>" "Robinhood Chain"`
   - `"$<symbol>" "Robinhood Chain"`
   - `"<website domain>" "<symbol>"`

2. Social claim:
   - `site:x.com "<CA>"`
   - `site:x.com "$<symbol>" "Robinhood"`
   - `"<x handle>" "<CA>"`
   - `"<x handle>" "Robinhood Chain"`

3. Narrative/concept:
   - `"<token name>" Robinhood meme`
   - `"<concept keyword>" "Robinhood Chain"`
   - `"<concept keyword>" "tokenized stocks"`
   - `"<concept keyword>" RWA stock token`
   - `"<concept keyword>" AI agent Hyperliquid`

4. Collision/noise:
   - `"<symbol>" crypto`
   - `"<token name>" token`
   - `"<token name>" scam`
   - `"<symbol>" "Base" OR "Solana" OR "BSC"`

## Evidence Labels

Label every useful result:

- `official_self_claim`: project website, X, docs, launch thread, Dex profile.
- `independent_ecosystem`: Robinhood/Robinhood Chain adjacent source, launchpad page, credible news, protocol integration.
- `community_social`: KOL posts, X discussion, community threads, organic replies.
- `same_name_noise`: unrelated tokens, same symbol on other chains, copied branding.
- `product_proof`: app, docs, GitHub, API, dashboard, contract, live wallet, real usage.
- `market_only`: price page, Dex chart, paid profile, token mirror.
- `negative_signal`: scam report, broken website, deleted X, contract warning, denied association.

## Multi-Dimensional Scoring

Score 0-5 for each dimension. Use half-points if needed. Do not average away hard red flags.

| Dimension | Weight | What 5 Means |
|---|---:|---|
| Chain Reality | 15 | Real Robinhood Chain pair, active buys/sells, clear token metadata and holders |
| Contract & LP | 15 | Verified source, no obvious backdoor, token-specific LP NFT/locker evidence |
| Official Claim | 15 | Website/X/docs explicitly list CA and cross-link each other |
| Narrative Originality | 15 | Strong Robinhood-native/RWA/AI concept with clear cultural or product source |
| Product Evidence | 15 | Working app/docs/API/GitHub/wallet/actions support the story |
| Social Traction | 10 | Organic X/community/KOL discussion beyond price spam |
| Market Structure | 10 | Liquidity can support realistic exits; volume is not purely wash-like |
| Execution Transparency | 5 | Treasury, fees, rewards, agent actions, or launchpad flows are auditable |

Convert to 100:

```text
weighted_score = sum(score / 5 * weight)
```

Suggested interpretation:

- `80-100`: strong_watch, if no hard red flags.
- `65-79`: watch, credible but still needs monitoring.
- `45-64`: weak_watch, narrative exists but evidence/risk is not enough.
- `<45`: avoid or research_only.

## Hard Red Flags

Any of these can cap the verdict at `avoid` or `weak_watch`:

- CA is not on Robinhood Chain.
- Contract is unverified and liquidity is thin.
- Mint/admin/blacklist/pause/sell-block functions remain active.
- LP NFT is owned by an EOA/deployer when project claims locked liquidity.
- Website/X claims official Robinhood backing without verifiable source.
- Official links do not acknowledge the CA.
- Token relies on "stock/RWA" claims with no issuer, custody, redemption, or legal explanation.
- AI-agent/trading claims have no live wallet, logs, API, or verifiable actions.
- DexScreener paid profile is the main trust evidence.

## Objective Summary Template

Use this for full reports.

```text
{Token}｜Robinhood Chain {Narrative Bucket}

一句话：
{one sentence: what is real + what remains risky}

项目定位：
{what the project claims to be in plain Chinese}

核心机制：
{how it supposedly works: token, app, treasury, agent, RWA, launchpad, etc.}

链上证据：
- CA / chain / main pair
- market cap / liquidity / volume / buy-sell tx
- holders / transfer count
- deployer / launchpad / treasury / LP NFT if found

社媒与叙事证据：
- Dex profile links
- website/X/Telegram CA recognition
- independent source or only self-claim
- concept origin and same-name noise

产品证据：
- website app route / docs / GitHub / API / dashboard / wallet actions
- front-end shell or real product loop

合约与 LP 风险：
- verified source status
- mint/owner/blacklist/tax/pause/sell-limit flags
- LP tokenId / locker owner / locker source / fee redirect

评分表：
Chain Reality: x/5
Contract & LP: x/5
Official Claim: x/5
Narrative Originality: x/5
Product Evidence: x/5
Social Traction: x/5
Market Structure: x/5
Execution Transparency: x/5
Weighted Score: xx/100

优势：
{3-5 bullets}

风险：
{3-7 bullets, ordered by severity}

缺失证据：
{what would change the verdict}

结论：
{strong_watch | watch | weak_watch | avoid} — {why}

下一步验证：
{one to three concrete checks}
```

## Writing Rules

- Be Chinese-first, concise, and evidence-led.
- Do not say "有价值" without saying which evidence supports it.
- Separate "项目方自称" from "外部独立证明".
- Separate "合约暂未发现明显后门" from "项目可信".
- Separate "真实运行" from "值得买".
- Use `数据口径待核` when market/social data is time-sensitive.
