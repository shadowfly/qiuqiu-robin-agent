# 🏹 Qiuqiu Robin Agent

> Robinhood Chain 农民的 CA 快筛 Skill：先查 Dex，再查合约，再查 LP，再查社媒，最后才谈叙事。

[English Version](docs/README.en.md) · [HoodCard 案例](case-studies/hoodcard.zh-CN.md) · [Agent Robin 案例](case-studies/agent-robin.zh-CN.md)

---

## 🌱 这是干什么的？

Qiuqiu Robin Agent 是一个面向 **Robinhood Chain** 的 CA 快筛与叙事判断工具。

你给它一个 token CA，它会帮你做第一轮脏活：

- 这个币到底是不是在 Robinhood Chain 上交易？
- DexScreener 资料是不是付费的？
- 官网、X、Telegram 是否真的认领 CA？
- 合约有没有 mint / owner / blacklist / tax / pause / sell limit？
- 如果是 Pons 发射，LP NFT 到底有没有进 locker？
- 这是 Robinhood 本体梗、RWA、AI Agent，还是普通 ticker 噪音？

它不是交易机器人，也不是护身符。

**它只是帮你在开赌前，先把坑照出来。**

---

## 🧭 工作流线稿

```text
         给一个 CA
             |
             v
   +-------------------+
   |  DexScreener 快查 |
   |  池子 / 付费 / 量 |
   +-------------------+
             |
             v
   +-------------------+
   |  Blockscout 合约  |
   |  源码 / holders   |
   +-------------------+
             |
             v
   +-------------------+
   |  Launchpad / LP   |
   |  tokenId / locker |
   +-------------------+
             |
             v
   +-------------------+
   |  社媒与叙事判断   |
   |  X / 官网 / CA    |
   +-------------------+
             |
             v
      watch / weak_watch / avoid
```

---

## ⚡ 核心能力

### 1. Dex 快速验真

- 检查 CA 是否真的有 Robinhood Chain 主池。
- 拉取价格、市值、流动性、成交量、买卖 tx、pair 创建时间。
- 检查 DexScreener 是否付费：
  - tokenProfile 是否 `approved`
  - 是否有 boost
  - 是否只有营销资料，没有链上证据

### 2. 合约风险初筛

读取 Blockscout verified source 和构造参数，扫描：

- mint / 增发
- owner / admin 权限
- blacklist / blocklist
- pause / 停止交易
- tax / fee 逻辑
- maxTx / maxWallet / sell restriction
- arbitrary call / delegatecall 风险

> 注意：这是启发式扫描，不是审计报告。合约 verified 不等于安全。

### 3. Pons / Launchpad / LP 证据

如果项目像 Pons Launchpad 发射，工具会尽量提取：

- launch transaction
- pool address
- LP NFT tokenId
- LP NFT 当前 owner
- locker 合约是否 verified
- locker 源码里有没有 withdraw / unlock / decreaseLiquidity / arbitrary-call 表面

这一步非常关键。

**不能因为平台支持锁仓，就默认某个 token 的 LP 已锁。必须 token-specific 验证。**

### 4. 社媒与叙事判断

工具会引导 agent 搜索：

- exact CA
- token name + `Robinhood Chain`
- `$SYMBOL` + `Robinhood`
- 官网域名 + symbol / CA
- Dex profile 里的官网 / X / Telegram
- X bio / launch thread 是否认领 CA
- 官网是否反链 X
- 项目是不是借 Robinhood 官方名字蹭热度
- 是否有真实产品、API、dashboard、docs，还是只有 landing page

### 5. 多维叙事评分

不是只问“故事好不好听”，而是拆成 8 个维度打分：

| 维度 | 权重 | 看什么 |
|---|---:|---|
| Chain Reality | 15 | 是否真的有 Robinhood Chain 主池、交易、holders |
| Contract & LP | 15 | 合约是否 verified、LP NFT 是否 token-specific 锁定 |
| Official Claim | 15 | 官网/X/docs 是否明确认领 CA，是否互相反链 |
| Narrative Originality | 15 | 是否有 Robinhood 原生梗、RWA/AI/支付等真实概念来源 |
| Product Evidence | 15 | 是否有 app/docs/API/GitHub/dashboard/真实钱包动作 |
| Social Traction | 10 | 是否有自然讨论，而不是纯价格 spam |
| Market Structure | 10 | 流动性、成交额、买卖 tx、滑点风险是否健康 |
| Execution Transparency | 5 | treasury、费用、收益分配、agent 行为是否可审计 |

最终输出不是“冲/不冲”，而是：

```text
strong_watch | watch | weak_watch | avoid
```

并明确说明：哪些证据是真的，哪些只是项目方自称，哪些证据还缺。

---

## 🧩 Robinhood Chain 叙事分类

这个 skill 会按 Robinhood Chain 的语境分类，而不是用普通土狗链逻辑一刀切。

