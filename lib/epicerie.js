// Onglet Épicerie : écran des listes, écran d'une liste, boîte d'ajout.
// (Feuille de route § 6.1.)
//
// Toute écriture passe par lib/store.js : elle réussit tout de suite, même
// hors ligne, et n'envoie que les champs modifiés.
//
// Gestes : toucher = cocher · glisser vers la gauche = poubelle (à toucher pour
// confirmer) · appui long sur un article = changer d'allée · appui long sur une
// liste = la glisser au rang voulu.

import { store, put, patch, remove } from "./store.js";
import { T } from "./textes.js";
import { icon } from "./icons.js";
import { esc, toast, openSheet, closeSheet } from "./ui.js";
import { normaliser, nomPropre, idStable } from "./noms.js";

const LIST_KEY = "wasabi-liste";
const NB_PUCES = 10;
const NB_COMPLETIONS = 5;
const EMOJI_DEFAUT = "🛒";
const SWIPE_OPEN = 76;        // largeur de la poubelle révélée (px)
const LONG_PRESS_MS = 450;
// Pastilles d'allée de la charte (jetons --allee-*).
const COULEURS_ALLEE = ["fruits-legumes", "boulangerie", "laitiers", "viandes-poissons",
  "garde-manger", "surgeles", "boissons", "maison"];

const ep = {
  listId: localStorage.getItem(LIST_KEY) || null,   // null = écran des listes
  qty: 1,           // quantité du prochain article ajouté
  draft: null,      // formulaire de liste en cours { id?, name, emoji }
};

// ---------------------------------------------------------------- données ---
const fr = new Intl.Collator("fr-CA", { sensitivity: "base", numeric: true });
const lists = () => [...store.data.grocery_lists]
  .sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at));
const currentList = () => store.data.grocery_lists.find((l) => l.id === ep.listId) || null;
const itemsOf = (listId) => store.data.list_items.filter((i) => i.list_id === listId);
const remaining = (listId) => itemsOf(listId).filter((i) => !i.checked).length;
const aisles = () => [...store.data.aisles].sort((a, b) => a.position - b.position || fr.compare(a.name, b.name));
const autreAisle = () => store.data.aisles.find((a) => a.key === "autre") || null;

// Catalogue : index « nom ou synonyme normalisé → article », refait seulement
// quand le catalogue change.
let catIndex = { source: null, byTerm: new Map(), terms: [] };
function catalogue() {
  if (catIndex.source !== store.catalog) {
    const byTerm = new Map();
    for (const c of store.catalog) {
      for (const terme of [c.name, ...(c.synonyms || [])]) {
        const n = normaliser(terme);
        if (n && !byTerm.has(n)) byTerm.set(n, c);
      }
    }
    catIndex = { source: store.catalog, byTerm, terms: [...byTerm.keys()] };
  }
  return catIndex;
}
const aisleIdForKey = (key) => (store.data.aisles.find((a) => a.key === key) || autreAisle())?.id || null;

// Les articles créés avant le catalogue (ou hors ligne sans lui) et restés dans
// « Autre » prennent l'allée du catalogue. Un choix fait à la main n'est jamais
// écrasé : on ne touche qu'aux articles sans lien au catalogue ET dans « Autre ».
function rattacherAuCatalogue() {
  if (!store.catalog.length) return;
  const autre = autreAisle()?.id || null;
  const { byTerm } = catalogue();
  for (const h of [...store.data.household_items]) {
    if (h.catalog_item_id || (h.aisle_id && h.aisle_id !== autre)) continue;
    const c = byTerm.get(h.name_normalized);
    if (!c) continue;
    const aisle_id = aisleIdForKey(c.default_aisle_key);
    // Allée pas encore semée pour ce foyer : on réessaiera au prochain chargement.
    if (c.default_aisle_key !== "autre" && aisle_id === autre) continue;
    patch("household_items", h.id, { catalog_item_id: c.id, aisle_id });
  }
}

// Articles regroupés par allée (dans l'ordre des allées du foyer), puis par
// ordre alphabétique. Un article coché reste à sa place. L'allée d'un article
// est celle que le foyer lui a donnée (household_items.aisle_id), sinon « Autre ».
function sectionsOf(listId) {
  const all = aisles();
  const autre = autreAisle();
  const aisleOfItem = new Map(store.data.household_items.map((h) => [h.id, h.aisle_id]));
  const groups = new Map();
  for (const item of itemsOf(listId)) {
    const aisle = all.find((a) => a.id === aisleOfItem.get(item.household_item_id)) || autre;
    const key = aisle?.id || "";
    if (!groups.has(key)) groups.set(key, { aisle, items: [] });
    groups.get(key).items.push(item);
  }
  return [...groups.values()]
    .sort((a, b) => (a.aisle?.position ?? 1e9) - (b.aisle?.position ?? 1e9))
    .map((g) => ({ ...g, items: g.items.sort((a, b) => fr.compare(a.name, b.name)) }));
}

