// Onglet Recettes : un carnet de signets visuel (feuille de route § 6.2).
// Tuiles → un lien, une fiche simple, ou des photos / un PDF. Trois vues :
// la grille, la fiche d'une recette, le formulaire (ajout et modification).
//
// Les données passent par lib/store.js (hors ligne, patchs par champ), les
// images et PDF par lib/media.js (appareil d'abord, envoi différé).

import { supabase } from "./supabase.js";
import { store, put, patch, remove, newId } from "./store.js";
import { T } from "./textes.js";
import { icon } from "./icons.js";
import { esc, toast, openSheet, closeSheet } from "./ui.js";
import { normaliser, idStable } from "./noms.js";
import {
  saveLocal, getUrl, getBlob, hydrate, prefetch, signedUrl, compressImage,
  TAILLE_FICHIER, TAILLE_VIGNETTE, MAX_PDF,
} from "./media.js";
import { openPdf } from "./pdf.js";

const rc = {
  view: "grid",        // 'grid' | 'detail' | 'form'
  id: null,            // recette affichée (fiche)
  q: "", cat: null, tags: new Set(),   // recherche et filtres de la grille
  draft: null,         // formulaire en cours
};
let els = { screen: null };

const fr = new Intl.Collator("fr-CA", { sensitivity: "base", numeric: true });
const recipe = (id) => store.data.recipes.find((r) => r.id === id) || null;
const categories = () => [...store.data.recipe_categories].sort((a, b) => a.position - b.position || fr.compare(a.name, b.name));
const allTags = () => [...store.data.tags].sort((a, b) => fr.compare(a.name, b.name));
const tagIdsOf = (recipeId) => store.data.recipe_tags.filter((x) => x.recipe_id === recipeId).map((x) => x.tag_id);
const filesOf = (recipeId) => store.data.recipe_files.filter((f) => f.recipe_id === recipeId).sort((a, b) => a.position - b.position);
const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; } };
const validUrl = (s) => { try { const u = new URL(s); return /^https?:$/.test(u.protocol) && u.hostname.includes("."); } catch { return false; } };
const safeUrl = (s) => (validUrl(s) ? s : "#");   // jamais de javascript: dans un href

// ------------------------------------------------------------------ rendu ---
export function renderRecettes(screen) {
  els = { screen };
  if (rc.view === "detail" && !recipe(rc.id)) rc.view = "grid";   // supprimée par l'autre
  if (rc.view === "form") { if (!screen.querySelector("#rf")) { screen.innerHTML = formHtml(); refreshForm(); } return; }
  if (rc.view === "detail") { screen.innerHTML = detailHtml(recipe(rc.id)); hydrate(screen); return; }
  // Grille : le champ de recherche n'est jamais reconstruit pendant la frappe.
  if (!screen.querySelector("#rc-grid")) screen.innerHTML = gridShellHtml();
  refreshGrid();
  prefetch(store.data.recipes.map((r) => r.cover_path));
}
const rerender = () => { if (els.screen?.isConnected) renderRecettes(els.screen); };
function go(view, id = null) {
  rc.view = view; rc.id = id;
  document.activeElement?.blur();
  if (els.screen) { els.screen.innerHTML = ""; rerender(); els.screen.scrollTop = 0; }
}

/** Onglet Recettes touché alors qu'on y est déjà : retour à la grille. */
export function showRecettesGrid() { rc.draft = null; go("grid"); }

/** Android : l'app reçoit un lien par le menu Partager (share_target du manifeste). */
export function recetteFromShare(params) {
  const found = [params.get("url"), params.get("text"), params.get("title")]
    .map((v) => (v || "").match(/https?:\/\/\S+/)?.[0]).find(Boolean);
  if (!found) return false;
  startDraft("url");
  rc.draft.url = found;
  rc.view = "form";
  setTimeout(() => fetchPreview(found), 0);
  return true;
}

// ----------------------------------------------------------------- grille ---
function gridShellHtml() {
  return `
    <header class="screen-head">
      <h1>${T.onglets.recettes}</h1>
      <button class="btn btn-primary btn-icon round" data-rc="add" aria-label="${T.ajouterRecette}">${icon("plus")}</button>
    </header>
    <input type="text" id="rc-q" value="${esc(rc.q)}" placeholder="${T.chercherRecette}" aria-label="${T.chercherRecette}"
      autocomplete="off" autocorrect="off" enterkeyhint="search">
    <div id="rc-filters"></div>
    <div id="rc-grid"></div>`;
}

