import type { ReactNode } from "react";

export function StageTask({
  children,
  title = "本关任务",
}: {
  children: ReactNode;
  title?: string;
}) {
  return (
    <div className="lab-stage-task">
      <h2>{title}</h2>
      <p>{children}</p>
    </div>
  );
}
