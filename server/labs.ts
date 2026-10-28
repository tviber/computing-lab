/**
 * Server-side lab registry: the dashboard allowlist. Stage counts come from
 * the feature domain modules — server→features imports are an established
 * precedent (see routes/calculator.ts).
 */

import type { DatabaseSync } from "node:sqlite";
import { CALCULATOR_STAGES } from "../src/features/calculator/domain/stages.ts";
import { COLOR_QUANT_STAGES } from "../src/features/color-quantization/domain/stages.ts";
import { CPU_STAGES } from "../src/features/cpu/domain/stages.ts";
import { DECODING_STAGES } from "../src/features/decoding/domain/stages.ts";
import { IMAGE_SAMPLING_STAGES } from "../src/features/image-sampling/domain/stages.ts";
import { IS_SIM_STAGES } from "../src/features/is-sim/domain/stages.ts";
import { LUNCH_STAGES } from "../src/features/lunch-shift/domain/stages.ts";
import type { SessionUser } from "./auth/session.ts";
import { parseJsonColumn } from "./db/client.ts";

export type LabInfo = {
  id: string;
  stageCount: number;
  /** Labs awaiting review stay closed until an administrator opens them. */
  defaultHidden?: boolean;
};

/**
 * Stored visibility of one lab. `hidden` locks the lab to admins; when open,
 * `openClassIds` scopes the audience — `null` means every class, an array of
 * class ids means only members of those classes ('[]' = no class).
 */
export type LabVisibility = {
  hidden: boolean;
  openClassIds: string[] | null;
};

export const LAB_REGISTRY: LabInfo[] = [
  { id: "calculator", stageCount: CALCULATOR_STAGES.length },
  { id: "image-sampling", stageCount: IMAGE_SAMPLING_STAGES.length },
  { id: "color-quantization", stageCount: COLOR_QUANT_STAGES.length },
  { id: "cpu", stageCount: CPU_STAGES.length },
  { id: "decoding", stageCount: DECODING_STAGES.length },
  { id: "is-sim", stageCount: IS_SIM_STAGES.length },
  { id: "lunch-shift", stageCount: LUNCH_STAGES.length },
  { id: "audio-encoding", stageCount: 0, defaultHidden: true },
];

export function labInfo(id: string | undefined): LabInfo | undefined {
  return LAB_REGISTRY.find((l) => l.id === id);
}

/** lab_settings rows keyed by lab id. */
function visibilityRows(db: DatabaseSync): Map<string, LabVisibility> {
  const rows = db
    .prepare("SELECT lab_id AS id, hidden, open_class_ids AS openClassIds FROM lab_settings")
    .all() as { id: string; hidden: number; openClassIds: string | null }[];
  const map = new Map<string, LabVisibility>();
  for (const row of rows) {
    map.set(row.id, {
      hidden: row.hidden === 1,
      openClassIds: parseJsonColumn<string[] | null>(row.openClassIds, null),
    });
  }
  return map;
}

function defaultVisibility(labId: string): LabVisibility {
  return {
    hidden: LAB_REGISTRY.find((lab) => lab.id === labId)?.defaultHidden ?? false,
    openClassIds: null,
  };
}

export function labVisibility(db: DatabaseSync, labId: string): LabVisibility {
  return visibilityRows(db).get(labId) ?? defaultVisibility(labId);
}

/**
 * Persist one lab's visibility. `openClassIds` omitted keeps the stored
 * scope; `null` reopens to every class; an array pins the checked classes.
 */
export function setLabVisibility(
  db: DatabaseSync,
  labId: string,
  update: { hidden: boolean; openClassIds?: string[] | null },
): LabVisibility {
  const next: LabVisibility = {
    hidden: update.hidden,
    openClassIds:
      update.openClassIds === undefined
        ? labVisibility(db, labId).openClassIds
        : update.openClassIds === null
          ? null
          : [...new Set(update.openClassIds)],
  };
  db.prepare(
    `INSERT INTO lab_settings (lab_id, hidden, open_class_ids) VALUES (?, ?, ?)
     ON CONFLICT (lab_id) DO UPDATE SET
       hidden = excluded.hidden,
       open_class_ids = excluded.open_class_ids,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
  ).run(
    labId,
    next.hidden ? 1 : 0,
    next.openClassIds === null ? null : JSON.stringify(next.openClassIds),
  );
  return next;
}

/** Class ids the account belongs to (any member role). */
function memberClassIds(db: DatabaseSync, userId: string): Set<string> {
  const rows = db
    .prepare("SELECT class_id AS classId FROM class_members WHERE user_id = ?")
    .all(userId) as { classId: string }[];
  return new Set(rows.map((row) => row.classId));
}

/** Teacher switches keyed by lab id, then class id (true = open). */
function labClassSwitches(db: DatabaseSync): Map<string, Map<string, boolean>> {
  const rows = db
    .prepare("SELECT lab_id AS labId, class_id AS classId, open FROM lab_class_settings")
    .all() as { labId: string; classId: string; open: number }[];
  const map = new Map<string, Map<string, boolean>>();
  for (const row of rows) {
    const inner = map.get(row.labId) ?? new Map<string, boolean>();
    inner.set(row.classId, row.open === 1);
    map.set(row.labId, inner);
  }
  return map;
}

/** A teacher's stored switch for one class, when they set one. */
export function labClassSwitch(
  db: DatabaseSync,
  labId: string,
  classId: string,
): boolean | undefined {
  const row = db
    .prepare("SELECT open FROM lab_class_settings WHERE lab_id = ? AND class_id = ?")
    .get(labId, classId) as { open: number } | undefined;
  return row === undefined ? undefined : row.open === 1;
}

/** Persist a teacher's per-class switch for one of their classes. */
export function setLabClassOpen(
  db: DatabaseSync,
  labId: string,
  classId: string,
  open: boolean,
): void {
  db.prepare(
    `INSERT INTO lab_class_settings (lab_id, class_id, open) VALUES (?, ?, ?)
     ON CONFLICT (lab_id, class_id) DO UPDATE SET
       open = excluded.open,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
  ).run(labId, classId, open ? 1 : 0);
}

