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
//   4. l'espace /api/, réservé à l'aperçu de lien des recettes (phase 3).
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

    // Phase 3 : POST /api/apercu-lien (jeton Supabase exigé, protection SSRF).
    if (pathname.startsWith("/api/")) return texte("Pas encore disponible.", 404);

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
