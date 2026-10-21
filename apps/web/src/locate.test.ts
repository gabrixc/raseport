import { describe, expect, it } from "vite-plus/test";
import { check } from "./check.ts";
import { locateId, locatePath, locateProblem } from "./locate.ts";

const text = JSON.stringify(
  { schemaVersion: 1, name: "t", datasets: [{ id: "sales", source: { kind: "rpc", name: "report_x" } }], body: [{ id: "b1", type: "body", rows: [] }] },
  null,
  2,
);
const at = (t: { offset: number; length: number } | null) => (t ? text.slice(t.offset, t.offset + t.length) : null);

describe("locate", () => {
  it("finds a node by id", () => {
    expect(at(locateId(text, "sales"))).toBe('"sales"');
    expect(at(locateId(text, "b1"))).toBe('"b1"');
    expect(locateId(text, "missing")).toBeNull();
  });

  it("finds a path, and falls back to the parent when the key is missing", () => {
    expect(at(locatePath(text, ["schemaVersion"]))).toBe("1");
    expect(at(locatePath(text, ["datasets", 0, "source", "name"]))).toBe('"report_x"');
    expect(at(locatePath(text, ["datasets", 0, "args", "p_month"]))).toBe('"sales"'); // no args: parent object, shown by its id
  });
});

describe("check", () => {
  it("points JSON syntax errors at their offset", () => {
    const bad = '{ "a": 1,, }';
    const { def, problems } = check(bad);
    expect(def).toBeNull();
    expect(problems[0]!.offset).toBeTypeOf("number");
    expect(locateProblem(bad, problems[0]!)).not.toBeNull();
  });

  it("gives schema problems a path and reference problems a node id", () => {
    const v2 = text.replace('"schemaVersion": 1', '"schemaVersion": 2');
    const wrongVersion = check(v2);
    expect(wrongVersion.problems[0]!.path).toEqual(["schemaVersion"]);
    const t = locateProblem(v2, wrongVersion.problems[0]!)!;
    expect(v2.slice(t.offset, t.offset + t.length)).toBe("2");

    const badRef = JSON.parse(text);
    badRef.body[0].rows = [{ id: "r1", cells: [{ span: 12, blocks: [{ type: "table", id: "t9", dataset: "nope", columns: [{ field: "a", label: "A" }] }] }] }];
    const res = check(JSON.stringify(badRef, null, 2));
    expect(res.problems).toEqual([{ message: 'block t9: unknown dataset "nope"', nodeId: "t9" }]);
  });
});
