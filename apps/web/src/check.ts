import { DefinitionError, parseDefinition, ZodError, type ParsedReport } from "@raseport/schema";
import type { Problem } from "./problems.ts";

export interface CheckResult {
  def: ParsedReport | null;
  problems: Problem[];
}

/** Validate editor text: JSON syntax first, then the shared schema and reference checks. */
export function check(text: string): CheckResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    const message = (e as Error).message;
    const pos = /position (\d+)/.exec(message)?.[1];
    return { def: null, problems: [{ message: `JSON: ${message}`, offset: pos === undefined ? undefined : Number(pos) }] };
  }
  try {
    return { def: parseDefinition(json), problems: [] };
  } catch (e) {
    if (e instanceof ZodError) {
      return {
        def: null,
        problems: e.issues.slice(0, 12).map((i) => ({ message: `${i.path.join(".") || "(root)"}: ${i.message}`, path: i.path.map((p) => (typeof p === "symbol" ? String(p) : p)) })),
      };
    }
    if (e instanceof DefinitionError) return { def: null, problems: e.issues.map((i) => ({ message: i.message, nodeId: i.nodeId })) };
    return { def: null, problems: [{ message: (e as Error).message }] };
  }
}