/**
 * Whether the user may open the lab at all: admins always; a hidden lab
 * blocks everyone else; teachers can preview every open lab — the admin
 * class scope and their own per-class switches gate only students. A
 * student needs a class that is effectively open: its teacher switch when
 * set, otherwise the admin scope default.
 */
export function canAccessLab(
  db: DatabaseSync,
  labId: string,
  user: SessionUser,
  visibility?: LabVisibility,
): boolean {
  if (user.role === "admin") return true;
  const v = visibility ?? labVisibility(db, labId);
  if (v.hidden) return false;
  if (user.role === "teacher") return true;
  const mine = memberClassIds(db, user.id);
  const switches = labClassSwitches(db).get(labId);
  // A teacher's switch overrides the admin scope for their class — they
  // can open a class the scope missed or close one it admitted.
  const openFor = (classId: string) =>
    switches?.get(classId) ?? (v.openClassIds === null || v.openClassIds.includes(classId));
  for (const classId of mine) if (openFor(classId)) return true;
  return false;
}

/**
 * Whether the lab is open to one specific class — used by the teacher
 * dashboard, which reports a class's progress and is only meaningful when
 * that class itself may take the lab.
 */
export function isLabOpenToClass(
  db: DatabaseSync,
  labId: string,
  classId: string,
  visibility?: LabVisibility,
): boolean {
  const v = visibility ?? labVisibility(db, labId);
  if (v.hidden) return false;
  return (
    labClassSwitch(db, labId, classId) ??
    (v.openClassIds === null || v.openClassIds.includes(classId))
  );
}

/**
 * Registry rows joined with the stored visibility. `visible` is the access
 * verdict for this user (admins see everything, including hidden labs, so
 * they can preview and reopen them). `visibleClassIds` lists the caller's
 * own classes whose students may take the lab — entry redirects and the
 * dashboard picker use it to land on a class that is actually open.
 */
export function labCatalog(
  db: DatabaseSync,
  user: SessionUser,
): (LabInfo & LabVisibility & { visible: boolean; visibleClassIds: string[] })[] {
  const rows = visibilityRows(db);
  const switches = labClassSwitches(db);
  const mine = memberClassIds(db, user.id);
  return LAB_REGISTRY.map((lab) => {
    const v = rows.get(lab.id) ?? defaultVisibility(lab.id);
    let visible: boolean;
    let visibleClassIds: string[];
    if (user.role === "admin") {
      visible = true;
      visibleClassIds = [...mine];
    } else if (v.hidden) {
      visible = false;
      visibleClassIds = [];
    } else {
      const labSwitches = switches.get(lab.id);
      visibleClassIds = [...mine].filter(
        (id) => labSwitches?.get(id) ?? (v.openClassIds === null || v.openClassIds.includes(id)),
      );
      // Teachers see every open lab; the admin scope and their own
      // switches gate only students. Students must belong to at least one
      // class whose gate is open; a global scope means all classes, not users
      // without a class membership.
      visible = user.role === "teacher" ? true : visibleClassIds.length > 0;
    }
    return { id: lab.id, stageCount: lab.stageCount, ...v, visible, visibleClassIds };
  });
}

/** One class cell of the teacher lab-management grid. */
export type LabClassGate = {
  classId: string;
  /** The admin scope admits this class (the default before any teacher switch). */
  adminAllowed: boolean;
  /** The teacher's own switch; falls back to the admin default when unset. */
  teacherOpen: boolean;
  /** What this class's students experience. */
  open: boolean;
};

/**
 * Labs joined with the caller's own-class gate cells — the teacher
 * management view. Hidden labs are admin-domain and never listed; each
 * gate resolves to `open` for the class's students under the admin scope
 * plus the teacher's own switch.
 */
export function teacherLabView(
  db: DatabaseSync,
  classIds: string[],
): (LabInfo & LabVisibility & { classes: LabClassGate[] })[] {
  const rows = visibilityRows(db);
  const switches = labClassSwitches(db);
  return LAB_REGISTRY.map((lab) => {
    const v = rows.get(lab.id) ?? defaultVisibility(lab.id);
    const classes = classIds.map((classId) => {
      const adminAllowed = v.openClassIds === null || v.openClassIds.includes(classId);
      const teacherOpen = switches.get(lab.id)?.get(classId) ?? adminAllowed;
      return { classId, adminAllowed, teacherOpen, open: teacherOpen };
    });
    return { id: lab.id, stageCount: lab.stageCount, ...v, classes };
  }).filter((row) => !row.hidden);
}
