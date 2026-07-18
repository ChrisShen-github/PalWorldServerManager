#!/usr/bin/env python3
"""Restricted native-host operations for Palworld Server Manager."""
from __future__ import annotations

import asyncio
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
from datetime import datetime, timezone
from collections.abc import Callable
import urllib.request
from pathlib import Path

SOCKET = Path("/run/palworld-server-manager/agent.sock")
SERVICE = "palworld-server.service"
# install.sh runs this source directly from <compose-dir>/host-agent. Keep
# recovery points beside compose.yaml so they remain visible and portable.
MANAGER_ROOT = Path(__file__).resolve().parent.parent
BACKUP_ROOT = MANAGER_ROOT / "backups"
BACKUP_ID_RE = re.compile(r"^world-\d{8}T\d{6}(?:\d{6})?Z\.tar\.gz$")
MAX_MANAGED_BACKUPS = 12
STEAMCMD_URL = "https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz"
OPERATION_LOCK = asyncio.Lock()
ANSI_ESCAPE = re.compile(r"\x1B\[[0-?]*[ -/]*[@-~]")
OPTION_SETTINGS_RE = re.compile(r"^OptionSettings=\((.*)\)\s*$", re.MULTILINE)
STRING_OPTION_KEYS = {
    "ServerName", "ServerDescription", "AdminPassword", "ServerPassword", "PublicIP", "Region",
    "BanListURL", "RandomizerSeed", "AdditionalDropItemWhenPlayerKillingInPvPMode",
}
PASSWORD_OPTION_KEYS = {"AdminPassword", "ServerPassword"}
ARRAY_OPTION_KEYS = {"CrossplayPlatforms", "DenyTechnologyList"}
SELECT_OPTION_VALUES = {
    "Difficulty": {"None"},
    "DeathPenalty": {"None", "Item", "ItemAndEquipment", "All"},
    "LogFormatType": {"Text", "Json"},
    "RandomizerType": {"None", "Region", "All"},
}
BOOLEAN_OPTION_KEYS = {
    "bIsRandomizerPalLevelRandom", "bEnableVoiceChat", "bIsUseBackupSaveData",
    "bEnableInvaderEnemy", "EnablePredatorBossPal", "bEnablePlayerToPlayerDamage",
    "bEnableFriendlyFire", "bActiveUNKO", "bEnableAimAssistPad", "bEnableAimAssistKeyboard",
    "bAutoResetGuildNoOnlinePlayers", "bIsMultiplay", "bIsPvP", "bHardcore", "bPalLost",
    "bCharacterRecreateInHardcore", "bCanPickupOtherGuildDeathPenaltyDrop",
    "bEnableNonLoginPenalty", "bEnableFastTravel", "bEnableFastTravelOnlyBaseCamp",
    "bIsStartLocationSelectByMap", "bExistPlayerAfterLogout", "bEnableDefenseOtherGuildPlayer",
    "bInvisibleOtherGuildBaseCampAreaFX", "bBuildAreaLimit", "bShowPlayerList",
    "bAllowGlobalPalboxExport", "bAllowGlobalPalboxImport", "RCONEnabled", "RESTAPIEnabled",
    "bUseAuth", "bAllowClientMod", "bIsShowJoinLeftMessage",
    "bDisplayPvPItemNumOnWorldMap_BaseCamp", "bDisplayPvPItemNumOnWorldMap_Player",
    "bAdditionalDropItemWhenPlayerKillingInPvPMode", "bAllowEnhanceStat_Health",
    "bAllowEnhanceStat_Attack", "bAllowEnhanceStat_Stamina", "bAllowEnhanceStat_Weight",
    "bAllowEnhanceStat_WorkSpeed", "bEnableBuildingPlayerUIdDisplay",
}
INTEGER_OPTION_RANGES = {
    "PublicPort": (1, 65535), "ServerPlayerMaxNum": (1, 512), "RCONPort": (1, 65535),
    "RESTAPIPort": (1, 65535), "DropItemMaxNum": (0, 10000), "DropItemMaxNum_UNKO": (0, 5000),
    "BaseCampMaxNum": (0, 10240), "BaseCampMaxNumInGuild": (1, 10), "BaseCampWorkerMaxNum": (1, 50),
    "GuildPlayerMaxNum": (1, 100), "CoopPlayerMaxNum": (1, 4), "SupplyDropSpan": (0, 10080),
    "ChatPostLimitPerMinute": (0, 100), "MaxBuildingLimitNum": (0, 1000000),
    "GuildRejoinCooldownMinutes": (0, 10080), "AdditionalDropItemNumWhenPlayerKillingInPvPMode": (0, 100),
    "PhysicsActiveDropItemMaxNum": (-1, 10000), "AutoTransferMasterThresholdDays": (1, 365),
    "MaxGuildsPerFrame": (1, 100), "BuildingNameDisplayCacheTTLSeconds": (1, 3600),
}
FLOAT_OPTION_RANGES = {
    "DayTimeSpeedRate": (0.1, 5), "NightTimeSpeedRate": (0.1, 5), "ExpRate": (0, 20),
    "PalCaptureRate": (0.1, 5), "PalSpawnNumRate": (0.1, 5), "PalDamageRateAttack": (0.1, 5),
    "PalDamageRateDefense": (0.1, 5), "PlayerDamageRateAttack": (0.1, 5),
    "PlayerDamageRateDefense": (0.1, 5), "PlayerStomachDecreaceRate": (0.1, 5),
    "PlayerStaminaDecreaceRate": (0.1, 5), "PlayerAutoHPRegeneRate": (0.1, 5),
    "PlayerAutoHpRegeneRateInSleep": (0.1, 5), "PalStomachDecreaceRate": (0.1, 5),
    "PalStaminaDecreaceRate": (0.1, 5), "PalAutoHPRegeneRate": (0.1, 5),
    "PalAutoHpRegeneRateInSleep": (0.1, 5), "BuildObjectHpRate": (0.1, 5),
    "BuildObjectDamageRate": (0.1, 5), "BuildObjectDeteriorationDamageRate": (0, 10),
    "CollectionDropRate": (0.1, 5), "CollectionObjectHpRate": (0.1, 5),
    "CollectionObjectRespawnSpeedRate": (0.1, 5), "EnemyDropItemRate": (0.1, 5),
    "DropItemAliveMaxHours": (0, 240), "AutoResetGuildTimeNoOnlinePlayers": (0, 240),
    "PalEggDefaultHatchingTime": (0, 240), "WorkSpeedRate": (0.1, 5), "AutoSaveSpan": (30, 3600),
    "ItemWeightRate": (0.1, 5), "ServerReplicatePawnCullDistance": (5000, 15000),
    "EquipmentDurabilityDamageRate": (0.1, 5), "ItemContainerForceMarkDirtyInterval": (0.1, 10),
    "ItemCorruptionMultiplier": (0.1, 10), "BlockRespawnTime": (0, 60),
    "RespawnPenaltyDurationThreshold": (0, 3600), "RespawnPenaltyTimeScale": (0, 10),
    "PlayerDataPalStorageUpdateCheckTickInterval": (0.1, 60), "MonsterFarmActionSpeedRate": (0.1, 5),
    "AutoTransferMasterCheckIntervalSeconds": (60, 86400), "VoiceChatMaxVolumeDistance": (100, 50000),
    "VoiceChatZeroVolumeDistance": (100, 50000),
}
EDITABLE_OPTION_KEYS = (
    STRING_OPTION_KEYS | PASSWORD_OPTION_KEYS | ARRAY_OPTION_KEYS | set(SELECT_OPTION_VALUES) |
    BOOLEAN_OPTION_KEYS | set(INTEGER_OPTION_RANGES) | set(FLOAT_OPTION_RANGES)
)


