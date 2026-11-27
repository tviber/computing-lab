import type { JSX } from "@solidjs/web";

export function StageTask(props: { children?: JSX.Element; title?: string }) {
  return (
    <div class="lab-stage-task">
      <h2>{props.title ?? "本关任务"}</h2>
      <p>{props.children}</p>
    </div>
  );
}
