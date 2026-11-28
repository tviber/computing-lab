import { dynamic } from "@solidjs/web";
import { Dialog, DialogBackdrop, DialogClose, DialogContent } from "@ui-sdk/solid/dialog";
import { For, Match, Show, Switch } from "solid-js";
import { formatDateTime, formatFullDateTime } from "../../../shared/ui/formatDateTime";
import { Icon } from "../../../shared/ui/Icon";
import { drawerChecks } from "./model";
import type { LabOption, SubmissionDetail } from "./types";

export function SubmissionDetailDrawer(props: {
  open: boolean;
  lab: LabOption;
  detail: SubmissionDetail | null;
  detailError: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog onOpenChange={props.onOpenChange} open={props.open}>
      <DialogBackdrop class="drawer-backdrop" />
      <DialogContent aria-label="提交详情" class="drawer submission-dialog">
        <div class="submission-dialog-content">
          <DialogClose aria-label="关闭详情" class="drawer-close" type="button">
            <Icon name="x" size={16} />
          </DialogClose>
          <Switch
            fallback={
              <p class="drawer-note" role="status">
                正在载入提交详情…
              </p>
            }
          >
            <Match when={props.detail}>
              {(detail) => (
                <>
                  <header>
                    <p class="eyebrow">
                      {detail().studentNo} {detail().name}
                    </p>
                    <h2>
                      第 {detail().stageIndex} 关 · {detail().score} / {detail().total}
                    </h2>
                    <p>
                      {
                        props.lab.stages.find((stage) => stage.index === detail().stageIndex)
                          ?.englishTitle
                      }
                    </p>
                  </header>
                  <Show
                    when={
                      detail().testSummary.detail &&
                      !detail().testSummary.parts?.length &&
                      !detail().testSummary.categories
                    }
                  >
                    <p>{detail().testSummary.detail}</p>
                  </Show>
                  <Show when={detail().testSummary.error}>
                    {(message) => <p class="test-error">{message()}</p>}
                  </Show>
                  <ul class="drawer-categories">
                    <For each={drawerChecks(detail().testSummary)}>
                      {(check) => {
                        const ok = check.passed === check.total;
                        const CheckContent = dynamic(() => props.lab.submissionCheck);
                        return (
                          <li class={ok ? "is-pass" : "is-fail"}>
                            <span>
                              <Show
                                when={props.lab.submissionCheck}
                                fallback={
                                  <>
                                    {check.label}
                                    <Show when={check.detail}>
                                      {(detailText) => <small>{detailText()}</small>}
                                    </Show>
                                  </>
                                }
                              >
                                <CheckContent check={check} summary={detail().testSummary.detail} />
                              </Show>
                            </span>
                            <span class="drawer-category-score">
                              {check.passed}/{check.total}{" "}
                              <Icon name={ok ? "check" : "x"} size={13} />
                            </span>
                          </li>
                        );
                      }}
                    </For>
                  </ul>
                  <p class="drawer-note" title={formatFullDateTime(detail().submittedAt)}>
                    提交时间 {formatDateTime(detail().submittedAt)}
                  </p>
                </>
              )}
            </Match>
            <Match when={props.detailError}>
              {(message) => (
                <p class="test-error" role="alert">
                  {message()}
                </p>
              )}
            </Match>
          </Switch>
        </div>
      </DialogContent>
    </Dialog>
  );
}
