import type { AnalysisOutput } from "@omnivox/shared";

type Action = AnalysisOutput["actions"][number];

type LabelSet = {
  sections: {
    actions: string;
    participants: string;
    transcript: string;
    diagrams: string;
  };
  fields: {
    status: string;
    type: string;
    owner: string;
    priority: string;
    risk: string;
    due: string;
  };
  status: Record<NonNullable<Action["status"]>, string>;
  actionType: Record<Action["actionType"], string>;
  level: Record<string, string>;
};

const LABELS_IT: LabelSet = {
  sections: {
    actions: "Azioni",
    participants: "Partecipanti",
    transcript: "Trascrizione",
    diagrams: "Diagrammi (Mermaid)",
  },
  fields: {
    status: "Stato",
    type: "Tipo",
    owner: "Owner",
    priority: "Priorità",
    risk: "Rischio",
    due: "Scadenza",
  },
  status: {
    todo: "Da fare",
    in_progress: "In corso",
    blocked: "Bloccata",
    done: "Fatta",
  },
  actionType: {
    task: "Attività",
    decision: "Decisione",
    risk: "Rischio",
    follow_up: "Follow-up",
  },
  level: { high: "Alta", medium: "Media", low: "Bassa" },
};

const LABELS_EN: LabelSet = {
  sections: {
    actions: "Actions",
    participants: "Participants",
    transcript: "Transcript",
    diagrams: "Diagrams (Mermaid)",
  },
  fields: {
    status: "Status",
    type: "Type",
    owner: "Owner",
    priority: "Priority",
    risk: "Risk",
    due: "Due",
  },
  status: {
    todo: "To do",
    in_progress: "In progress",
    blocked: "Blocked",
    done: "Done",
  },
  actionType: {
    task: "Task",
    decision: "Decision",
    risk: "Risk",
    follow_up: "Follow-up",
  },
  level: { high: "High", medium: "Medium", low: "Low" },
};

export function exportLabels(locale: string): LabelSet {
  return locale === "en" ? LABELS_EN : LABELS_IT;
}

export function formatExportDate(value: string | null | undefined, locale: string): string {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return date.toLocaleDateString(locale === "en" ? "en-GB" : "it-IT", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function describeAction(action: Action, locale: string) {
  const labels = exportLabels(locale);
  return {
    status: labels.status[action.status ?? "todo"],
    type: labels.actionType[action.actionType],
    priority: labels.level[action.priority] ?? action.priority,
    risk: labels.level[action.risk] ?? action.risk,
    due: formatExportDate(action.dueDate, locale),
  };
}
