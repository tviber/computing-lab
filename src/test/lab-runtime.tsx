import type { JSX } from "@solidjs/web";
import { LabRuntimeProvider } from "../shared/lab/runtime";
import { classroomTransport } from "../app/classroom/transport";

export function TestLabRuntime(props: { children?: JSX.Element }) {
  return (
    <LabRuntimeProvider
      value={{
        scopeId: "test",
        learnerId: "test",
        ready: true,
        freeNavigation: false,
        transport: classroomTransport,
      }}
    >
      {props.children}
    </LabRuntimeProvider>
  );
}