def checked_path(value: str) -> Path:
    path = Path(value).resolve()
    if not path.is_relative_to("/opt"):
        raise ValueError("安装目录必须位于 /opt 下")
    return path


def emit(output: Callable[[str], None] | None, message: str) -> None:
    if output:
        output(message)


def clean_terminal_output(value: str) -> str:
    return ANSI_ESCAPE.sub("", value).replace("\r", "")


def split_option_settings(value: str) -> list[str]:
    parts: list[str] = []
    current: list[str] = []
    depth = 0
    quoted = False
    escaped = False
    for character in value:
        if escaped:
            current.append(character)
            escaped = False
            continue
        if character == "\\" and quoted:
            current.append(character)
            escaped = True
            continue
        if character == '"':
            quoted = not quoted
        elif not quoted and character == "(":
            depth += 1
        elif not quoted and character == ")":
            depth = max(0, depth - 1)
        if character == "," and not quoted and depth == 0:
            parts.append("".join(current).strip())
            current = []
        else:
            current.append(character)
    if current:
        parts.append("".join(current).strip())
    return [part for part in parts if part]


def option_map(content: str) -> tuple[re.Match[str], list[tuple[str, str]]]:
    match = OPTION_SETTINGS_RE.search(content)
    if not match:
        raise ValueError("配置文件中缺少 OptionSettings")
    entries: list[tuple[str, str]] = []
    for part in split_option_settings(match.group(1)):
        if "=" in part:
            key, value = part.split("=", 1)
            entries.append((key.strip(), value.strip()))
    return match, entries


