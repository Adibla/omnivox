"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { THEME_STORAGE_KEY } from "@/components/theme-script";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type ThemeMode = "light" | "dark";

function readTheme(): ThemeMode {
  if (typeof window === "undefined") {
    return "dark";
  }
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "light" || stored === "dark") {
    return stored;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: ThemeMode) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.dataset.theme = theme;
  window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  window.dispatchEvent(new CustomEvent("omni-theme-change", { detail: { theme } }));
}

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<ThemeMode>("dark");

  useEffect(() => {
    setTheme(readTheme());
  }, []);

  const selectTheme = (next: ThemeMode) => {
    setTheme(next);
    applyTheme(next);
  };

  return (
    <div
      className={cn("inline-flex h-8 rounded-md border border-border bg-muted/50 p-0.5 shadow-sm", className)}
      role="group"
      aria-label="Tema interfaccia"
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant={theme === "light" ? "secondary" : "ghost"}
            size="icon"
            className="h-7 w-7"
            onClick={() => selectTheme("light")}
            aria-label="Tema chiaro"
            aria-pressed={theme === "light"}
          >
            <Sun aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Tema chiaro</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant={theme === "dark" ? "secondary" : "ghost"}
            size="icon"
            className="h-7 w-7"
            onClick={() => selectTheme("dark")}
            aria-label="Tema scuro"
            aria-pressed={theme === "dark"}
          >
            <Moon aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Tema scuro</TooltipContent>
      </Tooltip>
    </div>
  );
}