| Bucket | 说明 |
|---|---|
| `robinhood_native_meme` | Cash Cat、HOOD、VLAD、4663、Dog in Hood、Lady Marian 等本体梗 |
| `stock_token_rwa` | tokenized stocks、RWA、抵押股票借稳定币、券商式流动性 |
| `ai_agent` | AI trading agent、Virtuals-style agent、自动 treasury / 自动交易 |
| `launchpad_infra` | NOXA、Pons、flap、trensh、bankr、token factory |
| `trading_defi` | DEX、perps、lending、vault、market making |
| `meme_ticker` | 只借 HOOD / 股票 ticker / Robinhood 名字的噪音盘 |
| `unknown_or_noise` | 只有价格页，没有项目证据 |

---

## 🧪 快速使用

直接运行 CA probe：

```bash
node skill/scripts/robinhood_ca_probe.mjs <ROBINHOOD_CHAIN_TOKEN_CA>
```

或者运行 helper：

```bash
bash skill/scripts/run_robinhood_chain_narrative_radar.sh quick <ROBINHOOD_CHAIN_TOKEN_CA>
```

示例：

```bash
bash skill/scripts/run_robinhood_chain_narrative_radar.sh quick 0x6a98c4145cc8ea5a779118a31308929e5dda8a1a
```

脚本会先输出 JSON，再输出人工复核 checklist。

链上探针采用分层架构：薄 CLI → `lib/onchain/probe.mjs` 编排 → DexScreener/Blockscout provider → Dex、合约、Pons/LP、holders 等独立领域分析器。网络端点、传输错误和安全判断彼此隔离，现有 CLI 与 JSON 契约保持兼容。

可选接入 Moni Discover 社交情报（Key 仅通过 `MONI_API_KEY` 环境变量提供）：

全部环境变量见 [.env.example](.env.example)：复制成 `.env` 后填入。`.env` 已在 `.gitignore` 中，不要提交。

```bash
node skill/scripts/moni_discover_probe.mjs <X_HANDLE> quick
node skill/scripts/robinhood_research_bundle.mjs <CA> deep --timeframe D30
node skill/scripts/moni_discovery_feed.mjs projects --chain robinhood --limit 20
node skill/scripts/web_research_probe.mjs --deep "Robinhood Chain latest ecosystem"
```

`quick` 预计请求 8 points；`deep` 预计请求 21 points。成功响应默认缓存 15 分钟。Moni 未配置、未收录或暂时失败时，链上探针仍独立返回结果。

`moni_discovery_feed.mjs` 是独立的市场发现入口，支持 `projects`、`events` 和 `smart-mentions`；结果只作为候选线索，必须重新经过 CA、合约与 LP 验证。

网络研究默认通过 `GROK_API_KEY` 调用 `grok-chat-fast`。Research Bundle 的 `deep` 模式默认启用，`quick` 可加 `--search`。如果 Grok 不可用或没有返回可核验 URL，输出 `fallback.required=true`，由 Agent 使用自带网络搜索继续完成查询。

---

## 📦 JSON 输出重点

- `dex.mainPair`：主池、价格、市值、流动性、成交、买卖 tx、创建时间、官网和社媒。已剔除畸形池后取流动性最深的一个。
- `dex.aggregate`：全部合格池汇总的流动性、24h 成交、买卖 tx、最早建池时间。流动性分散在多个池时以这个为准。
- `dex.anomalousPairs`：被剔除的池及原因（无可用价格 / 无 fdv / 价格偏离中位数 10 倍以上）。
- `dex.mainPairScreening`：`clean` | `screened_outliers` | `fallback_all_pairs_anomalous`。最后一种表示没有池通过筛选，mainPair 的数字不可信。
- `dex.quoteToken`：主池的报价币身份（symbol、holders、是否 verified）。`priceReference=floating_asset` 表示 `priceUsd` / `fdv` / `marketCap` 会跟着报价币一起动，只能作为「以该资产计价」的数字引用。`quoteRisks` 是不信任这个估值的理由，不是对 token 合约本身的判断。
- `dex.paid`：DexScreener tokenProfile 是否付费 approved、是否有 boost。
- `blockscout.token`：token 名称、symbol、holders、总供应量。
- `blockscout.contract`：源码是否 verified、构造参数。
- `contractRisk.heuristicFlags`：合约风险关键词。
- `launchpad.pons.hookRisk`：毕业池上的 Uniswap v4 hook 的关键词扫描。hook 在每一笔 swap 里执行，可以拒绝或加价一笔卖出，所以它和 `claimAllowed` 是两个问题：`claimAllowed=true` 只说明仓位被锁住，不代表能卖出。`scanStatus=unknown_no_source` 表示 hook 未开源、什么都没查，这本身是风险信号而不是干净结果；`no_hook` 表示这次发射没有 hook（V1 直接建池）。同一个 launchpad 的所有 token 共用一个 hook，所以这里的命中通常是 launchpad 的属性而不是这个 token 的。
- `launchpad.pons`：Pons launch tx、LP NFT tokenId、locker owner、locker 源码风险。
- `launchpad.pons.graduation`：毕业状态、poolId、positionId、锁仓金额。V2 毕业不是原子的，`poolEvidenceFrom` 说明证据取自哪笔交易：`pool_graduated_event`（按 topic 定位到真正建池的那笔）或 `curve_completed_tx`（旧版原子毕业）；`graduationTx` 即该交易。
- `narrativeSearch`：按 CA、token name、symbol、官网域名、X handle、RWA/AI/Robinhood 概念生成的搜索查询和证据标签。
- Research Bundle 的 `socialIntelligence`：可选 Moni Score、Smart Tier、提及趋势、Smart Mentions 和账户事件，并单独报告覆盖状态、预计 points 与缓存命中。
- Research Bundle 的 `webResearch`：Grok 搜索摘要、直接来源 URL、token usage，以及 Agent 内置搜索回退契约。

