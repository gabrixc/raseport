import type { ParamValues, ParsedReport } from "@raseport/schema";

export class BadRequest extends Error {
  /** `id` of the definition node the problem is about, when there is one */
  readonly nodeId: string | undefined;
  constructor(message: string, nodeId?: string) {
    super(message);
    this.nodeId = nodeId;
  }
}

/** Validate and coerce request params against the definition's declared params. */
export function resolveParams(def: ParsedReport, input: Record<string, unknown> = {}): ParamValues {
  const out: ParamValues = {};
  for (const p of def.params) {
    const raw = input[p.name] ?? p.default;
    if (raw === undefined || raw === null || raw === "") {
      if (p.required) throw new BadRequest(`Missing required param "${p.name}"`);
      out[p.name] = null;
      continue;
    }
    if (p.type === "number") {
      const n = Number(raw);
      if (Number.isNaN(n)) throw new BadRequest(`Param "${p.name}" must be a number`);
      out[p.name] = n;
    } else if (p.type === "bool") {
      if (raw !== true && raw !== false && raw !== "true" && raw !== "false") throw new BadRequest(`Param "${p.name}" must be a boolean`);
      out[p.name] = raw === true || raw === "true";
    } else if (p.type === "date") {
      if (typeof raw !== "string" || Number.isNaN(Date.parse(raw))) throw new BadRequest(`Param "${p.name}" must be a date`);
      out[p.name] = raw;
    } else {
      out[p.name] = String(raw);
    }
  }
  return out;
}
