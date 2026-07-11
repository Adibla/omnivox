const STORAGE_KEY = "omnivox:recent-meetings";
const MAX_ITEMS = 25;

export type RecentMeeting = {
  jobId: string;
  meetingId: string;
  title: string;
  status: "completed" | "failed" | "in_progress";
  updatedAt: string;
  /** Set when analysis completed; used for overview stats */
  actionCount?: number;
  diagramCount?: number;
};

export function loadRecentMeetings(): RecentMeeting[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as RecentMeeting[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveRecentMeetings(items: RecentMeeting[]) {
  if (typeof window === "undefined") {
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
}

export function upsertRecentMeeting(entry: RecentMeeting) {
  const all = loadRecentMeetings().filter((x) => x.jobId !== entry.jobId);
  all.unshift(entry);
  saveRecentMeetings(all);
}

export function removeRecentMeeting(jobId: string) {
  saveRecentMeetings(loadRecentMeetings().filter((x) => x.jobId !== jobId));
}
