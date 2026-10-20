// Worker Cloudflare de Wasabi.
//
// Le site lui-même est servi tel quel par Cloudflare (fichiers statiques).
// Ce fichier n'ajoute que :
//   1. une tâche planifiée qui « visite » Supabase quatre fois par jour, pour
//      que l'offre gratuite ne mette jamais le projet en pause (il faut
//      quelques requêtes à la base chaque jour) ;
//   2. l'adresse /_ping, qui déclenche la même visite à la main pour vérifier ;
//   3. sur l'aperçu (dev-wasabi…), une icône inversée et le nom « Wasabi DEV »,
//      pour distinguer les deux apps sur l'écran d'accueil de l'iPhone ;
//   4. /api/ : l'aperçu de lien des recettes, avec ingrédients et étapes quand
//      le site les publie (voir plus bas).
//
// Les requêtes du ping sont minuscules : elles demandent un identifiant dans
// trois tables avec la clé publique, et les règles de sécurité (RLS) répondent
// une liste vide. Ça compte comme de l'activité sans rien exposer.
// (Le même ping existe aussi dans .github/workflows/supabase-eveil.yml, au
// cas où le cron Cloudflare ne tournerait pas.)

import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./lib/config.js";

const TABLES = ["households", "household_members", "grocery_lists"];

