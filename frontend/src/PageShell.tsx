import { type ReactNode } from "react";
import { PalIcon, type PalIconName } from "./PalIcons";
import "./page-shell.css";

export type PageView = "dashboard" | "game" | "paldex" | "map" | "backups" | "operations" | "settings";

const navigation: Array<{ view: PageView; label: string; icon: PalIconName; href: string }> = [
  { view: "dashboard", label: "指挥台", icon: "dashboard", href: "/" },
  { view: "game", label: "游戏内管理", icon: "game", href: "?view=game" },
  { view: "paldex", label: "帕鲁图鉴", icon: "paldex", href: "?view=paldex" },
  { view: "map", label: "世界地图", icon: "map", href: "?view=map" },
  { view: "backups", label: "存档与备份", icon: "backup", href: "?view=backups" },
  { view: "operations", label: "运行日志", icon: "logs", href: "?view=operations" },
  { view: "settings", label: "世界规则与安装", icon: "settings", href: "?view=settings" },
];

function navigate(href: string) {
  location.href = href;
}

export function NavigationSidebar({ active }: { active: PageView }) {
  return <aside>
    <div className="brand"><b className="brand-mark"><PalIcon name="sphere" /></b><span><strong>PALWORLD</strong><small>SERVER MANAGER</small></span></div>
    <nav aria-label="主导航">{navigation.map((item) => <button aria-current={active === item.view ? "page" : undefined} className={active === item.view ? "active" : ""} key={item.view} onClick={() => navigate(item.href)} type="button"><PalIcon className="nav-icon" name={item.icon} /><span>{item.label}</span></button>)}</nav>
    <footer>原生 SteamCMD · Docker 面板</footer>
  </aside>;
}

export function PageShell({ active, children, mainClassName }: { active: PageView; children: ReactNode; mainClassName?: string }) {
  return <div className="shell"><NavigationSidebar active={active} /><main className={mainClassName} id="main">{children}</main></div>;
}
