import type { SupabaseClient } from "@supabase/supabase-js";
import type { DatasetRows, ParamValues, ParsedReport } from "@raseport/schema";
import { BadRequest } from "./params.ts";

const PAGE = 1000; // PostgREST's default max_rows; RPCs must return a stable order
export const MAX_ROWS = 50_000;

/** Only functions named report_* are callable, so definitions cannot reach arbitrary RPCs. */
const ALLOWED_RPC = /^report_[a-z0-9_]+$/;

export async function fetchDatasets(client: SupabaseClient, def: ParsedReport, params: ParamValues): Promise<DatasetRows> {
  const entries = await Promise.all(
    def.datasets.map(async (ds) => {
      if (!ALLOWED_RPC.test(ds.source.name)) throw new BadRequest(`RPC "${ds.source.name}" is not allowed (must start with report_)`);
      const args = Object.fromEntries(
        Object.entries(ds.args).map(([k, v]) => [k, v !== null && typeof v === "object" ? params[v.$param] : v]),
      );
      const rows: Record<string, unknown>[] = [];
      for (let from = 0; rows.length < MAX_ROWS; from += PAGE) {
        const { data, error } = await client.rpc(ds.source.name, args).range(from, from + PAGE - 1);
        if (error) throw new Error(`Dataset "${ds.id}" failed: ${error.message}`);
        const page = (data ?? []) as Record<string, unknown>[];
        rows.push(...page);
        if (page.length < PAGE) break;
      }
      if (rows.length >= MAX_ROWS) throw new BadRequest(`Dataset "${ds.id}" exceeds ${MAX_ROWS} rows`);
      return [ds.id, rows] as const;
    }),
  );
  return Object.fromEntries(entries);
}
