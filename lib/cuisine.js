// Mode Cuisine : la recette en grand, par-dessus toute l'app, pour cuisiner
// sans toucher à l'écran plus qu'il ne faut.
//
// - Ingrédients et étapes côte à côte quand l'écran est assez large
//   (ordinateur, tablette, téléphone couché) ; sinon deux onglets.
// - Toucher un ingrédient le raye (sorti, mesuré) ; toucher une étape en fait
//   l'étape en cours, les précédentes s'estompent. Au clavier : flèches = étape
//   suivante / précédente, Échap = fermer.
// - L'écran reste allumé tant que le mode est ouvert (lib/eveil.js).
// Rien n'est enregistré : ce qui est rayé et l'étape en cours restent en
// mémoire pour la journée (fermer et rouvrir ne perd rien).

import { store } from "./store.js";
import { T } from "./textes.js";
import { icon } from "./icons.js";
import { esc } from "./ui.js";
import { lignesIngredients } from "./ingredients.js";
import { retenirEveil, relacherEveil, eveilActif, surEveil } from "./eveil.js";

const TAILLE_KEY = "wasabi-cuisine-taille";
const TAILLES = [0.85, 1, 1.2, 1.45, 1.75];   // facteur appliqué au texte
const lireTaille = () => {
  const i = parseInt(localStorage.getItem(TAILLE_KEY), 10);   // rien d'enregistré → NaN → taille normale
  return i >= 0 && i < TAILLES.length ? i : 1;
};

const cu = { id: null, volet: "etapes", taille: lireTaille() };
const suivis = new Map();   // recette → { jour, rayes: Set(rang d'ingrédient), etape }
const aujourdhui = () => new Date().toDateString();
function suivi(id) {
  let s = suivis.get(id);
  if (!s || s.jour !== aujourdhui()) { s = { jour: aujourdhui(), rayes: new Set(), etape: 0 }; suivis.set(id, s); }
  return s;
}

const recette = () => store.data.recipes.find((r) => r.id === cu.id) || null;
const ecran = () => document.getElementById("cuisine");
const ouvert = () => !!ecran() && !ecran().hidden;

/**
 * Les étapes d'un texte : une ligne = une étape. La numérotation d'origine
 * (« 1. », « 2) », « Étape 3 : ») est retirée, on renumérote ; une ligne courte
 * finissant par « : » est un intertitre (« Pour la sauce : »).
 */
export function etapesDe(texte) {
  return String(texte || "").split("\n")
    .map((l) => l.trim().replace(/^(?:[-•*–·]\s+|(?:étape\s*)?\d{1,2}\s*(?:[.):](?!\d)|\s[-–])\s*)/i, "").trim())
    .filter(Boolean)
    .map((ligne) => ({ ligne, intertitre: ligne.length <= 60 && /:$/.test(ligne) && !/[.!?]/.test(ligne.slice(0, -1)) }));
}

// ------------------------------------------------------------------ rendu ---
function ingredientsHtml(r, s) {
  const lignes = lignesIngredients(r.ingredients_text);
  if (!lignes.length) return `<p class="cu-vide">${T.cuisineSansIngredients}</p>`;
  return `<ul class="cu-liste">${lignes.map((l, i) => l.intertitre
    ? `<li class="cu-titre">${esc(l.ligne)}</li>`
    : `<li><button type="button" class="cu-ing" data-cu="rayer" data-i="${i}" aria-pressed="${s.rayes.has(i)}">
         <span class="case">${s.rayes.has(i) ? icon("crochet") : ""}</span><span>${esc(l.ligne)}</span>
       </button></li>`).join("")}</ul>`;
}

function etapesHtml(r, s) {
  const etapes = etapesDe(r.steps_text);
  let no = 0;
  const liste = etapes.length ? `<ol class="cu-liste">${etapes.map((e) => {
    if (e.intertitre) return `<li class="cu-titre">${esc(e.ligne)}</li>`;
    const i = no++;
    return `<li><button type="button" class="cu-etape${i < s.etape ? " faite" : ""}" data-cu="etape" data-i="${i}" ${i === s.etape ? 'aria-current="step"' : ""}>
        <span class="cu-no">${i + 1}</span><span>${esc(e.ligne)}</span>
      </button></li>`;
  }).join("")}</ol>` : `<p class="cu-vide">${T.cuisineSansEtapes}</p>`;
  const lien = r.type === "url" && !etapes.length && /^https?:\/\//.test(r.url || "")
    ? `<a class="btn" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${icon("externe")} ${T.ouvrirRecette}</a>` : "";
  const notes = r.notes ? `<h2 class="label">${T.notes}</h2><p class="prose">${esc(r.notes)}</p>` : "";
  return liste + lien + notes;
}

function rendre() {
  const r = recette();
  const el = ecran();
  if (!r || !el) return fermer();
  const s = suivi(r.id);
  el.dataset.volet = cu.volet;
  el.style.setProperty("--cu-taille", TAILLES[cu.taille]);
  el.innerHTML = `
    <header class="cu-bar">
      <button class="icon-btn" data-cu="fermer" aria-label="${T.fermer}">${icon("fermer")}</button>
      <h1>${esc(r.title)}</h1>
      <span class="cu-eveil" id="cu-eveil"></span>
      <button class="icon-btn cu-aa" data-cu="plus-petit" aria-label="${T.textePlusPetit}" ${cu.taille ? "" : "disabled"}>A<small>−</small></button>
      <button class="icon-btn cu-aa" data-cu="plus-gros" aria-label="${T.textePlusGros}" ${cu.taille < TAILLES.length - 1 ? "" : "disabled"}>A<small>+</small></button>
    </header>
    <div class="cu-onglets" role="tablist">
      <button role="tab" data-cu="volet" data-volet="ingredients" aria-selected="${cu.volet === "ingredients"}">${T.ingredients}</button>
      <button role="tab" data-cu="volet" data-volet="etapes" aria-selected="${cu.volet === "etapes"}">${T.etapes}</button>
    </div>
    <div class="cu-corps">
      <section class="cu-volet" id="cu-ingredients"><h2 class="label">${T.ingredients}</h2>${ingredientsHtml(r, s)}</section>
      <section class="cu-volet" id="cu-etapes"><h2 class="label">${T.etapes}</h2>${etapesHtml(r, s)}</section>
    </div>`;
  majEveil();
}

