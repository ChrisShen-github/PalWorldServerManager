from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    demo_mode: bool = True
    rest_url: str = "http://host.docker.internal:8212/v1/api"
    rest_username: str = "admin"
    rest_password: str = ""
    steamcmd_path: str = "/opt/steamcmd"
    server_path: str = "/opt/palserver"


class SettingsStore:
    def __init__(self) -> None:
        self.path = Path("/var/lib/palworld-manager/settings.db")
        if not self.path.parent.exists():
            self.path = Path.cwd() / "data" / "settings.db"
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with sqlite3.connect(self.path) as connection:
            connection.execute("CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id=1), demo_mode INTEGER NOT NULL, rest_url TEXT NOT NULL, rest_username TEXT NOT NULL, rest_password TEXT NOT NULL, steamcmd_path TEXT NOT NULL, server_path TEXT NOT NULL)")
            connection.execute("INSERT OR IGNORE INTO settings VALUES (1, 1, 'http://host.docker.internal:8212/v1/api', 'admin', '', '/opt/steamcmd', '/opt/palserver')")
            connection.execute("CREATE TABLE IF NOT EXISTS monitoring_samples (sampled_at TEXT PRIMARY KEY, host_cpu_percent REAL NOT NULL, host_memory_percent REAL NOT NULL, disk_used_percent REAL NOT NULL, palworld_cpu_percent REAL NOT NULL, palworld_memory_bytes INTEGER NOT NULL, server_fps REAL, current_players INTEGER)")

    def get(self) -> Settings:
        with sqlite3.connect(self.path) as connection:
            row = connection.execute("SELECT demo_mode, rest_url, rest_username, rest_password, steamcmd_path, server_path FROM settings WHERE id=1").fetchone()
        return Settings(bool(row[0]), *row[1:])

    def save(self, value: Settings) -> Settings:
        with sqlite3.connect(self.path) as connection:
            connection.execute("UPDATE settings SET demo_mode=?, rest_url=?, rest_username=?, rest_password=?, steamcmd_path=?, server_path=? WHERE id=1", (int(value.demo_mode), value.rest_url.rstrip('/'), value.rest_username, value.rest_password, value.steamcmd_path, value.server_path))
        return self.get()

    def record_monitoring_sample(self, sample: dict[str, float | int | None]) -> None:
        sampled_at = datetime.now(timezone.utc).isoformat()
        with sqlite3.connect(self.path) as connection:
            connection.execute(
                "INSERT INTO monitoring_samples VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (sampled_at, sample["host_cpu_percent"], sample["host_memory_percent"], sample["disk_used_percent"], sample["palworld_cpu_percent"], sample["palworld_memory_bytes"], sample["server_fps"], sample["current_players"]),
            )
            connection.execute("DELETE FROM monitoring_samples WHERE rowid NOT IN (SELECT rowid FROM monitoring_samples ORDER BY sampled_at DESC LIMIT 720)")

    def monitoring_history(self, hours: int = 24) -> list[dict[str, float | int | str | None]]:
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
        with sqlite3.connect(self.path) as connection:
            rows = connection.execute("SELECT sampled_at, host_cpu_percent, host_memory_percent, disk_used_percent, palworld_cpu_percent, palworld_memory_bytes, server_fps, current_players FROM monitoring_samples WHERE sampled_at >= ? ORDER BY sampled_at", (cutoff,)).fetchall()
        keys = ("sampled_at", "host_cpu_percent", "host_memory_percent", "disk_used_percent", "palworld_cpu_percent", "palworld_memory_bytes", "server_fps", "current_players")
        return [dict(zip(keys, row)) for row in rows]
