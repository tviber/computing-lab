import { createEffect, createSignal, type Accessor } from "solid-js";
import { api } from "../api/client";
import { labMetadata } from "./labMetadata";

/** One row of GET /api/labs — the catalog's lab identifiers and visibility. */
export type LabVisibility = {
  id: string;
  stageCount: number;
  /** Admin-toggled: hidden labs are admin-only until reopened. */
  hidden: boolean;
  /**
   * Admin-toggled class scope of an open lab: null means every class, an
   * array of class ids means only members of those classes.
   */
  openClassIds: string[] | null;
  /** Server-computed access verdict for the signed-in user. */
  visible: boolean;
  /**
   * The caller's own classes whose students may take the lab — entry
   * redirects and the dashboard picker use it to land on an open class.
   */
  visibleClassIds: string[];
};

/** One class cell of GET /api/teacher/labs — the teacher's own switch. */
export type TeacherLabClassGate = {
  classId: string;
  /** The admin scope admits this class (hidden labs admit none). */
  adminAllowed: boolean;
  /** The teacher's stored switch for this class; defaults to open. */
  teacherOpen: boolean;
  /** What this class's students experience. */
  open: boolean;
};

/** One row of GET /api/teacher/labs. */
export type TeacherLabView = Omit<LabVisibility, "visible"> & {
  classes: TeacherLabClassGate[];
};

/** Flat id → title view of `labMetadata` for the admin/teacher lab lists. */
export const LAB_TITLES: Record<string, string> = Object.fromEntries(
  Object.entries(labMetadata).map(([id, meta]) => [id, meta.title]),
);

/**
 * Fetches the lab catalog once `enabled()` (i.e. the caller is signed in).
 * Returns null while loading, then a Map keyed by lab id — empty when the
 * request failed, so surfaces fail open and the API still enforces access.
 */
export function useLabCatalog(enabled: () => boolean): Accessor<Map<string, LabVisibility> | null> {
  const [catalog, setCatalog] = createSignal<Map<string, LabVisibility> | null>(null);
  createEffect(
    () => enabled(),
    (isEnabled) => {
      if (!isEnabled) return;
      let cancelled = false;
      void api
        .get<{ labs: LabVisibility[] }>("/api/labs")
        .then((payload) => {
          if (!cancelled) setCatalog(new Map(payload.labs.map((lab) => [lab.id, lab])));
        })
        .catch(() => {
          if (!cancelled) setCatalog(new Map());
        });
      return () => {
        cancelled = true;
      };
    },
  );
  return catalog;
}
