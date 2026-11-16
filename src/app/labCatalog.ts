import { APP_LABS } from "./labRegistry";
import { LAB_IDS, labMetadata, type LabId, type LabMetadataEntry } from "../shared/lab/labMetadata";
import type { LabVisibility, TeacherLabView } from "../shared/lab/labs";

export type AdminLabCatalogEntry = LabVisibility & { serverRegistered: boolean };
export type TeacherLabCatalogEntry = TeacherLabView & { serverRegistered: boolean };

function stageCountOf(id: LabId): number {
  return APP_LABS[id].dashboardStages.length;
}

/** Keep management surfaces aligned to the frontend registry during deployments. */
export function mergeAdminLabCatalog(rows: LabVisibility[]): {
  labs: AdminLabCatalogEntry[];
  missingIds: LabId[];
} {
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const missingIds: LabId[] = [];
  const labs = LAB_IDS.map((id): AdminLabCatalogEntry => {
    const row = rowsById.get(id);
    if (row) return { ...row, serverRegistered: true };

    missingIds.push(id);
    return {
      id,
      stageCount: stageCountOf(id),
      hidden: (labMetadata[id] as LabMetadataEntry).defaultHidden ?? false,
      openClassIds: null,
      visible: false,
      visibleClassIds: [],
      serverRegistered: false,
    };
  });
  return { labs, missingIds };
}

/** Drop retired ids and keep newly registered labs visible to teachers. */
export function mergeTeacherLabCatalog(
  rows: TeacherLabView[],
  classes: { id: string; name: string }[],
  visibilityRows: LabVisibility[] | null,
): { labs: TeacherLabCatalogEntry[]; missingIds: LabId[] } {
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const visibilityById = new Map((visibilityRows ?? []).map((row) => [row.id, row]));
  const missingIds: LabId[] = [];
  const labs = LAB_IDS.flatMap((id): TeacherLabCatalogEntry[] => {
    const row = rowsById.get(id);
    if (row) return [{ ...row, serverRegistered: true }];

    // Teacher rows intentionally omit labs hidden by an administrator.
    if (visibilityById.get(id)?.hidden || visibilityRows === null) return [];

    missingIds.push(id);
    return [
      {
        id,
        stageCount: stageCountOf(id),
        hidden: (labMetadata[id] as LabMetadataEntry).defaultHidden ?? false,
        openClassIds: null,
        visibleClassIds: [],
        classes: classes.map(({ id: classId }) => ({
          classId,
          adminAllowed: true,
          teacherOpen: true,
          open: true,
        })),
        serverRegistered: false,
      },
    ];
  });
  return { labs, missingIds };
}
