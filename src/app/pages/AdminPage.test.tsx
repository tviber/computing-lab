import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { adminAuthState, renderAppAt } from "../../test/router-test-helpers";

const classes = [{ id: "c1", name: "测试班级", inviteCode: "CLASS1", memberCount: 0 }];
const labs = [
  {
    id: "calculator",
    stageCount: 7,
    hidden: false,
    openClassIds: null,
    visible: true,
    visibleClassIds: [],
  },
  {
    id: "image-sampling",
    stageCount: 3,
    hidden: false,
    openClassIds: null,
    visible: true,
    visibleClassIds: [],
  },
];
const users = [
  {
    id: "u1",
    studentNo: "20260101",
    name: "张三",
    role: "user",
    createdAt: "2026-09-20T00:00:00.000Z",
    classes: [],
  },
];

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function mockAdminApi() {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const path = String(input);
    const method = init?.method ?? "GET";
    if (method === "DELETE") return jsonResponse({ ok: true });
    if (path.includes("/api/admin/labs")) return jsonResponse({ lab: {} });
    if (path.includes("/api/admin/classes")) return jsonResponse({ classes });
    if (path.includes("/api/admin/users")) {
      const url = new URL(path, "http://admin.test");
      return jsonResponse({
        users,
        total: users.length,
        page: Number(url.searchParams.get("page") ?? "1"),
        pageSize: 50,
      });
    }
    if (path.includes("/api/labs")) return jsonResponse({ labs });
    return jsonResponse({});
  });
}

describe("AdminPage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("shows account management without management tabs", async () => {
    mockAdminApi();
    await renderAppAt("/admin", { auth: adminAuthState });

    expect(screen.getByRole("heading", { name: "账号管理" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /全部账号/ })).toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });

  it("keeps account controls aligned and confirms deletion", async () => {
    const fetchMock = mockAdminApi();
    const user = userEvent.setup();

    await renderAppAt("/admin", { auth: adminAuthState });

    const roleSelect = screen.getByLabelText("张三 的角色");
    const classSelect = screen.getByLabelText("把 张三 加入班级");
    expect(roleSelect).toHaveClass("admin-table-select");
    expect(classSelect).toHaveClass("admin-table-select");
    expect(roleSelect).toHaveClass("field-select-native");
    expect(classSelect).toHaveClass("field-select-native");

    await user.click(screen.getByRole("button", { name: "删除" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("确定删除账号「张三」");
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/admin/users/u1",
      expect.objectContaining({ method: "DELETE" }),
    );

    await user.click(screen.getByRole("button", { name: "取消" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "删除" }));
    await user.click(screen.getByRole("button", { name: "确认删除" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/admin/users/u1",
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
  });

  it("searches accounts and jumps to a page", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const path = String(input);
      const method = init?.method ?? "GET";
      if (method === "DELETE") return jsonResponse({ ok: true });
      if (path.includes("/api/admin/labs")) return jsonResponse({ lab: {} });
      if (path.includes("/api/admin/classes")) return jsonResponse({ classes });
      if (path.includes("/api/admin/users")) {
        const url = new URL(path, "http://admin.test");
        return jsonResponse({
          users,
          total: 101,
          page: Number(url.searchParams.get("page") ?? "1"),
          pageSize: 50,
        });
      }
      if (path.includes("/api/labs")) return jsonResponse({ labs });
      return jsonResponse({});
    });
    const user = userEvent.setup();

    await renderAppAt("/admin", { auth: adminAuthState });

    await user.type(screen.getByRole("searchbox", { name: "搜索学号或姓名" }), "张三");
    await user.click(screen.getByRole("button", { name: "搜索" }));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([input]) => String(input).includes("search=%E5%BC%A0%E4%B8%89")),
      ).toBe(true),
    );

    await user.clear(screen.getByRole("spinbutton", { name: "跳转页码" }));
    await user.type(screen.getByRole("spinbutton", { name: "跳转页码" }), "2");
    await user.click(screen.getByRole("button", { name: "跳转" }));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([input]) =>
            String(input).includes("page=2") && String(input).includes("search=%E5%BC%A0%E4%B8%89"),
        ),
      ).toBe(true),
    );
    expect(screen.getByText(/第 2 \/ 3 页/)).toBeInTheDocument();
  });
});
