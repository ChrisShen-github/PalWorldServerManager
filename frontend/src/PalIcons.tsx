export type PalIconName = "sphere" | "dashboard" | "server" | "trainers" | "backup" | "settings" | "logs" | "refresh" | "search" | "sun" | "moon" | "pulse" | "paldex" | "map";

export function PalIcon({ name, className = "" }: { name: PalIconName; className?: string }) {
  const paths: Record<PalIconName, React.ReactNode> = {
    sphere: <><circle cx="12" cy="12" r="8.5" /><path d="M3.8 10.2h4.4l2.1-2.1h3.4l2.1 2.1h4.4M3.8 13.8h4.4l2.1 2.1h3.4l2.1-2.1h4.4" /><circle cx="12" cy="12" r="2.2" /><path d="m8.3 5.1 1 2.2m6.4-2.2-1 2.2" /></>,
    dashboard: <><path d="M4 17.5V9l8-5 8 5v8.5" /><path d="M7.5 19v-6h3v6m3-8h3v3h-3z" /><path d="M3 19h18" /></>,
    server: <><path d="M7 20V7l5-3 5 3v13" /><path d="M4 20h16M9.5 9h5m-5 3h5m-5 3h5" /><circle cx="12" cy="18" r=".7" /></>,
    trainers: <><circle cx="8" cy="8" r="2" /><circle cx="16" cy="8" r="2" /><circle cx="5" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /><path d="M8.2 17.8c.7-3.1 2-4.6 3.8-4.6s3.1 1.5 3.8 4.6c.3 1.4-.8 2.6-2.2 2.1L12 19.3l-1.6.6c-1.4.5-2.5-.7-2.2-2.1Z" /></>,
    backup: <><path d="m12 3 6 4v8l-6 6-6-6V7z" /><path d="m8.5 8.5 3.5-2 3.5 2-3.5 2zM12 10.5V17m-3-4.5 3 2 3-2" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" /><circle cx="12" cy="12" r="8" /></>,
    logs: <><path d="M6 3.5h9l3 3V20.5H6z" /><path d="M15 3.5v3h3M9 10h6m-6 3h6m-6 3h4" /><path d="m8.5 6.8 1 1 1.8-2" /></>,
    refresh: <><path d="M19 8a7.5 7.5 0 0 0-12.7-2L4 8" /><path d="M4 4v4h4m-3 8a7.5 7.5 0 0 0 12.7 2L20 16" /><path d="M20 20v-4h-4" /></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.3 15.3 5 5" /><path d="M7.5 10.5h6m-3-3v6" /></>,
    sun: <><circle cx="12" cy="12" r="3.5" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4m0-14.2-1.4 1.4M6.3 17.7l-1.4 1.4" /></>,
    moon: <path d="M20 15.2A8.2 8.2 0 0 1 8.8 4a8.4 8.4 0 1 0 11.2 11.2Z" />,
    pulse: <><path d="M3 12h4l2-5 3.5 10 2.5-6 1.5 1H21" /><path d="M6 4.5A9 9 0 1 1 3 12" /></>,
    paldex: <><path d="M6 4.5h9.2l2.8 2.8v12.2H6z" /><path d="M15.2 4.5v2.8H18M9 10h6m-6 3h4" /><circle cx="9.2" cy="16.5" r="1.7" /><path d="M12.2 16.5h3.8" /></>,
    map: <><path d="m3.5 6 5.4-2 6.1 2 5-2v14l-5 2-6.1-2-5.4 2z" /><path d="M8.9 4v14m6.1-12v14" /><path d="M12 9.3c1.4 0 2.5 1 2.5 2.3 0 1.9-2.5 4.1-2.5 4.1S9.5 13.5 9.5 11.6C9.5 10.3 10.6 9.3 12 9.3Z" /></>,
  };

  return <svg aria-hidden="true" className={className} focusable="false" viewBox="0 0 24 24">{paths[name]}</svg>;
}