async function pingSupabase() {
  return Promise.all(TABLES.map(async (table) => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=id&limit=1`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });
    if (!res.ok) throw new Error(`Supabase a répondu ${res.status} pour ${table}`);
    return res.status;
  }));
}

// ------------------------------------------------------- aperçu de lien ---
// Seul service serveur de l'app (feuille de route § 6.2). Deux adresses, toutes
// deux réservées aux comptes connectés (jeton Supabase valide) :
//   POST /api/apercu-lien  { url }  →  { title, image, site_name }  (balises Open Graph)
//                                       + { ingredients, steps }   (fiche schema.org Recipe)
//   POST /api/image        { url }  →  les octets de l'image (le téléphone la
//                                       réduit puis la range dans Storage : les
//                                       liens d'images meurent, et plusieurs
//                                       sites bloquent l'affichage externe)
// Protection SSRF : http/https seulement, ports standards, aucune adresse
// privée ou locale, redirections revérifiées une à une, 5 s maximum, taille
// de réponse plafonnée.

const DELAI_MS = 5000;
const MAX_HTML = 768 * 1024;
const MAX_IMAGE = 8 * 1024 * 1024;
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});

export function adresseSure(href) {
  let u;
  try { u = new URL(href); } catch { return null; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (u.username || u.password) return null;
  if (u.port && u.port !== "80" && u.port !== "443") return null;
  const h = u.hostname.toLowerCase();
  if (!h.includes(".") || h.includes(":") || h.startsWith("[")) return null;      // localhost, IPv6
  if (/\.(local|localhost|internal|lan|home|corp|test|invalid)$/.test(h)) return null;
  const ip = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ip) {
    const [a, b] = [Number(ip[1]), Number(ip[2])];
    if (a === 0 || a === 10 || a === 127 || a >= 224) return null;
    if (a === 169 && b === 254) return null;
    if (a === 172 && b >= 16 && b <= 31) return null;
    if (a === 192 && b === 168) return null;
    if (a === 100 && b >= 64 && b <= 127) return null;
  } else if (/^[\d.]+$/.test(h)) return null;                                     // IP écrite autrement
  return u;
}

// Télécharge en suivant les redirections à la main (chacune est revérifiée),
// sous un délai global, et ne lit jamais plus que `max` octets.
async function telecharger(href, accept, max) {
  const signal = AbortSignal.timeout(DELAI_MS);
  let u = adresseSure(href);
  for (let saut = 0; u && saut < 5; saut++) {
    const res = await fetch(u.href, {
      redirect: "manual", signal,
      headers: { "user-agent": UA, accept, "accept-language": "fr-CA,fr;q=0.9,en;q=0.7" },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      u = adresseSure(new URL(res.headers.get("location"), u).href);
      continue;
    }
    if (!res.ok || !res.body) return null;
    const reader = res.body.getReader();
    const morceaux = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (total + value.length > max) {
        await reader.cancel();
        if (accept.startsWith("image")) return null;       // image trop lourde : on renonce
        morceaux.push(value.subarray(0, max - total));     // page : l'aperçu et la recette sont presque toujours avant
        total = max;
        break;
      }
      morceaux.push(value);
      total += value.length;
    }
    const octets = new Uint8Array(total);
    let pos = 0;
    for (const m of morceaux) { octets.set(m, pos); pos += m.length; }
    return { octets, type: res.headers.get("content-type") || "", url: u };
  }
  return null;
}

const ENTITES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", laquo: "«", raquo: "»", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", ndash: "–", mdash: "—", hellip: "…", deg: "°", oelig: "œ", aelig: "æ" };
const ACCENTS = { grave: "\u0300", acute: "\u0301", circ: "\u0302", tilde: "\u0303", uml: "\u0308", cedil: "\u0327" };
const decoder = (s) => String(s || "")
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  // &eacute; &Agrave; &icirc; &ccedil;… : la lettre + son accent, recomposés
  .replace(/&([a-zA-Z])(grave|acute|circ|tilde|uml|cedil);/g, (_, l, a) => (l + ACCENTS[a]).normalize("NFC"))
  .replace(/&([a-z]+);/gi, (m, n) => ENTITES[n.toLowerCase()] ?? m)
  .replace(/\s+/g, " ").trim();

/** Titre, image et nom du site tirés des balises Open Graph (repli sur <title>). */
export function extraireApercu(html, base) {
  const metas = {};
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const attr = {};
    for (const m of tag.matchAll(/([a-z:_-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/gi)) {
      attr[m[1].toLowerCase()] = m[3] ?? m[4] ?? m[5] ?? "";
    }
    const cle = (attr.property || attr.name || "").toLowerCase();
    if (cle && attr.content && !(cle in metas)) metas[cle] = attr.content;
  }
  const titre = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  let image = metas["og:image:secure_url"] || metas["og:image"] || metas["twitter:image"] || metas["twitter:image:src"] || "";
  if (image) { try { image = new URL(decoder(image), base).href; } catch { image = ""; } }
  return {
    title: decoder(metas["og:title"] || metas["twitter:title"] || titre).slice(0, 200),
    image: image && adresseSure(image) ? image : "",
    site_name: decoder(metas["og:site_name"]).slice(0, 80) || new URL(base).hostname.replace(/^www\./, ""),
  };
}

// ------------------------------------------------------ fiche de recette ---
// La plupart des sites de recettes publient la recette en données structurées
// pour les moteurs de recherche (schema.org Recipe, dans un
// <script type="application/ld+json">, ou en attributs itemprop dans le HTML) :
// ingrédients et étapes s'y lisent tels quels, sans IA. Pas de fiche Recipe :
// chaînes vides, la personne complète à la main. Même format que les recettes
// importées d'Umami : un ingrédient par ligne, des étapes numérotées.

const MAX_TEXTE = 10000;   // par champ

// Une valeur schema.org en lignes de texte : balises retirées, entités décodées.
const lignes = (s) => String(s ?? "")
  .replace(/<br\s*\/?>|<\/(p|li|div|h\d)>/gi, "\n")
  .replace(/<[^>]+>/g, " ")
  .split("\n").map(decoder).filter(Boolean);

function blocsJsonLd(html) {
  const blocs = [];
  for (const m of html.matchAll(/<script\b[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    const brut = m[1].trim().replace(/^<!\[CDATA\[|\]\]>$/g, "");
    try { blocs.push(JSON.parse(brut)); } catch {
      // Sauts de ligne bruts dans les chaînes : JSON invalide, mais fréquent.
      try { blocs.push(JSON.parse(brut.replace(/[\u0000-\u001f]+/g, " "))); } catch { /* bloc illisible */ }
    }
  }
  return blocs;
}

const estDeType = (noeud, type) => [].concat(noeud?.["@type"] || [])
  .some((t) => new RegExp(`(^|[/:])${type}$`, "i").test(String(t)));

// La recette peut être seule, dans une liste, dans un @graph (Yoast) ou
// rattachée à la page (mainEntity).
function trouverRecette(noeud, profondeur = 0) {
  if (!noeud || typeof noeud !== "object" || profondeur > 6) return null;
  if (Array.isArray(noeud)) {
    for (const n of noeud) { const r = trouverRecette(n, profondeur + 1); if (r) return r; }
    return null;
  }
  if (estDeType(noeud, "Recipe")) return noeud;
  for (const cle of ["@graph", "mainEntity", "itemListElement", "item"]) {
    const r = trouverRecette(noeud[cle], profondeur + 1);
    if (r) return r;
  }
  return null;
}

// recipeInstructions : un texte, une liste de textes, de HowToStep, ou de
// HowToSection (« Sauce », « Montage »…) qui contiennent des HowToStep.
// Les intertitres seuls (« Étapes », « Étape 2 », « Préparation ») sont écartés.
const INTERTITRE = /^(étapes?|préparation|instructions?|méthode|steps?|method|directions?)(\s*\d+)?\s*:?$/i;
function lireEtapes(valeur, sortie = [], profondeur = 0) {
  if (valeur == null || profondeur > 5) return sortie;
  if (typeof valeur === "string") {
    for (const t of lignes(valeur)) if (!INTERTITRE.test(t)) sortie.push({ texte: t });
  } else if (Array.isArray(valeur)) {
    for (const v of valeur) lireEtapes(v, sortie, profondeur + 1);
  } else if (typeof valeur === "object") {
    if (estDeType(valeur, "HowToSection") || (valeur.itemListElement && !valeur.text)) {
      const nom = lignes(valeur.name).join(" ");
      if (nom) sortie.push({ section: nom });
      lireEtapes(valeur.itemListElement, sortie, profondeur + 1);
    } else {
      const t = lignes(valeur.text || valeur.name || valeur.description).join(" ");
      if (t && !INTERTITRE.test(t)) sortie.push({ texte: t });
    }
  }
  return sortie;
}

// Microdata : le contenu HTML de chaque élément itemprop="…" (ou son attribut
// content), jusqu'à sa balise fermante, imbrications du même nom comptées.
// Moins courant que le JSON-LD, mais c'est le format de Trois fois par jour.
function itemprops(html, noms) {
  const valeurs = [];
  for (const m of html.matchAll(new RegExp(`<(\\w+)\\b[^>]*\\bitemprop=["']?(?:${noms})\\b[^>]*>`, "gi"))) {
    const attr = m[0].match(/\bcontent=(?:"([^"]*)"|'([^']*)')/i);
    if (attr) { valeurs.push(attr[1] ?? attr[2]); continue; }
    const debut = m.index + m[0].length;
    const balises = new RegExp(`<(/?)${m[1]}\\b[^>]*>`, "gi");
    balises.lastIndex = debut;
    for (let niveau = 1, b; (b = balises.exec(html)) && b.index - debut < MAX_TEXTE;) {
      niveau += b[1] ? -1 : 1;
      if (!niveau) { valeurs.push(html.slice(debut, b.index)); break; }
    }
  }
  return valeurs;
}

/** Ingrédients et étapes de la fiche schema.org Recipe de la page ("" si absente). */
export function extraireRecette(html) {
  let recette = null;
  for (const bloc of blocsJsonLd(html)) if ((recette = trouverRecette(bloc))) break;
  recette ||= {
    recipeIngredient: itemprops(html, "recipeIngredient|ingredients"),
    recipeInstructions: itemprops(html, "recipeInstructions"),
  };

  const ingredients = [].concat(recette.recipeIngredient || recette.ingredients || [])
    .flatMap((x) => lignes(typeof x === "string" ? x : x?.name || x?.text));
  const liste = lireEtapes(recette.recipeInstructions);
  // Une seule section porte d'habitude le nom de la recette : on ne la montre pas.
  const sections = liste.filter((e) => e.section).length > 1;
  let n = 0;
  const steps = liste.filter((e) => sections || !e.section).map((e, i) => e.section
    ? `${i ? "\n" : ""}${e.section}`
    // Étapes déjà numérotées par le site : on renumérote.
    : `${++n}. ${e.texte.replace(/^(?:étape\s*)?\d+\s*[.):–-]\s*/i, "")}`);
  return {
    ingredients: ingredients.join("\n").slice(0, MAX_TEXTE),
    steps: steps.join("\n").slice(0, MAX_TEXTE),
  };
}

async function compteValide(request) {
  const auth = request.headers.get("authorization") || "";
  if (!/^Bearer \S+/.test(auth)) return false;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: auth } });
  return res.ok;
}

