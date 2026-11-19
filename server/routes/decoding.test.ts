import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { hashPassword } from "../auth/password.ts";
import { createSession } from "../auth/session.ts";
import { openMemoryDb, newId } from "../db/client.ts";
import { attachDb, attachSession, type AppVariables } from "../http/context.ts";
import type { LabPayload } from "../../src/features/decoding/domain/protocol.ts";
import { generatePayload } from "../../src/features/decoding/domain/payload.ts";
import { seedFor } from "../../src/features/decoding/domain/rng.ts";
import { getDecodingStage } from "../../src/features/decoding/domain/stages.ts";
import { decodingRoutes } from "./decoding.ts";

async function setup() {
  const db = openMemoryDb();
  const classId = newId();
  db.prepare("INSERT INTO classes (id, name, invite_code) VALUES (?, ?, ?)").run(
    classId,
    "实验班",
    "invite-1",
  );
  const mkUser = async (no: string, role: string, memberRole: string | null) => {
    const id = newId();
    db.prepare(
      "INSERT INTO users (id, student_no, name, password_hash, role) VALUES (?, ?, ?, ?, ?)",
    ).run(id, no, no, await hashPassword("pass"), role);
    if (memberRole) {
      db.prepare("INSERT INTO class_members (id, class_id, user_id, role) VALUES (?, ?, ?, ?)").run(
        newId(),
        classId,
        id,
        memberRole,
      );
    }
    return id;
  };
  const studentId = await mkUser("stu-1", "user", "student");
  const adminId = await mkUser("adm-1", "admin", null);
  const app = new Hono<{ Variables: AppVariables }>();
  app.use("/api/*", attachDb(db), attachSession());
  app.route("/api/classes/:classId/labs/decoding", decodingRoutes());
  const cookieFor = (userId: string) => `lab_session=${createSession(db, userId).id}`;
  return { db, classId, studentId, adminId, app, cookieFor };
}

const url = (classId: string, path: string) =>
  `http://lab.test/api/classes/${classId}/labs/decoding${path}`;

function conceptAnswers(stageIndex: number): Record<string, number> {
  const stage = getDecodingStage(stageIndex)!;
  return Object.fromEntries(
    (stage.prompts ?? []).map((prompt) => [
      prompt.id,
      prompt.options.findIndex((o) => o.correct === true),
    ]),
  );
}

describe("decoding routes", () => {
  it("returns a project with per-user payloads for every stage", async () => {
    const { app, classId, studentId, cookieFor } = await setup();
    const res = await app.fetch(
      new Request(url(classId, "/project"), { headers: { cookie: cookieFor(studentId) } }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      labId: string;
      payloads: Record<string, LabPayload>;
    };
    expect(body.labId).toBe("decoding");
    expect(Object.keys(body.payloads).map(Number).sort()).toEqual([1, 2, 3, 4, 5, 6]);
    const stage1 = body.payloads["1"] as { kind: string; codes: number[] };
    expect(stage1.kind).toBe("codes");
    expect(stage1.codes.length).toBeGreaterThan(3);
  });

  it("generates each payload from the requesting user's stable seed", async () => {
    const { app, classId, studentId, adminId, cookieFor } = await setup();
    const fetchCodes = async (userId: string) => {
      const res = await app.fetch(
        new Request(url(classId, "/project"), { headers: { cookie: cookieFor(userId) } }),
      );
      const body = (await res.json()) as { payloads: Record<string, { codes: number[] }> };
      return body.payloads["1"].codes;
    };
    const a = await fetchCodes(studentId);
    const b = await fetchCodes(adminId);
    const stage = getDecodingStage(1)!;
    const studentSeed = seedFor(studentId, "decoding", 1);
    const adminSeed = seedFor(adminId, "decoding", 1);
    expect(studentSeed).not.toBe(adminSeed);
    expect(a).toEqual(
      (generatePayload(stage, studentSeed).payload as Extract<LabPayload, { kind: "codes" }>).codes,
    );
    expect(b).toEqual(
      (generatePayload(stage, adminSeed).payload as Extract<LabPayload, { kind: "codes" }>).codes,
    );
  });

  it("unauthenticated requests get 401", async () => {
    const { app, classId } = await setup();
    const res = await app.fetch(new Request(url(classId, "/project")));
    expect(res.status).toBe(401);
  });

  it("saves a draft and reads it back sanitized", async () => {
    const { app, classId, studentId, cookieFor } = await setup();
    const cookie = cookieFor(studentId);
    const put = await app.fetch(
      new Request(url(classId, "/draft"), {
        method: "PUT",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({
          stageIndex: 1,
          expectedRevision: 0,
          expectedGeneration: 0,
          draft: { code: "def decode(d): return ''", signature: "BM", verdicts: "junk" },
        }),
      }),
    );
    expect(put.status).toBe(200);
    const project = await app.fetch(new Request(url(classId, "/project"), { headers: { cookie } }));
    const body = (await project.json()) as {
      drafts: Record<string, { code: string; verdicts: unknown[] }>;
    };
    expect(body.drafts["1"].code).toBe("def decode(d): return ''");
    expect(Array.isArray(body.drafts["1"].verdicts)).toBe(true);
  });

  it("judges a correct stage-1 submission end-to-end", async () => {
    const { app, classId, studentId, cookieFor } = await setup();
    const stage = getDecodingStage(1)!;
    const { expected } = generatePayload(stage, seedFor(studentId, "decoding", 1));
    const res = await app.fetch(
      new Request(url(classId, "/judge"), {
        method: "POST",
        headers: { cookie: cookieFor(studentId), "content-type": "application/json" },
        body: JSON.stringify({
          stageIndex: 1,
          expectedGeneration: 0,
          artifact: expected,
          conceptAnswers: conceptAnswers(1),
          code: "def decode(data): return ''.join(map(chr, data))",
        }),
      }),
    );
    expect(res.status).toBe(200);
    const outcome = (await res.json()) as { passed: boolean; currentStage: number };
    expect(outcome.passed).toBe(true);
    expect(outcome.currentStage).toBe(2);
  });

  it("fails a submission whose concept checks are missing, with per-prompt parts", async () => {
    const { app, classId, studentId, cookieFor } = await setup();
    const res = await app.fetch(
      new Request(url(classId, "/judge"), {
        method: "POST",
        headers: { cookie: cookieFor(studentId), "content-type": "application/json" },
        body: JSON.stringify({
          stageIndex: 1,
          expectedGeneration: 0,
          artifact: { text: "WHATEVER" },
        }),
      }),
    );
    expect(res.status).toBe(200);
    const outcome = (await res.json()) as {
      passed: boolean;
      parts: { id: string; ok: boolean }[];
    };
    expect(outcome.passed).toBe(false);
    expect(outcome.parts.some((p) => p.id.startsWith("prompt-") && !p.ok)).toBe(true);
  });
});
