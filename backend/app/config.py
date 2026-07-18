from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    demo_mode: bool = True
    rest_url: str = "http://host.docker.internal:8212"
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
            connection.execute("INSERT OR IGNORE INTO settings VALUES (1, 1, 'http://host.docker.internal:8212', 'admin', '', '/opt/steamcmd', '/opt/palserver')")

    def get(self) -> Settings:
        with sqlite3.connect(self.path) as connection:
            row = connection.execute("SELECT demo_mode, rest_url, rest_username, rest_password, steamcmd_path, server_path FROM settings WHERE id=1").fetchone()
        return Settings(bool(row[0]), *row[1:])

    def save(self, value: Settings) -> Settings:
        with sqlite3.connect(self.path) as connection:
            connection.execute("UPDATE settings SET demo_mode=?, rest_url=?, rest_username=?, rest_password=?, steamcmd_path=?, server_path=? WHERE id=1", (int(value.demo_mode), value.rest_url.rstrip('/'), value.rest_username, value.rest_password, value.steamcmd_path, value.server_path))
        return self.get()
