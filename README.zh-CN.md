# Qiuqiu Robin Agent

Qiuqiu Robin Agent 是一个面向 Robinhood Chain 的 CA 快筛与叙事判断 skill。它的目标很简单：当你给一个 Robinhood Chain 代币 CA 时，agent 能快速查 Dex、查社媒、查合约、查 LP、查 launchpad，再给出一个尽量客观的判断。

它不是交易机器人，不负责自动买卖，也不会把“热度高”“Dex 资料付费了”当成项目可信。

## 核心能力

- 检查 CA 是否真的在 Robinhood Chain 上有 DexScreener 交易池。
- 拉取市值、流动性、成交量、买卖 tx、pair 创建时间。
- 检查 DexScreener 是否付费：tokenProfile 是否 approved、是否有 boost。
- 检查 Dex profile 里的官网、X/Twitter、Telegram 等链接。
- 读取 Blockscout token 信息、holders、transfer counter、已验证源码、构造参数。
- 对合约源码做启发式风险扫描：mint、owner/admin、blacklist、pause、tax/fee、sell limit、arbitrary call。
- 识别 Pons Launchpad 部署痕迹。
- 自动提取 launch tx、pool、LP NFT tokenId、locker owner、fee redirect、locker 源码风险。
- 引导 agent 搜索 X/官网/CA/KOL 认领证据。
- 根据 token 名称、symbol、官网概念和项目文案生成叙事搜索查询。
- 按 8 个维度给出叙事价值评分：链上真实度、合约/LP、官方认领、叙事原创性、产品证据、社媒传播、市场结构、执行透明度。
- 输出可复用的客观项目介绍模板，区分“项目方自称”和“外部独立证据”。
- 按 Robinhood Chain 语境做叙事分类：本体梗、RWA/股票代币、AI Agent、launchpad/infra、DeFi/trading、ticker 噪音等。

## 为什么需要 Robinhood Chain 专用判断

Robinhood Chain 不是普通 meme 链。它的早期生态同时混合了几种东西：

- Robinhood 本体梗：Cash Cat、HOOD、ROBIN、VLAD、4663、Dog in Hood、Lady Marian。
- RWA / 股票代币叙事：tokenized stocks、抵押股票借稳定币、券商式流动性。
- AI Agent 项目：宣称 treasury、自动交易、收益分配、agent 行为。
- Launchpad 生态：NOXA、Pons、flap、trensh、bankr 等。
- 大量 copycat、假官方、honeypot、付费 Dex 展示和低流动性盘。

所以这个 skill 的重点不是“这个故事好不好听”，而是先拆证据：

```text
Dex 是否真实
Dex 是否付费
社媒是否认领 CA
合约有没有明显后门
LP NFT 是否锁定
收益/treasury 是否链上强制
叙事是否有 Robinhood Chain 原生来源
```

## 目录结构

```text
qiuqiu-robin-agent/
├── README.md
├── README.zh-CN.md
└── skill/
    ├── SKILL.md
    ├── agents/
    │   └── openai.yaml
    ├── references/
    │   ├── ca-screening-playbook.md
    │   ├── robinhood-chain-ecosystem-timeline.md
    │   └── robinhood-chain-narrative-rubric.md
    └── scripts/
        ├── lib/onchain/
        ├── lib/moni/
        ├── lib/search/
        ├── moni_discover_probe.mjs
        ├── moni_discovery_feed.mjs
        ├── robinhood_ca_probe.mjs
        ├── robinhood_research_bundle.mjs
        ├── run_robinhood_chain_narrative_radar.sh
        └── web_research_probe.mjs
```

## 快速使用

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

链上探针已经拆成薄 CLI、应用编排、数据源 provider 和领域分析器四层。DexScreener/Blockscout 的 URL 与 HTTP 行为不会渗透进 Dex 筛池、合约、Pons/LP 或 holders 判断，现有 CLI 和 JSON 输出保持兼容。

