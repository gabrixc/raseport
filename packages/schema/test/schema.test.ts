import { describe, expect, it } from "vitest";
import { parseDefinition, reportJsonSchema } from "../src/index.ts";

describe("reportJsonSchema", () => {
  const schema = reportJsonSchema() as { properties: Record<string, unknown>; required?: string[] };
  it("describes the top level and requires only name, version and body", () => {
    expect(Object.keys(schema.properties)).toEqual(expect.arrayContaining(["schemaVersion", "name", "datasets", "body"]));
    expect([...(schema.required ?? [])].sort()).toEqual(["body", "name", "schemaVersion"]);
  });
  it("accepts a minimal definition via the parser", () => {
    expect(parseDefinition({ schemaVersion: 1, name: "x", body: [] }).datasets).toEqual([]);
  });
  it("knows block types", () => {
    expect(JSON.stringify(schema)).toContain('"chart"');
  });
});
