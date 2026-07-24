from __future__ import annotations

from datetime import datetime, timezone
import asyncio
import ipaddress
import json
import re
import uuid
from pathlib import Path
from typing import Literal

import httpx
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field, field_validator

from .config import Settings, SettingsStore


class ServerInfo(BaseModel):
    version: str
    name: str
    description: str
    world_guid: str


class Metrics(BaseModel):
    server_fps: float = Field(ge=0)
    frame_time_ms: float = Field(ge=0)
    current_players: int = Field(ge=0)
    max_players: int = Field(ge=0)
    uptime_seconds: int = Field(ge=0)
    base_camps: int = Field(ge=0)
    world_days: int = Field(ge=0)


class Player(BaseModel):
    name: str
    account_name: str
    player_id: str
    user_id: str
    ip_address: str
    ping: float = Field(ge=0)
    level: int = Field(ge=0)
    building_count: int = Field(ge=0)
    location_x: float
    location_y: float


class ServerOverview(BaseModel):
    status: Literal["online", "offline", "demo"]
    source: Literal["palworld-rest", "demo", "unreachable"]
    checked_at: datetime
    message: str
    server: ServerInfo
    metrics: Metrics
    players: list[Player]


app = FastAPI(title="Palworld Server Manager API", version="0.1.0")
store = SettingsStore()
AGENT_SOCKET = "/run/palworld-server-manager/agent.sock"
SERVICE_STATES = {"active", "inactive", "failed", "activating", "deactivating"}
SYSTEMD_ACTIVE_RE = re.compile(r"(?:^|\n)\s*Active:\s+(active|inactive|failed|activating|deactivating)\b")
BACKUP_ID_RE = re.compile(r"^world-\d{8}T\d{6}(?:\d{6})?Z\.tar\.gz$")
BACKUPS_DIR = Path("/backups")
BACKUP_IMPORTS_DIR = Path("/var/lib/palworld-manager/imports")
MAX_BACKUP_IMPORT_BYTES = 16 * 1024 * 1024 * 1024


class SettingsInput(BaseModel):
    demo_mode: bool
    rest_url: str
    rest_username: str
    rest_password: str
    steamcmd_path: str
    server_path: str


class ServerConfigInput(BaseModel):
    options: dict[str, bool | int | float | str | list[str]]

    @field_validator("options")
    @classmethod
    def valid_options(cls, value: dict[str, object]) -> dict[str, object]:
        if not value or len(value) > 128:
            raise ValueError("配置项数量无效")
        for key, option in value.items():
            if not re.fullmatch(r"[A-Za-z][A-Za-z0-9_]*", key):
                raise ValueError("配置项名称无效")
            strings = option if isinstance(option, list) else [option] if isinstance(option, str) else []
            if any("\n" in item or "\r" in item for item in strings):
                raise ValueError("配置文本不能包含换行")
        return value


class BackupRestoreInput(BaseModel):
    confirmed: bool = False


class BackupNameInput(BaseModel):
    name: str

    @field_validator("name")
    @classmethod
    def valid_name(cls, value: str) -> str:
        name = value.strip()
        if not name or len(name) > 80 or any(character in name for character in "\\/\x00\r\n"):
            raise ValueError("备份名称需为 1 到 80 个字符，且不能包含路径或换行")
        return name


class BackupScheduleInput(BaseModel):
    enabled: bool = False
    hour: int = Field(default=4, ge=0, le=23)
    minute: int = Field(default=0, ge=0, le=59)


def _checked_game_user_id(value: str) -> str:
    user_id = value.strip()
    if not user_id or len(user_id) > 128 or any(character.isspace() or ord(character) < 32 for character in user_id):
        raise ValueError("训练家 ID 格式无效。")
    return user_id


class GameMessageInput(BaseModel):
    message: str

    @field_validator("message")
    @classmethod
    def valid_message(cls, value: str) -> str:
        message = value.strip()
        if not message or len(message) > 280 or "\x00" in message:
            raise ValueError("消息需为 1 到 280 个字符，且不能包含空字符。")
        return message


