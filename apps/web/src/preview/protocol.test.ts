import { describe, expect, it } from "vite-plus/test";
import { channelName, isToMain, isToViewer, popoutUrl, readPopout } from "./protocol.ts";

describe("pop-out url", () => {
  it("round-trips the pairing id and drops the rest of the query", () => {
    const url = popoutUrl("abc12345-xyz", "http://localhost:5173/some/path?x=1#h");
    expect(url).toBe("http://localhost:5173/some/path?popout=preview&sid=abc12345-xyz");
    expect(readPopout(new URL(url).search)).toEqual({ sid: "abc12345-xyz" });
  });

  it("is only the preview window with both parts present and a sane id", () => {
    expect(readPopout("")).toBeNull();
    expect(readPopout("?popout=preview")).toBeNull();
    expect(readPopout("?sid=abc12345")).toBeNull();
    expect(readPopout("?popout=other&sid=abc12345")).toBeNull();
    expect(readPopout("?popout=preview&sid=../evil")).toBeNull();
    expect(readPopout("?popout=preview&sid=short")).toBeNull();
  });

  it("names the channel after the pairing id so two editors never cross-talk", () => {
    expect(channelName("a")).not.toBe(channelName("b"));
  });
});

describe("message guards", () => {
  it("accepts well-formed messages", () => {
    for (const m of [{ t: "hello" }, { t: "render" }, { t: "refreshData" }, { t: "closed" }, { t: "jump", problem: { message: "x" } }]) expect(isToMain(m)).toBe(true);
    for (const m of [{ t: "mainClosed" }, { t: "close" }, { t: "state", state: {} }, { t: "data", data: {} }]) expect(isToViewer(m)).toBe(true);
  });

  it("rejects anything else", () => {
    for (const m of [null, undefined, 3, "hello", {}, { t: "nope" }, { t: "jump" }, { t: "jump", problem: 1 }, { t: "state" }]) {
      expect(isToMain(m)).toBe(false);
      expect(isToViewer(m)).toBe(false);
    }
  });
});
