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
- Dex profile 里的官网 / X / Telegram
- X bio / launch thread 是否认领 CA
- 官网是否反链 X
- 项目是不是借 Robinhood 官方名字蹭热度
- 是否有真实产品、API、dashboard、docs，还是只有 landing page

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

---

## 📦 JSON 输出重点

- `dex.mainPair`：主池、价格、市值、流动性、成交、买卖 tx、创建时间、官网和社媒。
- `dex.paid`：DexScreener tokenProfile 是否付费 approved、是否有 boost。
- `blockscout.token`：token 名称、symbol、holders、总供应量。
- `blockscout.contract`：源码是否 verified、构造参数。
- `contractRisk.heuristicFlags`：合约风险关键词。
- `launchpad.pons`：Pons launch tx、LP NFT tokenId、locker owner、locker 源码风险。
- `nextSearches`：建议继续搜索的 CA、symbol、官网、X 链接。

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
