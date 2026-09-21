# Réutilisation de Calico et Panache

> Résumé exigé par la section 3 de `FEUILLE_DE_ROUTE.md`, produit après inspection
> des deux projets (2026-09-21).
> Calico = dossier `Gestionnaire de tâche maison` · Panache = dossier `Golf Tracker parcours du cerf`.

## Le socle commun

Les deux apps (et Kenda) sont bâties pareil : **fichiers statiques, aucune
compilation, aucun `npm`**. Un `index.html`, un `app.js` en modules ES, un
`app.css`, un dossier `lib/`, un service worker, un manifeste. Cloudflare Workers
sert le dossier tel quel; `worker.js` n'ajoute que le waker. Wasabi fait pareil.

## Repris tel quel (copié, seuls les noms changent)

| Élément | Source | Notes |
|---|---|---|
| Connexion courriel + mot de passe, « connexion sinon création du compte » | Calico `app.js` (`renderAuth`, `submitAuth`) | « Confirm email » désactivé dans Supabase. Formulaire compatible Trousseau iOS. |
| Foyer : `create_household`, `join_household`, code d'invitation à 4 caractères, maximum 5 membres | Calico `schema.sql` | La table `members` de Calico devient `household_members` (nom de la feuille de route). |
| Fonction `user_household_ids()` (SECURITY DEFINER, évite la récursion RLS) et politiques par foyer | Calico `schema.sql` | Même politique sur toutes les tables de Wasabi. |
| Démarrage : copie locale d'abord, puis session, puis foyer, puis chargement | Calico `app.js` (`boot`, `fetchMembership`, `resetToSignedOut`) | Y compris le cas « jeton impossible à rafraîchir hors ligne ». |
| Réveil de l'app : `visibilitychange`, `pageshow`, `online`, réessai aux 30 s | Calico `app.js` (`wakeUp`) | L'événement `online` n'est pas fiable sur iOS. |
| Temps réel : un canal par foyer, réouverture au réveil, rechargement à chaque reconnexion | Calico `app.js` (`subscribeRealtime`) | |
| Détection d'une panne de réseau (`status === 0`) par opposition à un refus de Supabase | Calico `app.js` (`isNetworkFailure`) | |
| Service worker « réseau d'abord avec délai de 3 s, sinon cache » | Calico `sw.js` | La partie CDN disparaît (voir plus bas). |
| supabase-js 2.45.4 embarqué dans le dépôt | Panache `lib/vendor/supabase-js.js` | Copié tel quel : l'app démarre hors ligne sans dépendre d'un CDN. |
| Waker : cron Cloudflare 4 fois par jour + adresse `/_ping` | Calico `worker.js` | |
| Second gardien : GitHub Actions 3 fois par jour | Calico `.github/workflows/supabase-eveil.yml` | |
| Déploiement : `wrangler.jsonc`, `.assetsignore`, `main` → production, `dev` → aperçu | Calico | Aperçu installable à côté de la vraie app (nom « Wasabi DEV », icône inversée). |
| En-têtes HTTP (`sw.js` jamais mis en cache, sécurité de base) | Panache `_headers` | |
| Feuilles du bas (`openSheet` / `closeSheet`) avec correction du défilement iOS après le clavier | Calico `app.js` | |
| Toasts, échappement HTML, délégation d'événements par `data-act` | Calico `app.js` | |
| Banc d'essai : vraie `app.js` sur un faux Supabase en mémoire + serveur local sans cache | Calico `_test-ui.html`, `_serve.py`; Panache pour l'injection par variable globale | |

## Adapté

| Élément | Ce qui change | Pourquoi |
|---|---|---|
| Couche hors ligne (`lib/store.js`) | Calico et Panache n'ont qu'une file pour **un seul type d'action** (une coche, un score); tout le reste exige le réseau. Wasabi généralise : instantané de toutes les tables + **file de patchs** (`upsert` d'une ligne complète à la création, `update` des **seuls champs modifiés** ensuite). | Feuille de route § 7 : toute action doit réussir hors ligne; conflits réglés **par champ**. Un `update` qui n'envoie que `checked` n'écrase pas la `quantity` changée par l'autre. |
| Identifiants | UUID générés côté client (`crypto.randomUUID()`), `created_at` fixé par le client. | Nécessaire pour créer hors ligne. |
| Suppression | Logique (`deleted_at`) sur toutes les tables synchronisées; c'est un patch comme un autre. | § 5. « Effacer les cochés » enverra un patch par article coché **au moment du geste**. |
| Stockage local | `localStorage` comme Calico/Panache pour les données. Les vignettes et fichiers de recettes (phase 3) iront dans l'API Cache. | `localStorage` ne convient pas aux images et PDF. |
| `worker.js` | Petit routeur : `/_ping`, habillage de l'aperçu, et l'espace `/api/` réservé à l'aperçu de lien (phase 3). | Seul service serveur de l'app. |
| Icônes d'interface | SVG en ligne (`lib/icons.js`) plutôt que la police Tabler d'un CDN. | Rien à mettre en cache depuis un CDN : le service worker se simplifie. |
| Couleurs | `tokens.css` + jetons de rôle seulement. | `CHARTE-COULEURS.md`. |
| Navigation | Barre d'onglets du bas (Épicerie · Recettes · Réglages) au lieu de l'en-tête + segments de Calico. | § 6. |

## Nouveau (rien d'équivalent à reprendre)

- Tables d'épicerie et de recettes, semis des catégories et de l'allée `autre` à la création du foyer.
- Compartiment Storage `recipe-media` et ses politiques.
- Boîte d'ajout collée au clavier (`visualViewport`) — maquette jetable `_clavier.html` à essayer sur l'iPhone dès la phase 0.
- Chaînes françaises regroupées dans `lib/textes.js`.
- Déclaration `share_target` (Android) dans le manifeste.

## Écarts assumés par rapport à la feuille de route

1. **Pas de table `profiles`.** Calico n'en a pas : le prénom et la couleur vivent
   dans la ligne de membre. « Structure identique à Calico » l'emporte.
2. **`household_id` ajouté sur `list_items`, `recipe_files` et `recipe_tags`**
   (absent du § 5). Une seule politique RLS pour toutes les tables, un filtre
   temps réel par foyer, et un chargement uniforme dans `store.js`. Une clé
   étrangère composée garantit que le foyer de la ligne est bien celui du parent.
3. **`recipe_tags` a un `id`** (en plus de l'unicité `recipe_id` + `tag_id`) pour
   que la file de patchs traite toutes les tables de la même façon.
4. **`color_key` sur `aisles`** : prévu pour le rapprochement charte (8 couleurs)
   ↔ gabarit (19 allées), à trancher en phase 2.
5. **Mot de passe oublié** : Panache a un écran de réinitialisation (courriel),
   Calico non. Wasabi part comme Calico (deux utilisateurs, Trousseau iOS); à
   reprendre de Panache si le besoin se présente.
