export type ConfigValue = string | number | boolean | string[];
export type ConfigFieldType = "text" | "textarea" | "password" | "number" | "boolean" | "select" | "multi";

export type ConfigField = {
  key: string;
  label: string;
  type: ConfigFieldType;
  defaultValue: ConfigValue;
  help?: string;
  min?: number;
  max?: number;
  step?: number;
  options?: { value: string; label: string }[];
  wide?: boolean;
  danger?: boolean;
};

export type ConfigGroup = {
  id: string;
  title: string;
  eyebrow: string;
  description: string;
  fields: ConfigField[];
};

const text = (key: string, label: string, defaultValue = "", help?: string, wide = false): ConfigField => ({ key, label, type: "text", defaultValue, help, wide });
const area = (key: string, label: string, defaultValue = "", help?: string): ConfigField => ({ key, label, type: "textarea", defaultValue, help, wide: true });
const password = (key: string, label: string, help?: string): ConfigField => ({ key, label, type: "password", defaultValue: "", help });
const number = (key: string, label: string, defaultValue: number, min: number, max: number, step = 1, help?: string): ConfigField => ({ key, label, type: "number", defaultValue, min, max, step, help });
const toggle = (key: string, label: string, defaultValue: boolean, help?: string, danger = false): ConfigField => ({ key, label, type: "boolean", defaultValue, help, danger });
const select = (key: string, label: string, defaultValue: string, options: { value: string; label: string }[], help?: string): ConfigField => ({ key, label, type: "select", defaultValue, options, help });
const multi = (key: string, label: string, defaultValue: string[], options: string[], help?: string): ConfigField => ({ key, label, type: "multi", defaultValue, options: options.map((value) => ({ value, label: value })), help, wide: true });