function filteredRecipes() {
  const q = normaliser(rc.q);
  return store.data.recipes
    .filter((r) => !q || normaliser(r.title).includes(q))
    .filter((r) => !rc.cat || r.category_id === rc.cat)
    .filter((r) => { const mine = tagIdsOf(r.id); return [...rc.tags].every((t) => mine.includes(t)); })   // logique ET
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}

function tileHtml(r) {
  const inner = `
    ${r.cover_path ? `<img data-media="${esc(r.cover_path)}" alt="" loading="lazy">` : ""}
    <span class="tile-fallback">${esc(r.type === "url" ? (r.site_name || hostOf(r.url)) : r.type === "file" && !r.cover_path ? "PDF" : (r.title[0] || "?").toUpperCase())}</span>
    <span class="tile-name"><span>${esc(r.title)}</span></span>`;
  // Un lien est un vrai <a> : en mode installé, iOS l'ouvre dans son navigateur
  // intégré, avec un bouton pour revenir à l'app.
  const main = r.type === "url"
    ? `<a class="tile-main" href="${esc(safeUrl(r.url))}" target="_blank" rel="noopener noreferrer">${inner}</a>`
    : `<button class="tile-main" data-rc="${r.type === "file" ? "view-files" : "detail"}" data-id="${r.id}">${inner}</button>`;
  return `
    <div class="tile${r.cover_path ? "" : " sans-image"}" data-media-box>
      ${main}
      ${r.type !== "manual" ? `<button class="tile-info" data-rc="detail" data-id="${r.id}" aria-label="${T.voirFiche}">${icon("info")}</button>` : ""}
    </div>`;
}

function refreshGrid() {
  const cats = categories();
  if (rc.cat && !cats.some((c) => c.id === rc.cat)) rc.cat = null;
  for (const t of [...rc.tags]) if (!store.data.tags.some((x) => x.id === t)) rc.tags.delete(t);

  const cat = cats.find((c) => c.id === rc.cat);
  document.getElementById("rc-filters").innerHTML = `
    ${cats.length ? `<button class="btn btn-small${cat ? " on" : ""}" data-rc="cat-filter">${icon("dossier")} <span class="grow">${esc(cat ? cat.name : T.toutesCategories)}</span> ${icon("chevronBas")}</button>` : ""}
    ${store.data.tags.length ? `<div class="puces">
      ${allTags().map((t) => `<button class="puce${rc.tags.has(t.id) ? " on" : ""}" data-rc="toggle-filter-tag" data-id="${t.id}">${esc(t.name)}</button>`).join("")}
    </div>` : ""}`;

  const list = filteredRecipes();
  const grid = document.getElementById("rc-grid");
  grid.innerHTML = list.length
    ? `<div class="tiles">${list.map(tileHtml).join("")}</div>`
    : `<div class="empty"><div class="empty-icon">${icon("livre")}</div><p>${store.data.recipes.length ? T.aucuneRecetteTrouvee : T.aucuneRecette}</p></div>`;
  hydrate(grid);
}

function openCatFilter() {
  const row = (id, name) => `
    <button class="menu-item" data-rc="cat" data-id="${id}" aria-pressed="${(rc.cat || "") === id}">
      <span class="grow">${esc(name)}</span>${(rc.cat || "") === id ? icon("crochet") : ""}
    </button>`;
  openSheet(`
    <h2>${T.categorie}</h2>
    <div class="aisle-choices">${row("", T.toutesCategories)}${categories().map((c) => row(c.id, c.name)).join("")}</div>`);
}

