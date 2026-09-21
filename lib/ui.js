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

let opening = 0;   // ouverture en attente de la prochaine image

export function openSheet(html) {
  const scrim = ensureScrim();
  document.activeElement?.blur();
  document.getElementById("sheet").innerHTML = `<div class="grab"></div>${html}`;
  cancelAnimationFrame(opening);
  opening = requestAnimationFrame(() => scrim.classList.add("open"));
}

export function closeSheet() {
  cancelAnimationFrame(opening);
  const scrim = document.getElementById("scrim");
  if (!scrim) return;
  scrim.classList.remove("open");
  if (document.activeElement && scrim.contains(document.activeElement)) document.activeElement.blur();
}

export const sheetIsOpen = () => !!document.getElementById("scrim")?.classList.contains("open");

// ------------------------------------------------------- fenêtre et clavier ---
// La page elle-même ne défile jamais : l'app occupe exactement la fenêtre
// VISIBLE (visualViewport), et seul l'écran du milieu défile. Sur iOS, le
// clavier ne rétrécit pas la page, il la recouvre : en calant l'app sur la
// fenêtre visible, la boîte d'ajout se retrouve posée sur le clavier, et rien
// ne « flotte » quand on tire la liste au bout de sa course.
// Clavier ouvert (ou champ d'ajout actif) : body.clavier cache la barre d'onglets.
export function initViewport() {
  const vv = window.visualViewport;
  const root = document.documentElement;
  let maxH = 0;
  const sync = () => {
    const h = vv ? vv.height : window.innerHeight;
    maxH = Math.max(maxH, h);
    const clavier = maxH - h > 120;
    // Le décalage ne compte que clavier ouvert (iOS remonte alors la fenêtre
    // visible). Clavier fermé, le suivre ferait bouger toute l'app à contresens
    // pendant le rebond du défilement.
    root.style.setProperty("--vv-h", `${h}px`);
    root.style.setProperty("--vv-top", `${clavier && vv ? Math.max(0, vv.offsetTop) : 0}px`);
    const champActif = document.activeElement?.id === "ep-champ";
    document.body.classList.toggle("clavier", champActif || clavier);
  };
  if (vv) { vv.addEventListener("resize", sync); vv.addEventListener("scroll", sync); }
  // La fenêtre elle-même change de taille (ordinateur, rotation, Android qui
  // rétrécit la page sous le clavier) : on repart d'une nouvelle référence.
  window.addEventListener("resize", () => { maxH = 0; sync(); });
  window.addEventListener("orientationchange", () => { maxH = 0; setTimeout(sync, 300); });
  document.addEventListener("focusin", sync);
  document.addEventListener("focusout", () => setTimeout(sync, 50));
  sync();
}
