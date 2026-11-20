import { LAB_IDS, type LabId } from "./labMetadata";

type LabVisit = { labId: LabId; classId: string };

const storageKey = (userId: string) => `computing-lab:recent-lab:${userId}`;

export function rememberRecentLab(userId: string, visit: LabVisit): void {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(visit));
  } catch {
    return;
  }
}

export function getRecentLab(userId: string): LabVisit | null {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    const visit = raw ? (JSON.parse(raw) as Partial<LabVisit> | null) : null;
    const labId = LAB_IDS.find((id) => id === visit?.labId);
    return labId && typeof visit?.classId === "string" ? { labId, classId: visit.classId } : null;
  } catch {
    return null;
  }
}
