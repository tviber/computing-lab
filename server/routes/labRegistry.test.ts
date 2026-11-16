// @vitest-environment node
import { describe, expect, it } from "vitest";
import { LAB_IDS, labMetadata } from "../../src/shared/lab/labMetadata.ts";
import { openMemoryDb } from "../db/client.ts";
import { createApp } from "../index.ts";
import { LAB_REGISTRY } from "../labs.ts";
import { LAB_ROUTES } from "./labRegistry.ts";

describe("server lab registry", () => {
  it("mounts every lab declared in LAB_IDS on createApp(db)", async () => {
    const metadataIds = Object.keys(labMetadata);
    expect(LAB_IDS).toEqual(metadataIds);
    expect(LAB_REGISTRY.map((entry) => entry.id)).toEqual(metadataIds);
    expect(Object.keys(LAB_ROUTES)).toEqual(metadataIds);

    const db = openMemoryDb();
    try {
      const app = createApp(db);
      for (const id of LAB_IDS) {
        const res = await app.fetch(
          new Request(`http://lab.test/api/classes/c1/labs/${id}/project`),
        );
        expect(res.status, `/api/classes/c1/labs/${id}/project`).toBe(401);
      }
    } finally {
      db.close();
    }
  });
});
