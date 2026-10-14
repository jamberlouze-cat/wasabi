// Onglet Menu : le menu de la semaine, une simple liste de repas, sans jour ni
// date. Un repas est une recette du carnet ou un texte libre (« Tacos »).
//
// Mêmes gestes que dans Courses : toucher = cocher (repas fait) · glisser vers
// la gauche = poubelle. La vignette d'un repas tiré du carnet ouvre sa fiche.
// Une seule boîte d'ajout, en bas : pastilles des recettes les plus souvent au
// menu, puis recherche dans le carnet à la frappe ; « terminé » ajoute le texte.

import { store, put, patch, remove } from "./store.js";
import { T } from "./textes.js";
import { icon } from "./icons.js";
import { esc, toast, openSheet, closeSheet, naviguer } from "./ui.js";
import { normaliser, nomPropre, idStable } from "./noms.js";
import { hydrate } from "./media.js";
import { detailHtml } from "./recettes.js";
import { gesteEnCours, clicAvale } from "./epicerie.js";

const NB_PUCES = 10;
const NB_COMPLETIONS = 5;

const mn = { view: "list", recipeId: null };   // 'list' | 'fiche'
let els = { screen: null, dock: null };

// ---------------------------------------------------------------- données ---
const fr = new Intl.Collator("fr-CA", { sensitivity: "base", numeric: true });
const meals = () => [...store.data.menu_items]
  .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
const recipe = (id) => (id && store.data.recipes.find((r) => r.id === id)) || null;
// Un repas est « le même » qu'un autre s'il vient de la même recette, ou s'il
// porte le même nom.
const sameMeal = (m, recipeId, norm) => (recipeId ? m.recipe_id === recipeId : normaliser(m.title) === norm);

// ------------------------------------------------------------------ rendu ---
export function renderMenu(screen, dock) {
  els = { screen, dock };
  if (gesteEnCours()) return;   // pas de reconstruction sous le doigt
  if (mn.view === "fiche" && !recipe(mn.recipeId)) mn.view = "list";   // supprimée par l'autre

  if (mn.view === "fiche") {
    dock.innerHTML = ""; dock.dataset.list = "";
    screen.innerHTML = detailHtml(recipe(mn.recipeId), { retour: 'data-mn="back"', modifiable: false });
    hydrate(screen);
    return;
  }
  if (!screen.querySelector("#mn")) {
    screen.innerHTML = `
      <div id="mn">
        <header class="screen-head"><h1>${T.menuDeLaSemaine}</h1></header>
        <div id="mn-items" class="items"></div>
      </div>`;
  }
  // La boîte d'ajout n'est jamais reconstruite tant qu'elle est là : le champ
  // perdrait son focus et le clavier se refermerait.
  if (dock.dataset.list !== "menu" || !dock.querySelector("#mn-champ")) {
    dock.innerHTML = addBoxHtml();
    dock.dataset.list = "menu";   // Courses refait sa propre boîte au retour
  }
  refreshMeals();
}
const rerender = () => { if (els.screen?.isConnected) renderMenu(els.screen, els.dock); };

function go(view, recipeId = null) {
  document.activeElement?.blur();
  naviguer(view === "fiche" ? "avant" : "arriere", () => {
    mn.view = view; mn.recipeId = recipeId;
    if (els.screen) { els.screen.innerHTML = ""; rerender(); els.screen.scrollTop = 0; }
  });
}

/** Onglet Menu touché alors qu'on y est déjà : retour à la liste. */
export function showMenuList() {
  if (mn.view === "list") { if (els.screen) els.screen.scrollTop = 0; return; }
  go("list");
}

function addBoxHtml() {
  return `
    <div class="ajout" id="ajout">
      <div id="mn-sugg"></div>
      <form class="ligne" id="mn-form">
        <input type="text" id="mn-champ" placeholder="${T.ajouterUnRepas}" aria-label="${T.ajouterUnRepas}"
          autocomplete="off" autocorrect="off" autocapitalize="sentences" enterkeyhint="done">
        <button type="button" class="btn btn-primary btn-icon" data-mn="done-menu" aria-label="${T.optionsRepasFaits}">${icon("coches")}</button>
      </form>
    </div>`;
}

