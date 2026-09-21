# 🌿 Wasabi

App maison (PWA) pour les **listes d'épicerie** et le **carnet de recettes** du
foyer, partagés en temps réel et utilisables hors ligne. Remplace Umami.

- Aucune compilation, aucun `npm` : juste des fichiers statiques (comme Calico et Panache).
- Données + temps réel + connexion + fichiers : **Supabase** (offre gratuite).
- Hébergement : **Cloudflare Workers**, publié à chaque `git push`.

Documents de référence : `FEUILLE_DE_ROUTE.md` (portée et phases),
`CHARTE-COULEURS.md` (couleurs), `REUTILISATION.md` (ce qui vient de Calico et Panache).

**État : phase 1 (épicerie).** Listes avec emoji, articles, quantités, boîte
d'ajout avec suggestions par fréquence et autocomplétion sur la mémoire du foyer,
tout cocher / décocher / effacer les cochés, temps réel et hors ligne. Articles classés
par allée (11 allées) puis par ordre alphabétique ; un catalogue québécois
(`catalogue.csv`) donne son allée à chaque nouvel article.

---

## 1. Supabase (une seule fois)

1. **SQL Editor** → **New query** → coller tout `schema.sql` → **Run**. Tu dois voir « Success ».
   Le fichier peut être repassé sans danger.
2. **Authentication** → **Sign In / Providers** → **Email** : activé, et
   **« Confirm email » désactivé** → **Save**.
3. **Authentication** → **URL Configuration** → **Site URL** :
   `https://wasabi.jamberlouze.workers.dev`
4. **Project Settings** → **API** : copier **Project URL** dans `lib/config.js`
   (la clé publique y est déjà).

## 2. Publier

Dépôt GitHub privé `jamberlouze-cat/wasabi`; Cloudflare publie à chaque `git push` :

- branche **`main`** → production : https://wasabi.jamberlouze.workers.dev
- branche **`dev`** → aperçu : https://dev-wasabi.jamberlouze.workers.dev
  (installable à côté de la vraie app : nom « Wasabi DEV », icône inversée)

`.assetsignore` liste ce qui reste dans le dépôt mais n'est **jamais** publié.

### Supabase reste éveillé tout seul

Deux gardiens indépendants : le cron de `worker.js` (4 fois par jour) et
`.github/workflows/supabase-eveil.yml` (3 fois par jour).
Vérification à la main : https://wasabi.jamberlouze.workers.dev/_ping doit
répondre « Supabase répond. »

## 3. Premier usage

1. Ouvrir l'adresse dans **Safari** → **Partager** → **Sur l'écran d'accueil**.
2. Courriel + mot de passe → **Continuer** (la première fois, ça crée le compte).
3. **Créer un foyer** → **Réglages** → copier le **code d'invitation**.
4. L'autre personne : même chose, mais **Rejoindre ce foyer** avec le code.

## 4. Développer en local

```bash
python3 _dev/serve.py
```

- http://localhost:4174/ — la vraie app (exige `lib/config.js` rempli).
- http://localhost:4174/_test.html — **banc d'essai** : la vraie `app.js` sur un
  faux Supabase en mémoire. `?scenario=auth` (écran de connexion),
  `?scenario=onboard` (sans foyer). Dans la console : `__fake.offline = true`
  simule une panne de réseau, `__fake.log` montre ce qui a été envoyé.

## Structure des fichiers

```
index.html              coquille de l'app + enregistrement du service worker
tokens.css              jetons de couleur (charte) — importé une seule fois
app.css                 styles ; uniquement des jetons de rôle, aucun hex
app.js                  auth, foyer, onglets, réglages, temps réel, réveil
lib/config.js           ← adresse et clé publique Supabase
lib/supabase.js         client Supabase
lib/store.js            couche hors ligne : copie locale + file de patchs par champ
lib/epicerie.js         onglet Épicerie : listes, articles, boîte d'ajout collée au clavier
lib/noms.js             noms normalisés + identifiants stables (pas de doublon à la synchro)
lib/ui.js               échappement, toasts, feuilles du bas
lib/textes.js           toutes les chaînes de l'interface (français)
lib/icons.js            icônes SVG en ligne
lib/vendor/             supabase-js embarqué (démarrage sans réseau)
manifest.webmanifest    métadonnées PWA (+ share_target pour Android)
sw.js                   service worker (installable, coquille hors ligne)
schema.sql              schéma complet, RLS, semis, Storage, temps réel (nouvelle installation)
migration-allees.sql    gabarit des 11 allées, à passer une fois sur une base déjà installée
catalogue.csv           catalogue d'articles (nom, synonymes séparés par « | », cle_allee) — à corriger ici
catalogue.sql           généré par `python3 _dev/catalogue_sql.py`, à passer dans Supabase
worker.js               waker Supabase, /_ping, habillage de l'aperçu, /api/ (phase 3)
wrangler.jsonc          config Cloudflare Workers
_headers                en-têtes HTTP
_test.html, _dev/       banc d'essai, faux Supabase, serveur local, générateur d'icônes
```

À chaque changement des fichiers de la coquille, monter le numéro de `CACHE`
dans `sw.js` et tenir la liste `SHELL` à jour.
