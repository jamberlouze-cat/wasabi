// Petits outils d'interface partagés : échappement, toasts, feuilles du bas.
// (Repris de Calico.)

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

// type : 'ok' | 'alerte' | 'erreur' (liseré de la charte)
export function toast(msg, { type = "ok", ms = 2200 } = {}) {
  let t = document.querySelector(".toast");
  if (!t) { t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
  t.textContent = msg;
  t.dataset.type = type;
  requestAnimationFrame(() => t.classList.add("show"));
  clearTimeout(t._to);
  t._to = setTimeout(() => t.classList.remove("show"), ms);
}

// ----------------------------------------------------------------- feuilles ---
function ensureScrim() {
  let scrim = document.getElementById("scrim");
  if (!scrim) {
    scrim = document.createElement("div");
    scrim.id = "scrim"; scrim.className = "scrim";
    scrim.innerHTML = `<div class="sheet" id="sheet" role="dialog" aria-modal="true"></div>`;
    scrim.addEventListener("click", (e) => { if (e.target === scrim) closeSheet(); });
    document.body.appendChild(scrim);
  }
  return scrim;
}

// Position de défilement de la page au moment d'ouvrir la feuille. Sur iOS,
// le clavier fait défiler la page derrière la feuille et ne la remet pas en
// place : on la restaure nous-mêmes.
let sheetScrollY = 0;

export function openSheet(html) {
  const scrim = ensureScrim();
  if (!scrim.classList.contains("open")) sheetScrollY = window.scrollY;
  document.activeElement?.blur();
  document.getElementById("sheet").innerHTML = `<div class="grab"></div>${html}`;
  requestAnimationFrame(() => scrim.classList.add("open"));
}

export function closeSheet() {
  const scrim = document.getElementById("scrim");
  if (!scrim?.classList.contains("open")) return;
  scrim.classList.remove("open");
  // Ranger le clavier, puis revenir où on était : tout de suite, et encore une
  // fois quand l'animation du clavier iOS est terminée.
  if (document.activeElement && scrim.contains(document.activeElement)) document.activeElement.blur();
  const restore = () => window.scrollTo(0, sheetScrollY);
  restore();
  setTimeout(restore, 350);
}

export const sheetIsOpen = () => !!document.getElementById("scrim")?.classList.contains("open");
