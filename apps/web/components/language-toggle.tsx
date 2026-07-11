"use client";

import { Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { type UiLocale, useI18n } from "@/components/i18n-provider";
import { cn } from "@/lib/utils";

const OPTIONS: { value: UiLocale; label: string }[] = [
  { value: "it", label: "IT" },
  { value: "en", label: "EN" }
];

export function LanguageToggle({ className }: { className?: string }) {
  const { locale, setLocale } = useI18n();

  return (
    <div
      className={cn("inline-flex h-8 items-center gap-0.5 rounded-md border border-border bg-muted/50 p-0.5 shadow-sm", className)}
      role="group"
      aria-label="Lingua interfaccia"
    >
      <span className="hidden h-7 w-7 items-center justify-center text-muted-foreground sm:inline-flex">
        <Languages aria-hidden="true" className="h-3.5 w-3.5" />
      </span>
      {OPTIONS.map((option) => (
        <Tooltip key={option.value}>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant={locale === option.value ? "secondary" : "ghost"}
              size="sm"
              className="h-7 px-2 text-[11px]"
              onClick={() => setLocale(option.value)}
              aria-label={option.value === "it" ? "Interfaccia in italiano" : "Interface in English"}
              aria-pressed={locale === option.value}
            >
              {option.label}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{option.value === "it" ? "Italiano" : "English"}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}
