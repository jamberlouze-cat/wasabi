// Onglet Épicerie : écran des listes, écran d'une liste, boîte d'ajout.
// (Feuille de route § 6.1. Phase 1 : une seule allée, tri par ordre d'ajout.)
//
// Toute écriture passe par lib/store.js : elle réussit tout de suite, même
// hors ligne, et n'envoie que les champs modifiés.

import { store, put, patch, remove } from "./store.js";
import { T } from "./textes.js";
import { icon } from "./icons.js";
import { esc, toast, openSheet, closeSheet } from "./ui.js";
import { normaliser, nomPropre, idStable } from "./noms.js";

const LIST_KEY = "wasabi-liste";
const NB_PUCES = 10;
const NB_COMPLETIONS = 5;
const EMOJIS = ["🛒", "🥦", "🍎", "🥖", "🧀", "🥩", "🐟", "🍷", "☕", "🍕", "🌮", "🧁",
  "🏠", "🧴", "🧹", "💊", "👶", "🐶", "🌿", "🔨", "🏕️", "🎉", "🎁", "❄️"];

const ep = {
  listId: localStorage.getItem(LIST_KEY) || null,   // null = écran des listes
  qty: 1,           // quantité du prochain article ajouté
  draft: null,      // formulaire de liste en cours { id?, name, emoji }
};

// ---------------------------------------------------------------- données ---
const lists = () => [...store.data.grocery_lists]
  .sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at));
const currentList = () => store.data.grocery_lists.find((l) => l.id === ep.listId) || null;
const itemsOf = (listId) => store.data.list_items
  .filter((i) => i.list_id === listId)
  .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
const remaining = (listId) => store.data.list_items.filter((i) => i.list_id === listId && !i.checked).length;
const autreAisle = () => store.data.aisles.find((a) => a.key === "autre") || null;

function openList(id) {
  ep.listId = id;
  ep.qty = 1;
  try { id ? localStorage.setItem(LIST_KEY, id) : localStorage.removeItem(LIST_KEY); } catch { /* rien */ }
}

// ------------------------------------------------------------------ rendu ---
// Appelé par app.js à chaque changement de données. L'écran d'une liste n'est
// jamais reconstruit au complet pendant qu'il est ouvert : le champ d'ajout
// perdrait le focus et le clavier se refermerait.
export function renderEpicerie(screen) {
  if (ep.listId && !currentList()) openList(null);   // liste supprimée (par l'autre, peut-être)

  const root = screen.querySelector("#ep");
  if (ep.listId && root?.dataset.list === ep.listId) { refreshList(); return; }

  screen.innerHTML = ep.listId ? listScreenHtml() : listsScreenHtml();
  if (ep.listId) { refreshList(); placer(); }
  else document.body.classList.remove("clavier");
}

function listsScreenHtml() {
  const all = lists();
  const rows = all.map((l) => {
    const n = remaining(l.id);
    return `
      <li class="list-row">
        <button class="list-open" data-ep="open" data-id="${l.id}">
          <span class="emoji-pill">${esc(l.emoji || "🛒")}</span>
          <span class="list-name">${esc(l.name)}</span>
          <span class="list-count">${n ? T.restants(n) : T.rienARamasser}</span>
        </button>
        <button class="icon-btn" data-ep="edit-list" data-id="${l.id}" aria-label="${T.modifierListe}">${icon("points")}</button>
      </li>`;
  }).join("");
  return `
    <div id="ep" data-list="">
      <header class="screen-head"><h1>${T.onglets.epicerie}</h1></header>
      ${all.length ? `<ul class="lists">${rows}</ul>` : `
        <div class="empty">
          <div class="empty-icon">${icon("panier")}</div>
          <p>${T.aucuneListe}</p>
        </div>`}
      <button class="btn btn-primary btn-block" data-ep="new-list">${icon("plus")} ${T.nouvelleListe}</button>
    </div>`;
}

