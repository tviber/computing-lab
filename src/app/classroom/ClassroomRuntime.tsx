import { useParams } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { isStaffRole, useAuth } from "../../shared/auth";
import { LabRuntimeProvider, type LabRuntime } from "../../shared/lab/runtime";
import { classroomTransport } from "./transport";

export function ClassroomRuntime(props: { children?: JSX.Element }) {
  const auth = useAuth();
  const params = useParams<{ classId?: string }>();
  const runtime: LabRuntime = {
    get scopeId() {
      return params.classId;
    },
    get learnerId() {
      return auth.session?.user.id ?? "";
    },
    get ready() {
      return auth.status === "authenticated";
    },
    get freeNavigation() {
      return isStaffRole(auth.role);
    },
    transport: classroomTransport,
  };
  return <LabRuntimeProvider value={runtime}>{props.children}</LabRuntimeProvider>;
}
