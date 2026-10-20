import { findNodeAtLocation, parseTree, type Node } from "jsonc-parser";
import type { Problem } from "./problems.ts";

export interface Target {
  offset: number;
  length: number;
}

const target = (n: Node): Target => ({ offset: n.offset, length: n.length });

/** For objects, point at their `id` (more useful than a lone brace); otherwise at the node itself. */
function label(node: Node): Target {
  if (node.type === "object") {
    const id = node.children?.find((p) => p.children?.[0]?.value === "id")?.children?.[1];
    if (id) return target(id);
    return { offset: node.offset, length: 1 };
  }
  if (node.type === "array") return { offset: node.offset, length: 1 };
  return target(node);
}

/** Position of a JSON path; a path that does not exist (a missing key) resolves to its nearest parent. */
export function locatePath(text: string, path: (string | number)[]): Target | null {
  const root = parseTree(text);
  if (!root) return null;
  for (let n = path.length; n >= 0; n--) {
    const node = n === 0 ? root : findNodeAtLocation(root, path.slice(0, n));
    if (node) return label(node);
  }
  return null;
}

/** First node (object) whose `id` is the given value. */
export function locateId(text: string, id: string): Target | null {
  const root = parseTree(text);
  if (!root) return null;
  const stack: Node[] = [root];
  while (stack.length) {
    const node = stack.shift()!;
    if (node.type === "object") {
      const value = node.children?.find((p) => p.children?.[0]?.value === "id")?.children?.[1];
      if (value?.value === id) return target(value);
    }
    stack.push(...(node.children ?? []));
  }
  return null;
}

export function locateProblem(text: string, p: Problem): Target | null {
  if (p.offset !== undefined) return { offset: Math.min(p.offset, Math.max(0, text.length - 1)), length: 1 };
  if (p.nodeId) {
    const t = locateId(text, p.nodeId);
    if (t) return t;
  }
  if (p.path) return locatePath(text, p.path);
  return null;
}
