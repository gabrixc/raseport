import { findNodeAtLocation, findNodeAtOffset, getLocation, parseTree, type JSONPath, type Node } from "jsonc-parser";

export interface ColumnSuggestion {
  path: string;
  type: string;
  example?: unknown;
}

export interface DatasetColumns {
  id: string;
  columns: ColumnSuggestion[];
}

export interface Suggestion {
  label: string;
  detail?: string;
  documentation?: string;
}

export interface Suggestions {
  items: Suggestion[];
  /** character range inside the string literal that a chosen item replaces */
  from: number;
  to: number;
}

const FIELD_KEYS = new Set(["field", "x", "groupBy"]);

const strings = (node: Node | undefined, key: string): string[] =>
  (node?.children ?? []).flatMap((el) => {
    const v = el.children?.find((p) => p.children?.[0]?.value === key)?.children?.[1]?.value;
    return typeof v === "string" ? [v] : [];
  });

const arrayAt = (root: Node, key: string) => findNodeAtLocation(root, [key]);

/** The dataset a `field` / `x` / `groupBy` belongs to: the nearest enclosing object with a `dataset` key. */
function datasetOf(root: Node, path: JSONPath): string | undefined {
  for (let n = path.length - 1; n >= 0; n--) {
    const node = n === 0 ? root : findNodeAtLocation(root, path.slice(0, n));
    if (node?.type !== "object") continue;
    const v = node.children?.find((p) => p.children?.[0]?.value === "dataset")?.children?.[1]?.value;
    if (typeof v === "string") return v;
  }
  return undefined;
}

/** Columns the author declared on the dataset itself (used when no live data is loaded). */
function declaredColumns(root: Node, dataset: string): ColumnSuggestion[] {
  const list = arrayAt(root, "datasets");
  const ds = list?.children?.find((d) => d.children?.some((p) => p.children?.[0]?.value === "id" && p.children[1]?.value === dataset));
  const cols = ds?.children?.find((p) => p.children?.[0]?.value === "columns")?.children?.[1];
  return (cols?.children ?? []).flatMap((p) => {
    const name = p.children?.[0]?.value;
    const type = p.children?.[1]?.value;
    return typeof name === "string" ? [{ path: name, type: typeof type === "string" ? type : "text" }] : [];
  });
}

/** What can be completed at `offset`, or null when the cursor is not in a completable string value. */
export function suggestAt(text: string, offset: number, datasets: DatasetColumns[]): Suggestions | null {
  const loc = getLocation(text, offset);
  const key = loc.path.at(-1);
  if (loc.isAtPropertyKey || typeof key !== "string") return null;

  const root = parseTree(text);
  const node = root && findNodeAtOffset(root, offset, true);
  if (!root || !node || node.type !== "string") return null;
  const range = { from: node.offset + 1, to: node.offset + node.length - 1 };

  if (FIELD_KEYS.has(key)) {
    const id = datasetOf(root, loc.path);
    if (!id) return null;
    const live = datasets.find((d) => d.id === id)?.columns;
    const columns = live?.length ? live : declaredColumns(root, id);
    if (!columns.length) return null;
    return {
      ...range,
      items: columns.map((c) => ({
        label: c.path,
        detail: c.type,
        ...(c.example !== undefined && c.example !== null ? { documentation: `e.g. ${typeof c.example === "object" ? JSON.stringify(c.example) : String(c.example)}` } : {}),
      })),
    };
  }
  if (key === "dataset") {
    const ids = strings(arrayAt(root, "datasets"), "id");
    return ids.length ? { ...range, items: ids.map((label) => ({ label, detail: "dataset" })) } : null;
  }
  if (key === "$param") {
    const names = strings(arrayAt(root, "params"), "name");
    return names.length ? { ...range, items: names.map((label) => ({ label, detail: "param" })) } : null;
  }
  return null;
}
