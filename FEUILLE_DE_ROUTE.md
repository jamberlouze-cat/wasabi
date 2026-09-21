# Feuille de route — App recettes et épicerie

> Document de référence pour Claude Code. À déposer à la racine du dépôt.
> Nom de l'app : **à déterminer** (utiliser `app-epicerie` comme nom de travail).

## 1. Contexte

App maison pour deux utilisateurs (Maxime et sa conjointe), qui remplace Umami. On ne reproduit pas Umami : on garde ce qui sert vraiment au quotidien et on simplifie le reste.

- **Cœur de l'app : les listes d'épicerie.** Usage hebdomadaire, à deux, souvent en magasin avec un mauvais réseau.
- **Recettes : un carnet de signets visuel.** Des tuiles avec photo qui mènent à un lien, à une fiche simple ou à une photo/PDF. Aucune fiche standardisée, aucun import intelligent.

## 2. Principes directeurs

1. **Mobile first, iPhone d'abord.** Doit aussi fonctionner sur Android. L'ordinateur est secondaire : l'interface mobile centrée dans une colonne suffit.
2. **PWA installable**, pleinement utilisable hors ligne.
3. **Français seulement** (termes québécois). Pas d'infrastructure i18n pour l'instant, mais garder les chaînes regroupées pour faciliter un ajout futur.
4. **Simplicité avant tout.** En cas de doute entre deux options, choisir celle qui demande le moins de gestes à l'utilisateur et le moins de code.
5. **Pas d'abonnement, pas de paiement.**

## 3. Socle technique

Reprendre le même socle que **Calico** et **Panache** :

- Développement avec Claude Code, dépôt GitHub
- Supabase (Postgres, Auth, Realtime, Storage)
- Cloudflare pour l'hébergement, avec le *waker agent* comme dans les autres apps
- **Authentification : identique à Calico et Panache**
- **Foyer partagé : même mécanique que le foyer de Calico** (création, invitation, adhésion)
- **Mode hors ligne : même approche que Calico et Panache**

**Consigne à Claude Code :** avant d'écrire du code, inspecter les projets Calico et Panache et produire un court résumé de ce qui sera réutilisé tel quel (auth, foyer, couche hors ligne, configuration PWA, déploiement Cloudflare, waker). Ne rien réinventer de ce qui existe déjà et fonctionne.

## 4. Portée

### Inclus en v1

| Module | Fonctionnalités |
|---|---|
| Épicerie | Listes multiples avec emoji; quantité par article (− / +); boîte d'ajout en bas avec suggestions par fréquence; mémoire des articles; tri par allée (catalogue québécois); ordre des allées personnalisable; tout cocher / tout décocher / effacer les cochés; synchro temps réel; hors ligne |
| Recettes | Un seul livre; page en tuiles (photo + nom); trois types (URL, manuelle, photo/PDF); vignette automatique pour les URL; notes sur toutes les recettes; catégories; tags; recherche et filtres |
| Transversal | Comptes individuels; foyer partagé; PWA |
| Migration | Script unique d'import de l'export Umami |

### Exclu

Import intelligent de recettes, mode cuisine, minuteries, mise à l'échelle des portions, évaluations, planification des repas, lien recette → épicerie, intégration Rappels iOS, liens publics de partage, extension de navigateur, multilingue, abonnement.

### Plus tard

Export / sauvegarde des données.

## 5. Modèle de données

Conventions : identifiants UUID **générés côté client** (nécessaire pour le hors ligne), `created_at` / `updated_at` partout, **suppression logique** (`deleted_at`) sur toutes les tables synchronisées, RLS sur chaque table limitant l'accès aux membres du foyer.

### Repris de Calico
`profiles`, `households`, `household_members` — structure et politiques RLS identiques.

### Épicerie