class GamePlayerActionInput(GameMessageInput):
    user_id: str

    @field_validator("user_id")
    @classmethod
    def valid_user_id(cls, value: str) -> str:
        return _checked_game_user_id(value)


class GameUnbanInput(BaseModel):
    user_id: str

    @field_validator("user_id")
    @classmethod
    def valid_user_id(cls, value: str) -> str:
        return _checked_game_user_id(value)


def _demo_overview() -> ServerOverview:
    return ServerOverview(
        status="demo",
        source="demo",
        checked_at=datetime.now(timezone.utc),
        message="演示模式：连接真实服务器后将显示实时数据。",
        server=ServerInfo(
            version="v1.0.1.100619",
            name="Palpagos · Expedition 01",
            description="为训练家保留一盏篝火。",
            world_guid="A7E97BAA767DB9029EF013BB71E993A0",
        ),
        metrics=Metrics(
            server_fps=58.0,
            frame_time_ms=17.2,
            current_players=4,
            max_players=16,
            uptime_seconds=172_984,
            base_camps=7,
            world_days=43,
        ),
        players=[
            Player(name="Aether", account_name="aether", player_id="demo-001", user_id="steam_demo_001", ip_address="192.168.1.*", ping=28, level=54, building_count=219, location_x=-292.4, location_y=146.8),
            Player(name="Mori", account_name="mori", player_id="demo-002", user_id="steam_demo_002", ip_address="192.168.1.*", ping=41, level=47, building_count=136, location_x=-114.1, location_y=209.2),
            Player(name="Lumen", account_name="lumen", player_id="demo-003", user_id="steam_demo_003", ip_address="192.168.1.*", ping=17, level=50, building_count=87, location_x=32.7, location_y=-66.4),
            Player(name="Rin", account_name="rin", player_id="demo-004", user_id="steam_demo_004", ip_address="192.168.1.*", ping=62, level=36, building_count=44, location_x=217.9, location_y=-33.2),
        ],
    )


def _offline_overview(message: str) -> ServerOverview:
    return ServerOverview(
        status="offline",
        source="unreachable",
        checked_at=datetime.now(timezone.utc),
        message=message,
        server=ServerInfo(version="—", name="未连接的服务器", description="检查 REST API 配置与容器状态。", world_guid="—"),
        metrics=Metrics(server_fps=0, frame_time_ms=0, current_players=0, max_players=0, uptime_seconds=0, base_camps=0, world_days=0),
        players=[],
    )


def _rest_api_base(url: str) -> str:
    base = url.rstrip("/")
    if not base.endswith("/v1/api"):
        base += "/v1/api"
    return base + "/"


def _masked_ip(value: str) -> str:
    """Return a useful but privacy-preserving representation of a player IP."""
    try:
        address = ipaddress.ip_address(value)
    except ValueError:
        return "—"
    if address.version == 4:
        parts = address.exploded.split(".")
        return ".".join([*parts[:3], "*"])
    groups = address.exploded.split(":")
    return ":".join([*groups[:4], "****", "****", "****", "****"])


