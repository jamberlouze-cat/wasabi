// Noms d'articles : forme normalisée (recherche, unicité) et identifiants stables.

/** Minuscules, sans accents, espaces simples : « Pâté  chinois » → « pate chinois ». */
export function normaliser(s) {
  return String(s)
    .replace(/œ/gi, "oe").replace(/æ/gi, "ae")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim();
}

/** Nom tel qu'affiché : espaces nettoyés, première lettre en majuscule. */
export function nomPropre(s) {
  const t = String(s).replace(/\s+/g, " ").trim();
  return t ? t[0].toLocaleUpperCase("fr-CA") + t.slice(1) : "";
}

// Identifiant stable, au format UUID, tiré d'un texte. Deux téléphones hors
// ligne qui ajoutent « Lait » à la même liste fabriquent ainsi LA MÊME ligne :
// à la synchro, elles fusionnent au lieu de faire un doublon (ou de buter sur
// la contrainte d'unicité du nom). Hachage cyrb128 : pas cryptographique, mais
// amplement assez dispersé pour quelques milliers d'articles.
export function idStable(...parts) {
  const str = parts.join("|");
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  const hex = [h1 ^ h2 ^ h3 ^ h4, h2 ^ h1, h3 ^ h1, h4 ^ h1]
    .map((n) => (n >>> 0).toString(16).padStart(8, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
