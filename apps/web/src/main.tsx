import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { PopoutViewer } from "./preview/PopoutViewer.tsx";
import { readPopout } from "./preview/protocol.ts";
import { ThemeProvider } from "./ThemeProvider.tsx";
import "./styles.css";

const popout = readPopout();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      {popout ? <PopoutViewer sid={popout.sid} /> : <App />}
    </ThemeProvider>
  </StrictMode>,
);
