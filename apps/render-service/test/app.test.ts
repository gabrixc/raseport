import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { createApp, MAX_BODY_BYTES } from "../src/app.ts";

const fakeClient = { auth: { getUser: async () => ({ data: { user: { id: "u" } }, error: null }) } } as unknown as SupabaseClient;
const app = createApp({
  clientFor: () => fakeClient,
  compile: async () => Buffer.from("%PDF-fake"),
  allowInlineDefinition: true,
  corsOrigins: ["http://localhost:5173"],
});

const post = (path: string, definition: unknown, token = "t") =>
  app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ definition, params: {} }),
  });

const base = { schemaVersion: 1, name: "t", body: [] };

describe("error responses", () => {
  it("requires a token", async () => {
    expect((await post("/render", base, "")).status).toBe(401);
  });

  it("returns 422 with zod issues for a malformed definition", async () => {
    const res = await post("/render", { ...base, schemaVersion: 2 });
    expect(res.status).toBe(422);
    expect((await res.json()).issues[0].path).toEqual(["schemaVersion"]);
  });

  it("returns 422 with node ids for broken references", async () => {
    const def = {
      ...base,
      body: [{ id: "b", type: "body", rows: [{ id: "r", cells: [{ span: 12, blocks: [{ type: "chart", id: "c1", kind: "bar", dataset: "nope", x: "a", series: [{ field: "b" }] }] }] }] }],
    };
    const res = await post("/render", def);
    expect(res.status).toBe(422);
    expect((await res.json()).issues).toEqual([{ message: 'block c1: unknown dataset "nope"', nodeId: "c1" }]);
  });

  it("rejects a non report_* RPC name at validation, pointing at its path", async () => {
    const def = { ...base, datasets: [{ id: "d1", source: { kind: "rpc", name: "drop_table" } }] };
    for (const path of ["/data", "/render"]) {
      const res = await post(path, def);
      expect(res.status).toBe(422);
      expect((await res.json()).issues[0].path).toEqual(["datasets", 0, "source", "name"]);
    }
  });

  it("rejects oversized bodies with 413", async () => {
    const res = await post("/render", { ...base, name: "x".repeat(MAX_BODY_BYTES) });
    expect(res.status).toBe(413);
  });

  it("renders a valid definition", async () => {
    const res = await post("/render", base);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
  });
});
