// Réglages > Allées et Réglages > Mes articles (feuille de route § 6.1).
//
// Allées : appui long pour réordonner (l'ordre est celui des listes), renommer,
// ajouter, supprimer — les articles d'une allée supprimée retombent dans
// « Autre », qui reste toujours en dernier.
// Mes articles : la mémoire du foyer — corriger un nom, changer l'allée,
// supprimer un article mémorisé par erreur.

import { store, put, patch, remove } from "./store.js";
import { T } from "./textes.js";
import { icon } from "./icons.js";
import { esc, toast, openSheet, closeSheet } from "./ui.js";
import { normaliser, nomPropre } from "./noms.js";
import { isDragging } from "./glisser.js";

const rg = { view: null, q: "", editId: null };   // view : null | 'allees' | 'articles'
let onChange = () => {};                            // app.js : redessiner l'écran

export function configureReglages(opts) { onChange = opts.onChange; }
export const reglagesSubview = () => rg.view;
export function closeReglagesSubview() { rg.view = null; rg.q = ""; }

const fr = new Intl.Collator("fr-CA", { sensitivity: "base", numeric: true });
const autre = () => store.data.aisles.find((a) => a.key === "autre") || null;
const aislesSorted = () => [...store.data.aisles].sort((a, b) => a.position - b.position || fr.compare(a.name, b.name));
const aisleName = (id) => (store.data.aisles.find((a) => a.id === id) || autre())?.name || T.autre;
const countIn = (aisleId) => store.data.household_items.filter((h) => (h.aisle_id || autre()?.id) === aisleId).length;

/** Les deux entrées affichées dans l'écran principal des Réglages. */
export function reglagesNavHtml() {
  return `
    <section class="card nav-card">
      <button class="nav-row" data-rg="open" data-view="allees">
        <span class="grow">${T.allees}</span><span class="muted">${store.data.aisles.length}</span>${icon("suivant")}
      </button>
      <button class="nav-row" data-rg="open" data-view="articles">
        <span class="grow">${T.mesArticles}</span><span class="muted">${store.data.household_items.length}</span>${icon("suivant")}
      </button>
    </section>`;
}

export function renderReglagesSubview(screen) {
  if (isDragging()) return;
  if (rg.view === "allees") { screen.innerHTML = alleesHtml(); return; }
  // Mes articles : on ne reconstruit pas le champ de recherche pendant la frappe.
  if (!screen.querySelector("#rg-articles")) screen.innerHTML = articlesShellHtml();
  refreshArticles();
}

const headHtml = (titre) => `
  <header class="list-head">
    <button class="icon-btn" data-rg="back" aria-label="${T.onglets.reglages}">${icon("retour")}</button>
    <h1>${titre}</h1>
  </header>`;

// ------------------------------------------------------------------ allées ---
function aisleRowHtml(a, fixed) {
  const n = countIn(a.id);
  return `
    <li class="list-row" data-id="${a.id}">
      <div class="list-open${fixed ? " fixed" : ""}">
        <span class="list-name">${esc(a.name)}</span>
        <span class="list-count">${n ? T.nbArticles(n) : ""}</span>
      </div>
      <button class="icon-btn" data-rg="edit-aisle" data-no-drag data-id="${a.id}" aria-label="${T.modifierAllee}">${icon("points")}</button>
    </li>`;
}

function alleesHtml() {
  const a = autre();
  const others = aislesSorted().filter((x) => x.id !== a?.id);
  return `
    ${headHtml(T.allees)}
    <p class="help">${T.aideAllees}</p>
    <ul class="lists" id="rg-aisles" data-reorder>${others.map((x) => aisleRowHtml(x)).join("")}</ul>
    ${a ? `<ul class="lists">${aisleRowHtml(a, true)}</ul>` : ""}
    <button class="btn btn-primary btn-block" data-rg="new-aisle">${icon("plus")} ${T.ajouterAllee}</button>`;
}

function openAisleForm(id) {
  const a = id ? store.data.aisles.find((x) => x.id === id) : null;
  rg.editId = a?.id || null;
  openSheet(`
    <h2>${a ? T.modifierAllee : T.ajouterAllee}</h2>
    <form id="aisle-form" class="form-sheet">
      <div class="field">
        <label class="label" for="af-name">${T.nomAllee}</label>
        <input type="text" id="af-name" value="${esc(a?.name || "")}" autocomplete="off" maxlength="40" enterkeyhint="done">
      </div>
      <button type="submit" class="btn btn-primary btn-block">${T.enregistrer}</button>
    </form>
    ${a && a.key !== "autre" ? `<button class="btn btn-block btn-danger" data-rg="delete-aisle">${icon("corbeille")} ${T.supprimerAllee}</button>` : ""}`);
  if (!a) setTimeout(() => document.getElementById("af-name")?.focus(), 300);
}

function saveAisle() {
  const name = document.getElementById("af-name").value.replace(/\s+/g, " ").trim();
  if (!name) { toast(T.entreNomAllee, { type: "alerte" }); return; }
  if (rg.editId) {
    const a = store.data.aisles.find((x) => x.id === rg.editId);
    if (a && a.name !== name) patch("aisles", a.id, { name });
  } else {
    // Juste avant « Autre », qui reste toujours en dernier.
    const last = Math.max(0, ...store.data.aisles.filter((x) => x.key !== "autre").map((x) => x.position || 0));
    put("aisles", { key: null, name, position: last + 10, color_key: null, deleted_at: null });
  }
  closeSheet();
  onChange();
}

