import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/editor/editor.worker?worker";
import jsonWorker from "monaco-editor/language/json/json.worker?worker";
import { reportJsonSchema } from "@raseport/schema";
import { suggestAt, type DatasetColumns } from "./suggest.ts";

// Bundle Monaco instead of loading it from a CDN, so the editor works offline.
self.MonacoEnvironment = {
  getWorker: (_id: string, label: string) => (label === "json" ? new jsonWorker() : new editorWorker()),
};
loader.config({ monaco });

monaco.json.jsonDefaults.setDiagnosticsOptions({
  validate: true,
  allowComments: false,
  schemas: [{ uri: "https://raseport.local/report.schema.json", fileMatch: ["*"], schema: reportJsonSchema() }],
});

// Field-path, dataset and param completion, driven by the datasets the Data tab has loaded.
let datasets: DatasetColumns[] = [];
export function setCompletionDatasets(next: DatasetColumns[]): void {
  datasets = next;
}

monaco.languages.registerCompletionItemProvider("json", {
  triggerCharacters: ['"', "."],
  provideCompletionItems(model, position) {
    const found = suggestAt(model.getValue(), model.getOffsetAt(position), datasets);
    if (!found) return { suggestions: [] };
    const a = model.getPositionAt(found.from);
    const b = model.getPositionAt(found.to);
    const range = new monaco.Range(a.lineNumber, a.column, b.lineNumber, b.column);
    return {
      suggestions: found.items.map((item, i) => ({
        label: item.label,
        kind: monaco.languages.CompletionItemKind.Field,
        insertText: item.label,
        range,
        sortText: String(i).padStart(4, "0"),
        ...(item.detail ? { detail: item.detail } : {}),
        ...(item.documentation ? { documentation: item.documentation } : {}),
      })),
    };
  },
});

export { monaco };

// Handy for debugging markers and models from the browser console during development.
if (import.meta.env.DEV) (window as unknown as { monaco: typeof monaco }).monaco = monaco;