function listScreenHtml() {
  return `
    <div id="ep" data-list="${ep.listId}">
      <header class="list-head">
        <button class="icon-btn" data-ep="back" aria-label="${T.toutesLesListes}">${icon("retour")}</button>
        <span class="emoji-pill" id="ep-emoji"></span>
        <h1 id="ep-title"></h1>
        <button class="icon-btn" data-ep="list-menu" aria-label="${T.menuListe}">${icon("points")}</button>
      </header>
      <div id="ep-items" class="items"></div>

      <div class="ajout" id="ajout">
        <div class="ajout-in">
          <div id="ep-sugg"></div>
          <form class="ligne" id="ep-form">
            <input type="text" id="ep-champ" placeholder="${T.ajouterUnArticle}" aria-label="${T.ajouterUnArticle}"
              autocomplete="off" autocorrect="off" autocapitalize="sentences" enterkeyhint="done">
            <div class="pas">
              <button type="button" data-ep="qty-dec" aria-label="${T.moins}">−</button>
              <output id="ep-qty">1</output>
              <button type="button" data-ep="qty-inc" aria-label="${T.plus}">+</button>
            </div>
            <button type="submit" class="btn btn-primary btn-icon" aria-label="${T.ajouter}">${icon("haut")}</button>
          </form>
        </div>
      </div>
    </div>`;
}

function itemHtml(i) {
  const right = i.checked
    ? (i.quantity > 1 ? `<span class="item-qte">×${i.quantity}</span>` : "")
    : `<div class="pas">
         <button type="button" data-ep="dec" aria-label="${T.moins}" ${i.quantity <= 1 ? "disabled" : ""}>−</button>
         <output>${i.quantity}</output>
         <button type="button" data-ep="inc" aria-label="${T.plus}">+</button>
       </div>`;
  return `
    <div class="item${i.checked ? " checked" : ""}" data-id="${i.id}">
      <button type="button" class="item-main" data-ep="toggle" aria-pressed="${i.checked}">
        <span class="case">${i.checked ? icon("crochet") : ""}</span>
        <span class="item-name">${esc(i.name)}</span>
      </button>
      ${right}
    </div>`;
}

function refreshList() {
  const list = currentList();
  if (!list) return;
  document.getElementById("ep-emoji").textContent = list.emoji || "🛒";
  document.getElementById("ep-title").textContent = list.name;
  const items = itemsOf(list.id);
  document.getElementById("ep-items").innerHTML = items.length
    ? items.map(itemHtml).join("")
    : `<div class="empty"><div class="empty-icon">${icon("panier")}</div><p>${T.listeVide}</p></div>`;
  refreshAddBox();
}

// ------------------------------------------------------------ boîte d'ajout ---
function refreshAddBox() {
  const champ = document.getElementById("ep-champ");
  if (!champ) return;
  document.getElementById("ep-qty").textContent = ep.qty;
  document.querySelector('[data-ep="qty-dec"]').disabled = ep.qty <= 1;

  const inList = new Set(itemsOf(ep.listId).map((i) => i.household_item_id));
  const q = normaliser(champ.value);
  const sugg = document.getElementById("ep-sugg");

  // Champ vide : les articles les plus fréquents qui ne sont pas déjà dans la liste.
  if (!q) {
    const top = store.data.household_items
      .filter((h) => !inList.has(h.id))
      .sort((a, b) => (b.use_count || 0) - (a.use_count || 0)
        || String(b.last_used_at || "").localeCompare(String(a.last_used_at || "")))
      .slice(0, NB_PUCES);
    sugg.className = "puces";
    sugg.innerHTML = top.map((h) =>
      `<button type="button" class="puce" data-ep="pick" data-name="${esc(h.name)}">${esc(h.name)}</button>`).join("");
    return;
  }

  // À la frappe : la mémoire du foyer, puis toujours « Ajouter "texte saisi" ».
  const found = store.data.household_items
    .filter((h) => h.name_normalized.includes(q))
    .sort((a, b) => (b.name_normalized.startsWith(q) - a.name_normalized.startsWith(q))
      || (b.use_count || 0) - (a.use_count || 0))
    .slice(0, NB_COMPLETIONS);
  const exact = found.some((h) => h.name_normalized === q);
  sugg.className = "completions";
  sugg.innerHTML = found.map((h) => `
      <button type="button" class="completion" data-ep="pick" data-name="${esc(h.name)}">
        <span>${esc(h.name)}</span>${inList.has(h.id) ? `<span class="muted">${T.dejaDansLaListe}</span>` : ""}
      </button>`).join("")
    + (exact ? "" : `
      <button type="button" class="completion completion-new" data-ep="pick" data-name="${esc(nomPropre(champ.value))}">
        ${icon("plus")}<span>${esc(T.ajouterTexte(nomPropre(champ.value)))}</span>
      </button>`);
}

