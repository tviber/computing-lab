import { createContext, useContext } from "solid-js";
import type { JSX } from "@solidjs/web";
import type { LabTransport } from "./contracts";

export type LabRuntime = {
  readonly scopeId: string | undefined;
  readonly learnerId: string;
  readonly ready: boolean;
  readonly freeNavigation: boolean;
  transport: LabTransport;
};

const RuntimeContext = createContext<LabRuntime>();

export function LabRuntimeProvider(props: { value: LabRuntime; children?: JSX.Element }) {
  return <RuntimeContext value={props.value}>{props.children}</RuntimeContext>;
}

export function useLabRuntime(): LabRuntime {
  const runtime = useContext(RuntimeContext);
  if (!runtime) throw new Error("实验需要宿主提供运行时。");
  return runtime;
}