function mealHtml(m) {
  const r = recipe(m.recipe_id);
  return `
    <div class="item${m.done ? " checked" : ""}" data-id="${m.id}">
      <button type="button" class="item-del" data-mn="swipe-delete" tabindex="-1" aria-label="${T.retirerDuMenu}">${icon("corbeille")}</button>
      <div class="item-front">
        <button type="button" class="item-main" data-mn="toggle" aria-pressed="${!!m.done}">
          <span class="case">${m.done ? icon("crochet") : ""}</span>
          <span class="item-text"><span class="item-name">${esc(r?.title || m.title)}</span></span>
        </button>
        ${r ? `
          <button type="button" class="mn-vignette" data-mn="open" data-id="${r.id}" aria-label="${T.voirLaRecette}" data-media-box>
            ${r.cover_path ? `<img data-media="${esc(r.cover_path)}" alt="">` : icon("livre")}
          </button>` : ""}
      </div>
    </div>`;
}

function refreshMeals() {
  const box = document.getElementById("mn-items");
  if (!box) return;
  const all = meals();
  box.innerHTML = all.length
    ? all.map(mealHtml).join("")
    : `<div class="empty"><div class="empty-icon">${icon("couverts")}</div><p>${T.menuVide}</p></div>`;
  hydrate(box);
  refreshAddBox();
}

// ------------------------------------------------------------ boîte d'ajout ---
function refreshAddBox() {
  const champ = document.getElementById("mn-champ");
  if (!champ) return;
  const surLeMenu = new Map(store.data.menu_items.filter((m) => m.recipe_id).map((m) => [m.recipe_id, m]));
  const q = normaliser(champ.value);
  const sugg = document.getElementById("mn-sugg");

  // Champ vide : les recettes les plus souvent mises au menu (puis les plus
  // récentes du carnet) qui n'y sont pas déjà.
  if (!q) {
    const top = store.data.recipes
      .filter((r) => !surLeMenu.has(r.id))
      .sort((a, b) => (b.menu_count || 0) - (a.menu_count || 0)
        || String(b.last_menu_at || "").localeCompare(String(a.last_menu_at || ""))
        || String(b.created_at).localeCompare(String(a.created_at)))
      .slice(0, NB_PUCES);
    sugg.className = "puces";
    sugg.innerHTML = top.map((r) =>
      `<button type="button" class="puce" data-mn="pick" data-id="${r.id}">${esc(r.title)}</button>`).join("");
    return;
  }

  // À la frappe : les recettes du carnet dont le titre contient le texte.
  const found = store.data.recipes
    .map((r) => ({ r, norm: normaliser(r.title) }))
    .filter((x) => x.norm.includes(q))
    .sort((a, b) => b.norm.startsWith(q) - a.norm.startsWith(q)
      || (b.r.menu_count || 0) - (a.r.menu_count || 0) || fr.compare(a.r.title, b.r.title))
    .slice(0, NB_COMPLETIONS);
  sugg.className = "completions";
  sugg.innerHTML = found.map(({ r }) => {
    const m = surLeMenu.get(r.id);
    return `
      <button type="button" class="completion" data-mn="pick" data-id="${r.id}">
        <span>${esc(r.title)}</span>${m && !m.done ? `<span class="muted">${T.dejaAuMenu}</span>` : ""}
      </button>`;
  }).join("");
}

