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

export interface ParamInput {
  name: string;
  type: "text" | "number" | "date" | "bool";
  required: boolean;
  default?: string | number | boolean;
}

const PARAM_TYPES = new Set(["text", "number", "date", "bool"]);

/**
 * Params read straight from the JSON, ignoring validation errors elsewhere. The params form uses this
 * when the definition does not validate, so you can still set values while you fix the problem.
 */
export function lenientParams(text: string): ParamInput[] {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return [];
  }
  const list = (json as { params?: unknown } | null)?.params;
  if (!Array.isArray(list)) return [];
  return list.flatMap((p: unknown): ParamInput[] => {
    if (!p || typeof p !== "object") return [];
    const { name, type, required, default: dflt } = p as Record<string, unknown>;
    if (typeof name !== "string" || name === "") return [];
    const input: ParamInput = { name, type: PARAM_TYPES.has(type as string) ? (type as ParamInput["type"]) : "text", required: required === true };
    if (typeof dflt === "string" || typeof dflt === "number" || typeof dflt === "boolean") input.default = dflt;
    return [input];
  });
}