function addItem(rawName) {
  const name = nomPropre(rawName);
  if (!name || !currentList()) return;
  const norm = normaliser(name);
  const now = new Date().toISOString();

  // La mémoire du foyer : tout article ajouté au moins une fois.
  let hi = store.data.household_items.find((h) => h.name_normalized === norm);
  if (!hi) {
    hi = put("household_items", {
      id: idStable(store.household.id, norm),
      name, name_normalized: norm, catalog_item_id: null,
      aisle_id: autreAisle()?.id || null, use_count: 0, last_used_at: null, deleted_at: null,
    });
  }

  const existing = itemsOf(ep.listId).find((i) => i.household_item_id === hi.id);
  if (existing && !existing.checked) {
    // Déjà là, pas coché : on le montre, sans rien changer (deux personnes qui
    // ajoutent « Lait » chacune de leur côté ne doivent pas se retrouver avec 2).
    resetAddBox();
    flash(existing.id);
    return;
  }
  if (existing) {
    patch("list_items", existing.id, { checked: false, checked_at: null, quantity: ep.qty });
  } else {
    put("list_items", {
      id: idStable(ep.listId, hi.id),
      list_id: ep.listId, household_item_id: hi.id, name: hi.name,
      quantity: ep.qty, checked: false, checked_at: null,
      added_by: store.member?.id || null, deleted_at: null,
    });
  }
  patch("household_items", hi.id, { use_count: (hi.use_count || 0) + 1, last_used_at: now });

  // Le champ reste actif et se vide, la quantité revient à 1 : on enchaîne.
  resetAddBox();
  refreshList();
  flash(existing ? existing.id : idStable(ep.listId, hi.id));
}

function resetAddBox() {
  const champ = document.getElementById("ep-champ");
  if (champ) champ.value = "";
  ep.qty = 1;
  refreshAddBox();
}

function flash(id) {
  const el = document.querySelector(`.item[data-id="${id}"]`);
  if (!el) return;
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  el.classList.remove("flash");
  void el.offsetWidth;   // relance l'animation
  el.classList.add("flash");
}

// --------------------------------------------------------- gestes : articles ---
function toggleItem(id) {
  const i = store.data.list_items.find((x) => x.id === id);
  if (!i) return;
  const checked = !i.checked;
  patch("list_items", id, { checked, checked_at: checked ? new Date().toISOString() : null });
  refreshList();
}

function changeQty(id, delta) {
  const i = store.data.list_items.find((x) => x.id === id);
  if (!i) return;
  const quantity = Math.max(1, (i.quantity || 1) + delta);   // le « − » ne supprime jamais
  if (quantity !== i.quantity) { patch("list_items", id, { quantity }); refreshList(); }
}

function setAll(checked) {
  const at = checked ? new Date().toISOString() : null;
  itemsOf(ep.listId).filter((i) => i.checked !== checked)
    .forEach((i) => patch("list_items", i.id, { checked, checked_at: at }));
  closeSheet();
  refreshList();
}

// Suppression des articles cochés AU MOMENT DU GESTE, et seulement s'ils le sont
// encore côté serveur : un article décoché entre-temps par l'autre ne disparaît pas.
function clearChecked() {
  const done = itemsOf(ep.listId).filter((i) => i.checked);
  if (!done.length) { closeSheet(); toast(T.aucunCoche, { type: "alerte" }); return; }
  if (!confirm(T.confirmerEffacer(done.length))) return;
  done.forEach((i) => remove("list_items", i.id, { checked: true }));
  closeSheet();
  refreshList();
}

let sheetItemId = null;
function openItemSheet(id) {
  const i = store.data.list_items.find((x) => x.id === id);
  if (!i) return;
  sheetItemId = id;
  openSheet(`
    <h2>${esc(i.name)}</h2>
    <button class="menu-item danger" data-ep="delete-item">${icon("corbeille")} ${T.retirerDeLaListe}</button>`);
}