Moni 查询使用的 X handle 默认来自项目方可控的 Dex metadata，因此始终先标为 `identityBinding=unverified`。Moni 热度只能补充 Social Traction，不能证明官方认领 CA、合约安全或 LP 安全。API Key 不得出现在命令参数、日志、fixture 或提交文件中。

Grok 搜索结果同样是外部证据线索。没有直接来源 URL 的回答不会被接受为网络证据；Grok Key 只能放在 `GROK_API_KEY` 环境变量中。

---

## 🧾 客观介绍模板

完整报告会按这个结构输出，方便别的 agent 直接复用：

```text
{Token}｜Robinhood Chain {Narrative Bucket}

一句话：{什么是真的 + 最大风险是什么}

项目定位：{项目自称是什么}
核心机制：{token / app / treasury / agent / RWA / launchpad 怎么运作}
链上证据：{CA、主池、成交、holders、deployer、LP NFT、treasury}
社媒与叙事证据：{官网/X 是否认领 CA、外部讨论、同名噪音}
产品证据：{app/docs/GitHub/API/dashboard 是否能闭环}
合约与 LP 风险：{verified、mint/owner/blacklist/tax/pause/sell-limit、locker}

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

优势：{3-5 条}
风险：{按严重程度排序}
缺失证据：{什么证据能改变判断}
结论：{strong_watch | watch | weak_watch | avoid}
下一步验证：{1-3 个最关键动作}
```

---

## 🧑‍🌾 Agent 推荐工作流

当用户给 CA 时：

1. 先运行 `robinhood_ca_probe.mjs`。
2. 确认 DexScreener 主池是 `chainId=robinhood`。
3. 看 Dex 是否付费 tokenProfile / boost。
4. 看市场结构：流动性、成交、买卖 tx、pair 年龄。
5. 看 Blockscout 合约是否 verified，构造参数是否能解释来源。
6. 人工复核合约风险 flags，不要只凭关键词下安全结论。
7. 如果是 Pons，查 token-specific LP NFT tokenId、owner、locker 源码。
8. 搜 exact CA，看官网/X 是否明确认领。
9. 最后再判断叙事类别和 watch / avoid。

---

## 🧷 判断等级

| 等级 | 含义 |
|---|---|
| `strong_watch` | 证据强、无硬伤、CA 官方认领清晰、LP 和合约风险都能解释 |
| `watch` | 项目真实度较高，但还有关键不透明点 |
| `weak_watch` | 有叙事，但证据薄、风险高 |
| `avoid` | 链上证据不足、非 Robinhood Chain、合约/LP/卖出存在硬风险、冒用官方或流动性危险 |

---

## 📚 案例说明

- [HoodCard](case-studies/hoodcard.zh-CN.md)：RWA 支付卡产品案例，用代币化股票作为虚拟 Visa 卡消费余额。
- [Agent Robin](case-studies/agent-robin.zh-CN.md)：AI trading meme 案例，展示真实链上运行与 treasury、LP、分红风险如何同时存在。

---

## 🔧 安装成 Codex Skill

把 `skill/` 目录复制到可发现的 skills 目录：

```bash
mkdir -p ~/.codex/skills/qiuqiu-robin-agent
cp -R skill/* ~/.codex/skills/qiuqiu-robin-agent/
```

实际触发名：

```text
robinhood-chain-narrative-radar
```

---

## 🚧 安全边界

- DexScreener 付费 profile / boost 是营销信号，不是可信背书。
- 合约 verified 不等于安全。
- Binance Token Audit 当前不支持 Robinhood Chain，不要伪造 Binance 风险标签。
- OKX OnchainOS 只有在当前环境支持 Robinhood Chain 时才调用；不支持就明确降级到 DexScreener + Blockscout。
- 本项目不提供投资建议，不自动执行交易。

---

## License

MIT
