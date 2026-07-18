from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

import httpx
from fastapi import FastAPI
from pydantic import BaseModel, Field

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


class SettingsInput(BaseModel):
    demo_mode: bool
    rest_url: str
    rest_username: str
    rest_password: str
    steamcmd_path: str
    server_path: str


def _demo_overview() -> ServerOverview:
    return ServerOverview(
        status="demo",
        source="demo",
        checked_at=datetime.now(timezone.utc),
        message="演示模式：连接真实服务器后将显示实时数据。",
        server=ServerInfo(
            version="v1.0.1.100619",
            name="Palpagos · Expedition 01",
            description="为冒险者保留一盏篝火。",
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
            Player(name="Aether", account_name="aether", player_id="demo-001", ping=28, level=54, building_count=219, location_x=-292.4, location_y=146.8),
            Player(name="Mori", account_name="mori", player_id="demo-002", ping=41, level=47, building_count=136, location_x=-114.1, location_y=209.2),
            Player(name="Lumen", account_name="lumen", player_id="demo-003", ping=17, level=50, building_count=87, location_x=32.7, location_y=-66.4),
            Player(name="Rin", account_name="rin", player_id="demo-004", ping=62, level=36, building_count=44, location_x=217.9, location_y=-33.2),
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


async def _fetch_overview(settings: Settings) -> ServerOverview:
    auth = (settings.rest_username, settings.rest_password) if settings.rest_password else None
    timeout = httpx.Timeout(5.0, connect=2.0)
    try:
        async with httpx.AsyncClient(base_url=settings.rest_url, auth=auth, timeout=timeout) as client:
            info_response, metrics_response, players_response = await client.get("/info"), await client.get("/metrics"), await client.get("/players")
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
                ping=float(player.get("ping", 0)),
                level=int(player.get("level", 0)),
                building_count=int(player.get("building_count", 0)),
                location_x=float(player.get("location_x", 0)),
                location_y=float(player.get("location_y", 0)),
            )
            for player in players
        ],
    )


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/server/overview", response_model=ServerOverview)
async def server_overview() -> ServerOverview:
    settings = store.get()
    if settings.demo_mode:
        return _demo_overview()
    return await _fetch_overview(settings)


@app.get("/api/settings", response_model=SettingsInput)
async def get_settings() -> Settings:
    return store.get()


@app.put("/api/settings", response_model=SettingsInput)
async def put_settings(value: SettingsInput) -> Settings:
    return store.save(Settings(**value.model_dump()))


@app.get("/api/installer/plan")
async def installer_plan() -> dict[str, object]:
    settings = store.get()
    return {"agent_required": True, "steamcmd_path": settings.steamcmd_path, "server_path": settings.server_path, "message": "原生安装需要受限宿主机代理；面板不会获取 Docker 特权或完整宿主机权限。"}
