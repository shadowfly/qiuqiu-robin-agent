# Case Study: Agent Robin

Agent Robin｜Robinhood Chain `trading_defi / ai_agent`

## 一句话

Agent Robin 是 Robinhood Chain 上一个真实运行过的早期 AI trading meme 项目：代币、主池、交易、官网/X 认领、Hyperliquid 仓位和 Pons 部署关系都有证据。但“真实运行”不等于“值得信任”，关键风险集中在 Treasury 控制权、LP 锁定证明、中心化收益分配和 AI 交易能力不可验证。

## 项目定位

Agent Robin 自称是一个 AI trading / treasury 型 meme 项目，围绕官网实时面板、Hyperliquid 仓位和收益/treasury 展示来建立可信度。

它与 Robinhood 的关系主要是：

```text
部署在 Robinhood Chain 上
使用 Robin/Robinhood 相关名字和语境
没有 Robinhood 官方背书证据
```

## 核心机制

从案例材料看，项目机制可以拆成四层：

```text
ROBIN 代币 -> Pons Launchpad 发射 -> Uniswap V3 主池交易
       |
       v
 项目官网 / X 认领 CA
       |
       v
 Treasury EOA + Hyperliquid 仓位展示
       |
       v
 宣称 AI/agent 交易与收益分配
```

项目有真实前端和链上活动，但收益分配和 treasury 管理并不是已验证的链上强制合约闭环。

## 链上证据

