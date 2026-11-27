import userEvent from "@testing-library/user-event";
import { screen, waitFor } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderAppAt, teacherAuthState } from "../../test/router-test-helpers";

afterEach(() => vi.restoreAllMocks());

describe("ProfilePage", () => {
  it("shows account details and submits a password change", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const user = userEvent.setup();
    await renderAppAt("/profile", { auth: teacherAuthState });

    expect(await screen.findByRole("heading", { name: "个人资料" })).toBeInTheDocument();
    expect(screen.getAllByText("教师")).toHaveLength(3);
    await user.type(screen.getByLabelText("当前密码"), "old-pass");
    await user.type(screen.getByLabelText("新密码"), "new-pass");
    await user.type(screen.getByLabelText("确认新密码"), "new-pass");
    await user.click(screen.getByRole("button", { name: "更新密码" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("密码已更新"));
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/auth/change-password",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ currentPassword: "old-pass", newPassword: "new-pass" }),
      }),
    );
  });

  it("enters from the account dropdown on the classroom home", async () => {
    const user = userEvent.setup();
    const { router } = await renderAppAt("/", { auth: teacherAuthState });
    await user.click(screen.getByRole("button", { name: /教师/ }));
    expect(screen.getByRole("menu", { name: "账户菜单" })).toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: "个人资料" }));
    await waitFor(() => expect(router.location.pathname).toBe("/profile"));
    expect(await screen.findByRole("heading", { name: "个人资料" })).toBeInTheDocument();
  });
});