def decode_string(value: str) -> str:
    if len(value) >= 2 and value[0] == value[-1] == '"':
        return value[1:-1].replace('\\"', '"').replace("\\\\", "\\")
    return value


def encode_string(value: str) -> str:
    if "\n" in value or "\r" in value:
        raise ValueError("配置文本不能包含换行")
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def config_file(server: Path) -> Path:
    return server / "Pal" / "Saved" / "Config" / "LinuxServer" / "PalWorldSettings.ini"


def save_games_path(server: Path) -> Path:
    return server / "Pal" / "Saved" / "SaveGames"


def backup_path(backup_id: str) -> Path:
    if not BACKUP_ID_RE.fullmatch(backup_id):
        raise ValueError("备份标识无效")
    return BACKUP_ROOT / backup_id


def backup_metadata_path() -> Path:
    return BACKUP_ROOT / "metadata.json"


def clean_backup_name(value: object) -> str:
    if not isinstance(value, str):
        raise ValueError("备份名称格式无效")
    name = value.strip()
    if not name or len(name) > 80 or any(character in name for character in "\\/\x00\r\n"):
        raise ValueError("备份名称需为 1 到 80 个字符，且不能包含路径或换行")
    return name


def read_backup_metadata() -> dict[str, str]:
    try:
        raw = json.loads(backup_metadata_path().read_text(encoding="utf-8"))
        return {key: value for key, value in raw.items() if BACKUP_ID_RE.fullmatch(key) and isinstance(value, str)} if isinstance(raw, dict) else {}
    except (FileNotFoundError, OSError, json.JSONDecodeError):
        return {}


def write_backup_metadata(metadata: dict[str, str]) -> None:
    BACKUP_ROOT.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=BACKUP_ROOT, prefix=".metadata-", delete=False) as temporary:
        json.dump(metadata, temporary, ensure_ascii=False, sort_keys=True)
        temporary_path = Path(temporary.name)
    os.replace(temporary_path, backup_metadata_path())


def backup_records() -> list[dict[str, object]]:
    if not BACKUP_ROOT.exists():
        return []
    metadata = read_backup_metadata()
    records: list[dict[str, object]] = []
    for archive in BACKUP_ROOT.glob("world-*.tar.gz"):
        if not BACKUP_ID_RE.fullmatch(archive.name) or not archive.is_file():
            continue
        stat = archive.stat()
        records.append({
            "id": archive.name,
            "name": metadata.get(archive.name, f"世界备份 {archive.name.removesuffix('.tar.gz').removeprefix('world-')}"),
            "created_at": datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat(),
            "size_bytes": stat.st_size,
        })
    return sorted(records, key=lambda item: str(item["id"]), reverse=True)


def prune_backups(output: Callable[[str], None] | None = None) -> None:
    stale = backup_records()[MAX_MANAGED_BACKUPS:]
    metadata = read_backup_metadata()
    for record in stale:
        backup_id = str(record["id"])
        backup_path(backup_id).unlink(missing_ok=True)
        metadata.pop(backup_id, None)
    if stale:
        write_backup_metadata(metadata)
    if stale:
        emit(output, f"已按保留策略清理 {len(stale)} 份较早的备份。")