function openList(id) {
  ep.listId = id;
  ep.qty = 1;
  try { id ? localStorage.setItem(LIST_KEY, id) : localStorage.removeItem(LIST_KEY); } catch { /* rien */ }
}

// ------------------------------------------------------------------ rendu ---
// Appelé par app.js à chaque changement de données. La boîte d'ajout vit dans
// le « dock » (hors de la zone qui défile) et n'est jamais reconstruite tant
// que la liste reste ouverte : le champ garderait sinon ni focus ni clavier.
let els = { screen: null, dock: null };

export function renderEpicerie(screen, dock) {
  els = { screen, dock };
  if (gesture?.active) return;                        // pas de reconstruction sous le doigt
  rattacherAuCatalogue();
  if (ep.listId && !currentList()) openList(null);   // liste supprimée (par l'autre, peut-être)

  if (!ep.listId) {
    dock.innerHTML = ""; dock.dataset.list = "";
    screen.innerHTML = listsScreenHtml();
    return;
  }
  if (screen.querySelector("#ep")?.dataset.list !== ep.listId) {
    screen.innerHTML = listScreenHtml();
    screen.scrollTop = 0;
  }
  if (dock.dataset.list !== ep.listId) {
    dock.innerHTML = addBoxHtml();
    dock.dataset.list = ep.listId;
  }
  refreshList();
}
/** Onglet Épicerie touché alors qu'on y est déjà : retour à l'écran des listes. */
export function showLists() {
  openList(null);
  rerender();
  if (els.screen) els.screen.scrollTop = 0;
}
const rerender = () => { if (els.screen?.isConnected) renderEpicerie(els.screen, els.dock); };

function listsScreenHtml() {
  const all = lists();
  const rows = all.map((l) => {
    const n = remaining(l.id);
    return `
      <li class="list-row" data-id="${l.id}">
        <button class="list-open" data-ep="open" data-id="${l.id}">
          <span class="emoji-pill">${esc(l.emoji || EMOJI_DEFAUT)}</span>
          <span class="list-name">${esc(l.name)}</span>
          <span class="list-count">${n ? T.restants(n) : T.rienARamasser}</span>
        </button>
        <button class="icon-btn" data-ep="edit-list" data-id="${l.id}" aria-label="${T.modifierListe}">${icon("points")}</button>
      </li>`;
  }).join("");
  return `
    <div id="ep" data-list="">
      <header class="screen-head"><h1>${T.onglets.epicerie}</h1></header>
      ${all.length ? `<ul class="lists" id="ep-lists">${rows}</ul>` : `
        <div class="empty">
          <div class="empty-icon">${icon("panier")}</div>
          <p>${T.aucuneListe}</p>
        </div>`}
      <button class="btn btn-primary btn-block" data-ep="new-list">${icon("plus")} ${T.nouvelleListe}</button>
      ${all.length > 1 ? `<p class="help center">${T.aideOrdreListes}</p>` : ""}
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
    </div>`;
}

function addBoxHtml() {
  return `
    <div class="ajout" id="ajout">
      <div id="ep-sugg"></div>
      <form class="ligne" id="ep-form">
        <input type="text" id="ep-champ" placeholder="${T.ajouterUnArticle}" aria-label="${T.ajouterUnArticle}"
          autocomplete="off" autocorrect="off" autocapitalize="sentences" enterkeyhint="done">
        <div class="pas">
          <button type="button" data-ep="qty-dec" aria-label="${T.moins}">${icon("moins")}</button>
          <output id="ep-qty">1</output>
          <button type="button" data-ep="qty-inc" aria-label="${T.plus}">${icon("plus")}</button>
        </div>
        <button type="submit" class="btn btn-primary btn-icon" aria-label="${T.ajouter}">${icon("haut")}</button>
      </form>
    </div>`;
}