// Une recette touchée (pastille ou complétion), ou le texte tapé. Un texte qui
// est exactement le titre d'une recette du carnet devient cette recette.
function addMeal({ recipeId = null, text = "" }) {
  let r = recipe(recipeId);
  const name = r ? r.title : nomPropre(text);
  if (!name) return;
  const norm = normaliser(name);
  if (!r) r = store.data.recipes.find((x) => normaliser(x.title) === norm) || null;

  const existing = store.data.menu_items.find((m) => sameMeal(m, r?.id, norm));
  if (existing && !existing.done) {
    // Déjà au menu : on le montre, sans doublon (deux personnes qui ajoutent
    // le même repas chacune de leur côté).
    resetAddBox();
    flash(existing.id);
    return;
  }
  // Identifiant stable : deux téléphones hors ligne fabriquent la même ligne.
  const id = existing?.id || idStable(store.household.id, "menu", r ? r.id : norm);
  if (existing) patch("menu_items", id, { done: false });
  else put("menu_items", { id, recipe_id: r?.id || null, title: name, done: false, deleted_at: null });
  if (r) patch("recipes", r.id, { menu_count: (r.menu_count || 0) + 1, last_menu_at: new Date().toISOString() });

  // Le champ reste actif et se vide : on enchaîne.
  resetAddBox();
  refreshMeals();
  flash(id);
}

function resetAddBox() {
  const champ = document.getElementById("mn-champ");
  if (champ) champ.value = "";
  refreshAddBox();
}

// Amène le repas au milieu de la zone qui défile et le met en surbrillance
// (comme un article de Courses).
function flash(id) {
  const el = document.querySelector(`#mn-items .item[data-id="${id}"]`);
  const screen = els.screen;
  if (!el || !screen) return;
  const r = el.getBoundingClientRect();
  const s = screen.getBoundingClientRect();
  screen.scrollTo({ top: screen.scrollTop + (r.top - s.top) - (s.height - r.height) / 2, behavior: "smooth" });
  el.classList.remove("flash");
  void el.offsetWidth;   // relance l'animation
  el.classList.add("flash");
}

// ----------------------------------------------------------------- gestes ---
function toggleMeal(id) {
  const m = store.data.menu_items.find((x) => x.id === id);
  if (!m) return;
  patch("menu_items", id, { done: !m.done });
  refreshMeals();
}

function openDoneMenu() {
  openSheet(`
    <button class="menu-item" data-mn="undo-all">${icon("carre")} ${T.toutDecocher}</button>
    <button class="menu-item danger" data-mn="clear-done">${icon("corbeille")} ${T.effacerRepasFaits}</button>`);
}

function undoAll() {
  store.data.menu_items.filter((m) => m.done).forEach((m) => patch("menu_items", m.id, { done: false }));
  closeSheet();
  refreshMeals();
}

// Sans confirmation, comme « Effacer les cochés » : seulement les repas encore
// cochés côté serveur au moment du geste.
function clearDone() {
  const done = store.data.menu_items.filter((m) => m.done);
  closeSheet();
  if (!done.length) { toast(T.aucunRepasFait, { type: "alerte" }); return; }
  done.forEach((m) => remove("menu_items", m.id, { done: true }));
  refreshMeals();
  toast(T.repasEffaces(done.length));
}

// ------------------------------------------------------------- événements ---
// Toucher un bouton de la boîte d'ajout ne doit pas enlever le focus du champ
// (lib/epicerie.js s'en charge pour tout #ajout).
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-mn]");
  if (!btn) return;
  if (clicAvale()) return;   // ce toucher refermait une poubelle ouverte
  const id = btn.closest(".item")?.dataset.id;
  switch (btn.dataset.mn) {
    case "toggle": return toggleMeal(id);
    case "swipe-delete": remove("menu_items", id); return refreshMeals();
    case "open": return go("fiche", btn.dataset.id);
    case "back": return go("list");
    case "pick": return addMeal({ recipeId: btn.dataset.id });
    case "done-menu": return openDoneMenu();
    case "undo-all": return undoAll();
    case "clear-done": return clearDone();
  }
});

document.addEventListener("submit", (e) => {
  if (e.target.id === "mn-form") { e.preventDefault(); addMeal({ text: document.getElementById("mn-champ").value }); }
});
// « Terminé » / Entrée : ajout explicite du texte tapé.
document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.target.id === "mn-champ" && !e.isComposing) { e.preventDefault(); addMeal({ text: e.target.value }); }
});
document.addEventListener("input", (e) => { if (e.target.id === "mn-champ") refreshAddBox(); });