// ------------------------------------------------------------------ fiche ---
function detailHtml(r) {
  const cat = store.data.recipe_categories.find((c) => c.id === r.category_id);
  const tags = allTags().filter((t) => tagIdsOf(r.id).includes(t.id));
  const files = filesOf(r.id);
  const bloc = (titre, texte) => texte ? `<section class="card"><div class="label">${titre}</div><p class="prose">${esc(texte)}</p></section>` : "";
  return `
    <header class="list-head">
      <button class="icon-btn" data-rc="back" aria-label="${T.onglets.recettes}">${icon("retour")}</button>
      <h1>${esc(r.title)}</h1>
      <button class="icon-btn" data-rc="edit" data-id="${r.id}" aria-label="${T.modifier}">${icon("crayon")}</button>
    </header>
    ${r.cover_path ? `<div class="cover" data-media-box><img data-media="${esc(r.cover_path)}" alt=""></div>` : ""}
    ${cat || tags.length ? `<div class="pills">
      ${cat ? `<span class="pill static">${esc(cat.name)}</span>` : ""}
      ${tags.map((t) => `<span class="pill tag static">${esc(t.name)}</span>`).join("")}
    </div>` : ""}
    ${r.type === "url" ? `
      <a class="btn btn-primary btn-block" href="${esc(safeUrl(r.url))}" target="_blank" rel="noopener noreferrer">${icon("externe")} ${T.ouvrirRecette}</a>
      <p class="help center link-text">${esc(r.site_name || hostOf(r.url))}</p>` : ""}
    ${r.type === "file" && files.length ? `
      <div class="file-strip">
        ${files.map((f, i) => f.mime_type === "application/pdf"
          ? `<button class="file-thumb pdf" data-rc="view-files" data-id="${r.id}" data-index="${i}">${icon("document")}<span>PDF</span></button>`
          : `<button class="file-thumb" data-rc="view-files" data-id="${r.id}" data-index="${i}" data-media-box><img data-media="${esc(f.path)}" alt="${T.page(i + 1)}"></button>`).join("")}
      </div>` : ""}
    ${bloc(T.ingredients, r.ingredients_text)}
    ${bloc(T.etapes, r.steps_text)}
    ${r.notes ? bloc(T.notes, r.notes) : `
      <section class="card">
        <div class="label">${T.notes}</div>
        <button class="link-btn left" data-rc="edit" data-id="${r.id}">${T.ajouterNotes}</button>
      </section>`}`;
}

// ------------------------------------------------------------- formulaire ---
function startDraft(type, r = null) {
  rc.draft = {
    id: r?.id || newId(), isNew: !r, type: r?.type || type,
    title: r?.title || "", url: r?.url || "", site_name: r?.site_name || "",
    category_id: r?.category_id || "", notes: r?.notes || "",
    ingredients_text: r?.ingredients_text || "", steps_text: r?.steps_text || "",
    tagIds: new Set(r ? tagIdsOf(r.id) : []),
    cover: { path: r?.cover_path || null, blob: null, preview: null },
    files: r ? filesOf(r.id).map((f) => ({ id: f.id, path: f.path, mime: f.mime_type })) : [],
    removedFiles: [],
    previewing: false,
  };
}