function itemHtml(i) {
  const right = i.checked
    ? (i.quantity > 1 ? `<span class="item-qte">×${i.quantity}</span>` : "")
    : `<div class="pas">
         <button type="button" data-ep="dec" aria-label="${T.moins}" ${i.quantity <= 1 ? "disabled" : ""}>${icon("moins")}</button>
         <output>${i.quantity}</output>
         <button type="button" data-ep="inc" aria-label="${T.plus}">${icon("plus")}</button>
       </div>`;
  return `
    <div class="item${i.checked ? " checked" : ""}" data-id="${i.id}">
      <button type="button" class="item-del" data-ep="swipe-delete" tabindex="-1" aria-label="${T.retirerDeLaListe}">${icon("corbeille")}</button>
      <div class="item-front">
        <button type="button" class="item-main" data-ep="toggle" aria-pressed="${i.checked}">
          <span class="case">${i.checked ? icon("crochet") : ""}</span>
          <span class="item-name">${esc(i.name)}</span>
        </button>
        ${right}
      </div>
    </div>`;
}

function aisleHeadHtml(aisle) {
  const couleur = COULEURS_ALLEE.includes(aisle?.color_key) ? aisle.color_key : "maison";
  return `<h2 class="aisle-head"><span class="dot" style="background:var(--allee-${couleur})"></span>${esc(aisle?.name || T.autre)}</h2>`;
}

function refreshList() {
  const list = currentList();
  const box = document.getElementById("ep-items");
  if (!list || !box) return;
  document.getElementById("ep-emoji").textContent = list.emoji || EMOJI_DEFAUT;
  document.getElementById("ep-title").textContent = list.name;
  const sections = sectionsOf(list.id);
  const withHeads = sections.length > 1;   // une seule allée : pas d'en-tête
  box.innerHTML = sections.length
    ? sections.map((s) => `<section class="aisle">${withHeads ? aisleHeadHtml(s.aisle) : ""}${s.items.map(itemHtml).join("")}</section>`).join("")
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

  // À la frappe : d'abord la mémoire du foyer, puis le catalogue (noms et
  // synonymes). Pour ajouter le texte tel quel : la flèche, ou « terminé ».
  const parDebut = (a, b) => b.norm.startsWith(q) - a.norm.startsWith(q);
  // Un article du foyer lié au catalogue se trouve aussi par ses synonymes
  // (« yaourt » trouve le « Yogourt » déjà mémorisé).
  const cat = catalogue();
  const parSynonyme = new Set(cat.terms.filter((t) => t.includes(q)).map((t) => cat.byTerm.get(t).id));
  const foyer = store.data.household_items
    .filter((h) => h.name_normalized.includes(q) || parSynonyme.has(h.catalog_item_id))
    .map((h) => ({ name: h.name, norm: h.name_normalized, poids: h.use_count || 0, present: inList.has(h.id) }))
    .sort((a, b) => parDebut(a, b) || b.poids - a.poids);
  const connus = new Set(store.data.household_items.map((h) => h.name_normalized));
  const vus = new Set();
  const duCatalogue = cat.terms
    .filter((t) => t.includes(q))
    .map((t) => ({ name: cat.byTerm.get(t).name, norm: t, item: cat.byTerm.get(t) }))
    .filter((c) => !connus.has(c.item.name_normalized))
    .sort((a, b) => parDebut(a, b) || fr.compare(a.name, b.name))
    .filter((c) => !vus.has(c.item.id) && vus.add(c.item.id));
  const found = [...foyer, ...duCatalogue].slice(0, NB_COMPLETIONS);
  sugg.className = "completions";
  sugg.innerHTML = found.map((h) => `
      <button type="button" class="completion" data-ep="pick" data-name="${esc(h.name)}">
        <span>${esc(h.name)}</span>${h.present ? `<span class="muted">${T.dejaDansLaListe}</span>` : ""}
      </button>`).join("");
}

