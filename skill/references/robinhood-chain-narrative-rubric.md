# Robinhood Chain Narrative Rubric

Use this when judging whether a Robinhood Chain token narrative is real enough to watch.

## Scoring Summary

Score each section from 0 to 3:

- `0`: missing, contradictory, or suspicious
- `1`: weak signal, mostly price-page or same-name evidence
- `2`: credible but incomplete
- `3`: strong, independently verifiable evidence

Suggested verdict:

- `strong_watch`: 14+ total, no hard red flags, and CA is officially recognized
- `watch`: 10-13 total, credible narrative but one or two important gaps
- `weak_watch`: 6-9 total, mostly narrative with thin proof
- `avoid`: 0-5 total, or any hard red flag

## 1. Chain And Market Reality

Strong:
- DexScreener confirms `chainId=robinhood`, active pair, balanced buy/sell activity, non-trivial liquidity.
- DexScreener paid orders are transparent: tokenProfile/boost status is checked and not mistaken for safety.
- Blockscout token page, transfers, and contract are visible.
- Contract ownership, proxy, or mint behavior is understandable or verified.

Weak:
- Pair exists but liquidity is tiny, wash-like, or one-sided.
- Only transfers are airdrops/incentives to many wallets.
- No clear sell activity or route.

Hard red flags:
- CA is not on Robinhood Chain while marketed as Robinhood Chain.
- Honeypot/transfer restriction evidence.
- Liquidity can disappear or trading is effectively blocked.
- Dex profile links to X/website that do not acknowledge the CA or contradict the token.

## 1A. Contract And LP Reality

Strong:
- Verified source shows no mint, no owner-only transfer controls, no blacklist, no pause, no buy/sell tax, and no sell restriction.
- Launchpad parameters are decoded and align with known Robinhood launchpads.
- Main LP NFT tokenId is identified, current owner is a verified locker, and locker source exposes no withdraw/unlock/arbitrary-call path.

Medium:
- Contract is verified and looks standard, but LP NFT ownership or lock duration is not yet proven.
- Launchpad supports locks, but the token-specific LP NFT owner has not been verified.

Weak:
- Unverified source, proxy without implementation clarity, or unknown launch route.
- Holder concentration is high and the largest non-LP/non-burn addresses are not classified.

Hard red flags:
- Mint or privileged supply controls remain active.
- Owner/admin can blacklist, pause, block sells, set punitive taxes, or transfer LP NFT out.
- LP NFT is owned by deployer/EOA rather than a verifiable locker.

## 2. Narrative Fit

Strong:
- Clear relation to Robinhood Chain distribution, stock-token/RWA rails, brokerage-style UX, trading infra, or new-chain DeFi liquidity.
- Narrative explains why this token belongs on Robinhood Chain specifically.
- Robinhood-native meme has a discoverable cultural source: Cash Cat, Vlad/Robinhood CEO posts, chain ID 4663, Hood/Cash/Robin Hood lore, or known ecosystem moment.

Medium:
- Generic DeFi or consumer wallet project that could fit any EVM chain but has some Robinhood Chain execution.

Weak:
- Uses Robinhood, HOOD, stocks, Nasdaq, or famous ticker words without any functional link.
- Narrative is only price copy: "first", "official", "AI", "RWA", "stock token" with no mechanism.
- Generic AI agent copy without live API, wallets, trades, docs, or product loop.

## 3. Official Recognition

Strong:
- Website, docs, X, or app explicitly lists the CA.
- Same domain links to X/GitHub/docs, and those sources cross-link back.
- Robinhood or a credible ecosystem account mentions the project or integration.

Medium:
- Official project exists but CA is not clearly listed.
- Launch thread and website agree, but no independent ecosystem recognition.

Weak:
- Only third-party price pages and Telegram groups mention the CA.
- Same-name X/GitHub accounts are not cross-linked.

Hard red flags:
- Claims "official Robinhood" without verifiable Robinhood source.
- Impersonates stock brands, public companies, or Robinhood branding.

## 4. Product And Technical Evidence

Strong:
- App route works and has real actions: swap, mint, redeem, bridge, portfolio, vault, analytics, API, or auth.
- GitHub or docs support the product claim with recent updates.
- Token has an understandable role in the product.

Medium:
- Docs are meaningful, but app is early or gated.
- GitHub exists but is not fully linked to deployed product.

Weak:
- Polished landing page with no working app path.
- Demo screenshots only, static dashboard, broken links, or generic template.

## 5. Stock Token / RWA Specific Proof

Use this section only when the project claims stock, RWA, yield, synthetic equity, or brokerage exposure.

Strong:
- Issuer, custody/backing, redemption, region restrictions, legal docs, and risk disclosures are clear.
- Mechanism distinguishes real tokenized equity, synthetic exposure, and meme/ticker representation.

Medium:
- Good docs but issuer/custody or redemption remains unclear.

Weak:
- "Stock token" is just a ticker meme.
- No explanation of backing, redemption, oracle, collateral, or restrictions.

Hard red flags:
- Promises stock ownership, dividends, guaranteed yield, or redemption without legal/issuer evidence.

## 6. Distribution And Smart-Money Quality

Strong:
- Multiple credible wallets bought through a route, with tx context supporting organic accumulation.
- Official incentives or campaigns are disclosed and do not masquerade as buys.

Medium:
- Watch wallets received token, but transfer context needs classification.

Weak:
- Airdrops, project-team transfers, LP movements, bridge churn, or incentive farming are presented as smart-money buying.

## Risk Pattern Library

- `official_name_hijack`: borrows Robinhood/public-company language without official recognition.
- `ticker_meme_noise`: stock ticker resemblance drives attention, not product.
- `rwa_shell`: RWA/stock-token words with no issuer, custody, redemption, or legal clarity.
- `airdrop_as_buy`: wallet receives are treated as buys without route/tx proof.
- `front_end_shell`: site looks real but app actions are fake/static/gated forever.
- `liquidity_mirage`: thin liquidity or one-sided activity makes exits unreliable.
- `ca_unclaimed`: project exists, but no official source claims this CA.
- `same_name_repo`: GitHub result matches the name but is not official or active.
- `paid_profile_trust_trap`: DexScreener paid tokenProfile/boost is treated as legitimacy instead of marketing.
- `launchpad_confusion`: platform supports lock/security, but the token-specific LP NFT is not verified.
- `centralized_profit_share`: holder rewards depend on treasury/backend discretion rather than on-chain forced distribution.

## Upgrade Triggers

Move from `watch` to `strong_watch` only when at least three of these appear:

- Official source explicitly lists the CA.
- Product route works on Robinhood Chain.
- Credible ecosystem/Robinhood-adjacent source recognizes the integration.
- Liquidity and buy/sell activity remain healthy over time.
- GitHub/docs ship updates after launch.
- RWA/stock claims have issuer/custody/redemption clarity.

Downgrade immediately when:

- Official sources deny association.
- CA changes without explanation.
- Sell route breaks or transfer restrictions appear.
- Liquidity is pulled.
- Website/X disappears or rebrands away from the token.

## Full Narrative Value Score

When the user asks for narrative value, concept quality, whether the name has a meme source, or a full objective summary, use `narrative-research-template.md` instead of only this quick rubric.

The full score must include:

- Chain Reality
- Contract & LP
- Official Claim
- Narrative Originality
- Product Evidence
- Social Traction
- Market Structure
- Execution Transparency

Do not allow a high Narrative Originality score to override hard contract, LP, or official-claim gaps.
