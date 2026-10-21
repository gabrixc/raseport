import { describe, expect, it } from "vite-plus/test";
import { collisionDetection, type DragData, type ZoneData } from "./dnd.tsx";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Rect = { left: number; top: number; right: number; bottom: number; width: number; height: number };
const rect = (left: number, top: number, w: number, h: number): Rect => ({ left, top, right: left + w, bottom: top + h, width: w, height: h });

interface Zone {
  id: string;
  rect: Rect;
  data: ZoneData;
}
const ALL: DragData["kind"][] = ["new", "block", "row"];
const gap = (id: string, r: Rect, index = 0): Zone => ({ id, rect: r, data: { dest: { kind: "row", at: { section: "footer" }, index }, accepts: ALL, priority: 2, gap: true } });
const edge = (id: string, r: Rect): Zone => ({ id, rect: r, data: { dest: { kind: "split", rowId: "r", cellIndex: 0, side: "after" }, accepts: ["new", "block"], priority: 3 } });
const half = (id: string, r: Rect): Zone => ({ id, rect: r, data: { dest: { kind: "cell", rowId: "r", cellIndex: 0, index: 0 }, accepts: ALL, priority: 1 } });

function run(drag: DragData, zones: Zone[], pointer: { x: number; y: number } | null) {
  const args: any = {
    active: { id: "a", data: { current: drag } },
    droppableContainers: zones.map((z) => ({ id: z.id, data: { current: z.data } })),
    droppableRects: new Map(zones.map((z) => [z.id, z.rect])),
    pointerCoordinates: pointer,
    collisionRect: rect(0, 0, 10, 10),
  };
  return collisionDetection(args).map((c) => c.id);
}

const NEW: DragData = { kind: "new", type: "text" };
const ROW: DragData = { kind: "row", id: "r1" };

describe("collisionDetection", () => {
  it("prefers the most specific zone when several are under the pointer: edge > gap > block half", () => {
    const zones = [half("h", rect(0, 0, 100, 50)), gap("g", rect(0, 40, 100, 18)), edge("e", rect(90, 0, 16, 60))];
    expect(run(NEW, zones, { x: 95, y: 45 })).toEqual(["e"]); // in all three
    expect(run(NEW, zones, { x: 50, y: 45 })).toEqual(["g"]); // half + gap
    expect(run(NEW, zones, { x: 50, y: 10 })).toEqual(["h"]); // half only
  });

  it("lets a row drag land only on gaps, snapping to the one nearest the pointer", () => {
    const zones = [half("h", rect(0, 0, 100, 50)), edge("e", rect(90, 0, 16, 60)), gap("g1", rect(0, 100, 100, 18), 0), gap("g2", rect(0, 200, 100, 18), 1)];
    expect(run(ROW, zones, { x: 50, y: 20 })).toEqual(["g1"]); // over a block: the closest gap, not the block
    expect(run(ROW, zones, { x: 50, y: 190 })).toEqual(["g2"]);
  });

  it("uses the pointer, not the size of the dragged element, to choose a gap", () => {
    // a huge dragged rect centred near g1 must not matter when the pointer is at g2
    const zones = [gap("g1", rect(0, 100, 100, 18)), gap("g2", rect(0, 300, 100, 18))];
    const args: any = {
      active: { id: "a", data: { current: ROW } },
      droppableContainers: zones.map((z) => ({ id: z.id, data: { current: z.data } })),
      droppableRects: new Map(zones.map((z) => [z.id, z.rect])),
      pointerCoordinates: { x: 50, y: 305 },
      collisionRect: rect(0, 0, 100, 220), // centre at y=110, right on g1
    };
    expect(collisionDetection(args).map((c) => c.id)).toEqual(["g2"]);
  });

  it("falls back to the nearest gap when released near the page, and cancels when released elsewhere", () => {
    const zones = [half("h", rect(0, 0, 100, 50)), gap("g1", rect(0, 100, 100, 18)), gap("g2", rect(0, 200, 100, 18))];
    expect(run(NEW, zones, { x: 110, y: 150 })).toEqual(["g1"]); // just outside the right edge, still near
    expect(run(NEW, zones, { x: 400, y: 150 })).toEqual([]); // far away: over the preview pane
    expect(run(NEW, zones, { x: 50, y: 600 })).toEqual([]); // far below
  });

  it("does nothing without pointer coordinates", () => {
    expect(run(NEW, [gap("g", rect(0, 0, 100, 18))], null)).toEqual([]);
    expect(run(ROW, [gap("g", rect(0, 0, 100, 18))], null)).toEqual([]);
  });

  it("never offers a split zone to a row drag", () => {
    expect(run(ROW, [edge("e", rect(0, 0, 20, 100))], { x: 5, y: 5 })).toEqual([]);
  });
});
