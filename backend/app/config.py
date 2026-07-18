from __future__ import annotations

import os
from dataclasses import dataclass


def _as_bool(value: str | None, *, default: bool) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    demo_mode: bool
    rest_url: str
    rest_username: str
    rest_password: str

    @classmethod
    def from_environment(cls) -> "Settings":
        return cls(
            demo_mode=_as_bool(os.getenv("PMSM_DEMO_MODE"), default=True),
            rest_url=os.getenv("PALWORLD_REST_URL", "http://palworld-server:8212").rstrip("/"),
            rest_username=os.getenv("PALWORLD_REST_USERNAME", "admin"),
            rest_password=os.getenv("PALWORLD_REST_PASSWORD", ""),
        )
