# 热门竞品厂商跟踪

面向手游产品研究的厂商—商店账号—游戏资料库。支持产品搜索、下载量/营收/评分/公开时间排序、CSV 导出、账号关系证据和塔防观察。

网站：https://k412407009.github.io/game-publisher-tracker/

## 同事如何使用

打开网站即可浏览，不需要安装工具或登录。产品雷达可按公司、账号、赛道和研究批次筛选；点击产品名打开商店，账号图谱中的证据链接用于核对归属。营收为空表示未取得数据。标为“商店待复核”的行保留上次资料。

## 本地运行与更新

需要 Node.js 22 或以上。

```bash
npm ci
npm run serve
# 浏览器打开 http://127.0.0.1:4173
GP_RELEASE_MARKET_CONCURRENCY=3 npm run update
```

Windows PowerShell 可先设置 `$env:GP_RELEASE_MARKET_CONCURRENCY="3"`，再运行 `npm run update`。

更新从 `accounts.json` 枚举 15 个 Google Play 市场，同时直连复核已知包名。详情优先使用 US / en，首次上架日期另外复核 21 个市场。抓取失败会保留旧资料并标记待复核；成功详情不足旧库一半时停止覆盖。更新摘要在 `reports/last-update.md`。

```bash
npx playwright install chromium
npm run verify:data
# 另一个终端保持 npm run serve 运行
npm run verify:dashboard
npm run build:public
npm run verify:public
```

`dist/site` 是可部署的静态网站。`dist/public-repo` 是经文件白名单整理的公开源码与数据快照。发布者更新数据后提交并推送到 GitHub，Pages 展示最新已发布快照；浏览器本身不会运行抓取。普通同事可以 Fork 后自行更新。

## 新增与核验账号

编辑 `accounts.json`，提供 `company`、`companyZh`、`account`、`devId`、`urlType`、`relationship`、`relationshipLabel` 和 `sources`。Google Play 数字开发者 ID 使用 `urlType: "dev"`，名称型账号使用 `"developer"`。`knownAppIds` 可补索引漏列的已确认包名。来源优先官方商店、公司官网与法律主体；关联不足的母公司保留待核验标识，未知账号写入 `unresolved.json`。

App Store 账号以证据链接形式提供；主产品库目前以 Google Play 包名去重。两个商店相似名字不自动认定为同一公司。

## 数据口径与覆盖

- 下载量是 Google Play 公布的区间下限，并非精确安装数。
- 营收是历史 Sensor Tower 应用商店估算，不含广告收入；刷新 Google Play 不会更新营收日期，也不会抹掉既有营收。请查看各数据字段的统计截止时间。
- 公开版含整理后的数值与来源，不包含原始商业导出、登录会话、密钥或内部研究底稿。需要补营收时，使用自己的有权访问的导出，按 Android 包名导入；缺失保持 `null`。
- 塔防视频页是 2026 年 2–8 月历史研究样本。使用“查看全库最新塔防产品”进入当前主库；`collect:td` 仅复查已登记视频，不会自动发现整个 B 站合集的新视频。
- 商店索引、地区可见性和网络情况会影响发现完整度；未抓到不等于全球下架。算法赛道标签和公司关联应结合证据复核。
- 产品名称、图标与商标属于各自权利人，图标用于识别研究对象。

## 可选的曝光时间研究

`data/exposure-events.json` 保存可追溯的媒体、测试和官宣证据。`npm run apply:exposure` 合并已核实记录。

DeepSeek/Tavily 辅助研究需自行在环境变量或本项目 `.env` 提供 `DEEPSEEK_API_KEY`、`TAVILY_API_KEY`。依次运行 `select:exposure-review`、`review:exposure-deepseek`、`curate:exposure-deepseek`、`apply:exposure`。此过程可能产生 API 费用，日常更新不会自动调用。