async function api(request, pathname) {
  if (request.method !== "POST") return json({ error: "methode" }, 405);
  if (!(await compteValide(request))) return json({ error: "non-connecte" }, 401);
  let url = "";
  try { url = String((await request.json()).url || ""); } catch { /* corps illisible */ }
  if (!adresseSure(url)) return json({ error: "adresse-refusee" }, 400);

  try {
    if (pathname === "/api/apercu-lien") {
      const page = await telecharger(url, "text/html,application/xhtml+xml", MAX_HTML);
      if (!page) return json({ error: "page-inaccessible" }, 502);
      const html = new TextDecoder("utf-8").decode(page.octets);
      return json({ ...extraireApercu(html, page.url.href), ...extraireRecette(html) });
    }
    if (pathname === "/api/image") {
      const img = await telecharger(url, "image/avif,image/webp,image/*;q=0.8", MAX_IMAGE);
      if (!img || !img.type.toLowerCase().startsWith("image/")) return json({ error: "image-inaccessible" }, 502);
      return new Response(img.octets, { headers: { "content-type": img.type, "cache-control": "no-store" } });
    }
  } catch {
    return json({ error: "delai-ou-panne" }, 504);
  }
  return json({ error: "inconnu" }, 404);
}

const texte = (body, status = 200) =>
  new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8" } });

