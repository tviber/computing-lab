import { screen, waitFor } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { adminAuthState, renderAppAt } from "../../test/router-test-helpers";

const classes = [{ id: "c1", name: "测试班级", inviteCode: "CLASS1", memberCount: 0 }];

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("AdminClassesPage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("manages classes on its own route without tabs", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (init?.method === "DELETE") return jsonResponse({ ok: true });
      if (String(input).includes("/api/admin/classes")) return jsonResponse({ classes });
      return jsonResponse({});
    });
    const user = userEvent.setup();

    await renderAppAt("/admin/classes", { auth: adminAuthState });

    expect(await screen.findByRole("heading", { name: "班级管理" })).toBeInTheDocument();
    expect(await screen.findByText("CLASS1")).toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "删除" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("确定删除班级「测试班级」");
    await user.click(screen.getByRole("button", { name: "确认删除" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/admin/classes/c1",
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
  });
});
