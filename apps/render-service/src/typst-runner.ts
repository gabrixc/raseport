import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface RunnerOptions {
  bin: string;
  fontDir: string;
  timeoutMs: number;
  maxConcurrent: number;
}

export class TypstError extends Error {}

export function createRunner(opts: RunnerOptions) {
  let active = 0;
  const waiting: (() => void)[] = [];
  const acquire = async () => {
    if (active >= opts.maxConcurrent) await new Promise<void>((r) => waiting.push(r));
    active++;
  };
  const release = () => {
    active--;
    waiting.shift()?.();
  };

  return async function compile(source: string): Promise<Buffer> {
    await acquire();
    const dir = await mkdtemp(join(tmpdir(), "report-"));
    try {
      await writeFile(join(dir, "main.typ"), source);
      await new Promise<void>((resolve, reject) => {
        const child = spawn(
          opts.bin,
          ["compile", "--root", dir, "--ignore-system-fonts", "--font-path", opts.fontDir, join(dir, "main.typ"), join(dir, "out.pdf")],
          { env: { PATH: process.env.PATH ?? "", HOME: dir }, stdio: ["ignore", "ignore", "pipe"] },
        );
        let stderr = "";
        child.stderr.on("data", (d) => (stderr += d));
        const timer = setTimeout(() => {
          child.kill("SIGKILL");
          reject(new TypstError("Typst timed out"));
        }, opts.timeoutMs);
        child.on("error", reject);
        child.on("close", (code) => {
          clearTimeout(timer);
          code === 0 ? resolve() : reject(new TypstError(stderr.slice(0, 4000) || `typst exited ${code}`));
        });
      });
      return await readFile(join(dir, "out.pdf"));
    } finally {
      await rm(dir, { recursive: true, force: true });
      release();
    }
  };
}