**`aisles`** — allées, propres à chaque foyer (pour permettre l'ordre personnalisé)
- `id`, `household_id`
- `key` (texte, ex. `fruits_legumes`; sert à relier le catalogue global; `null` pour une allée créée par l'utilisateur)
- `name`, `position`
- Semées à la création du foyer à partir du gabarit d'allées par défaut. Toujours une allée `autre` en dernier.

**`catalog_items`** — catalogue global d'aliments (lecture seule pour les utilisateurs, semé en phase 2)
- `id`, `name`, `name_normalized` (minuscules, sans accents)
- `synonyms` (tableau de texte, ex. `{haricots, fèves}`)
- `default_aisle_key`

**`household_items`** — la mémoire du foyer : tout article déjà ajouté au moins une fois
- `id`, `household_id`
- `name`, `name_normalized` (unique par foyer)
- `catalog_item_id` (nullable)
- `aisle_id` (allée effective; initialisée depuis le catalogue, sinon `autre`; modifiable, et la modification est retenue)
- `use_count`, `last_used_at`

**`grocery_lists`**
- `id`, `household_id`, `name`, `emoji`, `position`

**`list_items`**
- `id`, `list_id`, `household_item_id`
- `name` (dénormalisé pour l'affichage hors ligne)
- `quantity` (entier, défaut 1, minimum 1) — propre à la ligne de liste, **jamais mémorisée** dans `household_items`
- `checked`, `checked_at`, `added_by`

### Recettes

**`recipe_categories`** — `id`, `household_id`, `name`, `position`
Semées par défaut : Entrée, Soupe, Salade, Plat principal, Accompagnement, Dessert, Déjeuner, Collation, Boisson. Modifiables.

**`tags`** — `id`, `household_id`, `name`

**`recipes`**
- `id`, `household_id`, `created_by`
- `type` : `url` | `manual` | `file`
- `title`
- `category_id` (nullable)
- `cover_path` (image de la tuile, dans Storage)
- `notes` (texte libre, **tous les types**)
- Type `url` : `url`, `site_name`
- Type `manual` : `ingredients_text`, `steps_text` (texte libre, sauts de ligne conservés)

**`recipe_files`** — pour le type `file`; plusieurs fichiers possibles (ex. une recette sur deux pages)
- `id`, `recipe_id`, `path`, `mime_type`, `position`

**`recipe_tags`** — `recipe_id`, `tag_id`

### Stockage
Compartiment privé `recipe-media`, chemins préfixés par `household_id`, accès par RLS. Images compressées **côté client** avant l'envoi (max. 1600 px pour les fichiers, 600 px pour les vignettes de tuiles).

## 6. Spécification fonctionnelle

### Navigation
Barre d'onglets en bas : **Épicerie** · **Recettes** · **Réglages**. L'app ouvre sur Épicerie, directement sur la dernière liste consultée.

### 6.1 Épicerie

**Écran des listes.** Chaque liste affiche son emoji, son nom et le nombre d'articles restants. Création : nom + choix d'un emoji. Renommer, changer l'emoji, réordonner, supprimer (avec confirmation).

**Écran d'une liste.**
- Articles regroupés par allée, dans l'ordre des allées du foyer. En-têtes d'allée discrets.
- Chaque ligne : case à cocher et nom à gauche, **sélecteur de quantité compact à droite (− 2 +)**. À la quantité 1, le « − » est désactivé (il ne supprime pas l'article). Zones tactiles d'au moins 44 px, bien séparées de la zone qui coche, pour éviter les erreurs à une main en magasin.
- Toucher un article (hors sélecteur) le coche. Sur un article coché, le sélecteur est masqué et la quantité s'affiche en lecture seule (« ×2 »). Les articles cochés restent dans leur allée, grisés et barrés (à valider à l'usage : alternative = section « Cochés » en bas).
- Appui long ou glissement sur un article : changer l'allée, supprimer.
- Menu de la liste : **Tout cocher**, **Tout décocher**, **Effacer les cochés** (confirmation seulement pour ce dernier).

**Boîte d'ajout (élément central de l'app).**
- Fixée en bas de l'écran, au-dessus de la barre d'onglets, toujours visible.
- **Au focus, champ vide :** afficher les 8 à 10 `household_items` les plus fréquents (`use_count` décroissant, puis `last_used_at`) **qui ne sont pas déjà dans la liste**. Présentés en pastilles au-dessus du champ; un toucher = ajout immédiat, et la pastille est remplacée par la suggestion suivante.
- **À la frappe :** autocomplétion sur `name_normalized` et les synonymes, d'abord dans `household_items`, puis dans `catalog_items`. Dernière option toujours offerte : « Ajouter "texte saisi" ».
- **Quantité à l'ajout :** un sélecteur − / + à droite du champ de saisie, à 1 par défaut. La quantité affichée s'applique au prochain article ajouté, qu'il vienne d'une pastille, de l'autocomplétion ou du texte saisi.
- Après un ajout, **le champ reste actif et se vide, et la quantité revient à 1**, pour enchaîner les ajouts.
- Si l'article est déjà dans la liste et coché : le décocher et lui donner la quantité choisie, plutôt que créer un doublon. S'il est déjà présent et non coché : le signaler brièvement (surbrillance) sans rien changer — on évite ainsi que deux personnes qui ajoutent « Lait » chacune de leur côté se retrouvent avec 2. La quantité s'ajuste alors sur la ligne.
- Chaque ajout incrémente `use_count` et met à jour `last_used_at`.
- Article inconnu du catalogue et du foyer : créé dans `household_items` avec l'allée `autre`. L'utilisateur peut lui assigner une allée; le choix est retenu pour toujours.

**Réglages > Allées.** Réordonner par glisser-déposer, renommer, ajouter, supprimer (les articles d'une allée supprimée retombent dans `autre`).

**Réglages > Mes articles.** Liste des `household_items` : corriger un nom, changer l'allée, supprimer un article mémorisé par erreur (faute de frappe).

### 6.2 Recettes

**Page principale.** Grille de tuiles à 2 colonnes : photo + nom. En haut : champ de recherche (par nom), puis une rangée de pastilles de catégories à défilement horizontal, puis un bouton de filtre par tags (combinables, logique ET). Tuile sans image : fond de couleur + nom du site ou initiale.

**Toucher une tuile.**
- Type `url` : ouvre le site. Un appui long (ou un bouton « i » sur la tuile) ouvre la fiche de détail pour voir les notes et modifier.
  À valider à l'usage : si les notes servent souvent, inverser (le toucher ouvre la fiche, avec un gros bouton « Ouvrir la recette »).
- Type `manual` : ouvre la fiche — photo, ingrédients, étapes, notes.
- Type `file` : ouvre la visionneuse (images avec zoom par pincement et défilement entre les pages; PDF dans une visionneuse intégrée).

**Ajout d'une recette.** Bouton « + », puis choix du type.
- **Lien :** le bouton « Coller » lit le presse-papier (voir contraintes iOS); repli sur un champ de texte. Dès qu'une URL valide est saisie, appeler l'aperçu de lien (ci-dessous) pour préremplir le titre et l'image. Tout reste modifiable. Puis catégorie, tags, notes.
- **Manuelle :** titre, photo (facultative), ingrédients, étapes, notes, catégorie, tags.
- **Photo / PDF :** prendre une photo, choisir dans la photothèque ou choisir un fichier. Plusieurs fichiers possibles. Titre obligatoire. La première image sert de tuile par défaut; pour un PDF, générer une vignette de la première page si c'est simple, sinon tuile générique.

**Aperçu de lien (seul service serveur de l'app).** Point d'accès sur Cloudflare Worker : reçoit une URL, retourne `title`, `image`, `site_name` tirés des balises Open Graph (repli sur `<title>`).
- Exiger un jeton Supabase valide.
- Accepter seulement `http`/`https`; bloquer les adresses privées et locales (protection SSRF); délai maximal de 5 s; taille de réponse plafonnée.
- **Copier l'image dans Storage** plutôt que de pointer vers le site d'origine (les liens d'images meurent et plusieurs sites bloquent l'affichage externe).
- En cas d'échec : ne jamais bloquer l'ajout, l'utilisateur complète à la main.

**Réglages > Catégories et tags.** Ajouter, renommer, réordonner (catégories), supprimer.

### 6.3 Foyer et comptes
Identique à Calico : création du foyer, invitation de la conjointe, comptes individuels. Toutes les données (listes, recettes, allées, articles mémorisés) appartiennent au foyer.

## 7. Synchronisation et hors ligne

Reprendre la couche existante de Calico/Panache. Exigences propres à cette app :

- Toute action doit réussir instantanément hors ligne, puis se synchroniser au retour du réseau.
- Supabase Realtime sur `list_items` (au minimum) : quand l'un ajoute ou coche, l'autre le voit en quelques secondes.
- Conflits : dernière écriture gagnante, **par champ** et non par ligne. Cas types à gérer correctement : l'un coche un article pendant que l'autre en change l'allée ou la quantité.
- « Effacer les cochés » = suppression logique des articles cochés **au moment du geste**; un article décoché entre-temps par l'autre personne ne doit pas disparaître.
- Recettes : consultables hors ligne (métadonnées + vignettes en cache). Les fichiers complets (photos, PDF) sont mis en cache à la première ouverture.
- Indicateur discret d'état : hors ligne / modifications en attente.

## 8. Contraintes iPhone (PWA) à respecter

- **Aucune cible de partage sur iOS** : l'app ne peut pas apparaître dans le menu Partager de Safari. D'où l'importance du bouton « Coller ». Sur Android, déclarer tout de même `share_target` dans le manifeste : gain gratuit.
- **Presse-papier** : `navigator.clipboard.readText()` exige un geste de l'utilisateur et affiche une bulle « Coller » sur iOS. Prévoir le repli sur un champ de texte.
- **Boîte d'ajout et clavier** : sur iOS, un élément `position: fixed` en bas ne suit pas le clavier. Utiliser l'API `visualViewport` pour garder la boîte et ses suggestions collées au-dessus du clavier. **C'est le point d'ergonomie le plus critique de l'app : à tester sur un vrai iPhone dès la phase 1.**
- Champs de saisie à 16 px minimum (sinon Safari zoome).
- Respecter les zones sûres (`env(safe-area-inset-*)`), surtout pour la barre du bas.
- Liens externes et PDF en mode installé : vérifier le comportement d'ouverture et de retour à l'app.
- Appareil photo : `<input type="file" accept="image/*" capture>`.

## 9. Phases

Travailler **une phase à la fois**. Chaque phase se termine par un déploiement et un essai sur les deux téléphones avant de passer à la suivante.

### Phase 0 — Socle
- Résumé de réutilisation de Calico/Panache (voir section 3)
- Dépôt, projet Supabase, déploiement Cloudflare, waker
- Auth, foyer, invitation
- Coquille PWA : manifeste, service worker, barre d'onglets, couche hors ligne
- Schéma complet de la section 5 avec RLS (tables de recettes comprises, même si inutilisées pour l'instant)

**Terminé quand :** les deux comptes sont dans le même foyer, l'app est installée sur l'iPhone et s'ouvre hors ligne.

### Phase 1 — Épicerie
- Listes avec emoji (CRUD, ordre)
- Articles : ajout, cocher, supprimer, quantité (− / +) sur la ligne et dans la boîte d'ajout
- Boîte d'ajout complète : suggestions par fréquence, autocomplétion sur la mémoire du foyer, enchaînement des ajouts
- Tout cocher, tout décocher, effacer les cochés
- Temps réel + hors ligne
- Tri provisoire : ordre d'ajout (une seule allée `autre`)

**Terminé quand :** une vraie épicerie complète a été faite avec l'app, à deux, dont une partie hors ligne, sans irritant avec le clavier.

### Phase 2 — Catalogue québécois et allées
Précédée d'une **session de travail dédiée** (hors Claude Code) pour constituer le catalogue. Format de livraison : un CSV `nom, synonymes, cle_allee`.

Gabarit d'allées par défaut (provisoire, à valider pendant cette session) : Fruits et légumes · Boulangerie · Viandes et volailles · Poissons et fruits de mer · Charcuterie et fromages · Produits laitiers et œufs · Surgelés · Garde-manger · Déjeuner et céréales · Collations · Condiments, huiles et épices · Ingrédients à pâtisserie · Breuvages · Bière et vin · Bébé · Hygiène et pharmacie · Entretien ménager · Animaux · Autre

- Semis du catalogue et des allées
- Rattachement des `household_items` déjà créés en phase 1 au catalogue (par nom normalisé)
- Regroupement par allée dans les listes
- Autocomplétion étendue au catalogue et aux synonymes
- Réglages : ordre des allées, changement d'allée d'un article, « Mes articles »

**Terminé quand :** une liste typique de 30 articles se classe correctement à 90 % sans intervention, dans l'ordre réel du parcours en magasin.

### Phase 3 — Recettes
- Page en tuiles, recherche, filtres par catégorie et tags
- Les trois types de recettes, avec notes
- Worker d'aperçu de lien + copie de l'image dans Storage
- Téléversement photo/PDF avec compression, visionneuse
- Gestion des catégories et des tags
- Cache hors ligne

**Terminé quand :** dix recettes réelles de chaque type ont été ajoutées depuis l'iPhone, et l'ajout d'un lien prend moins de 15 secondes.

### Phase 4 — Migration Umami et finition
- Exporter depuis Umami (Compte > Exporter tous les livres de recettes, format JSON). **Première étape : inspecter un échantillon réel de l'export** avant d'écrire le script; ne pas présumer de la structure.
- Script unique (Node, exécuté localement) :
  - recette avec URL source → type `url` (titre, URL, image si disponible, notes)
  - recette sans URL → type `manual` (ingrédients et étapes aplatis en texte)
  - étiquettes Umami → `tags`; catégorie → proposer une table de correspondance à valider à la main
  - mode **simulation** produisant un rapport avant toute écriture
- Finition : nom définitif, icône, thème visuel, écrans vides soignés, messages d'erreur
- Bascule : dernière vérification, puis abandon d'Umami

**Terminé quand :** toute la collection Umami est dans l'app et les deux utilisateurs n'ouvrent plus Umami.

## 10. Décisions ouvertes

| Sujet | Note |
|---|---|
| Nom, icône, palette, typographie | À décider avant la phase 4; n'affecte pas l'architecture |
| Articles cochés : sur place ou regroupés en bas | À trancher à l'usage en phase 1 |
| Toucher une tuile URL : site ou fiche | À trancher à l'usage en phase 3 |
| Export / sauvegarde | Plus tard |