async def _fetch_overview(settings: Settings) -> ServerOverview:
    auth = (settings.rest_username, settings.rest_password) if settings.rest_password else None
    timeout = httpx.Timeout(5.0, connect=2.0)
    try:
        async with httpx.AsyncClient(base_url=_rest_api_base(settings.rest_url), auth=auth, timeout=timeout) as client:
            info_response, metrics_response, players_response = await client.get("info"), await client.get("metrics"), await client.get("players")
            info_response.raise_for_status()
            metrics_response.raise_for_status()
            players_response.raise_for_status()
    except httpx.HTTPError as error:
        return _offline_overview(f"无法访问 Palworld REST API：{error.__class__.__name__}")

    info = info_response.json()
    metrics = metrics_response.json()
    players = players_response.json().get("players", [])
    return ServerOverview(
        status="online",
        source="palworld-rest",
        checked_at=datetime.now(timezone.utc),
        message="已通过 Palworld REST API 获取实时数据。",
        server=ServerInfo(
            version=str(info.get("version", "未知")),
            name=str(info.get("servername", "未命名服务器")),
            description=str(info.get("description", "")),
            world_guid=str(info.get("worldguid", "未知")),
        ),
        metrics=Metrics(
            server_fps=float(metrics.get("serverfps", 0)),
            frame_time_ms=float(metrics.get("serverframetime", 0)),
            current_players=int(metrics.get("currentplayernum", 0)),
            max_players=int(metrics.get("maxplayernum", 0)),
            uptime_seconds=int(metrics.get("uptime", 0)),
            base_camps=int(metrics.get("basecampnum", 0)),
            world_days=int(metrics.get("days", 0)),
        ),
        players=[
            Player(
                name=str(player.get("name", "未知玩家")),
                account_name=str(player.get("accountName", "—")),
                player_id=str(player.get("playerId", "—")),
                user_id=str(player.get("userId", "—")),
                ip_address=_masked_ip(str(player.get("ip", ""))),
                ping=float(player.get("ping", 0)),
                level=int(player.get("level", 0)),
                building_count=int(player.get("building_count", 0)),
                location_x=float(player.get("location_x", 0)),
                location_y=float(player.get("location_y", 0)),
            )
            for player in players
        ],
    )


async def _game_action(endpoint: Literal["announce", "kick", "ban", "unban", "save"], payload: dict[str, str] | None = None) -> dict[str, str]:
    """Proxy the small allow-list of official game-control endpoints.

    REST credentials remain in the panel's server-side settings database and
    are never returned to the browser.
    """
    settings = store.get()
    if settings.demo_mode:
        raise HTTPException(status_code=409, detail="演示模式下不能执行游戏内管理操作。")
    if not settings.rest_password:
        raise HTTPException(status_code=409, detail="请先在世界规则与安装中设置 REST 管理员密码。")
    labels = {"announce": "公告", "kick": "踢出", "ban": "封禁", "unban": "解除封禁", "save": "保存世界"}
    try:
        async with httpx.AsyncClient(
            base_url=_rest_api_base(settings.rest_url),
            auth=(settings.rest_username, settings.rest_password),
            timeout=httpx.Timeout(10.0, connect=2.0),
        ) as client:
            response = await client.post(endpoint, json=payload) if payload is not None else await client.post(endpoint)
            response.raise_for_status()
    except httpx.HTTPStatusError as error:
        if error.response.status_code == 401:
            raise HTTPException(status_code=401, detail="Palworld REST API 拒绝了管理员凭据，请重新保存管理员密码。") from error
        raise HTTPException(status_code=502, detail=f"Palworld REST API 未完成{labels[endpoint]}操作（HTTP {error.response.status_code}）。") from error
    except httpx.HTTPError as error:
        raise HTTPException(status_code=502, detail=f"无法连接 Palworld REST API 执行{labels[endpoint]}：{error.__class__.__name__}") from error
    return {"message": f"{labels[endpoint]}操作已发送到游戏服务器。"}


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/server/overview", response_model=ServerOverview)
async def server_overview() -> ServerOverview:
    settings = store.get()
    if settings.demo_mode:
        return _demo_overview()
    return await _fetch_overview(settings)


@app.post("/api/game/announce")
async def game_announce(value: GameMessageInput) -> dict[str, str]:
    return await _game_action("announce", {"message": value.message})


@app.post("/api/game/save")
async def game_save() -> dict[str, str]:
    return await _game_action("save")


@app.post("/api/game/kick")
async def game_kick(value: GamePlayerActionInput) -> dict[str, str]:
    return await _game_action("kick", {"userid": value.user_id, "message": value.message})


@app.post("/api/game/ban")
async def game_ban(value: GamePlayerActionInput) -> dict[str, str]:
    return await _game_action("ban", {"userid": value.user_id, "message": value.message})


