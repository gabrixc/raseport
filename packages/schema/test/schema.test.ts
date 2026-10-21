import { describe, expect, it } from "vitest";
import { DefinitionError, parseDefinition, reportJsonSchema } from "../src/index.ts";

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

describe("DefinitionError", () => {
  it("carries the id of the node each issue is about", () => {
    const def = {
      schemaVersion: 1,
      name: "x",
      datasets: [{ id: "a", source: { kind: "rpc", name: "report_a" } }],
      body: [{ id: "b1", type: "body", rows: [{ id: "r1", cells: [{ span: 12, blocks: [{ type: "table", id: "t1", dataset: "nope", columns: [{ field: "x", label: "X" }] }] }] }] }],
    };
    try {
      parseDefinition(def);
      throw new Error("should not parse");
    } catch (e) {
      expect(e).toBeInstanceOf(DefinitionError);
      expect((e as DefinitionError).issues).toEqual([{ message: 'block t1: unknown dataset "nope"', nodeId: "t1" }]);
    }
  });
});

describe("dataset RPC names", () => {
  const withRpc = (name: string) => ({ schemaVersion: 1, name: "x", datasets: [{ id: "a", source: { kind: "rpc", name } }], body: [] });
  it("accepts report_* names", () => {
    expect(() => parseDefinition(withRpc("report_sales_by_region"))).not.toThrow();
  });
  it.each(["report_", "drop_it", "Report_x", "report_x-y", "report_x; drop"])("rejects %s with a helpful message", (name) => {
    expect(() => parseDefinition(withRpc(name))).toThrow(/report_ followed by lowercase letters/);
  });
});

describe("editor hover metadata", () => {
  const props = (reportJsonSchema() as any).properties; // eslint-disable-line @typescript-eslint/no-explicit-any
  const dataset = props.datasets.items.properties;

  it("gives the RPC name a specific squiggle message and a description", () => {
    expect(dataset.source.properties.name.patternErrorMessage).toMatch(/report_ followed by lowercase letters/);
    expect(dataset.source.properties.name.description).toMatch(/Postgres function.*report_sales_by_region/);
    expect(dataset.source.properties.name.description).not.toContain("`");
    expect(dataset.source.properties.name.markdownDescription).toContain("`report_sales_by_region`");
  });

  it("explains datasets, ids and args on hover", () => {
    expect(dataset.id.patternErrorMessage).toMatch(/lowercase letter/);
    expect(dataset.id.description).toMatch(/refer to this dataset/);
    expect(dataset.args.description).toMatch(/\$param/);
  });

  it("uses the same specific messages when validating", () => {
    const bad = { schemaVersion: 1, name: "x", datasets: [{ id: "Sales", source: { kind: "rpc", name: "report_x" } }], theme: { accent: "blue" }, body: [] };
    try {
      parseDefinition(bad);
      throw new Error("should not parse");
    } catch (e) {
      const messages = (e as { issues: { message: string }[] }).issues.map((i) => i.message);
      expect(messages).toEqual(expect.arrayContaining([expect.stringMatching(/lowercase letter/), expect.stringMatching(/6-digit hex/)]));
    }
  });
});