// ---------------------------------------------------------- gestes : listes ---
function openListMenu() {
  openSheet(`
    <h2>${esc(currentList().name)}</h2>
    <button class="menu-item" data-ep="check-all">${icon("crochet")} ${T.toutCocher}</button>
    <button class="menu-item" data-ep="uncheck-all">${icon("carre")} ${T.toutDecocher}</button>
    <button class="menu-item" data-ep="edit-list" data-id="${ep.listId}">${icon("crayon")} ${T.modifierListe}</button>
    <button class="menu-item danger" data-ep="clear-checked">${icon("corbeille")} ${T.effacerCoches}</button>`);
}

function openListForm(id) {
  const l = id ? store.data.grocery_lists.find((x) => x.id === id) : null;
  ep.draft = l ? { id: l.id, name: l.name, emoji: l.emoji || "🛒" } : { name: "", emoji: "🛒" };
  renderListForm();
  if (!l) setTimeout(() => document.getElementById("lf-name")?.focus(), 300);
}

function renderListForm() {
  const d = ep.draft;
  const all = lists();
  const idx = all.findIndex((l) => l.id === d.id);
  openSheet(`
    <h2>${d.id ? T.modifierListe : T.nouvelleListe}</h2>
    <form id="list-form" class="form-sheet">
      <div class="field">
        <label class="label" for="lf-name">${T.nomDeLaListe}</label>
        <input type="text" id="lf-name" value="${esc(d.name)}" placeholder="${T.nomDeLaListeExemple}" autocomplete="off" maxlength="40">
      </div>
      <div class="field">
        <div class="label">${T.emoji}</div>
        <div class="emoji-grid">
          ${EMOJIS.map((e) => `<button type="button" class="emoji-choice" data-ep="emoji" data-emoji="${e}" aria-pressed="${e === d.emoji}">${e}</button>`).join("")}
        </div>
      </div>
      <button type="submit" class="btn btn-primary btn-block">${T.enregistrer}</button>
    </form>
    ${d.id ? `
      ${all.length > 1 ? `<div class="inline">
        <button class="btn btn-block" data-ep="move-up" ${idx <= 0 ? "disabled" : ""}>${icon("haut")} ${T.monter}</button>
        <button class="btn btn-block" data-ep="move-down" ${idx >= all.length - 1 ? "disabled" : ""}>${icon("bas")} ${T.descendre}</button>
      </div>` : ""}
      <button class="menu-item danger" data-ep="delete-list">${icon("corbeille")} ${T.supprimerListe}</button>` : ""}`);
}

function saveListForm() {
  const d = ep.draft;
  const name = document.getElementById("lf-name").value.replace(/\s+/g, " ").trim();
  if (!name) { toast(T.entreNomListe, { type: "alerte" }); return; }
  if (d.id) {
    const l = store.data.grocery_lists.find((x) => x.id === d.id);
    const fields = {};
    if (l.name !== name) fields.name = name;
    if ((l.emoji || "🛒") !== d.emoji) fields.emoji = d.emoji;
    if (Object.keys(fields).length) patch("grocery_lists", d.id, fields);
  } else {
    const position = Math.max(0, ...store.data.grocery_lists.map((l) => l.position || 0)) + 1;
    const l = put("grocery_lists", { name, emoji: d.emoji, position, deleted_at: null });
    openList(l.id);
  }
  ep.draft = null;
  closeSheet();
  rerender();
}

function moveList(delta) {
  const all = lists();
  const i = all.findIndex((l) => l.id === ep.draft.id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= all.length) return;
  [all[i], all[j]] = [all[j], all[i]];
  all.forEach((l, pos) => { if (l.position !== pos + 1) patch("grocery_lists", l.id, { position: pos + 1 }); });
  ep.draft.name = document.getElementById("lf-name").value;
  renderListForm();
  rerender();
}

function deleteList() {
  const l = store.data.grocery_lists.find((x) => x.id === ep.draft.id);
  if (!l || !confirm(T.confirmerSupprimerListe(l.name))) return;
  remove("grocery_lists", l.id);
  if (ep.listId === l.id) openList(null);
  ep.draft = null;
  closeSheet();
  rerender();
}

function rerender() {
  const screen = document.getElementById("screen");
  if (screen) renderEpicerie(screen);
}

