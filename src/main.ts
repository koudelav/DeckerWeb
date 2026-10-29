import "./ui/style.css";
import { createApp } from "./ui/app";

const app = createApp();
app.render();

// Jen ve vývojovém režimu: přístup ke stavu z konzole a z testů UI.
if (import.meta.env.DEV) (window as unknown as { __app: unknown }).__app = app;
