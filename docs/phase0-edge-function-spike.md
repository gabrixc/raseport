# Phase 0 spike: Typst WASM in a Supabase Edge Function

Setup: `@myriaddreamin/typst.ts` 0.7.0 + `typst-ts-web-compiler` WASM (28.3 MB raw, 10.8 MB gzip),
Liberation Sans fonts, local Supabase edge runtime 1.77.4 (Deno 2.1.4). A4 table, 4 columns, one nested (jsonb-style) field.
Code: `supabase/functions/render/`.

| Rows | Compile (warm isolate) | Result |
|-----:|-----------------------:|--------|
| 50   | ~0.37 s | ok |
| 200  | ~0.30 s | ok |
| 500  | ~0.23 s | ok |
| 1000 | ~0.57 s | ok |
| 2000 | ~1.7-1.9 s | borderline: the first request after a cold start (init + compile) hit the CPU limit (HTTP 546), and so did some warm runs |
| 2000, split into 200-500-row tables | >2 s | worse, chunking does not help |

Findings
- Works functionally: valid PDF, fonts loaded from bundled files, data read via `json()`.
- Compiler format must be the numeric enum `1` (PDF). The string `"pdf"` silently returns the vector artifact.
- The Edge Function CPU limit (~2 s locally) leaves no headroom at the 2000-row target, and real reports (more columns, charts) will cost more.
- Not verified: the hosted bundle-size limit (documented as 20 MB; the WASM alone is 28 MB raw) and hosted CPU/memory behaviour.

Conclusion: Edge Function rendering is fine for small reports (up to roughly 800 rows) but not for the 1-2k row target.