def create_backup(server: Path, name: object = None, output: Callable[[str], None] | None = None) -> dict[str, object]:
    saves = save_games_path(server)
    if not saves.is_dir():
        raise FileNotFoundError("未找到世界存档目录，请确认服务器已启动过并生成存档")
    BACKUP_ROOT.mkdir(parents=True, exist_ok=True)
    was_running = status({}) == "active"
    if was_running:
        emit(output, "正在安全停止 Palworld 服务以冻结存档…")
        run("systemctl", "stop", SERVICE, output=output)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    archive = backup_path(f"world-{stamp}.tar.gz")
    temporary = archive.with_suffix(".tar.gz.partial")
    try:
        emit(output, "正在打包世界存档…")
        with tarfile.open(temporary, "w:gz") as bundle:
            bundle.add(saves, arcname="SaveGames", recursive=True)
        os.replace(temporary, archive)
        metadata = read_backup_metadata()
        metadata[archive.name] = clean_backup_name(name) if name is not None else f"世界备份 {stamp}"
        write_backup_metadata(metadata)
        prune_backups(output)
        emit(output, f"备份完成：{archive.name}")
        record = next(item for item in backup_records() if item["id"] == archive.name)
        return {"message": "存档备份已创建。", "backup": record, "server_restarted": was_running, "retention": MAX_MANAGED_BACKUPS}
    finally:
        temporary.unlink(missing_ok=True)
        if was_running:
            emit(output, "正在重新启动 Palworld 服务…")
            run("systemctl", "start", SERVICE, output=output)


def safe_extract(bundle: tarfile.TarFile, destination: Path) -> None:
    destination_root = destination.resolve()
    for member in bundle.getmembers():
        target = (destination / member.name).resolve()
        if not target.is_relative_to(destination_root) or member.issym() or member.islnk() or not (member.isfile() or member.isdir()):
            raise ValueError("备份归档包含不安全路径")
    bundle.extractall(destination)


def restore_backup(server: Path, backup_id: str, confirmed: bool, output: Callable[[str], None] | None = None) -> dict[str, object]:
    if not confirmed:
        raise ValueError("恢复存档必须明确确认")
    archive = backup_path(backup_id)
    if not archive.is_file():
        raise FileNotFoundError("备份不存在或已被清理")
    saves = save_games_path(server)
    if not saves.is_dir():
        raise FileNotFoundError("当前世界存档目录不存在，拒绝覆盖恢复")
    was_running = status({}) == "active"
    if was_running:
        emit(output, "正在安全停止 Palworld 服务…")
        run("systemctl", "stop", SERVICE, output=output)
    restore_safety_backup: dict[str, object] | None = None
    staging = Path(tempfile.mkdtemp(prefix=".palworld-restore-", dir=saves.parent))
    try:
        emit(output, "正在为当前存档创建恢复前保护备份…")
        restore_safety_backup = create_backup(server, output=output)
        emit(output, "正在校验并解压选择的备份…")
        with tarfile.open(archive, "r:gz") as bundle:
            safe_extract(bundle, staging)
        restored = staging / "SaveGames"
        if not restored.is_dir():
            raise ValueError("备份中不包含 SaveGames 根目录")
        emit(output, "正在替换世界存档…")
        shutil.rmtree(saves)
        os.replace(restored, saves)
        run("chown", "-R", "palworld:palworld", str(saves))
        emit(output, "存档恢复完成。")
        return {"message": "存档已恢复；恢复前版本已自动备份。", "backup": backup_id, "safety_backup": restore_safety_backup.get("backup") if restore_safety_backup else None, "server_restarted": was_running}
    finally:
        shutil.rmtree(staging, ignore_errors=True)
        if was_running:
            emit(output, "正在重新启动 Palworld 服务…")
            run("systemctl", "start", SERVICE, output=output)


def list_backups(server: Path) -> dict[str, object]:
    return {
        "message": "已读取本机存档备份。" if save_games_path(server).exists() else "尚未检测到世界存档目录。",
        "backups": backup_records(),
        "retention": MAX_MANAGED_BACKUPS,
    }


def delete_backup(backup_id: str, confirmed: bool) -> dict[str, object]:
    if not confirmed:
        raise ValueError("删除备份必须明确确认")
    archive = backup_path(backup_id)
    if not archive.is_file():
        raise FileNotFoundError("备份不存在或已被清理")
    archive.unlink()
    metadata = read_backup_metadata()
    metadata.pop(backup_id, None)
    write_backup_metadata(metadata)
    return {"message": "备份已删除。", "deleted": backup_id}


