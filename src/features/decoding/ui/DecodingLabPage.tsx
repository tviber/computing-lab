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

import { useSearchParams } from "@solidjs/router";
import { useLabRuntime } from "../../../shared/lab/runtime";
import { SaveIndicator } from "../../../shared/lab/SaveIndicator";
import { labStageTitle } from "../../../shared/lab/labMetadata";
import { AppPageLayout } from "../../../shared/layout/AppTopbar";
import { useDecodingLabController } from "../controller/useDecodingLabController.ts";
import { DecodingWorkspace } from "./DecodingWorkspace.tsx";
import "./decoding.css";

export function DecodingLabPage() {
  const [searchParams] = useSearchParams();
  const runtime = useLabRuntime();
  const controller = useDecodingLabController(() => ({
    scopeId: runtime.scopeId ?? "",
    ready: runtime.ready,
    userId: runtime.learnerId,
    stageLink: searchParams.stage,
    staff: runtime.freeNavigation,
  }));

  return (
    <AppPageLayout
      class="decoding-lab"
      topbar={
        <SaveIndicator
          onDiscardLocal={
            controller.model.feedback.conflictLocalAvailable
              ? controller.actions.discardConflictLocal
              : undefined
          }
          onRestoreLocal={
            controller.model.feedback.conflictLocalAvailable
              ? controller.actions.restoreConflictLocal
              : undefined
          }
          onRetrySync={controller.actions.retrySyncConflict}
          status={controller.model.feedback.saveStatus}
          unresolvedSyncConflict={controller.model.feedback.unresolvedSyncConflict}
        />
      }
      topbarProps={{
        subtitle: controller.model.stage?.englishTitle,
        title: labStageTitle("decoding", controller.model.stage?.title),
      }}
    >
      <DecodingWorkspace
        actions={controller.actions}
        model={controller.model}
        resetControls={controller.resetControls}
      />
    </AppPageLayout>
  );
}