function addItem(rawName) {
  const name = nomPropre(rawName);
  if (!name || !currentList()) return;
  const norm = normaliser(name);
  const now = new Date().toISOString();

  // La mémoire du foyer : tout article ajouté au moins une fois.
  // Nouvel article : le catalogue (nom ou synonyme) donne son allée. On garde
  // le mot de la personne : « Patates » reste « Patates », rangé aux légumes.
  let hi = store.data.household_items.find((h) => h.name_normalized === norm);
  if (!hi) {
    const c = catalogue().byTerm.get(norm) || null;
    hi = put("household_items", {
      id: idStable(store.household.id, norm),
      name, name_normalized: norm, catalog_item_id: c?.id || null,
      aisle_id: c ? aisleIdForKey(c.default_aisle_key) : (autreAisle()?.id || null),
      use_count: 0, last_used_at: null, deleted_at: null,
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

// Amène l'article au milieu de la zone qui défile (jamais scrollIntoView : il
// ferait aussi bouger la page sous le clavier) et le met en surbrillance.
function flash(id) {
  const el = document.querySelector(`.item[data-id="${id}"]`);
  const screen = els.screen;
  if (!el || !screen) return;
  const r = el.getBoundingClientRect();
  const s = screen.getBoundingClientRect();
  screen.scrollTo({ top: screen.scrollTop + (r.top - s.top) - (s.height - r.height) / 2, behavior: "smooth" });
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

// Sans confirmation (ça reste une liste d'épicerie). Efface les articles cochés
// AU MOMENT DU GESTE, et seulement s'ils le sont encore côté serveur : un
// article décoché entre-temps par l'autre ne disparaît pas.
function clearChecked() {
  const done = itemsOf(ep.listId).filter((i) => i.checked);
  closeSheet();
  if (!done.length) { toast(T.aucunCoche, { type: "alerte" }); return; }
  done.forEach((i) => remove("list_items", i.id, { checked: true }));
  refreshList();
  toast(T.cochesEffaces(done.length));
}

let sheetItemId = null;
function openAisleSheet(id) {
  const i = store.data.list_items.find((x) => x.id === id);
  if (!i) return;
  sheetItemId = id;
  const hi = store.data.household_items.find((h) => h.id === i.household_item_id);
  const current = hi?.aisle_id || autreAisle()?.id;
  openSheet(`
    <h2>${esc(i.name)}</h2>
    <p class="help">${T.choisirAllee}</p>
    <div class="aisle-choices">
      ${aisles().map((a) => `
        <button class="menu-item" data-ep="set-aisle" data-id="${a.id}" aria-pressed="${a.id === current}">
          <span class="dot" style="background:var(--allee-${COULEURS_ALLEE.includes(a.color_key) ? a.color_key : "maison"})"></span>
          <span class="grow">${esc(a.name)}</span>${a.id === current ? icon("crochet") : ""}
        </button>`).join("")}
    </div>`);
}

// Le choix est retenu pour toujours : il vit sur l'article mémorisé du foyer.
function setAisle(aisleId) {
  const i = store.data.list_items.find((x) => x.id === sheetItemId);
  if (i?.household_item_id) patch("household_items", i.household_item_id, { aisle_id: aisleId });
  closeSheet();
  refreshList();
  if (i) flash(i.id);
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
  ep.draft = l ? { id: l.id, name: l.name, emoji: l.emoji || EMOJI_DEFAUT } : { name: "", emoji: EMOJI_DEFAUT };
  const d = ep.draft;
  openSheet(`
    <h2>${d.id ? T.modifierListe : T.nouvelleListe}</h2>
    <form id="list-form" class="form-sheet">
      <div class="inline top">
        <div class="field">
          <label class="label" for="lf-emoji">${T.emoji}</label>
          <input type="text" id="lf-emoji" class="emoji-input" value="${esc(d.emoji)}" autocomplete="off" autocorrect="off" aria-describedby="lf-emoji-aide">
        </div>
        <div class="field grow">
          <label class="label" for="lf-name">${T.nomDeLaListe}</label>
          <input type="text" id="lf-name" value="${esc(d.name)}" placeholder="${T.nomDeLaListeExemple}" autocomplete="off" maxlength="40">
        </div>
      </div>
      <p class="help" id="lf-emoji-aide">${T.emojiAide}</p>
      <button type="submit" class="btn btn-primary btn-block">${T.enregistrer}</button>
    </form>
    ${d.id ? `<button class="btn btn-block btn-danger" data-ep="delete-list">${icon("corbeille")} ${T.supprimerListe}</button>` : ""}`);
  if (!l) setTimeout(() => document.getElementById("lf-name")?.focus(), 300);
}

// Le champ d'emoji ne garde que le dernier caractère entré (un emoji peut
// compter plusieurs « lettres » : on découpe par graphème).
function lastGrapheme(v) {
  const t = v.trim();
  if (!t) return "";
  if (!Intl.Segmenter) return [...t].pop();
  return [...new Intl.Segmenter("fr", { granularity: "grapheme" }).segment(t)].pop().segment;
}

function saveListForm() {
  const d = ep.draft;
  const name = document.getElementById("lf-name").value.replace(/\s+/g, " ").trim();
  const emoji = lastGrapheme(document.getElementById("lf-emoji").value) || EMOJI_DEFAUT;
  if (!name) { toast(T.entreNomListe, { type: "alerte" }); return; }
  if (d.id) {
    const l = store.data.grocery_lists.find((x) => x.id === d.id);
    const fields = {};
    if (l.name !== name) fields.name = name;
    if ((l.emoji || EMOJI_DEFAUT) !== emoji) fields.emoji = emoji;
    if (Object.keys(fields).length) patch("grocery_lists", d.id, fields);
  } else {
    const position = Math.max(0, ...store.data.grocery_lists.map((l) => l.position || 0)) + 1;
    const l = put("grocery_lists", { name, emoji, position, deleted_at: null });
    openList(l.id);
  }
  ep.draft = null;
  closeSheet();
  rerender();
}

function deleteList() {
  const l = store.data.grocery_lists.find((x) => x.id === ep.draft?.id);
  if (!l || !confirm(T.confirmerSupprimerListe(l.name))) return;
  remove("grocery_lists", l.id);
  if (ep.listId === l.id) openList(null);
  ep.draft = null;
  closeSheet();
  rerender();
}

// Nouvel ordre des listes, lu dans la page après un glisser-déposer.
function commitListOrder() {
  const ids = [...document.querySelectorAll("#ep-lists .list-row")].map((r) => r.dataset.id);
  ids.forEach((id, idx) => {
    const l = store.data.grocery_lists.find((x) => x.id === id);
    if (l && l.position !== idx + 1) patch("grocery_lists", id, { position: idx + 1 });
  });
}

// ----------------------------------------------------------------- gestes ---
// Un seul geste à la fois, suivi du pointerdown au pointerup :
//   { kind: 'item', … }  glissement horizontal (poubelle) ou appui long (allée)
//   { kind: 'list', … }  appui long puis glisser-déposer
let gesture = null;
let suppressClick = false;   // le « click » qui suit un geste ne doit rien déclencher

function closeSwipes(except) {
  document.querySelectorAll(".item.open").forEach((item) => {
    if (item === except) return;
    item.classList.replace("open", "swiping");
    item.querySelector(".item-front").style.transform = "";
    setTimeout(() => item.classList.remove("swiping"), 200);
  });
}

function endGesture() {
  if (!gesture) return;
  clearTimeout(gesture.timer);
  gesture = null;
}

document.addEventListener("pointerdown", (e) => {
  suppressClick = false;
  endGesture();

  // Toucher un bouton de la boîte d'ajout ne doit pas enlever le focus du
  // champ, sinon le clavier se referme entre deux ajouts.
  if (e.target.closest("#ajout button")) { e.preventDefault(); return; }

  // Une poubelle est ouverte : tout autre toucher la referme, sans autre effet.
  const opened = document.querySelector(".item.open");
  if (opened && !e.target.closest(".item-del")) {
    closeSwipes();
    suppressClick = true;
    return;
  }

  const front = e.target.closest(".item-front");
  if (front) {
    const item = front.closest(".item");
    gesture = { kind: "item", item, front, id: item.dataset.id, x: e.clientX, y: e.clientY, active: false };
    if (e.target.closest(".item-main")) {
      const id = item.dataset.id;
      gesture.timer = setTimeout(() => {
        endGesture();
        suppressClick = true;
        openAisleSheet(id);
      }, LONG_PRESS_MS);
    }
    return;
  }

  const row = e.target.closest(".list-row");
  if (row && !e.target.closest('[data-ep="edit-list"]') && document.querySelectorAll(".list-row").length > 1) {
    gesture = { kind: "list", row, x: e.clientX, y: e.clientY, originY: e.clientY, active: false };
    gesture.timer = setTimeout(() => {
      gesture.active = true;
      suppressClick = true;
      row.classList.add("dragging");
      navigator.vibrate?.(10);
    }, LONG_PRESS_MS);
  }
});

document.addEventListener("pointermove", (e) => {
  if (!gesture) return;
  const dx = e.clientX - gesture.x;
  const dy = e.clientY - gesture.y;

  if (gesture.kind === "item") {
    if (!gesture.active) {
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        gesture.active = true;
        clearTimeout(gesture.timer);
        gesture.base = gesture.item.classList.contains("open") ? -SWIPE_OPEN : 0;
        gesture.front.style.transition = "none";
        gesture.item.classList.add("swiping");
      } else if (Math.hypot(dx, dy) > 10) clearTimeout(gesture.timer);
      if (!gesture.active) return;
    }
    gesture.pos = Math.min(0, Math.max(-SWIPE_OPEN - 24, gesture.base + dx));
    gesture.front.style.transform = `translateX(${gesture.pos}px)`;
    return;
  }

  // liste : avant l'appui long, bouger annule ; après, la rangée suit le doigt
  if (!gesture.active) { if (Math.hypot(dx, dy) > 10) endGesture(); return; }
  const row = gesture.row;
  const follow = () => { row.style.transform = `translateY(${e.clientY - gesture.originY}px)`; };
  const swapWith = (sibling, place) => {
    row.style.transform = "";
    const before = row.offsetTop;
    place(sibling);
    gesture.originY += row.offsetTop - before;   // la rangée a changé de case
    follow();
  };
  follow();
  const r = row.getBoundingClientRect();
  const center = r.top + r.height / 2;
  const next = row.nextElementSibling, prev = row.previousElementSibling;
  if (next && center > next.getBoundingClientRect().top + next.offsetHeight / 2) swapWith(next, (s) => s.after(row));
  else if (prev && center < prev.getBoundingClientRect().top + prev.offsetHeight / 2) swapWith(prev, (s) => s.before(row));
});

function finishGesture(cancelled) {
  if (!gesture) return;
  const g = gesture;
  endGesture();
  if (!g.active) return;
  suppressClick = true;

  if (g.kind === "item") {
    const open = !cancelled && (g.pos ?? 0) < -SWIPE_OPEN / 2;
    g.front.style.transition = "";
    g.front.style.transform = open ? `translateX(${-SWIPE_OPEN}px)` : "";
    g.item.classList.toggle("open", open);
    setTimeout(() => g.item.classList.remove("swiping"), 200);   // après le retour de la ligne
    return;
  }
  g.row.classList.remove("dragging");
  g.row.style.transform = "";
  if (!cancelled) commitListOrder();
  rerender();
}
document.addEventListener("pointerup", () => finishGesture(false));
document.addEventListener("pointercancel", () => finishGesture(true));

// Pendant un glisser-déposer de liste, la page ne doit pas défiler sous le doigt.
document.addEventListener("touchmove", (e) => {
  if (gesture?.kind === "list" && gesture.active) e.preventDefault();
}, { passive: false });
document.addEventListener("contextmenu", (e) => {
  if (e.target.closest(".item, .list-row")) e.preventDefault();
});

// ------------------------------------------------------------------ clics ---
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-ep]");
  if (!btn) return;
  if (suppressClick) { suppressClick = false; return; }
  const itemId = btn.closest(".item")?.dataset.id;

  switch (btn.dataset.ep) {
    // écran des listes
    case "open": openList(btn.dataset.id); return rerender();
    case "new-list": return openListForm(null);
    case "edit-list": return openListForm(btn.dataset.id);

    // écran d'une liste
    case "back": openList(null); return rerender();
    case "list-menu": return openListMenu();
    case "toggle": return toggleItem(itemId);
    case "inc": return changeQty(itemId, +1);
    case "dec": return changeQty(itemId, -1);
    case "swipe-delete": remove("list_items", itemId); return refreshList();

    // boîte d'ajout
    case "qty-inc": ep.qty += 1; return refreshAddBox();
    case "qty-dec": ep.qty = Math.max(1, ep.qty - 1); return refreshAddBox();
    case "pick": return addItem(btn.dataset.name);

    // menus
    case "check-all": return setAll(true);
    case "uncheck-all": return setAll(false);
    case "clear-checked": return clearChecked();
    case "set-aisle": return setAisle(btn.dataset.id);
    case "delete-list": return deleteList();
  }
});

document.addEventListener("submit", (e) => {
  if (e.target.id === "ep-form") { e.preventDefault(); addItem(document.getElementById("ep-champ").value); }
  if (e.target.id === "list-form") { e.preventDefault(); saveListForm(); }
});
// « Terminé » / Entrée : ajout explicite (sans compter sur la soumission implicite).
document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.target.id === "ep-champ" && !e.isComposing) { e.preventDefault(); addItem(e.target.value); }
});
document.addEventListener("input", (e) => {
  if (e.target.id === "ep-champ") refreshAddBox();
  if (e.target.id === "lf-emoji") e.target.value = lastGrapheme(e.target.value);
});
document.addEventListener("focusin", (e) => { if (e.target.id === "lf-emoji") e.target.select(); });