// ------------------------------------------------------------- événements ---
// Appui long sur un article : ses options. (Le toucher simple le coche.)
let press = null;
let pressFired = false;
const cancelPress = () => { if (press) { clearTimeout(press.timer); press = null; } };

document.addEventListener("pointerdown", (e) => {
  // Toucher un bouton de la boîte d'ajout ne doit pas enlever le focus du
  // champ, sinon le clavier se referme entre deux ajouts.
  if (e.target.closest("#ajout button")) { e.preventDefault(); return; }

  const main = e.target.closest(".item-main");
  if (!main) return;
  pressFired = false;
  const id = main.closest(".item").dataset.id;
  press = {
    x: e.clientX, y: e.clientY,
    timer: setTimeout(() => { pressFired = true; press = null; openItemSheet(id); }, 500),
  };
});
document.addEventListener("pointermove", (e) => {
  if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 10) cancelPress();
});
document.addEventListener("pointerup", cancelPress);
document.addEventListener("pointercancel", cancelPress);
document.addEventListener("contextmenu", (e) => { if (e.target.closest(".item-main")) e.preventDefault(); });

document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-ep]");
  if (!btn) return;
  const itemId = btn.closest(".item")?.dataset.id;

  switch (btn.dataset.ep) {
    // écran des listes
    case "open": openList(btn.dataset.id); return rerender();
    case "new-list": return openListForm(null);
    case "edit-list": return openListForm(btn.dataset.id);

    // écran d'une liste
    case "back": openList(null); rerender(); return window.scrollTo(0, 0);
    case "list-menu": return openListMenu();
    case "toggle":
      if (pressFired) { pressFired = false; return; }   // c'était un appui long
      return toggleItem(itemId);
    case "inc": return changeQty(itemId, +1);
    case "dec": return changeQty(itemId, -1);

    // boîte d'ajout
    case "qty-inc": ep.qty += 1; return refreshAddBox();
    case "qty-dec": ep.qty = Math.max(1, ep.qty - 1); return refreshAddBox();
    case "pick": return addItem(btn.dataset.name);

    // menus
    case "check-all": return setAll(true);
    case "uncheck-all": return setAll(false);
    case "clear-checked": return clearChecked();
    case "delete-item": remove("list_items", sheetItemId); closeSheet(); return refreshList();

    // formulaire de liste
    case "emoji":
      ep.draft.emoji = btn.dataset.emoji;
      document.querySelectorAll(".emoji-choice").forEach((b) => b.setAttribute("aria-pressed", b === btn));
      return;
    case "move-up": return moveList(-1);
    case "move-down": return moveList(+1);
    case "delete-list": return deleteList();
  }
});

document.addEventListener("submit", (e) => {
  if (e.target.id === "ep-form") { e.preventDefault(); addItem(document.getElementById("ep-champ").value); }
  if (e.target.id === "list-form") { e.preventDefault(); saveListForm(); }
});
document.addEventListener("input", (e) => { if (e.target.id === "ep-champ") refreshAddBox(); });

// ---------------------------------------------------------------- clavier ---
// Sur iOS, un élément « fixed » en bas reste SOUS le clavier : la fenêtre de
// mise en page ne rétrécit pas, seule la fenêtre visuelle le fait. On remonte
// donc la boîte d'ajout de la hauteur du clavier (validé sur iPhone avec la
// maquette _clavier.html). Clavier ouvert : la barre d'onglets se cache et la
// boîte se pose directement sur le clavier.
const vv = window.visualViewport;
function placer() {
  const ajout = document.getElementById("ajout");
  if (!ajout) { document.body.classList.remove("clavier"); return; }
  const clavier = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
  ajout.style.transform = clavier ? `translateY(${-clavier}px)` : "";
  const champActif = document.activeElement?.id === "ep-champ";
  document.body.classList.toggle("clavier", clavier > 80 || (champActif && clavier > 0));
}
if (vv) { vv.addEventListener("resize", placer); vv.addEventListener("scroll", placer); }
window.addEventListener("resize", placer);
document.addEventListener("focusin", (e) => { if (e.target.id === "ep-champ") setTimeout(placer, 50); });
document.addEventListener("focusout", (e) => { if (e.target.id === "ep-champ") setTimeout(placer, 50); });