function formHtml() {
  const d = rc.draft;
  const area = (id, label, value, rows, ph = "") => `
    <div class="field">
      <label class="label" for="${id}">${label}</label>
      <textarea id="${id}" rows="${rows}" placeholder="${ph}">${esc(value)}</textarea>
    </div>`;
  return `
    <div id="rf">
      <header class="list-head">
        <button class="icon-btn" data-rc="cancel-form" aria-label="${T.annuler}">${icon("retour")}</button>
        <h1>${d.isNew ? T.typesRecette[d.type] : T.modifier}</h1>
      </header>
      <form id="rf-form" class="form-page">
        ${d.type === "url" ? `
          <div class="field">
            <label class="label" for="rf-url">${T.lien}</label>
            <div class="inline">
              <input type="url" id="rf-url" value="${esc(d.url)}" placeholder="https://" inputmode="url" autocomplete="off" autocapitalize="off" autocorrect="off">
              <button type="button" class="btn" data-rc="paste">${T.coller}</button>
            </div>
            <p class="help" id="rf-status"></p>
          </div>` : ""}
        <div class="field">
          <label class="label" for="rf-title">${T.titre}</label>
          <input type="text" id="rf-title" value="${esc(d.title)}" autocomplete="off" maxlength="200">
        </div>
        ${d.type === "file" ? `<div class="field"><div class="label">${T.photosOuPdf}</div><div id="rf-files"></div></div>` : ""}
        <div class="field"><div class="label">${d.type === "file" ? T.imageTuile : T.photo}</div><div id="rf-cover"></div></div>
        ${d.type === "manual" ? area("rf-ingredients", T.ingredients, d.ingredients_text, 6) + area("rf-steps", T.etapes, d.steps_text, 8) : ""}
        <div class="field">
          <label class="label" for="rf-cat">${T.categorie}</label>
          <div class="select-wrap">
            <select id="rf-cat">
              <option value="">${T.aucuneCategorie}</option>
              ${categories().map((c) => `<option value="${c.id}" ${c.id === d.category_id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}
            </select>
            ${icon("chevronBas")}
          </div>
        </div>
        <div class="field"><div class="label">${T.tags}</div><div id="rf-tags"></div></div>
        ${area("rf-notes", T.notes, d.notes, 3, T.notesExemple)}
        <button type="submit" class="btn btn-primary btn-block" id="rf-save">${T.enregistrer}</button>
      </form>
      ${d.isNew ? "" : `<button class="btn btn-block btn-danger" data-rc="delete">${icon("corbeille")} ${T.supprimerRecette}</button>`}
    </div>`;
}

// Les parties qui bougent (photos, tags) se redessinent seules : ce qui est
// déjà tapé dans les champs n'est jamais perdu.
function refreshForm() {
  const d = rc.draft;
  const cover = document.getElementById("rf-cover");
  if (cover) {
    const has = d.cover.preview || d.cover.path;
    cover.innerHTML = `
      <div class="cover-edit">
        ${has ? `<div class="cover small" data-media-box><img ${d.cover.preview ? `src="${d.cover.preview}"` : `data-media="${esc(d.cover.path)}"`} alt=""></div>` : ""}
        <div class="stack">
          <label class="btn">${icon("image")} ${has ? T.changerPhoto : T.choisirPhoto}<input type="file" accept="image/*" id="rf-cover-input" hidden></label>
          ${has ? `<button type="button" class="link-btn" data-rc="remove-cover">${T.retirerImage}</button>` : ""}
        </div>
      </div>`;
    hydrate(cover);
  }
  const files = document.getElementById("rf-files");
  if (files) {
    files.innerHTML = `
      <div class="file-strip">
        ${d.files.map((f, i) => `
          <div class="file-thumb${f.mime === "application/pdf" ? " pdf" : ""}" data-media-box>
            ${f.mime === "application/pdf" ? `${icon("document")}<span>PDF</span>` : `<img ${f.preview ? `src="${f.preview}"` : `data-media="${esc(f.path)}"`} alt="${T.page(i + 1)}">`}
            <button type="button" class="thumb-x" data-rc="remove-file" data-index="${i}" aria-label="${T.retirer}">${icon("fermer")}</button>
          </div>`).join("")}
      </div>
      <div class="inline wrap">
        <label class="btn">${icon("appareil")} ${T.prendrePhoto}<input type="file" accept="image/*" capture="environment" id="rf-camera" hidden></label>
        <label class="btn">${icon("image")} ${T.choisirFichiers}<input type="file" accept="image/*,application/pdf" multiple id="rf-pick" hidden></label>
      </div>`;
    hydrate(files);
  }
  const tags = document.getElementById("rf-tags");
  if (tags) {
    tags.innerHTML = `
      <div class="pills">
        ${allTags().map((t) => `<button type="button" class="pill${d.tagIds.has(t.id) ? " on" : ""}" data-rc="toggle-tag" data-id="${t.id}">${esc(t.name)}</button>`).join("")}
      </div>
      <div class="inline">
        <input type="text" id="rf-newtag" placeholder="${T.nouveauTag}" autocomplete="off" maxlength="30" enterkeyhint="done">
        <button type="button" class="btn" data-rc="add-tag">${T.ajouter}</button>
      </div>`;
  }
}

function setStatus(text) { const el = document.getElementById("rf-status"); if (el) el.textContent = text; }

// Aperçu de lien : titre, nom du site et image. En cas d'échec, on n'insiste
// pas — l'ajout n'est jamais bloqué, la personne complète à la main.
async function fetchPreview(url) {
  const d = rc.draft;
  if (!d || d.previewing || !validUrl(url) || !navigator.onLine) return;
  d.previewing = true;
  setStatus(T.apercuEnCours);
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const headers = { "content-type": "application/json", authorization: `Bearer ${session?.access_token || ""}` };
    const res = await fetch("/api/apercu-lien", { method: "POST", headers, body: JSON.stringify({ url }) });
    if (!res.ok) throw new Error(String(res.status));
    const info = await res.json();
    if (rc.draft !== d) return;   // formulaire quitté entre-temps
    // Lien reçu par Partager : le formulaire n'est peut-être pas encore à
    // l'écran (démarrage) ; le titre attend alors dans le brouillon.
    const titre = document.getElementById("rf-title");
    if (titre && !titre.value.trim() && info.title) titre.value = info.title;
    if (!titre && !d.title && info.title) d.title = info.title;
    d.site_name = info.site_name || hostOf(url);
    if (info.image && !d.cover.blob && !d.cover.path) {
      const img = await fetch("/api/image", { method: "POST", headers, body: JSON.stringify({ url: info.image }) });
      if (img.ok && rc.draft === d) setCover(await img.blob());
    }
    setStatus(d.site_name);
  } catch {
    if (rc.draft === d) setStatus(T.apercuEchec);
  } finally {
    d.previewing = false;
  }
}

function setCover(blob) {
  const d = rc.draft;
  if (d.cover.preview) URL.revokeObjectURL(d.cover.preview);
  d.cover = { path: null, blob, preview: URL.createObjectURL(blob) };
  refreshForm();
}

function addFiles(fileList) {
  const d = rc.draft;
  for (const f of fileList) {
    const pdf = f.type === "application/pdf";
    if (!pdf && !f.type.startsWith("image/")) { toast(T.fichierRefuse, { type: "alerte" }); continue; }
    if (pdf && f.size > MAX_PDF) { toast(T.pdfTropLourd, { type: "alerte", ms: 3500 }); continue; }
    d.files.push({ blob: f, mime: pdf ? "application/pdf" : "image/jpeg", preview: pdf ? null : URL.createObjectURL(f) });
  }
  refreshForm();
}

function addTag() {
  const input = document.getElementById("rf-newtag");
  const name = input.value.replace(/\s+/g, " ").trim();
  if (!name) return;
  const norm = normaliser(name);
  let tag = store.data.tags.find((t) => normaliser(t.name) === norm);
  if (!tag) tag = put("tags", { id: idStable(store.household.id, "tag", norm), name, deleted_at: null });
  rc.draft.tagIds.add(tag.id);
  refreshForm();
  document.getElementById("rf-newtag")?.focus();
}

async function saveForm() {
  const d = rc.draft;
  const val = (id) => document.getElementById(id)?.value ?? "";
  const url = val("rf-url").trim();
  let title = val("rf-title").replace(/\s+/g, " ").trim();
  if (d.type === "url") {
    if (!validUrl(url)) { toast(T.lienInvalide, { type: "alerte" }); return; }
    if (!title) title = hostOf(url);
  }
  if (!title) { toast(T.entreTitre, { type: "alerte" }); return; }
  if (d.type === "file" && !d.files.length) { toast(T.ajouteUnFichier, { type: "alerte" }); return; }

  const btn = document.getElementById("rf-save");
  btn.disabled = true; btn.textContent = T.enregistrementEnCours;
  try {
    const base = `${store.household.id}/${d.id}`;
    const stamp = Date.now().toString(36);

    // Fichiers ajoutés : photos réduites à 1600 px, PDF tels quels.
    const added = [];
    for (const [i, f] of d.files.entries()) {
      if (!f.blob) continue;
      const pdf = f.mime === "application/pdf";
      const blob = pdf ? f.blob : await compressImage(f.blob, TAILLE_FICHIER);
      const path = `${base}/f${i}-${stamp}.${pdf ? "pdf" : "jpg"}`;
      await saveLocal(path, blob);
      added.push({ f, path });
    }

    // Image de la tuile : celle choisie, sinon (photos/PDF) la première photo.
    let cover_path = d.cover.path;
    let coverSource = d.cover.blob;
    if (!coverSource && !cover_path && d.type === "file") {
      coverSource = d.files.find((f) => f.blob && f.mime !== "application/pdf")?.blob || null;
      const pdf = !coverSource && d.files.find((f) => f.blob && f.mime === "application/pdf");
      if (pdf) {
        try { coverSource = await (await openPdf(pdf.blob, pdf.blob)).render(1, TAILLE_VIGNETTE); }
        catch { /* PDF illisible : tuile générique */ }
      }
    }
    if (coverSource) {
      cover_path = `${base}/tuile-${stamp}.jpg`;
      await saveLocal(cover_path, await compressImage(coverSource, TAILLE_VIGNETTE));
    }

    const fields = {
      type: d.type, title, cover_path: cover_path || null,
      category_id: val("rf-cat") || null, notes: val("rf-notes").trim() || null,
      url: d.type === "url" ? url : null,
      site_name: d.type === "url" ? (d.site_name || hostOf(url)) : null,
      ingredients_text: d.type === "manual" ? (val("rf-ingredients").trim() || null) : null,
      steps_text: d.type === "manual" ? (val("rf-steps").trim() || null) : null,
    };
    if (d.isNew) {
      put("recipes", { id: d.id, created_by: store.member?.id || null, deleted_at: null, ...fields });
    } else {
      const old = recipe(d.id);
      const changed = Object.fromEntries(Object.entries(fields).filter(([k, v]) => (old[k] ?? null) !== v));
      if (Object.keys(changed).length) patch("recipes", d.id, changed);
    }

    d.removedFiles.forEach((id) => remove("recipe_files", id));
    d.files.forEach((f, position) => {
      const a = added.find((x) => x.f === f);
      if (a) put("recipe_files", { recipe_id: d.id, path: a.path, mime_type: f.mime, position, deleted_at: null });
      else if (store.data.recipe_files.find((x) => x.id === f.id)?.position !== position) patch("recipe_files", f.id, { position });
    });

    const before = new Set(d.isNew ? [] : tagIdsOf(d.id));   // avant tout ajout
    for (const t of d.tagIds) if (!before.has(t)) put("recipe_tags", { id: idStable(d.id, t), recipe_id: d.id, tag_id: t, deleted_at: null });
    // La vraie ligne, pas idStable : les liens importés d'Umami ont un autre identifiant.
    store.data.recipe_tags.filter((rt) => rt.recipe_id === d.id && !d.tagIds.has(rt.tag_id))
      .forEach((rt) => remove("recipe_tags", rt.id));

    rc.draft = null;
    go("grid");
    toast(T.recetteEnregistree);
  } catch (err) {
    console.warn(err);
    btn.disabled = false; btn.textContent = T.enregistrer;
    toast(T.enregistrementImpossible, { type: "erreur", ms: 4000 });
  }
}

function deleteRecipe() {
  const r = recipe(rc.draft?.id);
  if (!r || !confirm(T.confirmerSupprimerRecette(r.title))) return;
  filesOf(r.id).forEach((f) => remove("recipe_files", f.id));
  store.data.recipe_tags.filter((rt) => rt.recipe_id === r.id).forEach((rt) => remove("recipe_tags", rt.id));
  remove("recipes", r.id);
  rc.draft = null;
  go("grid");
}

async function paste() {
  const input = document.getElementById("rf-url");
  try {
    const text = (await navigator.clipboard.readText()).trim();
    const found = text.match(/https?:\/\/\S+/)?.[0];
    if (!found) { toast(T.rienAColler, { type: "alerte" }); input.focus(); return; }
    input.value = found;
    fetchPreview(found);
  } catch {
    input.focus();   // presse-papier refusé : on colle à la main dans le champ
    toast(T.collerALaMain, { type: "alerte", ms: 3500 });
  }
}

// ------------------------------------------------------------ visionneuse ---
// Photos et pages de PDF, même traitement : pincer pour zoomer, double toucher,
// glisser entre les pages. Un PDF est dessiné page par page (lib/pdf.js) : la
// liste des pages se complète dès que le nombre de pages du PDF est connu.
const viewer = { pages: [], index: 0, scale: 1, x: 0, y: 0, pointers: new Map(), start: null, lastTap: 0, rendered: new Map() };

async function openViewer(recipeId, index = 0) {
  const files = filesOf(recipeId);
  if (!files.length) { go("detail", recipeId); return; }
  viewer.pages = files.map((f) => ({ path: f.path, pdf: f.mime_type === "application/pdf", n: 1 }));
  viewer.index = Math.min(index, viewer.pages.length - 1);
  let el = document.getElementById("viewer");
  if (!el) { el = document.createElement("div"); el.id = "viewer"; el.className = "viewer"; document.body.appendChild(el); }
  el.hidden = false;
  showPage();
  // Chaque PDF de plus d'une page : ses pages s'insèrent à sa place.
  for (const f of files.filter((x) => x.mime_type === "application/pdf")) {
    const blob = await getBlob(f.path);
    if (!blob || document.getElementById("viewer")?.hidden) continue;
    try {
      const doc = await openPdf(f.path, blob);
      const at = viewer.pages.findIndex((p) => p.path === f.path && p.n === 1);
      if (doc.pages > 1 && at >= 0) {
        const extra = Array.from({ length: doc.pages - 1 }, (_, i) => ({ path: f.path, pdf: true, n: i + 2 }));
        viewer.pages.splice(at + 1, 0, ...extra);
        if (viewer.index > at) viewer.index += extra.length;
        refreshViewerBar();
      }
    } catch { /* PDF illisible : une seule « page », le lien plein écran reste */ }
  }
}

function closeViewer() {
  const el = document.getElementById("viewer");
  if (el) { el.hidden = true; el.innerHTML = ""; }
  viewer.pointers.clear();
}

function refreshViewerBar() {
  const bar = document.querySelector("#viewer .viewer-bar");
  if (!bar) return;
  const many = viewer.pages.length > 1;
  bar.innerHTML = `
    <button class="icon-btn" data-rc="close-viewer" aria-label="${T.fermer}">${icon("fermer")}</button>
    <span>${many ? `${viewer.index + 1} / ${viewer.pages.length}` : ""}</span>
    <span class="viewer-nav">
      ${many ? `<button class="icon-btn" data-rc="prev-page" ${viewer.index ? "" : "disabled"} aria-label="${T.pagePrecedente}">${icon("retour")}</button>
      <button class="icon-btn" data-rc="next-page" ${viewer.index < viewer.pages.length - 1 ? "" : "disabled"} aria-label="${T.pageSuivante}">${icon("suivant")}</button>` : ""}
    </span>`;
}

// L'image d'une page : la photo elle-même, ou la page du PDF dessinée à la
// taille de l'écran (gardée le temps de la session).
async function pageUrl(p) {
  if (!p.pdf) return getUrl(p.path);
  const key = `${p.path}#${p.n}`;
  if (viewer.rendered.has(key)) return viewer.rendered.get(key);
  const blob = await getBlob(p.path);
  if (!blob) return null;
  const doc = await openPdf(p.path, blob);
  const px = Math.round(Math.max(window.innerWidth, window.innerHeight) * (window.devicePixelRatio || 1) * 1.5);
  const url = URL.createObjectURL(await doc.render(p.n, Math.min(px, 3000)));
  viewer.rendered.set(key, url);
  return url;
}

