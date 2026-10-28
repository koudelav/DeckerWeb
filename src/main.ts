import "./ui/style.css";
import { image } from "./assets";
import { ORIGINAL_VERSION } from "./core";

// Fáze 0: jen ověření, že build, grafika a styly fungují. Skutečné UI přijde ve fázi 4.
const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <main class="splash">
    <img src="${image("Title")}" alt="Decker" class="pixel" />
    <p>Remaster hry Decker ${ORIGINAL_VERSION.major}.${ORIGINAL_VERSION.minor} – rozpracováno (fáze 0)</p>
    <img src="${image("il_ice")}" alt="" class="pixel sprites" />
    <p class="credit">Původní hra © 2001 Shawn Overcash · GPL v2</p>
  </main>
`;
