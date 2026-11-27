import { Button } from "@ui-sdk/solid/button";
import { AppPageLayout } from "../../shared/layout/AppTopbar";
import "./home.css";

export type LabErrorPageProps = {
  error: unknown;
  reset: () => void;
};

export function LabErrorPage(props: LabErrorPageProps) {
  return (
    <AppPageLayout>
      <main class="not-found" role="alert">
        <p class="eyebrow">实验 / 可以重试的错误</p>
        <h1>实验暂时无法显示</h1>
        <p>{props.error instanceof Error ? props.error.message : "实验遇到未知错误。"}</p>
        <div class="error-actions">
          <Button class="button button-secondary" onClick={() => props.reset()} type="button">
            重试实验
          </Button>
        </div>
      </main>
    </AppPageLayout>
  );
}
