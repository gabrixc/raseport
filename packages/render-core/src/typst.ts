/** Escape a JS string as a Typst string literal. Data never enters Typst as markup or code. */
export function str(s: string): string {
  let out = '"';
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (ch === "\\") out += "\\\\";
    else if (ch === '"') out += '\\"';
    else if (ch === "\n") out += "\\n";
    else if (ch === "\r") out += "\\r";
    else if (ch === "\t") out += "\\t";
    else if (c < 0x20 || c === 0x7f) out += `\\u{${c.toString(16)}}`;
    else out += ch;
  }
  return out + '"';
}

const LENGTH = /^-?\d+(\.\d+)?(pt|mm|cm|in|em)$/;
/** Lengths come from definitions; only plain Typst lengths are allowed through. */
export function length(s: string): string {
  if (!LENGTH.test(s)) throw new Error(`Invalid length "${s}"`);
  return s;
}

const COLOR = /^#[0-9a-fA-F]{6}$/;
export function color(s: string): string {
  if (!COLOR.test(s)) throw new Error(`Invalid color "${s}"`);
  return `rgb(${str(s)})`;
}

/** Font family names are quoted strings, so they cannot inject code. */
export const font = str;
