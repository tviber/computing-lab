import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderAppAt, teacherAuthState } from "../../test/router-test-helpers";

const payload = {
  classes: [
    { id: "c1", name: "一班" },
    { id: "c2", name: "二班" },
  ],
  labs: [
    {
      id: "calculator",
      stageCount: 7,
      hidden: false,
      openClassIds: null,
      visibleClassIds: ["c1", "c2"],
      classes: [
        { classId: "c1", adminAllowed: true, teacherOpen: true, open: true },
        { classId: "c2", adminAllowed: true, teacherOpen: true, open: true },
      ],
    },
    {
      id: "decoding",
      stageCount: 5,
      hidden: false,
      openClassIds: ["c1"],
      visibleClassIds: ["c1"],
      classes: [
        { classId: "c1", adminAllowed: true, teacherOpen: true, open: true },
        { classId: "c2", adminAllowed: false, teacherOpen: false, open: false },
      ],
    },
    {
      id: "ml-intro",
      stageCount: 6,
      hidden: false,
      openClassIds: null,
      visibleClassIds: ["c1", "c2"],
      classes: [
        { classId: "c1", adminAllowed: true, teacherOpen: true, open: true },
        { classId: "c2", adminAllowed: true, teacherOpen: true, open: true },
      ],
    },
  ],
};

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function mockApi() {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const path = String(input);
    if (init?.method === "PUT") return jsonResponse({ ok: true });
    if (path.includes("/api/teacher/labs")) return jsonResponse(payload);
    return jsonResponse({});
  });
}

function labRow(title: string) {
  const row = screen.getByText(title).closest("tr");
  if (!row) throw new Error(`row for ${title} not found`);
  return within(row);
}

describe("TeacherLabsPage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("toggles a lab per own class and keeps admin-blocked classes disabled", async () => {
    const fetchMock = mockApi();
    const user = userEvent.setup();

    await renderAppAt("/teacher/labs", { auth: teacherAuthState });

    expect(screen.getByRole("heading", { name: "实验管理" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("实现ALU")).toBeInTheDocument());

    const calc = labRow("实现ALU");
    // Both own classes start open; the row reports the open count.
    expect(calc.getByRole("checkbox", { name: "一班" })).toBeChecked();
    expect(calc.getByRole("checkbox", { name: "二班" })).toBeChecked();
    expect(calc.getByText("2 个班开放")).toBeInTheDocument();

    // Closing one class fires the scoped PUT and flips the local cell.
    await user.click(calc.getByRole("checkbox", { name: "二班" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/teacher/labs/calculator/classes/c2/open",
        expect.objectContaining({ method: "PUT", body: JSON.stringify({ open: false }) }),
      ),
    );
    await waitFor(() => expect(calc.getByText("1 个班开放")).toBeInTheDocument());
    expect(calc.getByRole("checkbox", { name: "二班" })).not.toBeChecked();

    // A class outside the admin scope starts unchecked but stays
    // changeable — the teacher can open it to their own students anyway.
    const decoding = labRow("解码侦探");
    expect(decoding.getByText("1 个班开放")).toBeInTheDocument();
    expect(decoding.getByRole("checkbox", { name: "一班" })).toBeChecked();
    const outOfScope = decoding.getByRole("checkbox", { name: "二班" });
    expect(outOfScope).toBeEnabled();
    expect(outOfScope).not.toBeChecked();
    await user.click(outOfScope);
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/teacher/labs/decoding/classes/c2/open",
        expect.objectContaining({ method: "PUT", body: JSON.stringify({ open: true }) }),
      ),
    );
    // The open count reflects the teacher's switch regardless of the
    // admin scope — the row reads 2 个班开放 now.
    await waitFor(() => expect(decoding.getByText("2 个班开放")).toBeInTheDocument());

    const mlRow = labRow("机器学习入门");
    expect(mlRow.getByText("ml-intro")).toBeInTheDocument();
    expect(mlRow.getByText("6")).toBeInTheDocument();
    await user.click(mlRow.getByRole("checkbox", { name: "一班" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/teacher/labs/ml-intro/classes/c1/open",
        expect.objectContaining({ method: "PUT", body: JSON.stringify({ open: false }) }),
      ),
    );
  });
});
