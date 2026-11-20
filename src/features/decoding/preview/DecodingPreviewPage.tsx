import { LabPreviewPage } from "../../../devtools/lab-preview/LabPreviewPage";
import { SaveIndicator } from "../../../shared/lab/LabGate";
import { labStageTitle } from "../../../shared/lab/labMetadata";
import { DecodingWorkspace } from "../ui/DecodingWorkspace.tsx";
import { createDecodingPreviewActions, decodingPreviewFixtures } from "./fixtures.ts";

export function DecodingPreviewPage() {
  return (
    <LabPreviewPage
      createActions={createDecodingPreviewActions}
      frameClassName="decoding-lab"
      frameTitle="解码侦探实验预览"
      frameTopbar={(scene) => <SaveIndicator status={scene.model.feedback.saveStatus} />}
      frameTopbarProps={(scene) => ({
        subtitle: scene.model.stage?.englishTitle,
        title: labStageTitle("decoding", scene.model.stage?.title),
      })}
      renderWorkspace={(scene, actions) => (
        <DecodingWorkspace model={scene.model} actions={actions} />
      )}
      scenes={decodingPreviewFixtures}
      subtitle="固定公开数据 · 无需登录或后端"
      title="解码侦探视觉开发预览"
    />
  );
}
