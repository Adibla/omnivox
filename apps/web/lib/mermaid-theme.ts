import type { MermaidConfig } from "mermaid";

/**
 * Mermaid "base" theme aligned with app tokens in globals.css (:root HSL).
 * Values are hex for Mermaid themeVariables (Mermaid 11).
 */
export function getMermaidThemeConfig(): {
  theme: "base";
  themeVariables: Record<string, string>;
} {
  const isDark =
    typeof document === "undefined" || document.documentElement.classList.contains("dark");
  return {
    theme: "base",
    themeVariables: isDark ? darkThemeVariables : lightThemeVariables,
  };
}

const darkThemeVariables = {
  fontSize: "15px",
  background: "#13151a",
  mainBkg: "#1a1d24",
  secondBkg: "#151820",
  tertiaryColor: "#252a33",
  primaryColor: "#3b7df0",
  primaryTextColor: "#f3f5f7",
  primaryBorderColor: "#2f3640",
  secondaryColor: "#252a33",
  secondaryTextColor: "#e8eaef",
  secondaryBorderColor: "#2f3640",
  lineColor: "#4a5568",
  textColor: "#f3f5f7",
  border1: "#2f3640",
  border2: "#3d4654",
  arrowheadColor: "#9ca3af",
  clusterBkg: "#1a1d24",
  clusterBorder: "#3d4654",
  titleColor: "#f3f5f7",
  edgeLabelBackground: "#1a1d24",
  actorBkg: "#1a1d24",
  actorBorder: "#3d4654",
  actorTextColor: "#f3f5f7",
  signalColor: "#9ca3af",
  signalTextColor: "#e8eaef",
  labelBoxBkgColor: "#252a33",
  labelBoxBorderColor: "#3d4654",
  labelTextColor: "#f3f5f7",
  loopTextColor: "#e8eaef",
  activationBorderColor: "#3d4654",
  activationBkgColor: "#252a33",
  sequenceNumberColor: "#13151a",
  sectionBkgColor: "#1a1d24",
  altSectionBkgColor: "#151820",
  gridColor: "#2f3640",
  todayLineColor: "#3b7df0",
  taskBkgColor: "#252a33",
  taskTextColor: "#f3f5f7",
  taskTextLightColor: "#9ca3af",
  taskTextOutsideColor: "#e8eaef",
  taskTextClickableColor: "#7ab0ff",
  activeTaskBkgColor: "#3b7df0",
  activeTaskBorderColor: "#2563eb",
  doneTaskBkgColor: "#1e3a2f",
  doneTaskBorderColor: "#2d6a4f",
  critBorderColor: "#ef4444",
  critBkgColor: "#3f1d1d",
  fontFamily: "ui-sans-serif, system-ui, sans-serif",
};

const lightThemeVariables = {
  ...darkThemeVariables,
  background: "#f5f7fb",
  mainBkg: "#ffffff",
  secondBkg: "#eef3f8",
  tertiaryColor: "#e2eaf2",
  primaryColor: "#2563eb",
  primaryTextColor: "#152033",
  primaryBorderColor: "#cbd5e1",
  secondaryColor: "#eef3f8",
  secondaryTextColor: "#243247",
  secondaryBorderColor: "#cbd5e1",
  lineColor: "#64748b",
  textColor: "#152033",
  border1: "#cbd5e1",
  border2: "#94a3b8",
  arrowheadColor: "#475569",
  clusterBkg: "#ffffff",
  clusterBorder: "#cbd5e1",
  titleColor: "#152033",
  edgeLabelBackground: "#ffffff",
  actorBkg: "#ffffff",
  actorBorder: "#94a3b8",
  actorTextColor: "#152033",
  signalColor: "#475569",
  signalTextColor: "#243247",
  labelBoxBkgColor: "#eef3f8",
  labelBoxBorderColor: "#cbd5e1",
  labelTextColor: "#152033",
  loopTextColor: "#243247",
  activationBorderColor: "#94a3b8",
  activationBkgColor: "#e2eaf2",
  sequenceNumberColor: "#ffffff",
  sectionBkgColor: "#ffffff",
  altSectionBkgColor: "#eef3f8",
  gridColor: "#cbd5e1",
  todayLineColor: "#2563eb",
  taskBkgColor: "#eef3f8",
  taskTextColor: "#152033",
  taskTextLightColor: "#64748b",
  taskTextOutsideColor: "#243247",
  taskTextClickableColor: "#1d4ed8",
  activeTaskBkgColor: "#2563eb",
  activeTaskBorderColor: "#1d4ed8",
  doneTaskBkgColor: "#dcfce7",
  doneTaskBorderColor: "#22c55e",
  critBorderColor: "#dc2626",
  critBkgColor: "#fee2e2",
};

/** Full `mermaid.initialize` options: theme + layout readability (flowchart / mindmap). */
export function getMermaidInitializeOptions(): MermaidConfig {
  return {
    ...getMermaidThemeConfig(),
    htmlLabels: true,
    flowchart: {
      diagramPadding: 28,
      padding: 14,
      nodeSpacing: 56,
      rankSpacing: 56,
      useMaxWidth: true,
      wrappingWidth: 200,
    },
    mindmap: {
      padding: 20,
      maxNodeWidth: 240,
      useMaxWidth: true,
    },
  };
}
