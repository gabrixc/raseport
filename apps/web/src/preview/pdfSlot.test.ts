import { describe, expect, it } from "vite-plus/test";
import { createPdfSlot } from "./pdfSlot.ts";

function slot() {
  const made: string[] = [];
  const revoked: string[] = [];
  const s = createPdfSlot(
    () => {
      const u = `blob:${made.length + 1}`;
      made.push(u);
      return u;
    },
    (u) => void revoked.push(u),
  );
  return { s, made, revoked };
}

const copy = () => new Blob(["pdf"]); // every message delivers a new Blob object

describe("createPdfSlot", () => {
  it("keeps the same URL when the same render arrives again as a new copy", () => {
    const { s, made } = slot();
    const first = s.set(1, copy());
    expect(s.set(1, copy())).toBe(first);
    expect(s.set(1, copy())).toBe(first);
    expect(made).toHaveLength(1);
  });

  it("makes a new URL, and frees the old one, only when the render id changes", () => {
    const { s, made, revoked } = slot();
    s.set(1, copy());
    const second = s.set(2, copy());
    expect(second).toBe("blob:2");
    expect(made).toHaveLength(2);
    expect(revoked).toEqual(["blob:1"]);
  });

  it("shows nothing when there is no PDF, and recovers when one arrives", () => {
    const { s } = slot();
    expect(s.set(0, null)).toBeNull();
    expect(s.set(0, null)).toBeNull();
    expect(s.set(1, copy())).toBe("blob:1");
  });

  it("frees the URL on dispose", () => {
    const { s, revoked } = slot();
    s.set(1, copy());
    s.dispose();
    expect(revoked).toEqual(["blob:1"]);
    s.dispose();
    expect(revoked).toHaveLength(1);
  });
});
