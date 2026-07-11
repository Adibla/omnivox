"use client";

import type { ReactNode } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageToggle } from "@/components/language-toggle";
import { useI18n } from "@/components/i18n-provider";
import { cn } from "@/lib/utils";

export type AppShellProps = {
  /** Mobile full-screen overlay (e.g. dismiss drawer) */
  mobileOverlay: ReactNode;
  /** Left column: brand, primary nav, recent list */
  sidebar: ReactNode;
  /** Sticky top row inside main column */
  header: ReactNode;
  /** Account/workspace controls shown before preferences */
  topbarEnd?: ReactNode;
  /** Scrollable main content */
  children: ReactNode;
  mobileNavOpen: boolean;
  sidebarCollapsed?: boolean;
  onOpenMobileNav: () => void;
};

export function AppShell({
  mobileOverlay,
  sidebar,
  header,
  topbarEnd,
  children,
  mobileNavOpen,
  sidebarCollapsed = false,
  onOpenMobileNav
}: AppShellProps) {
  const { t } = useI18n();

  return (
    <div className="flex min-h-screen w-full bg-background text-foreground">
      {mobileOverlay}

      <aside
        id="app-sidebar"
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[272px] shrink-0 flex-col border-r border-border/70 bg-card transition-[width,transform] duration-200 ease-out md:static md:z-0 md:translate-x-0",
          sidebarCollapsed && "md:w-[76px]",
          mobileNavOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
        aria-label={t("shell.nav")}
      >
        {sidebar}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-border/70 bg-background/92 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/78 sm:px-5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 md:hidden"
            onClick={onOpenMobileNav}
            aria-expanded={mobileNavOpen}
            aria-controls="app-sidebar"
            aria-label={t("shell.openMenu")}
          >
            <Menu aria-hidden="true" />
          </Button>
          <div className="min-w-0 flex-1">{header}</div>
          <div className="flex shrink-0 items-center gap-2">
            {topbarEnd}
            <LanguageToggle className="hidden sm:inline-flex" />
            <ThemeToggle className="shrink-0" />
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
