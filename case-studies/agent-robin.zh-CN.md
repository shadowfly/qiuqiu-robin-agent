# Case Study: Agent Robin

## 一句话

Agent Robin 是 Robinhood Chain 上的早期 AI trading meme 项目。它有真实代币、真实主池、真实交易、真实 Hyperliquid 仓位和官网/X/CA 认领关系，但项目可信度不能只看“真实运行”。关键风险集中在 LP 锁仓、Treasury 控制权、中心化收益分配和 AI 交易能力是否可持续。

## 快照数据

以下数据来自一次点位复盘，用于展示 Qiuqiu Robin Agent 的判断方式。市场数据变化极快，实际分析时必须重新运行 CA probe。

```text
Chain: Robinhood Chain
DEX: Uniswap V3
Price: about $0.0001957
FDV: about $195,791
Liquidity: about $43,142
24h Volume: about $336,396
24h Buys: about 2,013
24h Sells: about 1,522
Main pool WETH: about 11.62 WETH
Main pool ROBIN: about 104.98M
Main pool supply share: about 10.5%
```

这些数据说明项目不是没有真实成交的假页面。主池有真实交易，也有卖出。但同一组数据也显示明显高风险：

- 24h 成交额约为流动性的 7.8 倍。
- 买入笔数约为卖出的 1.32 倍。
- 短时间价格涨幅极端。
- 流动性只有几万美元级别。
- 几千美元卖单就可能造成明显滑点。

此外，存在多个几乎没有流动性的 ETH 噪音池，不能作为价格或流动性依据。

## 部署关系

Token launch 交易参数显示：

- Token 名称：Agent Robin
- Symbol：ROBIN
- Website metadata：agentrobinrh
- X：https://x.com/agentrobinrh
- Treasury / deployer 参数：`0xB0bEd084b44e40Fe165EDECe08b95Afb8aD07624`
- 发起部署钱包：`0x9a6b...3ABD`
- 工厂：PonsLaunchFactory

这证明官网、X、代币 CA 和 Treasury 之间存在链上部署关联。Treasury 不是事后随便写在官网里的地址，而是部署流程的一部分。

但 Treasury 仍然是普通 EOA 钱包，不是链上强制分红合约。

## LP 锁仓教训

这个案例最重要的产品启发是：不能因为平台支持锁仓，就默认某个 token 的 LP 已锁。

早期复盘中曾看到 PonsLaunchLocker 和若干 LP NFT，但其中一个示例 tokenId 实际对应的是别的项目，而不是 ROBIN。因此，在没有找到 ROBIN 对应 LP NFT tokenId 前，应把 LP 状态写成：

```text
LP support exists, but token-specific LP lock is unproven.
```

正确流程应该是：

1. 找到 ROBIN 的 TokenLaunched / PositionLocked 事件。
2. 提取 ROBIN 对应的 LP NFT tokenId。
3. 查询该 NFT 当前 owner。
4. 确认 owner 是否是已验证 locker。
5. 阅读 locker 源码，看是否存在 withdraw / unlock / decreaseLiquidity / arbitrary-call。

只有完成以上步骤，才可以说“ROBIN 这一个池子的 LP NFT 已锁定”。

## 持仓结构

holders 增长说明参与者增加，但前排地址需要分类：

- LP 合约
- 7702 智能账户
- Launch locker
- 协议合约
- 普通早期钱包

不能直接把前十大地址全部当作项目方持仓，也不能直接当作聪明钱。

较稳定的风险结论是：

- 主池占供应量约 10% 级别。
- 最大普通/特殊地址可能超过 13%。
- 供应集中度较高。
- 流动性远低于成交额。

## 官方性判断

官网和 X 明确认领 CA，但这只代表项目方自己认领。

没有找到 Robinhood 官方或 Robinhood Chain 官方对 Agent Robin 的背书。

X 账号是新号，粉丝和帖子数量仍处于早期阶段。官网和 X 对 AI 叙述也存在细节差异，例如 X 简介写 “Powered by Opus 5”，官网 API 显示 `brain: claude`。这不一定说明造假，但说明 AI 决策不能只靠宣传判断。

## 风险评分

```text
Chain Reality: 7/10
Project Trust: 4/10
Narrative Bucket: trading_defi
Narrative Level: narrative_watch
Evidence Level: credible_but_incomplete
Official Recognition: project self-recognized CA, no Robinhood official recognition
Product Proof: website live panel + Hyperliquid positions
Initial Verdict: weak_watch
```

## 主要风险

1. Treasury 是普通私钥钱包。
2. 分红没有链上强制合约。
3. LP 锁定必须 token-specific 验证，不能用平台锁仓能力代替。
4. 官网数据和链上余额可能不同步。
5. 流动性薄，价格波动极端。
6. 没有 Robinhood 官方背书。
7. AI 交易能力无法独立验证。

## 一句话结论

Agent Robin 更像一个真实运行中的中心化 AI trading meme 实验盘。真实代币、真实主池、真实交易和真实仓位提高了链上真实度，但“真实运行”不等于“值得买”。关键未知不是代币合约，而是 LP 锁仓、Treasury 控制权和分红是否持续。

对 Qiuqiu Robin Agent 来说，这个案例证明了一个原则：

```text
先证明 token-specific LP 和合约安全，再谈叙事。
```
