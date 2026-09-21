// Glisser-déposer par appui long, partagé par les listes et les allées.
//
//   <ul data-reorder> <li data-id="…">…</li> … </ul>
//
// Garder le doigt ~½ s sur une rangée la « décroche » ; elle suit le doigt et
// les voisines lui font place. Au relâchement, le conteneur reçoit l'événement
// « reorder » avec detail.ids (le nouvel ordre). Un élément marqué data-no-drag
// (bouton d'options) ne déclenche pas le geste.

const LONG_PRESS_MS = 450;
let drag = null;
let justDragged = false;   // le « click » qui suit un déplacement ne doit rien ouvrir

export const isDragging = () => !!drag?.active;

function end() {
  if (drag) clearTimeout(drag.timer);
  drag = null;
}

document.addEventListener("pointerdown", (e) => {
  justDragged = false;
  end();
  const row = e.target.closest("[data-reorder] > [data-id]");
  if (!row || e.target.closest("[data-no-drag]") || row.parentElement.children.length < 2) return;
  drag = { row, box: row.parentElement, x: e.clientX, y: e.clientY, originY: e.clientY, active: false };
  drag.timer = setTimeout(() => {
    drag.active = true;
    row.classList.add("dragging");
    navigator.vibrate?.(10);
  }, LONG_PRESS_MS);
});

document.addEventListener("pointermove", (e) => {
  if (!drag) return;
  // avant l'appui long, bouger annule (c'est un défilement) ; après, la rangée suit le doigt
  if (!drag.active) { if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 10) end(); return; }
  const row = drag.row;
  const follow = () => { row.style.transform = `translateY(${e.clientY - drag.originY}px)`; };
  const swapWith = (sibling, place) => {
    row.style.transform = "";
    const before = row.offsetTop;
    place(sibling);
    drag.originY += row.offsetTop - before;   // la rangée a changé de case
    follow();
  };
  follow();
  const r = row.getBoundingClientRect();
  const center = r.top + r.height / 2;
  const next = row.nextElementSibling, prev = row.previousElementSibling;
  if (next && center > next.getBoundingClientRect().top + next.offsetHeight / 2) swapWith(next, (s) => s.after(row));
  else if (prev && center < prev.getBoundingClientRect().top + prev.offsetHeight / 2) swapWith(prev, (s) => s.before(row));
});

function finish(cancelled) {
  if (!drag) return;
  const d = drag;
  end();
  if (!d.active) return;
  justDragged = true;
  d.row.classList.remove("dragging");
  d.row.style.transform = "";
  const ids = cancelled ? null : [...d.box.children].map((c) => c.dataset.id);
  d.box.dispatchEvent(new CustomEvent("reorder", { bubbles: true, detail: { ids } }));
}
document.addEventListener("pointerup", () => finish(false));
document.addEventListener("pointercancel", () => finish(true));

document.addEventListener("click", (e) => {
  if (!justDragged) return;
  justDragged = false;
  e.stopPropagation();
  e.preventDefault();
}, true);

// Pendant un déplacement, l'écran ne doit pas défiler sous le doigt.
document.addEventListener("touchmove", (e) => { if (drag?.active) e.preventDefault(); }, { passive: false });
document.addEventListener("contextmenu", (e) => { if (e.target.closest("[data-reorder]")) e.preventDefault(); });
