# 热门竞品厂商跟踪维护规则

## “更新”命令

用户在本项目语境中说“更新”时：

1. 先读 `README.md`、`accounts.json`、`unresolved.json` 和 `reports/last-update.md`；
2. 在项目根目录运行 `npm run update`；
3. 检查 `reports/last-update.md` 与 Git diff，复核新增、不可见／移除和失败账号；
4. 用本地网页验证搜索、排序、账号图谱和手机端横向表格；
5. 汇报账号数、产品数、变化、失败项和 Sensor Tower 覆盖缺口。

## 硬规则

- `accounts.json` 是抓取入口；公司关系必须附来源并标注可信度。
- Google Play 常规基线固定为美国区英文商店。地区限定或下架只写“当前美国区不可见”，不要直接写成全球下架。
- Google Play 刷新不得抹掉已有 Sensor Tower 字段；缺失营收保持 `null`，不伪造为 0。
- Sensor Tower 正式补数优先使用已登录浏览器的批量导出，按 Android 包名精确匹配；不读取、复制或保存 Cookie、密码、Token。
- 原始 Sensor Tower 导出留在 `data/raw/`，口径和覆盖数写入数据元信息与报告。
- 不在别的项目复制抓取逻辑；维护脚本只放本目录 `scripts/`。