def rename_backup(backup_id: str, name: object) -> dict[str, object]:
    archive = backup_path(backup_id)
    if not archive.is_file():
        raise FileNotFoundError("备份不存在或已被清理")
    metadata = read_backup_metadata()
    metadata[backup_id] = clean_backup_name(name)
    write_backup_metadata(metadata)
    return {"message": "备份名称已更新。", "backup_id": backup_id, "name": metadata[backup_id]}


def default_config_file(server: Path) -> Path:
    return server / "DefaultPalWorldSettings.ini"


def config_source(server: Path) -> tuple[Path, str]:
    target = config_file(server)
    if target.exists():
        content = target.read_text(encoding="utf-8-sig")
        if OPTION_SETTINGS_RE.search(content):
            return target, "target"
    default = default_config_file(server)
    if default.exists() and OPTION_SETTINGS_RE.search(default.read_text(encoding="utf-8-sig")):
        return default, "default-invalid" if target.exists() else "default-missing"
    raise FileNotFoundError("未找到 PalWorldSettings.ini 或 DefaultPalWorldSettings.ini，请先安装服务器")


def decode_array(value: str) -> list[str]:
    if value.startswith("(") and value.endswith(")"):
        value = value[1:-1]
    return [decode_string(item.strip()) for item in split_option_settings(value) if item.strip()]


def decode_option_value(key: str, value: str) -> object:
    if key in STRING_OPTION_KEYS:
        return decode_string(value)
    if key in ARRAY_OPTION_KEYS:
        return decode_array(value)
    if key in BOOLEAN_OPTION_KEYS:
        return value.lower() == "true"
    if key in INTEGER_OPTION_RANGES:
        try:
            return int(float(value))
        except ValueError:
            return INTEGER_OPTION_RANGES[key][0]
    if key in FLOAT_OPTION_RANGES:
        try:
            return float(value)
        except ValueError:
            return 1.0
    return value


def read_server_config(payload: dict[str, object]) -> dict[str, object]:
    server = checked_path(str(payload["server_path"]))
    source, source_state = config_source(server)
    _, entries = option_map(source.read_text(encoding="utf-8-sig"))
    values = dict(entries)
    options = {
        key: decode_option_value(key, value)
        for key, value in entries
        if key in EDITABLE_OPTION_KEYS and key not in PASSWORD_OPTION_KEYS
    }
    config = {
        "options": options,
        "passwords": {
            "server": bool(decode_string(values.get("ServerPassword", '""'))),
            "admin": bool(decode_string(values.get("AdminPassword", '""'))),
        },
        "file_exists": source_state == "target",
        "source": source_state,
        "world_option_exists": any((server / "Pal" / "Saved" / "SaveGames").glob("*/*/WorldOption.sav")),
    }
    messages = {
        "target": "已读取 PalWorldSettings.ini。",
        "default-missing": "目标配置尚未创建，已载入服务器默认模板；保存后将自动创建。",
        "default-invalid": "目标配置为空或不完整，已载入服务器默认模板；保存时会先备份旧文件再初始化。",
    }
    return {"message": messages[source_state], "config": config}