@app.post("/api/game/unban")
async def game_unban(value: GameUnbanInput) -> dict[str, str]:
    return await _game_action("unban", {"userid": value.user_id})


@app.get("/api/settings", response_model=SettingsInput)
async def get_settings() -> Settings:
    return store.get()


@app.put("/api/settings", response_model=SettingsInput)
async def put_settings(value: SettingsInput) -> Settings:
    return store.save(Settings(**value.model_dump()))


async def _agent(action: str, extra: dict[str, object] | None = None) -> dict[str, object]:
    if not Path(AGENT_SOCKET).exists():
        return {"ok": False, "agent_connected": False, "message": "宿主机代理未安装。请先在 Ubuntu 执行 host-agent/install.sh。"}
    settings = store.get()
    payload: dict[str, object] = {"action": action, "steamcmd_path": settings.steamcmd_path, "server_path": settings.server_path}
    if extra:
        payload.update(extra)
    try:
        reader, writer = await asyncio.wait_for(asyncio.open_unix_connection(AGENT_SOCKET), timeout=2)
        writer.write((json.dumps(payload) + "\n").encode())
        await writer.drain()
        response = json.loads((await asyncio.wait_for(reader.readline(), timeout=900)).decode())
        writer.close()
        await writer.wait_closed()
        if not response.get("ok") and response.get("message") == "ValueError: 不允许的操作":
            response["message"] = "宿主机 Agent 版本过旧。更新管理器镜像后，请执行一次 sudo ./host-agent/install.sh；后续 Agent 将随镜像自动更新。"
        response["agent_connected"] = True
        return response
    except (OSError, asyncio.TimeoutError, json.JSONDecodeError) as error:
        return {"ok": False, "agent_connected": False, "message": f"宿主机代理调用失败：{error.__class__.__name__}"}


async def _agent_stream(action: str, extra: dict[str, object] | None = None):
    if not Path(AGENT_SOCKET).exists():
        yield f"data: {json.dumps({'event': 'complete', 'ok': False, 'message': '宿主机代理未安装。请先在 Ubuntu 执行 host-agent/install.sh。'}, ensure_ascii=False)}\n\n"
        return
    settings = store.get()
    payload: dict[str, object] = {"action": action, "stream": True, "steamcmd_path": settings.steamcmd_path, "server_path": settings.server_path}
    if extra:
        payload.update(extra)
    writer: asyncio.StreamWriter | None = None
    try:
        reader, writer = await asyncio.wait_for(asyncio.open_unix_connection(AGENT_SOCKET), timeout=2)
        writer.write((json.dumps(payload) + "\n").encode())
        await writer.drain()
        while line := await reader.readline():
            event = json.loads(line.decode())
            # Older installed agents respond once without the stream envelope.
            if "event" not in event:
                event = {"event": "complete", **event}
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
            if event.get("event") == "complete":
                break
    except (OSError, asyncio.TimeoutError, json.JSONDecodeError) as error:
        event = {"event": "complete", "ok": False, "message": f"宿主机代理流式调用失败：{error.__class__.__name__}"}
        yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
    finally:
        if writer:
            writer.close()
            await writer.wait_closed()


def _service_state(message: str) -> str:
    """Normalize both current and older host-agent systemd responses."""
    normalized = message.strip().lower()
    if normalized in SERVICE_STATES:
        return normalized
    match = SYSTEMD_ACTIVE_RE.search(message)
    return match.group(1) if match else "unknown"


@app.get("/api/server/config")
async def get_server_config() -> dict[str, object]:
    return await _agent("get_config")


