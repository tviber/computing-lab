import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { adminAuthState, renderAppAt } from "../../test/router-test-helpers";

const labs = [
  {
    id: "calculator",
    stageCount: 11,
    hidden: false,
    openClassIds: null,
    visible: true,
    visibleClassIds: [],
  },
  {
    id: "decoding",
    stageCount: 5,
    hidden: true,
    openClassIds: null,
    visible: true,
    visibleClassIds: [],
  },
  {
    id: "ml-intro",
    stageCount: 6,
    hidden: false,
    openClassIds: null,
    visible: true,
    visibleClassIds: ["c1", "c2"],
  },
];
const classes = [
  { id: "c1", name: "一班", inviteCode: "C1", memberCount: 0 },
  { id: "c2", name: "二班", inviteCode: "C2", memberCount: 0 },
];

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function mockApi() {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const path = String(input);
    if (init?.method === "PUT") return jsonResponse({ lab: {} });
    if (path.includes("/api/admin/classes")) return jsonResponse({ classes });
    if (path.includes("/api/labs")) return jsonResponse({ labs });
    return jsonResponse({});
  });
}

function labRow(title: string) {
  const row = screen.getByText(title).closest("tr");
  if (!row) throw new Error(`row for ${title} not found`);
  return within(row);
}

describe("AdminLabsPage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("scopes an open lab to the checked classes and saves", async () => {
    const fetchMock = mockApi();
    const user = userEvent.setup();

    await renderAppAt("/admin/labs", { auth: adminAuthState });

    expect(screen.getByRole("heading", { name: "实验管理" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("实现ALU")).toBeInTheDocument());
    const calc = labRow("实现ALU");
    // openClassIds null → every class box checked, nothing to save yet.
    await waitFor(() => expect(calc.getByRole("radio", { name: "开放" })).toBeChecked());
    expect(calc.getByRole("button", { name: "保存" })).toBeDisabled();
    expect(calc.getByRole("checkbox", { name: "二班" })).toBeChecked();
    expect(calc.getByText("全部班级")).toBeInTheDocument();

    // Uncheck one class → the row becomes dirty and stores the pinned subset.
    await user.click(calc.getByRole("checkbox", { name: "二班" }));
    expect(calc.getByText("1 个班")).toBeInTheDocument();
    await user.click(calc.getByRole("button", { name: "保存" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/admin/labs/calculator/visibility",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ hidden: false, openClassIds: ["c1"] }),
        }),
      ),
    );
  });

  it("supports 全选 / 取消全部 and hides a lab for admins only", async () => {
    const fetchMock = mockApi();
    const user = userEvent.setup();

    await renderAppAt("/admin/labs", { auth: adminAuthState });

    await waitFor(() => expect(screen.getByText("解码侦探")).toBeInTheDocument());
    const decoding = labRow("解码侦探");
    await waitFor(() => expect(decoding.getByRole("radio", { name: /隐藏/ })).toBeChecked());
    expect(decoding.queryByRole("checkbox")).not.toBeInTheDocument();

    // Switch to 开放, clear every class → stores an empty scope.
    await user.click(decoding.getByRole("radio", { name: "开放" }));
    await user.click(decoding.getByRole("button", { name: "取消全部" }));
    expect(decoding.getByRole("checkbox", { name: "一班" })).not.toBeChecked();
    expect(decoding.getByText("0 个班")).toBeInTheDocument();
    await user.click(decoding.getByRole("button", { name: "全选" }));
    expect(decoding.getByRole("checkbox", { name: "一班" })).toBeChecked();
    await user.click(decoding.getByRole("button", { name: "取消全部" }));

    await user.click(decoding.getByRole("button", { name: "保存" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/admin/labs/decoding/visibility",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ hidden: false, openClassIds: [] }),
        }),
      ),
    );

    // Picking 隐藏 sends the hidden flag with the scope left as "all".
    const calc = labRow("实现ALU");
    await user.click(calc.getByRole("radio", { name: /隐藏/ }));
    await user.click(calc.getByRole("button", { name: "保存" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/admin/labs/calculator/visibility",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ hidden: true, openClassIds: null }),
        }),
      ),
    );
  });

  it("lists ml-intro, hides it, and saves class-scoped visibility", async () => {
    const fetchMock = mockApi();
    const user = userEvent.setup();

    await renderAppAt("/admin/labs", { auth: adminAuthState });

    await waitFor(() => expect(screen.getByText("机器学习入门")).toBeInTheDocument());
    const mlRow = labRow("机器学习入门");
    expect(mlRow.getByText("ml-intro")).toBeInTheDocument();
    expect(mlRow.getByText("6")).toBeInTheDocument();
    await waitFor(() => expect(mlRow.getByRole("radio", { name: "开放" })).toBeChecked());

    await user.click(mlRow.getByRole("radio", { name: /隐藏/ }));
    await user.click(mlRow.getByRole("button", { name: "保存" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/admin/labs/ml-intro/visibility",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ hidden: true, openClassIds: null }),
        }),
      ),
    );

    await user.click(mlRow.getByRole("radio", { name: "开放" }));
    await user.click(mlRow.getByRole("checkbox", { name: "二班" }));
    await user.click(mlRow.getByRole("button", { name: "保存" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/admin/labs/ml-intro/visibility",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ hidden: false, openClassIds: ["c1"] }),
        }),
      ),
    );
  });

  it("keeps the lab list when the class list request fails", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const path = String(input);
      if (path.includes("/api/admin/classes")) {
        return new Response(JSON.stringify({ error: "internal-error" }), {
          status: 500,
          headers: { "content-type": "application/json" },
        });
      }
      if (path.includes("/api/labs")) return jsonResponse({ labs });
      return jsonResponse({});
    });

    await renderAppAt("/admin/labs", { auth: adminAuthState });

    expect(await screen.findByText("实现ALU")).toBeInTheDocument();
    expect(screen.queryByText("还没有实验。")).not.toBeInTheDocument();
    expect(screen.getByText("班级列表不可用，开放范围暂时无法编辑。")).toBeInTheDocument();
    expect(labRow("实现ALU").getByRole("button", { name: "保存" })).toBeDisabled();
  });
});
