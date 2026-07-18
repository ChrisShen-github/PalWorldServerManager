# Palworld Server Manager

面向 Ubuntu + Docker + SteamCMD 的《幻兽帕鲁》专用服务器管理面板。第一阶段提供 Docker 化的 React 仪表盘、FastAPI 状态聚合和官方服务器镜像的可选 Compose profile。

## 快速开始

```bash
cp .env.example .env
docker compose up -d --build
```

打开 `http://<服务器 IP>:8080`。默认是演示模式，不会下载游戏镜像。

## 连接真实服务器

1. 在 `.env` 设置 `PMSM_DEMO_MODE=false` 与 `PALWORLD_REST_PASSWORD`。
2. 在 `runtime/palworld/Saved/Config/LinuxServer/PalWorldSettings.ini` 启用 `RESTAPIEnabled=True`。
3. 启动游戏服务：`docker compose --profile game-server up -d`。

游戏存档持久化于 `runtime/palworld/Saved`；修改 `PALWORLD_IMAGE_TAG` 更新前必须备份。REST API 默认只绑定 `127.0.0.1:8212`，不可直接暴露公网。

## 结构

```text
backend/       FastAPI：状态聚合与后续运维工作流
frontend/      React + Vite：管理仪表盘
infra/         官方游戏镜像兼容启动包装器
runtime/       生成的配置、存档、日志与备份（不提交）
```

参考：[官方服务器文档](https://docs.palworldgame.com/)、[官方 Docker 示例](https://github.com/pocketpairjp/palworld-dedicated-server-docker)。