@app.put("/api/server/config")
async def put_server_config(value: ServerConfigInput) -> dict[str, object]:
    current = store.get()
    submitted_admin_password = value.options.get("AdminPassword")
    admin_password = submitted_admin_password if isinstance(submitted_admin_password, str) and submitted_admin_password else current.rest_password
    if not admin_password:
        raise HTTPException(status_code=422, detail="首次启用 REST API 时必须设置管理员密码。")
    response = await _agent("set_config", {"config": value.model_dump()})
    if response.get("ok"):
        rest_api_port = value.options.get("RESTAPIPort", 8212)
        if not isinstance(rest_api_port, int) or isinstance(rest_api_port, bool):
            raise HTTPException(status_code=422, detail="REST API 端口格式无效。")
        rest_url = f"http://host.docker.internal:{rest_api_port}/v1/api"
        store.save(Settings(
            demo_mode=False,
            rest_url=rest_url,
            rest_username="admin",
            rest_password=admin_password,
            steamcmd_path=current.steamcmd_path,
            server_path=current.server_path,
        ))
        response["rest_url"] = rest_url
        response["demo_mode"] = False
    return response


@app.get("/api/host/status")
async def host_status() -> dict[str, object]:
    response = await _agent("status")
    message = str(response.get("message", ""))
    state = _service_state(message)
    service_missing = message.strip().lower() == "not-installed"
    response["service_state"] = "not-installed" if service_missing else state
    response["service_installed"] = False if service_missing else True if state != "unknown" or response.get("ok") else None
    if response.get("agent_connected") and service_missing:
        response["message"] = "代理已连接；Palworld systemd 服务尚未安装。请先执行安装。"
    elif response.get("agent_connected") and state == "active":
        response["message"] = "Palworld 原生服务正在运行。"
    elif response.get("agent_connected") and state == "inactive":
        response["message"] = "Palworld 原生服务已安装，当前未运行。"
    elif response.get("agent_connected") and state == "failed":
        response["message"] = "Palworld 原生服务启动失败，请在主机日志中排查。"
    elif response.get("agent_connected") and state in {"activating", "deactivating"}:
        response["message"] = "Palworld 原生服务正在切换状态，请稍候刷新。"
    elif response.get("agent_connected") and response["service_installed"] is None:
        response["message"] = "代理已连接，但当前代理无法确认服务状态。可尝试启动服务，或更新代理后重新检查。"
    return response


@app.get("/api/monitoring")
async def monitoring() -> dict[str, object]:
    settings = store.get()
    overview_task = asyncio.create_task(_fetch_overview(settings) if not settings.demo_mode else asyncio.sleep(0, result=_demo_overview()))
    host = await _agent("monitor")
    overview = await overview_task
    if not host.get("ok"):
        return {**host, "history": store.monitoring_history()}

    total_memory = int(host.get("memory_total_bytes") or 0)
    available_memory = int(host.get("memory_available_bytes") or 0)
    disk_total = int(host.get("disk_total_bytes") or 0)
    disk_used = int(host.get("disk_used_bytes") or 0)
    process = host.get("palworld") if isinstance(host.get("palworld"), dict) else {}
    store.record_monitoring_sample({
        "host_cpu_percent": float(host.get("cpu_percent") or 0),
        "host_memory_percent": round((total_memory - available_memory) / total_memory * 100, 1) if total_memory else 0.0,
        "disk_used_percent": round(disk_used / disk_total * 100, 1) if disk_total else 0.0,
        "palworld_cpu_percent": float(process.get("cpu_percent") or 0),
        "palworld_memory_bytes": int(process.get("memory_bytes") or 0),
        "server_fps": overview.metrics.server_fps if overview.source == "palworld-rest" else None,
        "current_players": overview.metrics.current_players if overview.source == "palworld-rest" else None,
    })
    return {
        "ok": True,
        "agent_connected": True,
        "message": "已同步宿主机与游戏运行指标。",
        "host": host,
        "game": {"source": overview.source, "server_fps": overview.metrics.server_fps, "current_players": overview.metrics.current_players, "max_players": overview.metrics.max_players},
        "history": store.monitoring_history(),
    }


@app.post("/api/host/install")
async def host_install() -> dict[str, object]:
    return await _agent("install")


@app.post("/api/host/update")
async def host_update() -> dict[str, object]:
    return await _agent("update")


