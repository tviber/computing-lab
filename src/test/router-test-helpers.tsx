import { StrictMode } from "react";
import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import { render, waitFor } from "@testing-library/react";
import { expect } from "vitest";
import { AuthProvider, type AuthState } from "../shared/auth";
import { createAppRouter } from "../app/router";

/** Default harness identity for authenticated page tests. */
export const teacherAuthState: AuthState = {
  status: "authenticated",
  session: {
    user: { id: "u-teacher", studentNo: "teacher", name: "教师", role: "teacher" },
    memberships: [{ classId: "c1", className: "测试班级", role: "teacher" }],
  },
};

export const adminAuthState: AuthState = {
  status: "authenticated",
  session: {
    user: { id: "u-admin", studentNo: "admin", name: "管理员", role: "admin" },
    memberships: [{ classId: "c1", className: "测试班级", role: "teacher" }],
  },
};

export const anonymousAuthState: AuthState = { status: "anonymous", session: null };

export const studentAuthState: AuthState = {
  status: "authenticated",
  session: {
    user: { id: "u-student", studentNo: "20240101", name: "学生", role: "user" },
    memberships: [{ classId: "c1", className: "测试班级", role: "student" }],
  },
};

export type RenderAppOptions = { auth?: AuthState; strict?: boolean };

export async function renderAppAt(initialEntry: string, options: RenderAppOptions = {}) {
  const auth = options.auth ?? adminAuthState;

  const history = createMemoryHistory({ initialEntries: [initialEntry] });
  const router = createAppRouter({ history });
  const tree = (
    <AuthProvider initialState={auth}>
      <RouterProvider router={router} />
    </AuthProvider>
  );
  const rendered = render(options.strict ? <StrictMode>{tree}</StrictMode> : tree);

  await router.load();
  await waitFor(() => expect(router.state.status).toBe("idle"));

  return { ...rendered, history, router };
}