def validated_config(raw: object) -> dict[str, object]:
    if not isinstance(raw, dict):
        raise ValueError("服务器配置格式无效")
    options = raw.get("options")
    if set(raw) != {"options"} or not isinstance(options, dict):
        raise ValueError("服务器配置格式无效")
    unknown = set(options) - EDITABLE_OPTION_KEYS
    if unknown:
        raise ValueError(f"包含不允许的配置项：{', '.join(sorted(unknown))}")
    result = dict(options)
    for key, value in result.items():
        if key in STRING_OPTION_KEYS:
            maximum = 512 if key == "ServerDescription" else 256
            if not isinstance(value, str) or len(value) > maximum or "\n" in value or "\r" in value:
                raise ValueError(f"{key} 格式无效")
            if key == "ServerName" and not value.strip():
                raise ValueError("服务器名称不能为空")
        elif key in ARRAY_OPTION_KEYS:
            if not isinstance(value, list) or len(value) > 256 or any(not isinstance(item, str) or len(item) > 128 for item in value):
                raise ValueError(f"{key} 格式无效")
        elif key in SELECT_OPTION_VALUES:
            if value not in SELECT_OPTION_VALUES[key]:
                raise ValueError(f"{key} 选项无效")
        elif key in BOOLEAN_OPTION_KEYS:
            if not isinstance(value, bool):
                raise ValueError(f"{key} 必须为布尔值")
        elif key in INTEGER_OPTION_RANGES:
            minimum, maximum = INTEGER_OPTION_RANGES[key]
            if not isinstance(value, int) or isinstance(value, bool) or not minimum <= value <= maximum:
                raise ValueError(f"{key} 必须在 {minimum} 到 {maximum} 之间")
        elif key in FLOAT_OPTION_RANGES:
            minimum, maximum = FLOAT_OPTION_RANGES[key]
            if not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(float(value)) or not minimum <= float(value) <= maximum:
                raise ValueError(f"{key} 必须在 {minimum} 到 {maximum} 之间")
    return result


def encode_config_value(key: str, value: object) -> str:
    if key in STRING_OPTION_KEYS:
        return encode_string(str(value))
    if key in ARRAY_OPTION_KEYS:
        items = value if isinstance(value, list) else []
        if key == "DenyTechnologyList":
            return "(" + ",".join(encode_string(str(item)) for item in items) + ")"
        return "(" + ",".join(str(item) for item in items) + ")"
    if isinstance(value, bool):
        return "True" if value else "False"
    if key in FLOAT_OPTION_RANGES:
        return f"{float(value):.6f}"
    return str(value)


def write_server_config(payload: dict[str, object]) -> dict[str, object]:
    server = checked_path(str(payload["server_path"]))
    source, source_state = config_source(server)
    target = config_file(server)
    content = source.read_text(encoding="utf-8-sig")
    match, entries = option_map(content)
    config = validated_config(payload.get("config"))
    config["RESTAPIEnabled"] = True
    updates = {key: encode_config_value(key, value) for key, value in config.items()}
    updated_entries: list[tuple[str, str]] = []
    seen: set[str] = set()
    for key, value in entries:
        updated_entries.append((key, updates.get(key, value)))
        seen.add(key)
    for key, value in updates.items():
        if key not in seen:
            updated_entries.append((key, value))
    rendered = content[:match.start()] + "OptionSettings=(" + ",".join(f"{key}={value}" for key, value in updated_entries) + ")" + content[match.end():]
    target.parent.mkdir(parents=True, exist_ok=True)
    backup_path: Path | None = None
    if target.exists():
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
        backup_path = target.with_name(f"PalWorldSettings.ini.manager-{stamp}.bak")
        shutil.copy2(target, backup_path)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=target.parent, prefix=".PalWorldSettings.", delete=False) as temporary:
        temporary.write(rendered)
        temporary_path = Path(temporary.name)
    os.chmod(temporary_path, 0o640)
    os.replace(temporary_path, target)
    run("chown", "palworld:palworld", str(target))
    return {
        "message": ("服务器配置已初始化并保存；重启 Palworld 服务后生效。" if source_state != "target" else "服务器配置已保存；重启 Palworld 服务后生效。"),
        "restart_required": True,
        "backup_created": str(backup_path) if backup_path else None,
    }