function deleteAisle() {
  const a = store.data.aisles.find((x) => x.id === rg.editId);
  const dest = autre();
  if (!a || a.key === "autre" || !dest) return;
  const n = countIn(a.id);
  if (!confirm(T.confirmerSupprimerAllee(a.name, n))) return;
  store.data.household_items.filter((h) => h.aisle_id === a.id)
    .forEach((h) => patch("household_items", h.id, { aisle_id: dest.id }));
  remove("aisles", a.id);
  closeSheet();
  onChange();
}

document.addEventListener("reorder", (e) => {
  if (e.target.id !== "rg-aisles") return;
  (e.detail.ids || []).forEach((id, idx) => {
    const a = store.data.aisles.find((x) => x.id === id);
    if (a && a.position !== (idx + 1) * 10) patch("aisles", id, { position: (idx + 1) * 10 });
  });
  onChange();
});

// ------------------------------------------------------------ mes articles ---
function articlesShellHtml() {
  return `
    ${headHtml(T.mesArticles)}
    <input type="text" id="rg-q" value="${esc(rg.q)}" placeholder="${T.chercherArticle}" aria-label="${T.chercherArticle}"
      autocomplete="off" autocorrect="off" enterkeyhint="search">
    <div id="rg-articles"></div>`;
}

function refreshArticles() {
  const box = document.getElementById("rg-articles");
  if (!box) return;
  const q = normaliser(rg.q);
  const items = store.data.household_items
    .filter((h) => !q || h.name_normalized.includes(q))
    .sort((a, b) => fr.compare(a.name, b.name));
  box.innerHTML = items.length ? `
    <ul class="card rows">
      ${items.map((h) => `
        <li><button class="row row-btn" data-rg="edit-item" data-id="${h.id}">
          <span class="row-main">${esc(h.name)}</span><span class="muted">${esc(aisleName(h.aisle_id))}</span>
        </button></li>`).join("")}
    </ul>` : `<div class="empty"><p>${store.data.household_items.length ? T.aucunResultat : T.aucunArticle}</p></div>`;
}

function openItemForm(id) {
  const h = store.data.household_items.find((x) => x.id === id);
  if (!h) return;
  rg.editId = id;
  const current = h.aisle_id || autre()?.id;
  openSheet(`
    <h2>${esc(h.name)}</h2>
    <form id="item-form" class="form-sheet">
      <div class="field">
        <label class="label" for="if-name">${T.nomArticle}</label>
        <div class="inline">
          <input type="text" id="if-name" value="${esc(h.name)}" autocomplete="off" maxlength="60" enterkeyhint="done">
          <button type="submit" class="btn">${T.enregistrer}</button>
        </div>
      </div>
    </form>
    <div class="label">${T.allee}</div>
    <div class="aisle-choices">
      ${aislesSorted().map((a) => `
        <button class="menu-item" data-rg="item-aisle" data-id="${a.id}" aria-pressed="${a.id === current}">
          <span class="grow">${esc(a.name)}</span>${a.id === current ? icon("crochet") : ""}
        </button>`).join("")}
    </div>
    <button class="btn btn-block btn-danger" data-rg="delete-item">${icon("corbeille")} ${T.oublierArticle}</button>`);
}

// Le nom corrigé suit l'article partout : dans la mémoire et sur les lignes de
// liste (où il est recopié pour l'affichage hors ligne).
function saveItemName() {
  const h = store.data.household_items.find((x) => x.id === rg.editId);
  const name = nomPropre(document.getElementById("if-name").value);
  if (!h || !name) { toast(T.entreNomArticle, { type: "alerte" }); return; }
  const norm = normaliser(name);
  if (store.data.household_items.some((x) => x.id !== h.id && x.name_normalized === norm)) {
    toast(T.articleExisteDeja(name), { type: "alerte", ms: 3500 });
    return;
  }
  if (name !== h.name) {
    patch("household_items", h.id, { name, name_normalized: norm });
    store.data.list_items.filter((i) => i.household_item_id === h.id && i.name !== name)
      .forEach((i) => patch("list_items", i.id, { name }));
  }
  closeSheet();
  onChange();
}

// ------------------------------------------------------------- événements ---
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-rg]");
  if (!btn) return;
  switch (btn.dataset.rg) {
    case "open": rg.view = btn.dataset.view; rg.q = ""; onChange(); return;
    case "back": closeReglagesSubview(); onChange(); return;

    case "new-aisle": return openAisleForm(null);
    case "edit-aisle": return openAisleForm(btn.dataset.id);
    case "delete-aisle": return deleteAisle();

    case "edit-item": return openItemForm(btn.dataset.id);
    case "item-aisle":
      patch("household_items", rg.editId, { aisle_id: btn.dataset.id });
      closeSheet(); return onChange();
    case "delete-item":   // sans confirmation : l'article revient dès qu'on le rajoute à une liste
      remove("household_items", rg.editId);
      closeSheet(); return onChange();
  }
});

document.addEventListener("submit", (e) => {
  if (e.target.id === "aisle-form") { e.preventDefault(); saveAisle(); }
  if (e.target.id === "item-form") { e.preventDefault(); saveItemName(); }
});
document.addEventListener("input", (e) => {
  if (e.target.id === "rg-q") { rg.q = e.target.value; refreshArticles(); }
});
