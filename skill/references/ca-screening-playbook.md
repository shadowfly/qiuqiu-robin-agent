# CA Screening Playbook

Use this reference when a user gives only a Robinhood Chain CA and wants a fast true/fake/safety/narrative read.

## Required Fast Checks

1. DexScreener pair data:
   - `https://api.dexscreener.com/latest/dex/tokens/<CA>`
   - Confirm `chainId=robinhood`.
   - Capture main pair, market cap/FDV, liquidity, 24h volume, buy/sell tx, pair age, links.

2. DexScreener paid status:
   - `https://api.dexscreener.com/orders/v1/robinhood/<CA>`
   - `tokenProfile approved` means paid profile is approved.
   - `boosts[]` means paid boost exists.
   - Treat payment as visibility/marketing, not legitimacy.

3. Blockscout token:
   - `/api/v2/tokens/<CA>`
   - `/api/v2/tokens/<CA>/counters`
   - `/api/v2/smart-contracts/<CA>`
   - Capture holders, transfers, verified source, decoded constructor args.

4. Contract risk source scan:
   - Search verified source for mint, owner/admin controls, blacklist, pause, tax/fee setters, maxTx/maxWallet, sell/transfer restrictions.
   - For launchpad templates, separate launch-time limits from permanent controls.

5. LP / launchpad proof:
   - If Pons constructor args appear, find deployer launch transaction.
   - Decode logs for `TokenLaunched`, `PoolCreated`, `PositionLocked`, and ERC-721 `Transfer`.
   - Extract `positionId`, PositionManager, pool, locker, feeRedirect.
   - Verify NFT instance owner is the locker.
   - Read locker source: check for withdraw/unlock/decreaseLiquidity/arbitrary call.

6. Social proof:
   - Use Dex profile links first.
   - Search exact CA on X/web.
   - Check whether X bio/thread/website lists CA.
   - Note if the account is new, verified, paid, high-follower, or mostly price spam.

7. Narrative search:
   - Use `narrativeSearch.queries` from `robinhood_ca_probe.mjs`.
   - Search token name, symbol, CA, website domain, X handle, and concept keywords.
   - Classify each result as official/self-claim, independent source, community discussion, same-name collision, or spam.
   - Load `narrative-research-template.md` for full scoring and objective summary.

8. Optional OKX / other chain skills:
   - Use OKX token/security/holder tools only when their active chain support includes Robinhood Chain.
   - If unsupported, clearly state fallback and do not quote unsupported scanner results.
   - Binance Token Audit does not support Robinhood Chain.

## Fast Output

```text
{Token}｜Robinhood Chain {bucket}

一句话：{what is real} + {what remains risky}

Dex：mcap / liquidity / volume / buys-sells / paid profile / boost
合约：verified / fixed supply / owner-mint-tax-blacklist-pause-sell flags
LP：tokenId / owner / locker / withdraw surface
社媒：website / X / Telegram / CA recognition / discussion quality
叙事：native meme / RWA / AI agent / launchpad infra / ticker noise
初判：strong_watch | watch | weak_watch | avoid
下一步：one concrete verification that changes the verdict
```

## Full Objective Summary

For a deeper report, use:

```text
项目定位：
核心机制：
链上证据：
社媒/叙事证据：
产品证据：
合约与LP风险：
市场结构：
评分表：
优势：
风险：
缺失证据：
结论：
下一步验证：
```

## Downgrade Rules

- No Dex pair or not Robinhood Chain -> `avoid`.
- Unverified contract plus low liquidity -> `avoid` or `weak_watch`.
- Paid Dex profile but no official CA recognition -> do not upgrade.
- Launchpad supports locks but LP NFT owner is not verified -> "LP support but unproven".
- Centralized treasury/profit share -> keep below `strong_watch` unless distribution is on-chain forced.
