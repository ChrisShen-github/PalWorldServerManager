# Palworld Server Manager

面向 Ubuntu + SteamCMD 的《幻兽帕鲁》专用服务器管理面板。管理面板运行在 Docker 中；帕鲁专服始终由宿主机原生 SteamCMD 安装、更新和运行。

## 快速开始

```bash
docker compose pull
docker compose up -d
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

首次部署宿主机代理后，打开面板的“世界规则与安装”：

1. 保存 `/opt/steamcmd` 与 `/opt/palserver` 等安装目录。
2. 点击“安装 SteamCMD 与服务器”，面板会在 Ubuntu 宿主机原生安装依赖、SteamCMD、PalServer 和 systemd 服务。
3. 在“服务器配置”中按分类或搜索编辑服务器连接、世界倍率、公会、PvP、性能等完整规则。
4. 保存配置后点击“启动”；以后可在面板中执行更新、启动、停止和重启。

游戏配置位于 `/opt/palserver/Pal/Saved/Config/LinuxServer/PalWorldSettings.ini`，存档位于 `/opt/palserver/Pal/Saved/`。配置写入前会自动生成带时间戳的 `.bak` 文件。

如果目标 `PalWorldSettings.ini` 尚未创建、为空或不包含 `OptionSettings`，面板会从服务器自带的 `DefaultPalWorldSettings.ini` 载入当前版本默认模板；首次保存前仍会备份原目标文件。游戏升级新增的未知配置项会在读写时原样保留。若存档包含 `WorldOption.sav`，面板会提示其可能优先于 INI 配置。

在“存档与备份”页面创建的世界恢复点会放在 Compose YAML 同级的 `backups/`。可在创建后修改显示名称并直接下载 `.tar.gz` 归档。创建或恢复时会短暂停止 `palworld-server.service` 以确保一致性，完成后自动重新启动；恢复前还会自动备份当前存档。面板保留最近 12 份自己创建的归档，`backups/` 默认不提交到 Git。

## 连接面板到原生服务器

在“服务器配置”中保存设置时，面板会自动写入 `RESTAPIEnabled=True`，使用管理员密码连接 `http://host.docker.internal:<端口>/v1/api`，并关闭演示模式。配置需要重启 Palworld 服务后生效。

Compose 为 `manager` 配置了 `host.docker.internal:host-gateway`，因此它可从容器访问 Ubuntu 宿主机的 `8212` REST 端口。不要将该 REST 端口公开到互联网；应以 UFW 或安全组限制访问来源。

## 启用原生安装代理

管理面板以 Docker 容器运行，而 SteamCMD 与 PalServer 必须原生运行在 Ubuntu 宿主机。管理面板首次启动时会把代理安装包自动写入 Compose 文件同级的 `./host-agent` 目录。首次部署时执行：

```bash
docker compose pull
docker compose up -d
sudo ./host-agent/install.sh
```

该代理只接受状态检查、安装、更新、启动、停止、重启以及服务器配置读取/写入等固定操作；不会执行来自面板的任意命令。它使用 Unix Socket 与面板容器通信。安装目录必须位于 `/opt` 下，配置读写固定限制在 `Pal/Saved/Config/LinuxServer/PalWorldSettings.ini`。

完成上述首次安装后，无需再通过 Git 更新或手动复制代理。systemd 直接运行 Compose 同级 `./host-agent/agent.py`（`/opt/palworld-server-manager/agent.py` 是指向它的兼容链接）。每次执行 `docker compose pull` 并执行 `docker compose up -d` 时，容器会同步镜像内最新代理；Agent 检测到自身文件已替换后会正常退出，并由 systemd 的 `Restart=always` 自动加载新版本。

从早期复制式 Agent 升级到该自动更新方案时，只需在拉取包含新安装脚本的镜像后额外执行一次 `sudo ./host-agent/install.sh`。此后更新镜像无需再次运行安装脚本。

## 结构

```text
backend/       FastAPI：状态聚合与后续运维工作流
frontend/      React + Vite：管理仪表盘
runtime/       面板运行时数据、备份与日志（不提交；世界存档备份在 runtime/backups/）
```

参考：[官方服务器文档](https://docs.palworldgame.com/)、[Bluefissure/pal-conf](https://github.com/Bluefissure/pal-conf)、[官方 Docker 示例](https://github.com/pocketpairjp/palworld-dedicated-server-docker)。

## GitHub Actions 镜像发布

每次推送到 `main`，工作流会构建并推送一个包含前端、Nginx 与 FastAPI 的 Docker 镜像。标签只有 `latest` 与版本号（例如 `v0.1.0.42`）；版本基础值来自根目录的 `VERSION` 文件，末尾数字是 Actions run number。

在 GitHub 仓库的 **Settings → Secrets and variables → Actions** 中添加：

- Secret `DOCKERHUB_USERNAME`：Docker Hub 用户名。
- Secret `DOCKERHUB_TOKEN`：Docker Hub access token，最小权限为 Read & Write。
- Variable `DOCKERHUB_REPOSITORY`：Docker Hub 仓库名，例如 `palworld-server-manager`。

配置完成后，在 **Actions → Publish manager images → Run workflow** 手动运行一次，或推送一次 `main`。工作流随后会发布 `用户名/仓库名:latest` 与一个版本标签。
