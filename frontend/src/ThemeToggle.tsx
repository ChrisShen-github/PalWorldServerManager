import { useState } from "react";
import { PalIcon } from "./PalIcons";

export type Theme = "dark" | "light";

function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(currentTheme);
  const nextTheme = theme === "dark" ? "light" : "dark";
  const label = nextTheme === "light" ? "切换到浅色模式" : "切换到深色模式";

  const toggle = () => {
    document.documentElement.dataset.theme = nextTheme;
    document.documentElement.style.colorScheme = nextTheme;
    localStorage.setItem("palworld-manager-theme", nextTheme);
    setTheme(nextTheme);
  };

  return <button aria-label={label} className="theme-toggle" onClick={toggle} title={label} type="button">
    <PalIcon name={theme === "dark" ? "sun" : "moon"} />
    <span>{theme === "dark" ? "浅色" : "深色"}</span>
  </button>;
}
