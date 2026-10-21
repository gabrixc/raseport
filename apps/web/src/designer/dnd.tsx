import { pointerWithin, useDraggable, useDroppable, type CollisionDetection } from "@dnd-kit/core";
import type { BlockKind } from "../insert.ts";
import type { Dest } from "./ops.ts";

/** What is being dragged. */
export type DragData = { kind: "new"; type: BlockKind } | { kind: "block"; id: string } | { kind: "row"; id: string };

/** What a drop zone does when something is dropped on it. */
export interface ZoneData {
  dest: Dest;
  /** which kinds of drag may land here */
  accepts: DragData["kind"][];
  /** when zones overlap under the pointer, the highest wins */
  priority: number;
  /** only for gaps: used as the fallback target when the pointer is over no zone */
  gap?: boolean;
}

const PRIORITY = { edge: 3, gap: 2, half: 1 } as const;

/**
 * Pick the drop zone under the pointer. Overlapping zones resolve by priority (edge > gap > block half).
 * Row drags only consider the gaps between rows and snap to the nearest one.
 */
export const collisionDetection: CollisionDetection = (args) => {
  const kind = (args.active.data.current as DragData | undefined)?.kind;
  const zoneOf = (id: unknown) => args.droppableContainers.find((c) => c.id === id)?.data.current as ZoneData | undefined;
  const accepting = args.droppableContainers.filter((c) => (c.data.current as ZoneData | undefined)?.accepts.includes(kind as DragData["kind"]));
  const gaps = accepting.filter((c) => (c.data.current as ZoneData).gap);

  if (kind === "row") return nearestToPointer(args, gaps);

  const within = pointerWithin({ ...args, droppableContainers: accepting }).sort((a, b) => (zoneOf(b.id)?.priority ?? 0) - (zoneOf(a.id)?.priority ?? 0));
  if (within.length) return [within[0]!];
  // Released near the page but not on a zone: use the nearest gap. Released anywhere else (over the
  // inspector, the preview, outside the window): do nothing, so a stray drop never changes the report.
  return nearPage(args, gaps) ? nearestToPointer(args, gaps) : [];
};

const NEAR = 16;

type Args = Parameters<CollisionDetection>[0];

/**
 * The zone closest to the *pointer* (not to the dragged element, whose size would otherwise decide).
 * Distance is measured to the middle of the zone, weighting vertical distance more than horizontal.
 */
function nearestToPointer(args: Args, containers: Args["droppableContainers"]): ReturnType<CollisionDetection> {
  const pt = args.pointerCoordinates;
  if (!pt) return [];
  let best: { id: string | number; value: number } | null = null;
  for (const c of containers) {
    const r = args.droppableRects.get(c.id);
    if (!r) continue;
    const dx = pt.x - (r.left + r.width / 2);
    const dy = pt.y - (r.top + r.height / 2);
    const value = dy * dy * 4 + dx * dx; // rows stack vertically, so vertical distance matters most
    if (!best || value < best.value) best = { id: c.id, value };
  }
  return best ? [{ id: best.id, data: { droppableContainer: containers.find((c) => c.id === best!.id), value: best.value } }] : [];
}

/** Is the pointer inside (or within NEAR px of) the area the gap zones span, i.e. the page? */
function nearPage(args: Args, gaps: Args["droppableContainers"]): boolean {
  const pt = args.pointerCoordinates;
  const rects = gaps.map((g) => args.droppableRects.get(g.id)).filter((r): r is NonNullable<typeof r> => !!r);
  if (!pt || rects.length === 0) return false;
  const left = Math.min(...rects.map((r) => r.left));
  const right = Math.max(...rects.map((r) => r.right));
  const top = Math.min(...rects.map((r) => r.top));
  const bottom = Math.max(...rects.map((r) => r.bottom));
  return pt.x >= left - NEAR && pt.x <= right + NEAR && pt.y >= top - NEAR && pt.y <= bottom + NEAR;
}

type ZoneProps = { id: string; dest: Dest; accepts?: DragData["kind"][]; className: string; gap?: boolean; priority: keyof typeof PRIORITY; children?: React.ReactNode };

/** An invisible target laid over the canvas; it only shows itself while a drag hovers it. */
export function Zone({ id, dest, accepts = ["new", "block", "row"], className, gap, priority, children }: ZoneProps) {
  const data: ZoneData = { dest, accepts, priority: PRIORITY[priority], ...(gap ? { gap } : {}) };
  const { setNodeRef, isOver } = useDroppable({ id, data });
  return (
    <div ref={setNodeRef} className={`d-zone ${className}`} data-over={isOver} aria-hidden="true">
      {children}
    </div>
  );
}

export function useDragSource(id: string, data: DragData) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id, data });
  return { attributes, listeners, setNodeRef, isDragging };
}

export const gapId = (section: string, index: number) => `gap:${section}:${index}`;
