import { Button } from "@ui-sdk/solid/button";
import { Meter, MeterIndicator, MeterTrack, MeterValue } from "@ui-sdk/solid/meter";
import { createMemo, For, Match, Show, Switch } from "solid-js";
import { formatDateTime, formatFullDateTime } from "../../../shared/ui/formatDateTime";
import { Icon } from "../../../shared/ui/Icon";
import { useScrollEdges } from "../../../shared/ui/scrollEdges";
import { stageCompletion } from "./model";
import type { LabOption, MatrixCell, MatrixPayload, MatrixRow } from "./types";

function CellView(props: {
  cell: MatrixCell | undefined;
  onOpen?: (event: MouseEvent) => void;
  openTitle?: string;
  opensDialog?: boolean;
}) {
  return (
    <Switch fallback={<span class="cell-empty">—</span>}>
      <Match when={props.cell?.passed}>
        <Show
          fallback={
            <span class="cell-pass">
              <Icon name="check" size={14} />
            </span>
          }
          when={props.onOpen}
        >
          {(open) => (
            <Button
              class="cell-pass"
              onClick={(event) => open()(event)}
              title={props.openTitle ?? "查看提交详情"}
              type="button"
            >
              <Icon name="check" size={14} />
            </Button>
          )}
        </Show>
      </Match>
      <Match when={props.cell}>
        {(cell) => (
          <Show
            fallback={
              <span class="cell-score">
                {cell().score}/{cell().total}
              </span>
            }
            when={props.onOpen}
          >
            {(open) => (
              <Button
                aria-haspopup={props.opensDialog ? "dialog" : undefined}
                class="cell-score"
                onClick={(event) => open()(event)}
                type="button"
              >
                {cell().score}/{cell().total}
              </Button>
            )}
          </Show>
        )}
      </Match>
    </Switch>
  );
}

export function ProgressMatrix(props: {
  payload: MatrixPayload | null;
  lab: LabOption;
  isAdmin: boolean;
  onOpenDetail: (submissionId: string) => void;
  onOpenPreview: (row: MatrixRow, cell?: MatrixCell) => void;
  onClearRecords: (row: MatrixRow) => void;
}) {
  const matrixScrollRef = useScrollEdges<HTMLDivElement>();
  const completion = createMemo(() => stageCompletion(props.payload?.rows ?? [], props.lab.stages));
  const canPreview = () => props.isAdmin && props.lab.supportsCanvasPreview;

  return (
    <div aria-label="学生进度横向滚动区" class="matrix-scroll" ref={matrixScrollRef} tabindex={0}>
      <table class="matrix-table">
        <caption class="sr-only">
          按关卡显示每位学生的最新提交结果，并标注每关完成人数与班级人数
        </caption>
        <thead>
          <tr>
            <th scope="col">学号</th>
            <th scope="col">姓名</th>
            <For each={props.lab.stages}>
              {(stage) => {
                const completed = () => completion().counts.get(stage.index) ?? 0;
                const total = () => completion().total;
                return (
                  <th aria-label={stage.title} scope="col" title={stage.englishTitle}>
                    <span aria-hidden="true" class="matrix-stage-index">
                      {String(stage.index).padStart(2, "0")}
                    </span>
                    <span class="matrix-stage-title">{stage.title}</span>
                    <Show
                      fallback={<span class="matrix-stage-completion is-empty">完成 —</span>}
                      when={total() > 0}
                    >
                      <Meter
                        aria-label={`${stage.title}完成人数`}
                        class={(state) =>
                          state.percent === 100
                            ? "matrix-stage-meter is-complete"
                            : "matrix-stage-meter"
                        }
                        format={(value) => `${value}/${total()}`}
                        getValueLabel={(value, details) => `${value} / ${details.max} 人已完成`}
                        max={total()}
                        title={`${completed()} 人已完成，${total() - completed()} 人未完成`}
                        value={completed()}
                      >
                        <span aria-hidden="true" class="matrix-stage-meter-label">
                          完成
                        </span>
                        <MeterValue class="matrix-stage-meter-value" />
                        <MeterTrack class="matrix-stage-meter-track">
                          <MeterIndicator class="matrix-stage-meter-fill" />
                        </MeterTrack>
                      </Meter>
                    </Show>
                  </th>
                );
              }}
            </For>
            <th scope="col">最后活动</th>
            <Show when={props.isAdmin}>
              <th scope="col">操作</th>
            </Show>
          </tr>
        </thead>
        <tbody>
          <For each={props.payload?.rows ?? []}>
            {(row) => (
              <tr>
                <th scope="row">{row.studentNo}</th>
                <td>{row.name}</td>
                <For each={props.lab.stages}>
                  {(stage) => {
                    const cell = () => row.cells[String(stage.index)];
                    return (
                      <td>
                        <CellView
                          cell={cell()}
                          onOpen={(() => {
                            const current = cell();
                            if (!current) return undefined;
                            if (canPreview()) return () => props.onOpenPreview(row, current);
                            if (current.passed) return undefined;
                            return () => props.onOpenDetail(current.submissionId);
                          })()}
                          opensDialog={!canPreview()}
                          openTitle={canPreview() ? "预览学生画布" : undefined}
                        />
                      </td>
                    );
                  }}
                </For>
                <td title={formatFullDateTime(row.lastActiveAt)}>
                  {formatDateTime(row.lastActiveAt)}
                </td>
                <Show when={props.isAdmin}>
                  <td>
                    <div class="matrix-row-actions">
                      <Show when={props.lab.supportsCanvasPreview}>
                        <Button
                          class="matrix-action"
                          onClick={() => props.onOpenPreview(row)}
                          title="模拟该学生看到的画布（仅前端预览，刷新还原）"
                          type="button"
                        >
                          预览画布
                        </Button>
                      </Show>
                      <Button
                        class="matrix-action is-destructive"
                        onClick={() => props.onClearRecords(row)}
                        title="删除该学生的全部提交和关卡进度"
                        type="button"
                      >
                        清空记录
                      </Button>
                    </div>
                  </td>
                </Show>
              </tr>
            )}
          </For>
          <Show when={props.payload && props.payload.rows.length === 0}>
            <tr>
              <td colspan={props.lab.stages.length + (props.isAdmin ? 4 : 3)}>
                还没有学生加入这个班级。
              </td>
            </tr>
          </Show>
        </tbody>
      </table>
    </div>
  );
}
