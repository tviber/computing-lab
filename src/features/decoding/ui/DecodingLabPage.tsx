/**
 * 解码侦探 lab page: raw data on the left, the student's decoder in the
 * middle, the decoded artifact on the right — the lab's whole claim is that
 * "数据 + 约定 = 信息", so every stage ends with a visible artifact.
 *
 * The student only ever submits data (the decoded artifact + their code
 * snapshot for the teacher); the server re-derives the per-user payload and
 * checks the artifact against a reference decode. Student Python runs only
 * in the browser's Pyodide worker.
 */

import { useParams, useSearch } from "@tanstack/react-router";
import { useAuth } from "../../../shared/auth";
import { SaveIndicator } from "../../../shared/lab/LabGate";
import { labMetadata } from "../../../shared/lab/labMetadata";
import { AppPageLayout } from "../../../shared/layout/AppTopbar";
import { useDecodingLabController } from "../controller/useDecodingLabController.ts";
import { DecodingWorkspace } from "./DecodingWorkspace.tsx";
import "./decoding.css";

export function DecodingLabPage() {
  const { classId } = useParams({ from: "/classes/$classId/labs/decoding" });
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const { status, session } = useAuth();
  const controller = useDecodingLabController({
    classId,
    ready: status === "authenticated",
    userId: session?.user.id ?? "",
    stageLink: search.stage,
  });
  const { model } = controller;
  return (
    <AppPageLayout
      className="decoding-lab"
      topbar={
        <SaveIndicator
          status={model.feedback.saveStatus}
          unresolvedSyncConflict={model.feedback.unresolvedSyncConflict}
          onRetrySync={controller.actions.retrySyncConflict}
          onRestoreLocal={
            model.feedback.conflictLocalAvailable
              ? controller.actions.restoreConflictLocal
              : undefined
          }
          onDiscardLocal={
            model.feedback.conflictLocalAvailable
              ? controller.actions.discardConflictLocal
              : undefined
          }
        />
      }
      topbarProps={{
        subtitle: model.stage?.englishTitle,
        title: model.stage
          ? `${String(model.stage.index).padStart(2, "0")} ${model.stage.title}`
          : labMetadata.decoding.title,
      }}
    >
      <DecodingWorkspace {...controller} />
    </AppPageLayout>
  );
}
