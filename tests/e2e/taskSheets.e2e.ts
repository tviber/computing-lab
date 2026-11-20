import { expect, test } from "@playwright/test";

test("completes a task-sheet assignment end to end", async ({ baseURL, browser, request }) => {
  const adminLogin = await request.post("/api/auth/login", {
    data: { studentNo: "admin", password: "admin-dev-password" },
  });
  expect(adminLogin.status()).toBe(200);

  const classesResponse = await request.get("/api/admin/classes");
  expect(classesResponse.status()).toBe(200);
  const { classes } = (await classesResponse.json()) as { classes: { id: string }[] };
  const classId = classes[0]?.id;
  expect(classId).toBeTruthy();

  const studentNo = `e2e-sheet-${Date.now()}`;
  const createStudent = await request.post("/api/admin/users", {
    data: {
      studentNo,
      name: "Task-sheet student",
      password: "e2e-password",
      role: "user",
      classId,
    },
  });
  expect(createStudent.status()).toBe(201);

  const teacherLogin = await request.post("/api/auth/login", {
    data: { studentNo: "teacher", password: "teacher-dev-password" },
  });
  expect(teacherLogin.status()).toBe(200);

  const createSheet = await request.post("/api/task-sheets", {
    data: { title: "E2E 任务单", description: "playwright 端到端验证" },
  });
  expect(createSheet.status()).toBe(201);
  const { sheet } = (await createSheet.json()) as { sheet: { id: string } };

  const schema = {
    version: 1,
    questions: [
      {
        id: "q1",
        type: "fill",
        prompt: "二进制的 10 等于十进制的 ${}",
        required: true,
        score: 2,
        blanks: [{ id: "b1", accept: ["2"] }],
      },
      {
        id: "q2",
        type: "choice",
        prompt: "下面哪个是偶数？",
        required: true,
        score: 3,
        multiple: false,
        options: [
          { id: "o1", text: "3" },
          { id: "o2", text: "4" },
        ],
        correctOptionIds: ["o2"],
      },
    ],
  };
  const saveSchema = await request.patch(`/api/task-sheets/${sheet.id}`, {
    data: { schema, status: "published" },
  });
  expect(saveSchema.status()).toBe(200);

  const assign = await request.post(`/api/classes/${classId}/task-assignments`, {
    data: { sheetId: sheet.id },
  });
  expect(assign.status()).toBe(201);
  const { assignment } = (await assign.json()) as { assignment: { id: string } };

  const studentLogin = await request.post("/api/auth/login", {
    data: { studentNo, password: "e2e-password" },
  });
  expect(studentLogin.status()).toBe(200);

  const firstVisit = await browser.newContext({
    baseURL,
    storageState: await request.storageState(),
  });
  try {
    const page = await firstVisit.newPage();
    await page.goto("./");
    const badge = page.getByRole("article").filter({ hasText: "E2E 任务单" }).getByText("未开始");
    await expect(badge).toHaveCSS("display", "inline-flex");
    await expect(badge).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(badge).toHaveCSS("border-top-left-radius", "999px");
  } finally {
    await firstVisit.close();
  }

  const view = await request.get(
    `/api/classes/${classId}/task-assignments/${assignment.id}/response`,
  );
  expect(view.status()).toBe(200);
  const viewBody = (await view.json()) as {
    schema: { questions: { id: string; type: string }[] };
    response: { status: string };
  };
  expect(viewBody.response.status).toBe("not_started");
  expect(JSON.stringify(viewBody.schema)).not.toContain("correctOptionIds");
  expect(JSON.stringify(viewBody.schema)).not.toContain("accept");

  const draft = await request.put(
    `/api/classes/${classId}/task-assignments/${assignment.id}/response`,
    {
      data: {
        answers: {
          q1: { type: "fill", blanks: { b1: "2" } },
          q2: { type: "choice", optionIds: ["o2"] },
        },
      },
    },
  );
  expect(draft.status()).toBe(200);

  const submit = await request.post(
    `/api/classes/${classId}/task-assignments/${assignment.id}/response/submit`,
  );
  expect(submit.status()).toBe(200);
  await expect(submit.json()).resolves.toMatchObject({ autoScore: 5, autoTotal: 5 });

  const resubmit = await request.post(
    `/api/classes/${classId}/task-assignments/${assignment.id}/response/submit`,
  );
  expect(resubmit.status()).toBe(409);

  await request.post("/api/auth/login", {
    data: { studentNo: "teacher", password: "teacher-dev-password" },
  });
  const roster = await request.get(
    `/api/classes/${classId}/task-assignments/${assignment.id}/responses`,
  );
  expect(roster.status()).toBe(200);
  const { rows } = (await roster.json()) as {
    rows: { studentNo: string; status: string; autoScore: number | null }[];
  };
  const row = rows.find((r) => r.studentNo === studentNo);
  expect(row).toMatchObject({ status: "submitted", autoScore: 5 });
});