@app.get("/api/backups")
async def backups() -> dict[str, object]:
    return await _agent("list_backups")


@app.get("/api/operations")
async def operations() -> dict[str, object]:
    return await _agent("list_operation_logs")


@app.put("/api/backups/schedule")
async def put_backup_schedule(value: BackupScheduleInput) -> dict[str, object]:
    return await _agent("set_backup_schedule", value.model_dump())


@app.post("/api/backups/import/stream")
async def import_backup_stream(name: str = Form(...), archive: UploadFile = File(...)) -> StreamingResponse:
    """Stage an uploaded archive in the manager data volume for host-agent validation.

    The host agent only receives an opaque generated identifier, never a browser
    filename or a caller-controlled host path.
    """
    try:
        display_name = BackupNameInput(name=name).name
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    filename = archive.filename or ""
    if not filename.lower().endswith(".tar.gz"):
        raise HTTPException(status_code=422, detail="仅支持 .tar.gz 格式的世界备份包。")

    BACKUP_IMPORTS_DIR.mkdir(parents=True, exist_ok=True)
    import_id = f"{uuid.uuid4().hex}.tar.gz"
    staged = BACKUP_IMPORTS_DIR / import_id
    received = 0
    try:
        with staged.open("xb") as target:
            while chunk := await archive.read(1024 * 1024):
                received += len(chunk)
                if received > MAX_BACKUP_IMPORT_BYTES:
                    raise HTTPException(status_code=413, detail="导入包超过 16 GB 限制。")
                target.write(chunk)
    except Exception:
        staged.unlink(missing_ok=True)
        raise
    finally:
        await archive.close()

    async def events():
        try:
            async for event in _agent_stream("import_backup", {"import_id": import_id, "name": display_name}):
                yield event
        finally:
            staged.unlink(missing_ok=True)

    return StreamingResponse(events(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.post("/api/backups/create/stream")
async def create_backup_stream(value: BackupNameInput | None = None) -> StreamingResponse:
    extra = {"name": value.name} if value else None
    return StreamingResponse(_agent_stream("create_backup", extra), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.post("/api/backups/{backup_id}/restore/stream")
async def restore_backup_stream(backup_id: str, value: BackupRestoreInput) -> StreamingResponse:
    if not value.confirmed:
        raise HTTPException(status_code=422, detail="恢复存档必须明确确认。")
    return StreamingResponse(_agent_stream("restore_backup", {"backup_id": backup_id, "confirmed": True}), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.delete("/api/backups/{backup_id}")
async def delete_backup(backup_id: str) -> dict[str, object]:
    return await _agent("delete_backup", {"backup_id": backup_id, "confirmed": True})


@app.patch("/api/backups/{backup_id}")
async def rename_backup(backup_id: str, value: BackupNameInput) -> dict[str, object]:
    return await _agent("rename_backup", {"backup_id": backup_id, "name": value.name})


@app.get("/api/backups/{backup_id}/download")
async def download_backup(backup_id: str) -> FileResponse:
    if not BACKUP_ID_RE.fullmatch(backup_id):
        raise HTTPException(status_code=404, detail="备份不存在。")
    response = await _agent("list_backups")
    record = next((item for item in response.get("backups", []) if isinstance(item, dict) and item.get("id") == backup_id), None)
    archive = BACKUPS_DIR / backup_id
    if not response.get("ok") or not record or not archive.is_file():
        raise HTTPException(status_code=404, detail="备份不存在或尚未挂载到面板。")
    name = str(record.get("name", backup_id)).replace('"', "'")
    return FileResponse(archive, media_type="application/gzip", filename=f"{name}.tar.gz")


@app.post("/api/host/{operation}/stream")
async def host_service_stream(operation: Literal["install", "update", "start", "stop", "restart"]) -> StreamingResponse:
    return StreamingResponse(_agent_stream(operation), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.post("/api/host/{operation}")
async def host_service(operation: Literal["start", "stop", "restart"]) -> dict[str, object]:
    return await _agent(operation)
