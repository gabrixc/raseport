import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { parseDefinition } from "@raseport/schema";
import { fetchDatasets } from "../src/data.ts";
import { BadRequest } from "../src/params.ts";

const def = (rpc: string) =>
  parseDefinition({ schemaVersion: 1, name: "t", datasets: [{ id: "sales", source: { kind: "rpc", name: rpc } }], body: [] });

describe("fetchDatasets errors", () => {
  it("rejects non report_* RPCs and says which dataset", async () => {
    const err = await fetchDatasets({} as SupabaseClient, def("delete_everything"), {}).catch((e) => e);
    expect(err).toBeInstanceOf(BadRequest);
    expect(err.nodeId).toBe("sales");
  });

  it("reports RPC failures against the dataset", async () => {
    const client = { rpc: () => ({ range: async () => ({ data: null, error: { message: "boom" } }) }) } as unknown as SupabaseClient;
    const err = await fetchDatasets(client, def("report_x"), {}).catch((e) => e);
    expect(err).toMatchObject({ message: 'Dataset "sales" failed: boom', nodeId: "sales" });
  });
});