// L'aperçu est servi par le même code que la prod : seul le nom d'hôte diffère.
const estApercu = (url) => url.hostname.startsWith("dev-") || url.hostname.startsWith("localhost");

// Icônes inversées pour l'aperçu (assets/icon-*-dev.png).
const ICONES_DEV = {
  "/assets/icon-180.png": "/assets/icon-180-dev.png",
  "/assets/icon-192.png": "/assets/icon-192-dev.png",
  "/assets/icon-512.png": "/assets/icon-512-dev.png",
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;

    if (pathname === "/_ping") {
      try {
        await pingSupabase();
        return texte("Supabase répond.");
      } catch (err) {
        return texte(`Échec : ${err.message}`, 502);
      }
    }

    if (pathname.startsWith("/api/")) return api(request, pathname);

    if (estApercu(url)) {
      if (ICONES_DEV[pathname]) {
        url.pathname = ICONES_DEV[pathname];
        return env.ASSETS.fetch(new Request(url, request));
      }
      // Manifeste : nom et icônes de l'aperçu.
      if (pathname === "/manifest.webmanifest") {
        const res = await env.ASSETS.fetch(request);
        if (!res.ok) return res;
        const m = await res.json();
        m.name = "Wasabi DEV";
        m.short_name = "Wasabi DEV";
        for (const ic of m.icons) ic.src = ic.src.replace(/icon-(\d+)\.png$/, "icon-$1-dev.png");
        return new Response(JSON.stringify(m, null, 2), {
          headers: { "content-type": "application/manifest+json; charset=utf-8", "cache-control": "no-cache" },
        });
      }
    }

    // Tout le reste : les fichiers du site (et 404 pour les pages inconnues).
    return env.ASSETS.fetch(request);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(pingSupabase());
  },
};
