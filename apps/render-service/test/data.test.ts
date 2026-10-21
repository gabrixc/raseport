import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { parseDefinition } from "@raseport/schema";
import { fetchDatasets } from "../src/data.ts";
import { BadRequest } from "../src/params.ts";

const def = (rpc: string) => {
  const parsed = parseDefinition({ schemaVersion: 1, name: "t", datasets: [{ id: "sales", source: { kind: "rpc", name: "report_ok" } }], body: [] });
  parsed.datasets[0]!.source.name = rpc; // bypass the schema: fetchDatasets must still refuse on its own
  return parsed;
};

describe("fetchDatasets errors", () => {
  it("refuses non report_* RPCs even if validation was bypassed, and says which dataset", async () => {
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
