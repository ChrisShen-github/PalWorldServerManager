# 图鉴与离线地图资料

图鉴与地图的运行时静态资源统一放在 `frontend/public/data/palworld/`，构建后以 `/data/palworld/` 提供：

- `pals.json`：288 条帕鲁的轻量列表索引（中文名、英文名、元素、工作适性、伙伴技能与基础数值）。
- `details/`：按帕鲁编号拆分的完整详情。点击图鉴条目后才读取对应文件，包含伙伴技能说明与升星效果、基础与移动数值、主动技能说明/威力/冷却/范围、掉落物、昼夜出没情况，以及双向配种方案。
- `icons/`：图鉴头像。
- `map/map.json`：区域、31 个分类与 4,241 个地图点位；包含地图默认隐藏的宝箱、帕鲁蛋、矿点等分类。
- `map/icons/`：地图分类图标。
- `map/tiles/`：离线底图瓦片。

资料由 [游民星空帕鲁图鉴](https://app.gamersky.com/tools/palworldwiki/list.html?appNavigationBarStyle=kNoneBar&type=pals) 和 [游民星空互动地图](https://app.gamersky.com/map/?gsAppChannel=diTu&gsGameId=1395719&mapId=26) 的公开数据生成。本次图鉴数据源标识为 Palworld 1.0 local game assets，生成脚本数据版本为 `V1.12.45`；面板运行时不访问第三方图鉴或地图接口。

## 刷新资料

在项目根目录执行：

```bash
node scripts/import-companion-data.mjs
```

脚本会重新下载图鉴、主动技能、栖息地、配种索引、头像、地图分类图标、每个公开分类的完整点位和离线底图，再写入上述 `/data/palworld/` 目录。脚本在资料数量异常时会中止，不会用不完整的数据覆盖现有快照。

默认内置第 12 级地图瓦片，适合在面板内清晰查看完整世界。若要制作更高分辨率镜像，可在导入时设置 `PALWORLD_MAP_ZOOM`，但层级越高，文件数和镜像体积会呈四倍增长：

```bash
PALWORLD_MAP_ZOOM=12 node scripts/import-companion-data.mjs
```

第 16 级是来源的最高层，完整导入约为 6.5 万张瓦片；不建议提交进 Git 仓库或用于日常更新。