def run(*args: str, output: Callable[[str], None] | None = None) -> str:
    if output:
        process = subprocess.Popen(args, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, bufsize=1)
        lines: list[str] = []
        assert process.stdout is not None
        for line in process.stdout:
            text = clean_terminal_output(line).rstrip()
            if text:
                lines.append(text)
                output(text)
        if process.wait() != 0:
            raise subprocess.CalledProcessError(process.returncode, args, output="\n".join(lines))
        return "\n".join(lines[-4000:])
    result = subprocess.run(args, check=True, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    return clean_terminal_output(result.stdout)[-4000:]


def ensure_user(output: Callable[[str], None] | None = None) -> None:
    if subprocess.run(("id", "palworld"), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode:
        emit(output, "正在创建 palworld 系统用户…")
        run("useradd", "--system", "--create-home", "--home-dir", "/var/lib/palworld", "--shell", "/usr/sbin/nologin", "palworld", output=output)


def install_steamcmd(path: Path, output: Callable[[str], None] | None = None) -> str:
    emit(output, "正在检查 SteamCMD…")
    if (path / "steamcmd.sh").exists():
        emit(output, "SteamCMD 已存在，跳过下载。")
        return "SteamCMD 已存在。"
    emit(output, "正在安装 SteamCMD 所需系统依赖…")
    run("apt-get", "update", output=output)
    run("apt-get", "install", "-y", "lib32gcc-s1", "libc6-i386", "curl", output=output)
    path.mkdir(parents=True, exist_ok=True)
    emit(output, "正在下载并解压 SteamCMD…")
    with tempfile.NamedTemporaryFile(suffix=".tar.gz") as archive:
        last_percent = -1

        def progress(blocks: int, block_size: int, total_size: int) -> None:
            nonlocal last_percent
            if total_size <= 0:
                return
            percent = min(100, blocks * block_size * 100 // total_size)
            if percent >= last_percent + 10 or percent == 100:
                last_percent = percent
                emit(output, f"正在下载 SteamCMD… {percent}%")

        urllib.request.urlretrieve(STEAMCMD_URL, archive.name, reporthook=progress)
        with tarfile.open(archive.name) as bundle:
            bundle.extractall(path)
    run("chown", "-R", "palworld:palworld", str(path), output=output)
    emit(output, "SteamCMD 安装完成。")
    return "SteamCMD 已安装。"


def write_service(server: Path, output: Callable[[str], None] | None = None) -> None:
    content = f"""[Unit]\nDescription=Palworld Dedicated Server\nAfter=network.target\n\n[Service]\nUser=palworld\nWorkingDirectory={server}\nExecStart={server}/PalServer.sh -port=8211 -useperfthreads -NoAsyncLoadingThread -UseMultithreadForDS\nRestart=on-failure\nRestartSec=10\n\n[Install]\nWantedBy=multi-user.target\n"""
    Path("/etc/systemd/system/palworld-server.service").write_text(content)
    emit(output, "正在创建 Palworld systemd 服务…")
    run("systemctl", "daemon-reload", output=output)


def install(payload: dict[str, str], output: Callable[[str], None] | None = None) -> str:
    steamcmd, server = checked_path(payload["steamcmd_path"]), checked_path(payload["server_path"])
    emit(output, "正在验证安装目录…")
    ensure_user(output)
    message = install_steamcmd(steamcmd, output)
    server.mkdir(parents=True, exist_ok=True)
    run("chown", "-R", "palworld:palworld", str(server), output=output)
    emit(output, "正在通过 SteamCMD 下载并验证 PalServer（App 2394010）…")
    message += "\n" + run("runuser", "-u", "palworld", "--", str(steamcmd / "steamcmd.sh"), "+force_install_dir", str(server), "+login", "anonymous", "+app_update", "2394010", "validate", "+quit", output=output)
    write_service(server, output)
    emit(output, "安装完成。请在面板中配置世界规则后启动服务器。")
    return message + "\n安装完成；请在面板中配置服务器设置后启动。"


def status(_: dict[str, str]) -> str:
    if not shutil.which("systemctl"):
        return "systemd 不可用"
    load_state = subprocess.run(("systemctl", "show", SERVICE, "--property=LoadState", "--value"), check=False, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    if load_state.stdout.strip() in {"not-found", ""}:
        return "not-installed"
    result = subprocess.run(("systemctl", "is-active", SERVICE), check=False, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    return result.stdout.strip() or "unknown"


def operate(action: str, payload: dict[str, object], output: Callable[[str], None] | None = None) -> str | dict[str, object]:
    if action == "get_config": return read_server_config(payload)
    if action == "set_config": return write_server_config(payload)
    if action == "list_backups": return list_backups(checked_path(str(payload["server_path"])))
    if action == "create_backup": return create_backup(checked_path(str(payload["server_path"])), payload.get("name"), output)
    if action == "restore_backup": return restore_backup(checked_path(str(payload["server_path"])), str(payload.get("backup_id", "")), payload.get("confirmed") is True, output)
    if action == "delete_backup": return delete_backup(str(payload.get("backup_id", "")), payload.get("confirmed") is True)
    if action == "rename_backup": return rename_backup(str(payload.get("backup_id", "")), payload.get("name"))
    if action == "install": return install(payload, output)
    if action == "update":
        steamcmd, server = checked_path(payload["steamcmd_path"]), checked_path(payload["server_path"])
        emit(output, "正在停止服务器…")
        run("systemctl", "stop", SERVICE, output=output)
        emit(output, "正在通过 SteamCMD 更新并验证 PalServer…")
        result = run("runuser", "-u", "palworld", "--", str(steamcmd / "steamcmd.sh"), "+force_install_dir", str(server), "+login", "anonymous", "+app_update", "2394010", "validate", "+quit", output=output)
        emit(output, "正在重新启动服务器…")
        run("systemctl", "start", SERVICE, output=output)
        emit(output, "更新完成；服务器已重新启动。")
        return result + "\n更新完成；服务器已重新启动。"
    emit(output, f"正在执行服务器{action}操作…")
    return run("systemctl", action, SERVICE, output=output)


async def write_event(writer: asyncio.StreamWriter, event: dict[str, object]) -> None:
    writer.write((json.dumps(event, ensure_ascii=False) + "\n").encode())
    await writer.drain()


async def stream_operation(action: str, payload: dict[str, str], writer: asyncio.StreamWriter) -> None:
    queue: asyncio.Queue[str] = asyncio.Queue()
    loop = asyncio.get_running_loop()
    task = asyncio.create_task(asyncio.to_thread(operate, action, payload, lambda message: loop.call_soon_threadsafe(queue.put_nowait, message)))
    while not task.done() or not queue.empty():
        try:
            message = await asyncio.wait_for(queue.get(), timeout=0.25)
        except asyncio.TimeoutError:
            continue
        await write_event(writer, {"event": "progress", "message": message})
    try:
        result = await task
        await write_event(writer, {"event": "complete", "ok": True, "message": result or "操作完成。"})
    except Exception as error:
        await write_event(writer, {"event": "complete", "ok": False, "message": f"{error.__class__.__name__}: {error}"})


async def handle(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
    streaming = False
    try:
        payload = json.loads((await reader.readline()).decode())
        action = payload.get("action")
        if action not in {"status", "install", "update", "start", "stop", "restart", "get_config", "set_config", "list_backups", "create_backup", "restore_backup", "delete_backup", "rename_backup"}:
            raise ValueError("不允许的操作")
        streaming = bool(payload.get("stream"))
        async with OPERATION_LOCK:
            if streaming:
                await stream_operation(action, payload, writer)
            else:
                result = await asyncio.to_thread(operate, action, payload)
                response = {"ok": True, **result} if isinstance(result, dict) else {"ok": True, "message": result}
    except Exception as error:  # Agent must return errors without exposing a shell.
        if streaming:
            await write_event(writer, {"event": "complete", "ok": False, "message": f"{error.__class__.__name__}: {error}"})
        else:
            response = {"ok": False, "message": f"{error.__class__.__name__}: {error}"}
    if not streaming:
        writer.write((json.dumps(response) + "\n").encode())
        await writer.drain()
    writer.close()
    await writer.wait_closed()


def source_signature(path: Path) -> tuple[int, int, int, int]:
    stat = path.stat()
    return stat.st_dev, stat.st_ino, stat.st_size, stat.st_mtime_ns


async def wait_for_agent_update(path: Path | None = None, interval: float = 2.0) -> None:
    source = path or Path(__file__)
    initial = source_signature(source)
    while True:
        await asyncio.sleep(interval)
        try:
            current = source_signature(source)
        except FileNotFoundError:
            continue
        if current != initial:
            return


async def main() -> None:
    SOCKET.parent.mkdir(parents=True, exist_ok=True)
    if SOCKET.exists(): SOCKET.unlink()
    server = await asyncio.start_unix_server(handle, path=str(SOCKET))
    os.chmod(SOCKET, 0o660)
    # The manager image atomically replaces this file. Exiting lets the existing
    # systemd Restart=always policy load the new code without a privileged hook.
    async with server:
        await wait_for_agent_update()


if __name__ == "__main__":
    try: asyncio.run(main())
    except KeyboardInterrupt: sys.exit(0)
