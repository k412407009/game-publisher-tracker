# 漏抓复盘：Random Dice 2

- 记录日期：2026-08-19
- 产品：[Random Dice 2](https://play.google.com/store/apps/details?id=com.percent.aos.randomdice2)
- Android 包名：`com.percent.aos.randomdice2`
- 开发者：`111%`（开发者 ID：`7769366979601471884`，已在 `accounts.json` 跟踪）

## 发生了什么

2026-08-18 的更新没有收录该产品。复核时，直接通过包名读取 Google Play US 英文详情页可以正常得到产品名和开发者 `111%`；因此它不是未归属账号、不是美国区详情页不可见，也不是全球下架。

但原流程只以单一美国区的开发者产品列表和“111%”同名搜索作为发现入口。复核当时，开发者列表只返回 9 款产品，搜索结果也未返回此包名；两个入口均漏列，导致后续详情抓取根本没有机会执行。

此外，`google-play-scraper` 对本产品返回了 `free: false` 与 `price: 0` 的矛盾组合。Google Play 详情页显示“Install”及内购价格区间，说明它是免费安装、含内购产品；这属于库字段解析不一致，不是漏抓的主因，但已修正为以价格是否大于 0 判断是否付费。

## 已采取的修复

1. 在 111% 账号配置加入 `knownAppIds: ["com.percent.aos.randomdice2"]`，每次更新直接按包名复查，避免 Google Play 开发者页或搜索索引继续漏列时被移除。
2. 发现阶段由单一 US 扩为多个主要市场的并集；详情仍优先使用 US 作为可比基线，US 不可读时回退到实际发现市场。
3. 数据中保存 `discoveryMarkets`、`discoverySources` 和 `detailMarket`，使“在哪些市场被发现”和“详情来自哪个市场”可审计。

## 仍然存在的边界

Google Play 没有提供可靠的“全球全部国家／地区、全部开发者产品”的公开单一接口。多市场联合发现显著扩大覆盖面，但不能证明所有国家／地区均已穷尽。对已知的关键包名，必须保留 `knownAppIds` 直连兜底；对新发现的产品，应在核验后补进该字段。