async function showPage() {
  const el = document.getElementById("viewer");
  const p = viewer.pages[viewer.index];
  Object.assign(viewer, { scale: 1, x: 0, y: 0, start: null });
  viewer.pointers.clear();
  el.innerHTML = `<div class="viewer-bar"></div><div class="viewer-stage" id="viewer-stage"><div class="spinner"></div></div>`;
  refreshViewerBar();
  const stage = document.getElementById("viewer-stage");
  let url = null;
  try { url = await pageUrl(p); } catch (err) { console.warn("Page illisible :", err); }
  if (viewer.pages[viewer.index] !== p || !stage.isConnected) return;
  if (url) {
    stage.innerHTML = `<img class="viewer-img" id="viewer-img" src="${url}" alt="${T.page(viewer.index + 1)}" draggable="false">`;
    return;
  }
  // Fichier absent de l'appareil, ou PDF que pdf.js ne lit pas : le lien plein écran reste.
  stage.innerHTML = `<p class="viewer-msg">${T.fichierIndisponible}</p>
    <a class="btn viewer-open" id="viewer-open" target="_blank" rel="noopener" hidden>${icon("externe")} ${T.ouvrirPdf}</a>`;
  if (p.pdf) {
    const link = await signedUrl(p.path);
    const a = document.getElementById("viewer-open");
    if (link && a) { a.href = link; a.hidden = false; }
  }
}