// Pastille « écran gardé allumé » : pleine quand le verrou est tenu, éteinte
// (et barrée d'une explication) quand l'appareil ne le permet pas.
function majEveil() {
  const el = document.getElementById("cu-eveil");
  if (!el) return;
  const actif = eveilActif();
  el.classList.toggle("actif", actif);
  el.title = actif ? T.ecranAllume : T.ecranPeutSEteindre;
  el.innerHTML = `${icon("soleil")}<span>${actif ? T.ecranAllume : T.ecranPeutSEteindre}</span>`;
}
surEveil(() => { if (ouvert()) majEveil(); });

// --------------------------------------------------------------- actions ---
export function ouvrirCuisine(recipeId) {
  const r = store.data.recipes.find((x) => x.id === recipeId);
  if (!r) return;
  cu.id = recipeId;
  // Au téléphone (onglets) : on commence par sortir les ingrédients, sauf si c'est déjà entamé.
  const s = suivi(recipeId);
  cu.volet = r.ingredients_text && !s.etape && !s.rayes.size ? "ingredients" : "etapes";
  let el = ecran();
  if (!el) {
    el = document.createElement("div");
    el.id = "cuisine"; el.className = "cuisine";
    el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-label", T.modeCuisine);
    document.body.appendChild(el);
  }
  el.hidden = false;
  document.activeElement?.blur();
  retenirEveil("cuisine");
  rendre();
  montrerEtape(false);
}

function fermer() {
  const el = ecran();
  if (el) { el.hidden = true; el.innerHTML = ""; }
  relacherEveil("cuisine");
  cu.id = null;
}

function rayer(btn) {
  const s = suivi(cu.id), i = Number(btn.dataset.i);
  s.rayes.has(i) ? s.rayes.delete(i) : s.rayes.add(i);
  btn.setAttribute("aria-pressed", s.rayes.has(i));
  btn.querySelector(".case").innerHTML = s.rayes.has(i) ? icon("crochet") : "";
}

function allerA(i) {
  const boutons = [...document.querySelectorAll("#cu-etapes .cu-etape")];
  if (!boutons.length) return;
  const s = suivi(cu.id);
  s.etape = Math.max(0, Math.min(boutons.length - 1, i));
  boutons.forEach((b, k) => {
    b.classList.toggle("faite", k < s.etape);
    if (k === s.etape) b.setAttribute("aria-current", "step"); else b.removeAttribute("aria-current");
  });
  montrerEtape(true);
}

// L'étape en cours, vers le tiers supérieur de son volet (jamais scrollIntoView :
// il ferait aussi bouger la page).
function montrerEtape(doux) {
  const b = document.querySelector('#cu-etapes .cu-etape[aria-current="step"]');
  const volet = document.getElementById("cu-etapes");
  if (!b || !volet || !volet.offsetParent) return;
  const r = b.getBoundingClientRect(), v = volet.getBoundingClientRect();
  if (!doux && r.top >= v.top && r.bottom <= v.bottom) return;
  volet.scrollTo({ top: volet.scrollTop + (r.top - v.top) - Math.max(16, (v.height - r.height) / 3), behavior: doux ? "smooth" : "auto" });
}

function changerTaille(delta) {
  cu.taille = Math.max(0, Math.min(TAILLES.length - 1, cu.taille + delta));
  try { localStorage.setItem(TAILLE_KEY, cu.taille); } catch { /* rien */ }
  const el = ecran();
  el.style.setProperty("--cu-taille", TAILLES[cu.taille]);
  el.querySelector('[data-cu="plus-petit"]').disabled = cu.taille === 0;
  el.querySelector('[data-cu="plus-gros"]').disabled = cu.taille === TAILLES.length - 1;
}

function changerVolet(volet) {
  cu.volet = volet;
  const el = ecran();
  el.dataset.volet = volet;
  el.querySelectorAll('[data-cu="volet"]').forEach((b) => b.setAttribute("aria-selected", b.dataset.volet === volet));
  if (volet === "etapes") montrerEtape(false);
}

// ------------------------------------------------------------- événements ---
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-cu]");
  if (!btn) return;
  switch (btn.dataset.cu) {
    case "ouvrir": return ouvrirCuisine(btn.dataset.id);   // bouton « Cuisiner » d'une fiche
    case "fermer": return fermer();
    case "rayer": return rayer(btn);
    case "etape": return allerA(Number(btn.dataset.i));
    case "volet": return changerVolet(btn.dataset.volet);
    case "plus-petit": return changerTaille(-1);
    case "plus-gros": return changerTaille(+1);
  }
});

document.addEventListener("keydown", (e) => {
  if (!ouvert() || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === "Escape") { e.preventDefault(); return fermer(); }
  const pas = { ArrowDown: 1, ArrowRight: 1, PageDown: 1, ArrowUp: -1, ArrowLeft: -1, PageUp: -1 }[e.key];
  if (!pas) return;
  e.preventDefault();
  if (cu.volet !== "etapes") changerVolet("etapes");
  allerA(suivi(cu.id).etape + pas);
});