export const SERVER_CONFIG_GROUPS: ConfigGroup[] = [
  {
    id: "server",
    title: "服务器与连接",
    eyebrow: "SERVER & NETWORK",
    description: "名称、密码、人数、跨平台、管理接口与日志。REST API 会由面板保持启用。",
    fields: [
      text("ServerName", "服务器名称", "Default Palworld Server", "显示在服务器列表中的名称。"),
      number("ServerPlayerMaxNum", "最大训练家人数", 32, 1, 512, 1),
      area("ServerDescription", "服务器简介", "", "显示在服务器详情中的介绍。"),
      password("ServerPassword", "加入密码", "留空时保持现有密码不变。"),
      password("AdminPassword", "管理员密码", "REST API 与管理员指令使用；留空时保持不变。"),
      text("PublicIP", "公网 IP", "", "仅社区服务器需要显式指定；通常留空自动检测。"),
      number("PublicPort", "公网端口", 8211, 1, 65535, 1, "不会改变游戏实际监听端口。"),
      multi("CrossplayPlatforms", "允许连接的平台", ["Steam", "Xbox", "PS5", "Mac"], ["Steam", "Xbox", "PS5", "Mac"], "取消平台前请确认现有训练家不会被阻止连接。"),
      text("Region", "服务器地区", ""),
      toggle("bIsUseBackupSaveData", "启用游戏内世界备份", true, "Palworld 按官方保留策略生成备份；会增加磁盘写入。"),
      number("AutoSaveSpan", "自动保存间隔（秒）", 30, 30, 3600, 1),
      select("LogFormatType", "日志格式", "Text", [{ value: "Text", label: "文本" }, { value: "Json", label: "JSON" }]),
      number("RESTAPIPort", "REST API 端口", 8212, 1, 65535, 1, "请勿将此端口直接暴露到公网。"),
      toggle("RCONEnabled", "启用 RCON", false, "仅在确实需要旧式远程控制时开启。"),
      number("RCONPort", "RCON 端口", 25575, 1, 65535, 1),
      toggle("bShowPlayerList", "显示在线训练家列表", false, "允许训练家在 ESC 菜单查看在线列表。"),
      toggle("bIsShowJoinLeftMessage", "显示加入与离开消息", true),
      number("ChatPostLimitPerMinute", "每分钟聊天上限", 10, 0, 100, 1),
      toggle("bAllowClientMod", "允许使用客户端 Mod", true, "开启后允许启用 Mod 的客户端加入。", true),
      toggle("bEnableVoiceChat", "启用游戏内语音", false),
      number("VoiceChatMaxVolumeDistance", "语音无衰减距离", 3000, 100, 50000, 100),
      number("VoiceChatZeroVolumeDistance", "语音静音距离", 15000, 100, 50000, 100),
      toggle("bUseAuth", "启用服务器认证", true, "建议保持开启。", true),
      text("BanListURL", "封禁列表 URL", "https://b.palworldgame.com/api/banlist.txt", "建议保留官方地址。", true),
    ],
  },
  {
    id: "balance",
    title: "世界倍率",
    eyebrow: "GAME BALANCE",
    description: "时间、成长、战斗、生存、采集与生产倍率。1.0 通常代表标准值。",
    fields: [
      number("DayTimeSpeedRate", "白天流逝速度", 1, 0.1, 5, 0.1),
      number("NightTimeSpeedRate", "夜晚流逝速度", 1, 0.1, 5, 0.1),
      number("ExpRate", "经验值倍率", 1, 0, 20, 0.1),
      number("PalCaptureRate", "帕鲁捕获倍率", 1, 0.1, 5, 0.1),
      number("PalSpawnNumRate", "帕鲁出现数量倍率", 1, 0.1, 5, 0.1, "提高会明显增加服务器负载。"),
      number("PalDamageRateAttack", "帕鲁造成伤害倍率", 1, 0.1, 5, 0.1),
      number("PalDamageRateDefense", "帕鲁承受伤害倍率", 1, 0.1, 5, 0.1),
      number("PlayerDamageRateAttack", "训练家造成伤害倍率", 1, 0.1, 5, 0.1),
      number("PlayerDamageRateDefense", "训练家承受伤害倍率", 1, 0.1, 5, 0.1),
      number("PlayerStomachDecreaceRate", "训练家饱食度消耗倍率", 1, 0.1, 5, 0.1),
      number("PlayerStaminaDecreaceRate", "训练家耐力消耗倍率", 1, 0.1, 5, 0.1),
      number("PlayerAutoHPRegeneRate", "训练家生命自然回复倍率", 1, 0.1, 5, 0.1),
      number("PlayerAutoHpRegeneRateInSleep", "训练家睡眠回复倍率", 1, 0.1, 5, 0.1),
      number("PalStomachDecreaceRate", "帕鲁饱食度消耗倍率", 1, 0.1, 5, 0.1),
      number("PalStaminaDecreaceRate", "帕鲁耐力消耗倍率", 1, 0.1, 5, 0.1),
      number("PalAutoHPRegeneRate", "帕鲁生命自然回复倍率", 1, 0.1, 5, 0.1),
      number("PalAutoHpRegeneRateInSleep", "帕鲁终端内回复倍率", 1, 0.1, 5, 0.1),
      number("BuildObjectHpRate", "建筑生命值倍率", 1, 0.1, 5, 0.1),
      number("BuildObjectDamageRate", "建筑承受伤害倍率", 1, 0.1, 5, 0.1),
      number("BuildObjectDeteriorationDamageRate", "建筑劣化速度倍率", 1, 0, 10, 0.1),
      number("CollectionDropRate", "采集掉落倍率", 1, 0.1, 5, 0.1),
      number("CollectionObjectHpRate", "采集物生命值倍率", 1, 0.1, 5, 0.1),
      number("CollectionObjectRespawnSpeedRate", "采集物重生间隔倍率", 1, 0.1, 5, 0.1),
      number("EnemyDropItemRate", "敌人掉落倍率", 1, 0.1, 5, 0.1),
      number("PalEggDefaultHatchingTime", "巨大蛋孵化时间（小时）", 72, 0, 240, 0.5),
      number("WorkSpeedRate", "工作速度倍率", 1, 0.1, 5, 0.1),
      number("MonsterFarmActionSpeedRate", "放牧产出速度倍率", 1, 0.1, 5, 0.1),
      number("ItemWeightRate", "物品重量倍率", 1, 0.1, 5, 0.1),
      number("EquipmentDurabilityDamageRate", "装备耐久损耗倍率", 1, 0.1, 5, 0.1),
      number("ItemCorruptionMultiplier", "食物腐坏速度倍率", 1, 0.1, 10, 0.1),
    ],
  },
  {
    id: "world",
    title: "世界与公会",
    eyebrow: "WORLD RULES",
    description: "死亡、传送、袭击、据点、公会、掉落物和跨界帕鲁终端规则。",
    fields: [
      select("DeathPenalty", "死亡惩罚", "All", [
        { value: "None", label: "不掉落" }, { value: "Item", label: "掉落非装备物品" },
        { value: "ItemAndEquipment", label: "掉落物品与装备" }, { value: "All", label: "掉落物品、装备与队伍帕鲁" },
      ]),
      toggle("bEnableInvaderEnemy", "启用袭击事件", true),
      toggle("EnablePredatorBossPal", "启用猛兽 Boss 帕鲁", true),
      toggle("bEnableFastTravel", "启用快速传送", true),
      toggle("bEnableFastTravelOnlyBaseCamp", "仅允许据点间快速传送", false, "开启后鹰像将不能用于快速传送。", true),
      toggle("bIsStartLocationSelectByMap", "允许从地图选择初始位置", true),
      toggle("bExistPlayerAfterLogout", "登出后角色留在世界", false),
      number("BaseCampMaxNum", "全服据点总数上限", 128, 0, 10240, 1, "数值过高会增加服务器负载。"),
      number("BaseCampMaxNumInGuild", "每个公会据点上限", 4, 1, 10, 1),
      number("BaseCampWorkerMaxNum", "每个据点工作帕鲁上限", 15, 1, 50, 1, "数值过高会显著增加服务器负载。"),
      number("GuildPlayerMaxNum", "公会训练家上限", 20, 1, 100, 1),
      number("GuildRejoinCooldownMinutes", "重新加入公会冷却（分钟）", 0, 0, 10080, 1),
      toggle("bAutoResetGuildNoOnlinePlayers", "自动清理长期无人公会", false, "会删除公会建筑与据点帕鲁，请谨慎开启。", true),
      number("AutoResetGuildTimeNoOnlinePlayers", "无人公会清理阈值（小时）", 72, 0, 240, 1),
      number("AutoTransferMasterCheckIntervalSeconds", "会长自动移交检查间隔（秒）", 3600, 60, 86400, 60),
      number("AutoTransferMasterThresholdDays", "会长离线移交阈值（天）", 14, 1, 365, 1),
      number("DropItemMaxNum", "掉落物最大存在数量", 3000, 0, 10000, 1),
      number("DropItemMaxNum_UNKO", "帕鲁便便最大存在数量", 100, 0, 5000, 1),
      number("DropItemAliveMaxHours", "掉落物存在时间（小时）", 1, 0, 240, 0.5),
      number("SupplyDropSpan", "陨石与空投间隔（分钟）", 180, 0, 10080, 1),
      toggle("bAllowGlobalPalboxExport", "允许保存至跨界帕鲁终端", true),
      toggle("bAllowGlobalPalboxImport", "允许从跨界帕鲁终端复原", false, "可能影响服务器经济与进度。", true),
      toggle("bAllowEnhanceStat_Health", "允许加点：生命", true),
      toggle("bAllowEnhanceStat_Attack", "允许加点：攻击", true),
      toggle("bAllowEnhanceStat_Stamina", "允许加点：耐力", true),
      toggle("bAllowEnhanceStat_Weight", "允许加点：负重", true),
      toggle("bAllowEnhanceStat_WorkSpeed", "允许加点：工作速度", true),
      select("RandomizerType", "帕鲁随机化模式", "None", [{ value: "None", label: "关闭" }, { value: "Region", label: "按区域随机" }, { value: "All", label: "完全随机" }]),
      text("RandomizerSeed", "随机化种子", ""),
      toggle("bIsRandomizerPalLevelRandom", "野外帕鲁等级完全随机", false),
    ],
  },
  {
    id: "advanced",
    title: "PvP 与高级",
    eyebrow: "PVP & PERFORMANCE",
    description: "PvP、硬核、建造限制和同步性能。带警示的设置可能改变存档体验或服务器负载。",
    fields: [
      toggle("bIsPvP", "启用 PvP", false, "仅开启此项并不足以完成全部 PvP 规则配置。", true),
      toggle("bEnablePlayerToPlayerDamage", "允许训练家互相伤害", false, undefined, true),
      toggle("bEnableFriendlyFire", "启用友伤", false, undefined, true),
      toggle("bHardcore", "启用硬核模式", false, "死亡后无法正常复活。", true),
      toggle("bPalLost", "死亡永久失去帕鲁", false, undefined, true),
      toggle("bCharacterRecreateInHardcore", "硬核死亡后允许重建角色", false),
      toggle("bCanPickupOtherGuildDeathPenaltyDrop", "允许拾取其他公会死亡掉落", false),
      toggle("bEnableDefenseOtherGuildPlayer", "据点防御其他公会训练家", false),
      toggle("bInvisibleOtherGuildBaseCampAreaFX", "隐藏其他公会据点区域特效", false),
      toggle("bDisplayPvPItemNumOnWorldMap_BaseCamp", "地图显示据点 PvP 物品数量", false),
      toggle("bDisplayPvPItemNumOnWorldMap_Player", "地图显示训练家 PvP 物品数量", false),
      toggle("bAdditionalDropItemWhenPlayerKillingInPvPMode", "PvP 击杀追加掉落", false),
      text("AdditionalDropItemWhenPlayerKillingInPvPMode", "PvP 追加掉落物 ID", "PlayerDropItem"),
      number("AdditionalDropItemNumWhenPlayerKillingInPvPMode", "PvP 追加掉落数量", 1, 0, 100, 1),
      number("BlockRespawnTime", "重生基础冷却（秒）", 5, 0, 60, 0.5),
      number("RespawnPenaltyDurationThreshold", "连续死亡判定阈值（秒）", 0, 0, 3600, 1),
      number("RespawnPenaltyTimeScale", "连续死亡冷却倍率", 2, 0, 10, 0.1),
      toggle("bEnableNonLoginPenalty", "启用长期未登录惩罚", true),
      toggle("bBuildAreaLimit", "限制特殊区域附近建造", false),
      number("MaxBuildingLimitNum", "每名训练家建筑上限", 0, 0, 1000000, 1, "0 表示不限。"),
      number("ServerReplicatePawnCullDistance", "帕鲁同步距离（厘米）", 15000, 5000, 15000, 100),
      number("PhysicsActiveDropItemMaxNum", "启用物理模拟的掉落物上限", -1, -1, 10000, 1, "-1 使用游戏默认值。"),
      number("ItemContainerForceMarkDirtyInterval", "容器强制同步间隔（秒）", 1, 0.1, 10, 0.1),
      number("PlayerDataPalStorageUpdateCheckTickInterval", "帕鲁仓库更新检查间隔", 1, 0.1, 60, 0.1),
      number("MaxGuildsPerFrame", "每帧处理公会数量上限", 10, 1, 100, 1),
      toggle("bEnableBuildingPlayerUIdDisplay", "建筑显示建造者 ID", false),
      number("BuildingNameDisplayCacheTTLSeconds", "建筑名称缓存时间（秒）", 60, 1, 3600, 1),
      toggle("bActiveUNKO", "启用帕鲁便便", false),
      toggle("bEnableAimAssistPad", "启用手柄瞄准辅助", true),
      toggle("bEnableAimAssistKeyboard", "启用键鼠瞄准辅助", false),
      multi("DenyTechnologyList", "禁用科技 ID", [], [], "高级项：当前先保留并展示已有 ID；后续接入完整科技选择器。"),
    ],
  },
];

export const SERVER_CONFIG_FIELDS = SERVER_CONFIG_GROUPS.flatMap((group) => group.fields);

export const DEFAULT_SERVER_OPTIONS = Object.fromEntries(
  SERVER_CONFIG_FIELDS.map((field) => [field.key, Array.isArray(field.defaultValue) ? [...field.defaultValue] : field.defaultValue]),
) as Record<string, ConfigValue>;