function applyZoom() {
  const img = document.getElementById("viewer-img");
  if (img) img.style.transform = `translate(${viewer.x}px, ${viewer.y}px) scale(${viewer.scale})`;
}
function turnPage(delta) {
  const i = viewer.index + delta;
  if (i < 0 || i >= viewer.pages.length) return;
  viewer.index = i;
  showPage();
}
const spread = () => { const [a, b] = [...viewer.pointers.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };

document.addEventListener("pointerdown", (e) => {
  if (!e.target.closest("#viewer-img")) return;
  viewer.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  const pts = [...viewer.pointers.values()];
  viewer.start = pts.length === 2
    ? { dist: spread(), scale: viewer.scale }
    : { px: e.clientX, py: e.clientY, x: viewer.x, y: viewer.y };
});
document.addEventListener("pointermove", (e) => {
  if (!viewer.pointers.has(e.pointerId) || !viewer.start) return;
  viewer.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (viewer.pointers.size === 2 && viewer.start.dist) {
    viewer.scale = Math.min(5, Math.max(1, viewer.start.scale * spread() / viewer.start.dist));
    if (viewer.scale === 1) { viewer.x = 0; viewer.y = 0; }
  } else if (viewer.pointers.size === 1 && viewer.start.px !== undefined) {
    viewer.x = viewer.start.x + (e.clientX - viewer.start.px);
    if (viewer.scale > 1) viewer.y = viewer.start.y + (e.clientY - viewer.start.py);
  }
  applyZoom();
});
function viewerPointerEnd(e) {
  if (!viewer.pointers.delete(e.pointerId)) return;
  if (viewer.pointers.size) { const [p] = viewer.pointers.values(); viewer.start = { px: p.x, py: p.y, x: viewer.x, y: viewer.y }; return; }
  if (viewer.scale === 1) {
    // Pas zoomé : un glissement horizontal tourne la page ; un double toucher zoome.
    const dx = viewer.x;
    viewer.x = 0; viewer.y = 0;
    if (Math.abs(dx) > 60) return turnPage(dx < 0 ? +1 : -1);
    const now = Date.now();
    if (Math.abs(dx) < 6 && now - viewer.lastTap < 320) { viewer.scale = 2.5; viewer.lastTap = 0; } else viewer.lastTap = now;
  } else if (viewer.start?.px !== undefined && Math.hypot(viewer.x - viewer.start.x, viewer.y - viewer.start.y) < 6) {
    const now = Date.now();
    if (now - viewer.lastTap < 320) { viewer.scale = 1; viewer.x = 0; viewer.y = 0; viewer.lastTap = 0; } else viewer.lastTap = now;
  }
  applyZoom();
}
document.addEventListener("pointerup", viewerPointerEnd);
document.addEventListener("pointercancel", viewerPointerEnd);

// ------------------------------------------------------------- événements ---
function openTypeChooser() {
  openSheet(`
    <h2>${T.ajouterRecette}</h2>
    <button class="menu-item" data-rc="new" data-type="url">${icon("lien")} <span class="grow">${T.typesRecette.url}</span></button>
    <button class="menu-item" data-rc="new" data-type="manual">${icon("crayon")} <span class="grow">${T.typesRecette.manual}</span></button>
    <button class="menu-item" data-rc="new" data-type="file">${icon("appareil")} <span class="grow">${T.typesRecette.file}</span></button>`);
}

document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-rc]");
  if (!btn) return;
  const d = rc.draft;
  switch (btn.dataset.rc) {
    // grille
    case "add": return openTypeChooser();
    case "new": closeSheet(); startDraft(btn.dataset.type); return go("form");
    case "cat": rc.cat = btn.dataset.id || null; closeSheet(); return refreshGrid();
    case "cat-filter": return openCatFilter();
    case "toggle-filter-tag":
      rc.tags.has(btn.dataset.id) ? rc.tags.delete(btn.dataset.id) : rc.tags.add(btn.dataset.id);
      return refreshGrid();
    case "detail": return go("detail", btn.dataset.id);
    case "view-files": return openViewer(btn.dataset.id, Number(btn.dataset.index || 0));

    // fiche
    case "back": return go("grid");
    case "edit": startDraft(null, recipe(btn.dataset.id)); return go("form");

    // formulaire
    case "cancel-form": rc.draft = null; return d && !d.isNew ? go("detail", d.id) : go("grid");
    case "paste": return paste();
    case "remove-cover": d.cover = { path: null, blob: null, preview: null }; return refreshForm();
    case "remove-file": {
      const [f] = d.files.splice(Number(btn.dataset.index), 1);
      if (f?.id) d.removedFiles.push(f.id);
      return refreshForm();
    }
    case "toggle-tag":
      d.tagIds.has(btn.dataset.id) ? d.tagIds.delete(btn.dataset.id) : d.tagIds.add(btn.dataset.id);
      return btn.classList.toggle("on");
    case "add-tag": return addTag();
    case "delete": return deleteRecipe();

    // visionneuse
    case "close-viewer": return closeViewer();
    case "prev-page": return turnPage(-1);
    case "next-page": return turnPage(+1);
  }
});

document.addEventListener("submit", (e) => { if (e.target.id === "rf-form") { e.preventDefault(); saveForm(); } });
document.addEventListener("input", (e) => { if (e.target.id === "rc-q") { rc.q = e.target.value; refreshGrid(); } });
document.addEventListener("change", (e) => {
  const t = e.target;
  if (t.id === "rf-cover-input" && t.files[0]) setCover(t.files[0]);
  if ((t.id === "rf-camera" || t.id === "rf-pick") && t.files.length) { addFiles([...t.files]); t.value = ""; }
  if (t.id === "rf-url") fetchPreview(t.value.trim());
});
document.addEventListener("paste", (e) => { if (e.target.id === "rf-url") setTimeout(() => fetchPreview(e.target.value.trim()), 0); });
document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.target.id === "rf-newtag") { e.preventDefault(); addTag(); }
  // « terminé » dans un champ du formulaire range le clavier, sans enregistrer la recette.
  else if (e.key === "Enter" && e.target.matches("#rf-form input")) { e.preventDefault(); e.target.blur(); }
  if (e.key === "Escape" && document.getElementById("viewer")?.hidden === false) closeViewer();
});
