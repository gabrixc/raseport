import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { channelName, isToMain, popoutUrl, POPOUT_NAME, SID_KEY, type ToMain, type ToViewer } from "./protocol.ts";

export interface Popout {
  /** is the preview window open (and talking to us)? */
  open: boolean;
  /** open (or reuse) the window; false when the browser blocked the pop-up. Must run inside a click. */
  openWindow: () => boolean;
  focusWindow: () => void;
  closeWindow: () => void;
  post: (message: ToViewer) => void;
}

/** A pairing id that survives a reload, so the preview window keeps working when the editor is refreshed. */
function pairingId(): string {
  try {
    const saved = sessionStorage.getItem(SID_KEY);
    if (saved) return saved;
    const fresh = crypto.randomUUID();
    sessionStorage.setItem(SID_KEY, fresh);
    return fresh;
  } catch {
    return crypto.randomUUID();
  }
}

/**
 * The editor's side of the preview window. The editor stays the single source of truth: it posts the PDF and
 * the data to the window, and the window can only ask for things (render, refresh, jump to a problem).
 */
export function usePopout(onMessage: (m: ToMain) => void): Popout {
  const sid = useMemo(pairingId, []);
  const win = useRef<Window | null>(null);
  const channel = useRef<BroadcastChannel | null>(null);
  const [open, setOpen] = useState(false);
  const handler = useRef(onMessage);
  handler.current = onMessage;

  useEffect(() => {
    const ch = new BroadcastChannel(channelName(sid));
    channel.current = ch;
    ch.onmessage = (e: MessageEvent) => {
      if (!isToMain(e.data)) return;
      if (e.data.t === "hello") setOpen(true); // also restores the state after the editor was reloaded
      if (e.data.t === "closed") {
        win.current = null;
        setOpen(false);
      }
      handler.current(e.data);
    };
    const bye = () => ch.postMessage({ t: "mainClosed" } satisfies ToViewer);
    window.addEventListener("pagehide", bye);
    return () => {
      window.removeEventListener("pagehide", bye);
      ch.close();
      channel.current = null;
    };
  }, [sid]);

  // The window can vanish without saying so (a crash, a forced close): notice it.
  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => {
      if (win.current?.closed) {
        win.current = null;
        setOpen(false);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [open]);

  const post = useCallback((m: ToViewer) => channel.current?.postMessage(m), []);

  const openWindow = useCallback(() => {
    // Reusing the same window name means a second click re-uses the window instead of opening another.
    const w = window.open(popoutUrl(sid), POPOUT_NAME, "popup,width=1100,height=900");
    if (!w) return false;
    win.current = w;
    setOpen(true);
    return true;
  }, [sid]);

  const focusWindow = useCallback(() => win.current?.focus(), []);

  const closeWindow = useCallback(() => {
    post({ t: "close" });
    win.current?.close();
    win.current = null;
    setOpen(false);
  }, [post]);

  return { open, openWindow, focusWindow, closeWindow, post };
}
