import { fireEvent, screen, waitFor } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthState } from "../../shared/auth";
import { anonymousAuthState, renderAppAt, teacherAuthState } from "../../test/router-test-helpers";

const membersPayload = {
  classId: "c1",
  className: "测试班级",
  students: [{ userId: "u-s1", studentNo: "20260101", name: "张三" }],
  teachers: [{ userId: "u-t1", studentNo: "teacher", name: "教师" }],
};

const studentAuthState: AuthState = {
  status: "authenticated",
  session: {
    user: { id: "u-s1", studentNo: "20260101", name: "张三", role: "user" },
    memberships: [{ classId: "c1", className: "测试班级", role: "student" }],
  },
};

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function mockMembersApi() {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url.includes("/api/classes/c1/members")) {
      if (method === "GET") return jsonResponse(membersPayload);
      if (method === "POST") return jsonResponse({ member: membersPayload.students[0] }, 201);
      return jsonResponse({ ok: true });
    }
    return jsonResponse({});
  });
}

describe("ClassMembersPage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("lists the roster and enrolls an existing account by student number", async () => {
    const fetchMock = mockMembersApi();
    const user = userEvent.setup();

    await renderAppAt("/classes/c1/members", { auth: teacherAuthState });

    expect(await screen.findByRole("heading", { name: "班级成员" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("张三")).toBeInTheDocument());
    expect(screen.getByText(/任课教师：教师/)).toBeInTheDocument();

    await user.type(screen.getByLabelText("学生学号"), "20260102");
    await user.click(screen.getByRole("button", { name: "加入班级" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/classes/c1/members",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ studentNo: "20260102" }),
        }),
      ),
    );
  });

  it("creates a new student account seated in the class", async () => {
    const fetchMock = mockMembersApi();
    const user = userEvent.setup();

    await renderAppAt("/classes/c1/members", { auth: teacherAuthState });
    await waitFor(() => expect(screen.getByText("张三")).toBeInTheDocument());

    await user.type(screen.getByLabelText("学号"), "20260103");
    await user.type(screen.getByLabelText("姓名"), "李四");
    await user.type(screen.getByLabelText("初始密码"), "pw1234");
    await user.click(screen.getByRole("button", { name: "创建并入班" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/classes/c1/members/students",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ studentNo: "20260103", name: "李四", password: "pw1234" }),
        }),
      ),
    );
  });

  it("removes a student after confirmation", async () => {
    const fetchMock = mockMembersApi();
    const user = userEvent.setup();

    await renderAppAt("/classes/c1/members", { auth: teacherAuthState });
    await waitFor(() => expect(screen.getByText("张三")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "移出班级" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("确定把学生「张三（20260101）」移出班级");
    await user.click(screen.getByRole("button", { name: "确认移出" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/classes/c1/members/u-s1",
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
  });

  it("keeps Chinese composition in the name field and submits the committed name once", async () => {
    const fetchMock = mockMembersApi();
    const user = userEvent.setup();

    await renderAppAt("/classes/c1/members", { auth: teacherAuthState });
    await user.click(await screen.findByRole("button", { name: "改名" }));
    const name = screen.getByLabelText("张三 的新姓名");
    await user.clear(name);
    await user.type(name, "李四");

    fireEvent.keyDown(name, { key: "Enter", isComposing: true });
    fireEvent.keyDown(name, { key: "Escape", keyCode: 229 });
    expect(name).toHaveFocus();
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH")).toHaveLength(0);

    await user.keyboard("{Enter}");
    const patches = fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH");
    expect(patches).toEqual([
      [
        "/api/classes/c1/members/u-s1",
        expect.objectContaining({ body: JSON.stringify({ name: "李四" }) }),
      ],
    ]);
  });

  it("drops the previous roster and dialogs while the new class loads", async () => {
    const twoClassTeacher: AuthState = {
      status: "authenticated",
      session: {
        user: { id: "u-teacher", studentNo: "teacher", name: "教师", role: "teacher" },
        memberships: [
          { classId: "c1", className: "测试班级", role: "teacher" },
          { classId: "c2", className: "第二班", role: "teacher" },
        ],
      },
    };
    let releaseC2: ((response: Response) => void) | null = null;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.includes("/api/classes/c1/members")) {
        if (method === "GET") return jsonResponse(membersPayload);
        return jsonResponse({ ok: true });
      }
      if (url.includes("/api/classes/c2/members") && method === "GET") {
        return new Promise<Response>((resolve) => {
          releaseC2 = resolve;
        });
      }
      return jsonResponse({});
    });
    const user = userEvent.setup();

    await renderAppAt("/classes/c1/members", { auth: twoClassTeacher });
    await waitFor(() => expect(screen.getByText("张三")).toBeInTheDocument());

    await user.selectOptions(screen.getByLabelText("选择班级"), "c2");

    await waitFor(() => expect(releaseC2).not.toBeNull());
    expect(screen.queryByText("张三")).not.toBeInTheDocument();
    expect(screen.getByText("正在加载名单…")).toBeInTheDocument();

    const resolveC2 = releaseC2 as unknown as (response: Response) => void;
    resolveC2(jsonResponse({ classId: "c2", className: "第二班", students: [], teachers: [] }));
    await waitFor(() => expect(screen.getByText("还没有学生加入这个班级。")).toBeInTheDocument());
  });

  it("denies students", async () => {
    mockMembersApi();
    await renderAppAt("/classes/c1/members", { auth: studentAuthState });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "只有任课教师或管理员可以管理班级成员",
    );
  });

  it("redirects anonymous visitors to login", async () => {
    mockMembersApi();
    const { router } = await renderAppAt("/classes/c1/members", { auth: anonymousAuthState });
    await waitFor(() => expect(router.location.pathname).toBe("/login"));
  });
});
