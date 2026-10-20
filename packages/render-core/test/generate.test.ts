import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseDefinition } from "@raseport/schema";
import { generateTypst, typstString } from "../src/index.ts";

const example = JSON.parse(readFileSync(new URL("../../../examples/sales-report.json", import.meta.url), "utf8"));
const rows = [
  { order_no: "A-1", region: "North", ordered_on: "2026-01-05", amount: 1200.5, customer: { name: "Acme", tier: "gold" } },
  { order_no: "A-2", region: "North", ordered_on: "2026-01-06", amount: 99.5, customer: { name: "Bolt", tier: "basic" } },
  { order_no: "B-1", region: "South", ordered_on: "2026-01-07", amount: 300, customer: { name: "Cyan", tier: "basic" } },
];

function typstAvailable(): boolean {
  try {
    execFileSync("typst", ["--version"]);
    return true;
  } catch {
    return false;
  }
}

describe("typstString", () => {
  it("escapes quotes, backslashes and control characters", () => {
    expect(typstString('a"b\\c\nd')).toBe('"a\\"b\\\\c\\nd"');
    expect(typstString("\u0001")).toBe('"\\u{1}"');
  });
});

describe("generateTypst", () => {
  const def = parseDefinition(example);

  it("renders aggregates and nested jsonb paths with formatting", () => {
    const src = generateTypst(def, { sales: rows }, { month: "2026-01-01" });
    expect(src).toContain('"$1,600.00"'); // total revenue
    expect(src).toContain('"Acme"'); // customer.name
    expect(src).toContain('"Jan 5, 2026"');
    expect(src).toContain('"Subtotal"');
  });

  it("cannot be injected through data values", () => {
    const evil = [{ ...rows[0], customer: { name: '"); #read("/etc/passwd"); ("', tier: "x" } }];
    const src = generateTypst(def, { sales: evil }, { month: "x" });
    expect(src).toContain('\\"); #read(\\"/etc/passwd\\"); (\\"');
    expect(src).not.toMatch(/^#read/m);
  });

  it("shows the noData band only when the dataset is empty", () => {
    expect(generateTypst(def, { sales: rows }, { month: "m" })).not.toContain("No sales for this period.");
    const empty = generateTypst(def, { sales: [] }, { month: "m" });
    expect(empty).toContain("No sales for this period.");
    expect(empty).not.toContain("table.header");
  });

  it("rejects references to unknown datasets", () => {
    const bad = structuredClone(example);
    bad.body[1].rows[0].cells[0].blocks[0].dataset = "nope";
    expect(() => parseDefinition(bad)).toThrow(/unknown dataset "nope"/);
  });

  it.runIf(typstAvailable())("compiles with the real Typst CLI", () => {
    const dir = mkdtempSync(join(tmpdir(), "rr-"));
    writeFileSync(join(dir, "main.typ"), generateTypst(def, { sales: rows }, { month: "2026-01-01" }));
    execFileSync("typst", ["compile", "--root", dir, join(dir, "main.typ"), join(dir, "out.pdf")], { stdio: "pipe" });
    expect(readFileSync(join(dir, "out.pdf")).subarray(0, 5).toString()).toBe("%PDF-");
  });
});
