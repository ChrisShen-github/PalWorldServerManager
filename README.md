# Palworld Server Manager

面向 Ubuntu + SteamCMD 的《幻兽帕鲁》专用服务器管理面板。管理面板运行在 Docker 中；帕鲁专服始终由宿主机原生 SteamCMD 安装、更新和运行。

## 快速开始

```bash
cp .env.example .env
docker compose up -d --build
```

打开 `http://<服务器 IP>:8080`。默认是演示模式，不会下载游戏镜像。

## 本地开发（不使用 Docker）

在两个终端中分别运行。后端默认使用 `8010`，避免与本开发机上已常见占用的 `8000` 冲突：

```powershell
# 终端 1：项目根目录
.\.venv\Scripts\python.exe -m uvicorn backend.app.main:app --reload --port 8010

# 终端 2：项目根目录
cd frontend
npm run dev
```

浏览器打开 Vite 显示的地址（通常为 `http://localhost:5173`）。前端会将 `/api` 代理到 `http://localhost:8010`；如需改端口，可在启动前设置 `VITE_DEV_API_URL=http://localhost:<端口>`。

## 安装并运行原生帕鲁专服

在 Ubuntu 宿主机上完成一次 SteamCMD 安装：

```bash
mkdir -p ~/steamcmd ~/palserver
cd ~/steamcmd
./steamcmd.sh +login anonymous +force_install_dir ~/palserver +app_update 2394010 validate +quit
cd ~/palserver
./PalServer.sh -port=8211 -useperfthreads -NoAsyncLoadingThread -UseMultithreadForDS
```

更新时先停止服务器、备份存档，然后重复 `app_update 2394010 validate` 命令。游戏配置和存档位于 `~/palserver/Pal/Saved/`。

## 连接面板到原生服务器

1. 启动一次原生服务器，让 `Pal/Saved/Config/LinuxServer/PalWorldSettings.ini` 自动生成。
2. 在该文件的 `OptionSettings` 中设置 `AdminPassword`、`RESTAPIEnabled=True`、`RESTAPIPort=8212`。
3. 在面板项目的 `.env` 设置 `PMSM_DEMO_MODE=false` 与同一个 `PALWORLD_REST_PASSWORD`。
4. 重启面板：`docker compose up -d --build`。

Compose 为 `manager-api` 配置了 `host.docker.internal:host-gateway`，因此它可从容器访问 Ubuntu 宿主机的 `8212` REST 端口。不要将该 REST 端口公开到互联网；应以 UFW 或安全组限制访问来源。

## 结构

```text
backend/       FastAPI：状态聚合与后续运维工作流
frontend/      React + Vite：管理仪表盘
runtime/       面板运行时数据、备份与日志（不提交）
```

参考：[官方服务器文档](https://docs.palworldgame.com/)、[官方 Docker 示例](https://github.com/pocketpairjp/palworld-dedicated-server-docker)。
