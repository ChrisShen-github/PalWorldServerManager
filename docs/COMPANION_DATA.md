# 图鉴与地图数据

图鉴和地图使用两个独立的数据来源，均不把第三方游戏美术资产打包进镜像。

- **帕鲁图鉴**：构建时保存 [Palworld.tools Paldex](https://www.palworld.tools/pals) 公开索引的本地快照。当前快照对应 1.0 数据，索引更新时间为 2026-07-13，含 288 条可收集帕鲁及变种记录。
- **世界地图**：页面内嵌 [MapGenie 的 Palworld 互动地图](https://mapgenie.io/palworld/maps/palpagos-islands)。地图内容、搜索与标记由 MapGenie 在其站点中维护；完整地图可从面板的新标签页入口打开。

构建产物在 `frontend/public/companion/pals.json`。中文名仅保留已有的已校对历史译名；新加入而暂无中文名的条目会显示官方英文名，避免编造译名。

## 刷新图鉴快照

在项目根目录执行：

```bash
node scripts/import-companion-data.mjs
```

脚本会从公开索引下载数据，保留已存在的中文译名，并拒绝用异常的小数据集覆盖图鉴。完成后重新构建镜像即可随镜像发布新的快照；运行中的面板不会直接请求第三方图鉴接口。
