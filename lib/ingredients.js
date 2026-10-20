// Ingrédients d'une recette → articles d'épicerie.
//
// Une ligne de `ingredients_text` = un ingrédient : c'est le format du
// formulaire, de l'aperçu de lien et de la migration d'Umami. Pour la liste
// d'épicerie, on garde le nom de l'ingrédient sans la quantité ni la
// préparation : « 375 ml (1 ½ tasse) de bouillon de bœuf, chaud » donne
// « Bouillon de bœuf », avec « 375 ml » à part.
// Fonctions pures : le rattachement au catalogue et l'ajout sont dans lib/epicerie.js.

import { nomPropre } from "./noms.js";

const NOMBRE = String.raw`(?:\d+(?:[.,/]\d+)?|[½¼¾⅓⅔⅛⅜⅝⅞])`;
const UNITES = [
  "ml", "cl", "dl", "l", "litres?", "mg", "g", "kg", "lbs?", "oz", "onces?", "livres?",
  "tasses?", String.raw`c\.?\s*à\s*(?:soupe|thé|café|s\.?|t\.?|c\.?)`, String.raw`c\.\s*[st]\.?`,
  String.raw`cuill[eè]res?\s*à\s*(?:soupe|thé|café)`, "pincées?", "gousses?", "boîtes?", "conserves?",
  "paquets?", "sachets?", "tranches?", "branches?", "brins?", "bottes?", "bouquets?", "poignées?",
  "traits?", "morceaux?", "filets?", "noisettes?",
  "cups?", "tbsp", "tsp", "tablespoons?", "teaspoons?", "ounces?", "pounds?", "cans?", "cloves?",
  "pinch(?:es)?", "slices?", "packages?",
].join("|");

// Ce qui précède le nom, enlevé morceau par morceau : quantités, unités,
// « de », tailles (gardés comme quantité), articles (oubliés).
const DEBUTS = [
  { re: new RegExp(String.raw`^(?:environ|about|approx\.?)\s+`, "i"), garde: true },
  { re: new RegExp(String.raw`^${NOMBRE}(?:\s*(?:à|-|–|to)\s*${NOMBRE})?\s*`, "i"), garde: true },
  { re: new RegExp(String.raw`^(?:${UNITES})(?=[\s.]|$)\.?\s*`, "i"), garde: true },
  { re: /^(?:de|des|du|d['’]|of)\s*(?=\S)/i, garde: true },
  { re: /^(?:un peu d['’e]\s*|(?:au goût|à volonté|quelques|une|un|a|an|la|le|les)\s+|l['’]\s*)/i, garde: false },
  // « petits pois » est un produit, pas une taille.
  { re: /^(?:très\s+)?(?:gros|grosses?|petits?|petites?|moyens?|moyennes?|grands?|grandes?|large|small|medium|big)\s+(?!pois\b)/i, garde: true },
];

// Ce qui suit le nom et le décrit : on coupe au premier de ces mots.
const PREPARATION = /^(?:coupée?s?|hachée?s?|émincée?s?|ciselée?s?|râpée?s?|tranchée?s?|pelée?s?|épépinée?s?|égouttée?s?|rincée?s?|cuite?s?|décortiquée?s?|déchiquetée?s?|broyée?s?|grillée?s?|fondue?s?|ramollie?s?|battue?s?|écrasée?s?|émiettée?s?|dénoyautée?s?|tempérée?s?|chopped|diced|minced|sliced|grated|peeled|melted|softened|finely|roughly)$/i;
// … sauf « haché » ou « râpé » après une viande ou un fromage : c'est le produit.
const PRODUIT = /^(?:bœuf|boeuf|porc|veau|agneau|viande|poulet|dinde|fromage|parmesan|mozzarella|cheddar|coco)$/i;
const EN_MORCEAUX = /\s+en\s+(?:dés|cubes|julienne|tranches|rondelles|morceaux|quartiers|bouquets|lanières|purée)\b.*$/i;

/** Un intertitre (« Pour la sauce : ») plutôt qu'un ingrédient. */
export const estIntertitre = (ligne) => /:\s*$/.test(ligne) || (/^pour (?:la|le|les|l['’])/i.test(ligne) && !/\d/.test(ligne));

/**
 * Analyse une ligne d'ingrédient.
 * → { nom, quantite, nombre } : nom à mettre dans la liste (« » si rien à en
 *   tirer), quantité telle qu'écrite (« 375 ml », « 3 gousses »), et nombre
 *   d'unités quand la quantité n'est qu'un entier (« 2 poivrons » → 2).
 */
export function analyser(ligne) {
  let reste = String(ligne)
    .replace(/\([^()]*\)/g, " ").replace(/\([^()]*\)/g, " ")   // (3 c. à soupe), ((imbriquées))
    .split(/,(?!\d)|;|\s[–-]\s|\s(?:pour|ou|or|for)\s/i)[0]   // pas la virgule de « 1,75 litre »
    .replace(/\s+/g, " ").trim();

  let avant = "";
  for (let change = true; change;) {
    change = false;
    for (const { re, garde } of DEBUTS) {
      const m = reste.match(re);
      if (!m || m[0].length >= reste.length) continue;
      if (garde) avant += m[0];
      reste = reste.slice(m[0].length);
      change = true;
    }
  }

  const mots = reste.replace(EN_MORCEAUX, "").split(" ");
  const coupe = mots.findIndex((m, i) => i > 0 && (
    (PREPARATION.test(m) && !(/^(?:hach|râp)/i.test(m) && PRODUIT.test(mots[i - 1])))
    || (/^(?:au|à)$/i.test(m) && /^(?:goût|température|besoin)/i.test(mots[i + 1] || ""))));
  const nom = (coupe > 0 ? mots.slice(0, coupe) : mots).join(" ").replace(/[.:]+$/, "").trim();

  const quantite = avant.replace(/\s*(?:\b(?:de|des|du|of)|d['’])\s*$/i, "").trim();
  const entier = quantite.match(/^(\d{1,2})$/);
  return { nom: nomPropre(nom), quantite: entier ? "" : quantite, nombre: entier ? Number(entier[1]) : 1 };
}

/** Les lignes d'un texte d'ingrédients : { ligne, intertitre }. */
export const lignesIngredients = (texte) => String(texte || "").split("\n")
  .map((l) => l.replace(/^\s*(?:[-•*–·]\s*|▢\s*)/, "").trim()).filter(Boolean)
  .map((ligne) => ({ ligne, intertitre: estIntertitre(ligne) }));
