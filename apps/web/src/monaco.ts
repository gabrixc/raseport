import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/editor/editor.worker?worker";
import jsonWorker from "monaco-editor/language/json/json.worker?worker";
import { reportJsonSchema } from "@raseport/schema";

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

export { monaco };

// Handy for debugging markers and models from the browser console during development.
if (import.meta.env.DEV) (window as unknown as { monaco: typeof monaco }).monaco = monaco;
