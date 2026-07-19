# 图鉴与地图数据

图鉴和地图不从第三方互动地图页面抓取数据或图片。首版内置两份可追溯的公开仓库数据：

- 帕鲁中文名称、元素、工作适性、成长数值与招式：[`EternalWraith/PalEdit`](https://github.com/EternalWraith/PalEdit)，MIT。
- 帕鲁昼夜分布坐标：[`mlg404/palworld-paldex-api`](https://github.com/mlg404/palworld-paldex-api)，MIT。

构建产物位于 `frontend/public/companion/`。仓库不内置上述项目的游戏图片；角色与地图美术的权利仍归《幻兽帕鲁》权利人所有。

更新数据时，分别取得两个仓库的工作副本后执行：

```bash
node scripts/import-companion-data.mjs /path/to/PalEdit /path/to/palworld-paldex-api
```

脚本会把世界坐标压缩为相对坐标，并按每只帕鲁、昼夜和地图网格去重，以降低浏览器渲染开销。地图显示的是分布坐标层；不把未明确授权的第三方地图底图打包进镜像。