案例快照数据如下，市场数据变化极快，实际分析时必须重新运行 CA probe。

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
Holders: about 480+
```

这些数据说明它不是完全没有交易的假页面：

- Robinhood Chain 主池存在。
- 有真实成交。
- 有买入也有卖出。
- 官网、X、CA 和 treasury 地址存在部署关联。
- 官网展示过 Hyperliquid 资产/仓位。

但同一组数据也说明市场结构很脆：

- 24h 成交额约为流动性的 7.8 倍。
- 买入笔数约为卖出的 1.32 倍。
- 短时间价格上涨约 69 倍。
- 流动性只有约 4.3 万美元。
- 几千美元卖单就可能造成明显滑点。
- 另有多个几乎没有流动性的 ETH 噪音池，不能作为价格依据。

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

## 社媒与叙事证据

官网和 X 明确认领 CA，这属于项目方自我认领。

没有找到 Robinhood 官方或 Robinhood Chain 官方对 Agent Robin 的背书。它不应归类为 `official_or_ecosystem`。

X 账号处于早期阶段：

- 加入时间：2026 年 7 月
- 粉丝：约 117
- 发帖：约 23 条
- X 简介写 “Powered by Opus 5”
- 官网 API 显示 `brain: claude`

AI 宣传前后不完全一致，不一定说明造假，但说明 AI 决策能力不能只靠官网文案或 X 简介验证。

叙事分类更接近：

```text
Narrative Bucket: trading_defi / ai_agent
Not: official_or_ecosystem
Not: stock_token_rwa
```

## 产品证据

项目有一定产品证据：

- 官网实时面板。
- 官网 treasury/asset 展示。
- Hyperliquid 仓位或资产展示。
- 项目方 X 和 Dex profile 链接。

但这些证据的强度有限：

- 官网数据和链上 WETH 余额曾出现不同步。
- Treasury WETH 余额变化很快，可能被转出或进入其他流程。
- 官网 treasury 数字可能存在缓存、统计口径或同步问题。
- AI 交易记录无法完全独立验证。
- 收益分配没有链上强制合约证明。

因此产品证据可以支持“项目真实运行”，但不能支持“收益机制可信”。

## 合约与 LP 风险

ROBIN 代币合约本身，案例材料中暂未发现典型恶意后门：

- 总供应量一次性固定为 1,000,000,000。
- 没有 mint。
- 没有 owner。
- 没有黑名单。
- 没有交易税逻辑。
- 没有暂停交易函数。
- 没有针对卖出的限制。
- 只在发射初期限制从官方 V3 池买入。
- 限制期结束后按普通 ERC-20 转账。

这说明它不像典型 honeypot 或可随时增发的恶意币。

但代币合约安全不等于项目可信。更关键的是 LP 和 treasury：

- PonsLaunchLocker 存在，只能证明平台支持锁仓。
- 不能因为某些 LP NFT 在 Locker 地址里，就证明 ROBIN 这一个池子的 LP 已锁。
- 案例材料中没有完成 ROBIN token-specific LP NFT tokenId、owner、锁定截止时间验证。
- Treasury 是普通私钥钱包。
- 手续费、收益、分配权是否可由项目方改变，仍需继续追踪。

正确写法应是：

```text
LP support exists, but token-specific LP lock is unproven in this case snapshot.
```

## 持仓结构

holders 从约 370+ 增至约 480+，说明参与者在增加。

但前排地址混杂：

- LP 合约
- 7702 智能账户
- Launch locker
- 协议合约
- 普通早期钱包

不能直接把前十大地址全部当成项目方持仓，也不能直接当成聪明钱。

案例材料中较明确的风险是：

- 主池约占总供应量 10.5%。
- 最大普通/特殊地址约占 13%+。
- 供应集中度较高。
- 流动性远小于成交额。

## 评分表

```text
Chain Reality: 4/5
Contract & LP: 2.5/5
Official Claim: 3/5
Narrative Originality: 3/5
Product Evidence: 3/5
Social Traction: 1.5/5
Market Structure: 1.5/5
Execution Transparency: 1.5/5
Weighted Score: 54/100
```

评分说明：

- 链上真实度较高：真实主池、真实交易、真实部署关系、真实官网/X 认领。
- 合约本身暂未发现典型后门，但 LP 锁仓在案例快照中未完成 token-specific 验证。
- 官方认领只到项目方层面，没有 Robinhood 官方背书。
- 产品证据存在，但 treasury、AI 决策、收益分配都缺少强制链上闭环。
- 市场结构高波动、薄流动性，不能用成交额替代可退出深度。

## 优势

- 代币合约本身未显示典型 honeypot、增发、黑名单、卖出限制。
- 官网、X、CA、Treasury 在部署参数中存在关联，不像事后拼接的假页面。
- 主池有真实交易和卖出，不是完全无成交假盘。
- 有 Pons Launchpad 部署关系，相关平台合约已验证。
- 有官网实时面板和 Hyperliquid 仓位展示，产品不是纯 landing page。
- AI trading meme 叙事在早期链上容易吸引注意力。

## 风险

- Treasury 是普通 EOA，资金控制权高度中心化。
- 收益分配没有链上强制合约，持续性依赖项目方。
- LP 是否锁定、锁多久，在案例快照中尚未 token-specific 证明。
- 官网 treasury 数据和链上余额曾多次对不上。
- 流动性很薄，24h 成交额远高于池子深度，退出滑点风险高。
- 持仓集中度高，少数地址可能影响价格。
- 没有 Robinhood 官方或 Robinhood Chain 官方背书。
- AI 交易能力无法独立验证，宣传口径也存在不一致。

## 缺失证据

能改变判断的关键证据包括：

- ROBIN 对应的 Uniswap V3 LP NFT tokenId。
- LP NFT 当前 owner 是否为已验证 locker。
- 锁定截止时间或永久锁定机制。
- LP 手续费收取权和 fee recipient 是否可变更。
- Treasury 是否改为多签或链上收益分配合约。
- Hyperliquid 仓位、交易决策、收益分配的可验证日志。
- Robinhood 官方或生态方的独立提及。

## 结论

`weak_watch`

Agent Robin 更像一个真实运行中的中心化 AI trading meme 实验盘。真实代币、真实主池、真实交易、真实部署关系和真实仓位展示提高了链上真实度，但当前仍没有达到“可验证、可信任、可重仓”的程度。

本案例最重要的判断原则是：

```text
代币合约没明显后门，只能说明 token 层暂时没看到硬伤；
项目是否可信，要继续看 LP、Treasury、收益分配和产品执行。
```

## 下一步验证

1. 找到 ROBIN 对应的 Uniswap V3 LP NFT tokenId，并确认 owner 是否为 Locker。
2. 确认 LP 锁定截止时间、手续费收取权和 fee recipient 控制权。
3. 追踪 Treasury、Hyperliquid 仓位和收益分配是否能形成链上闭环。
