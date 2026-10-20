import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { parsePreference, readPreference, resolveTheme, THEME_KEY, writePreference } from "./theme.ts";

describe("parsePreference", () => {
  it("accepts the three values and falls back to system for anything else", () => {
    for (const v of ["light", "dark", "system"] as const) expect(parsePreference(v)).toBe(v);
    for (const v of [null, undefined, "", "Dark", "auto", 1]) expect(parsePreference(v)).toBe("system");
  });
});

describe("resolveTheme", () => {
  it("follows the OS only for system", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
});

describe("storage", () => {
  afterEach(() => vi.unstubAllGlobals());

  const fakeStorage = (initial: Record<string, string> = {}) => {
    const data = { ...initial };
    return { data, getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v) };
  };

  it("round-trips a preference", () => {
    const storage = fakeStorage();
    vi.stubGlobal("localStorage", storage);
    writePreference("dark");
    expect(storage.data[THEME_KEY]).toBe("dark");
    expect(readPreference()).toBe("dark");
  });

  it("ignores a corrupt stored value", () => {
    vi.stubGlobal("localStorage", fakeStorage({ [THEME_KEY]: "purple" }));
    expect(readPreference()).toBe("system");
  });

  it("does not throw when storage is blocked", () => {
    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    vi.stubGlobal("localStorage", blocked);
    expect(readPreference()).toBe("system");
    expect(() => writePreference("light")).not.toThrow();
  });
});
