import React from "react";
import ReactDOM from "react-dom/client";
import { vani } from "./lib/vani.js";
import "./styles/globals.css";

window.vani = vani;

const params = new URLSearchParams(window.location.search);
const windowType = params.get("window") || "dashboard";

async function bootstrap() {
  let Component;
  if (windowType === "overlay") {
    const { default: Overlay } = await import("./Overlay.jsx");
    Component = Overlay;
  } else {
    const { default: App } = await import("./App.jsx");
    Component = App;
  }

  ReactDOM.createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <Component />
    </React.StrictMode>
  );
}

bootstrap().catch((err) => {
  document.body.style.background = "#1a0010";
  document.body.style.color = "#f472b6";
  document.body.style.padding = "2rem";
  document.body.style.fontFamily = "monospace";
  document.body.style.fontSize = "14px";
  document.body.innerHTML = `<h2>VANI bootstrap error</h2><pre>${err?.stack || err}</pre>`;
});