可选接入 Moni Discover 社交情报。Key 只能通过 `MONI_API_KEY` 环境变量提供：

```bash
node skill/scripts/moni_discover_probe.mjs <X_HANDLE> quick
node skill/scripts/robinhood_research_bundle.mjs <CA> deep --timeframe D30
node skill/scripts/moni_discovery_feed.mjs projects --chain robinhood --limit 20
node skill/scripts/web_research_probe.mjs --deep "Robinhood Chain latest ecosystem"
```

`quick` 预计 8 points，`deep` 预计 21 points；成功响应默认缓存 15 分钟。Moni 故障不会改变链上探针的完整性或退出码。

全局发现 CLI 支持 `projects`、`events`、`smart-mentions`。这些结果只是候选线索，不能绕过 CA、合约与 LP 验证。

网络研究默认使用 `grok-chat-fast`，Key 从 `GROK_API_KEY` 读取。`deep` Research Bundle 默认搜索，`quick` 可加 `--search`；Grok 失败或没有直接来源 URL 时，会返回 Agent 内置网络搜索回退请求。

## JSON 输出重点

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
- Research Bundle 的 `socialIntelligence`：可选 Moni Score、Smart Tier、提及趋势、Smart Mentions、账户事件及独立覆盖状态。
- Research Bundle 的 `webResearch`：Grok 搜索结果、直接来源、token usage 和 Agent 内置搜索回退契约。

Moni 的 X handle 默认来自项目方可控的 Dex metadata，必须保持 `identityBinding=unverified`，直到官网、X 或主文档明确认领同一 CA。Moni 热度不能证明官方身份、合约或 LP 安全，也不能补齐缺失的链上证据。

无直接 URL 的 Grok 回答不能作为网络证据。Grok Key 不得进入命令参数、日志、fixture 或提交文件。

## 叙事评分模板

| 维度 | 权重 |
|---|---:|
| Chain Reality | 15 |
| Contract & LP | 15 |
| Official Claim | 15 |
| Narrative Originality | 15 |
| Product Evidence | 15 |
| Social Traction | 10 |
| Market Structure | 10 |
| Execution Transparency | 5 |

完整介绍会包含：项目定位、核心机制、链上证据、社媒与叙事证据、产品证据、合约与 LP 风险、评分表、优势、风险、缺失证据、结论和下一步验证。

## 案例说明

- [HoodCard](case-studies/hoodcard.zh-CN.md)：RWA 支付卡产品案例，用代币化股票作为虚拟 Visa 卡消费余额。
- [Agent Robin](case-studies/agent-robin.zh-CN.md)：AI trading meme 案例，展示真实链上运行与 treasury、LP、分红风险如何同时存在。

## Agent 推荐工作流

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

## 判断等级

- `strong_watch`：证据强、无硬伤、CA 官方认领清晰、LP 和合约风险都能解释。
- `watch`：项目真实度较高，但还有关键不透明点，值得继续观察。
- `weak_watch`：有叙事，但证据薄、风险高、还不能上强判断。
- `avoid`：链上证据不足、非 Robinhood Chain、合约/LP/卖出存在硬风险、冒用官方或流动性危险。

## 安全边界

- DexScreener 付费 profile / boost 是营销信号，不是可信背书。
- 合约 verified 不等于安全。
- Binance Token Audit 当前不支持 Robinhood Chain，不要伪造 Binance 风险标签。
- OKX OnchainOS 只有在当前环境支持 Robinhood Chain 时才调用；不支持就明确降级到 DexScreener + Blockscout。
- 这个项目不提供投资建议，不自动执行交易。

## 安装成 Codex Skill

把 `skill/` 目录复制到可发现的 skills 目录：

```bash
mkdir -p ~/.codex/skills/qiuqiu-robin-agent
cp -R skill/* ~/.codex/skills/qiuqiu-robin-agent/
```

实际触发名：

```text
robinhood-chain-narrative-radar
```

## License

MIT
