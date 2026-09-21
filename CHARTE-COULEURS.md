# Charte de couleurs — App recettes et épicerie

> Document de référence pour Claude Code. À placer à la racine du dépôt (ou dans `docs/`) et à référencer depuis `CLAUDE.md`.
> Toute couleur utilisée dans l'interface doit provenir des jetons définis ici. Aucune valeur hexadécimale en dur dans les composants.

## 1. Contexte

- PWA mobile first (iPhone en priorité, Android supporté), interface en français.
- Deux sections : **Épicerie** (listes partagées, tri par allée, cases à cocher) et **Recettes** (tuiles avec photo, catégories, tags).
- Identité : trois couleurs de base — **Wasabi** (vert néon), **Noir**, **Off-white**.
- Le Wasabi est la seule couleur forte. Les neutres sont légèrement teintés de vert pour s'harmoniser avec lui.
- Mode clair et mode sombre obligatoires, pilotés par `prefers-color-scheme` (avec possibilité de forcer via `data-theme`).

## 2. Palette

### 2.1 Marque — Wasabi

| Jeton | Hex | Usage |
|---|---|---|
| `--wasabi-100` | `#F0FBC9` | Fond de tag, ligne sélectionnée (mode clair) |
| `--wasabi-300` | `#DDF78A` | Survol, état pressé |
| `--wasabi-500` | `#C5F135` | **Couleur principale** : bouton principal, case cochée, onglet actif |
| `--wasabi-600` | `#9CC41A` | Bordure, anneau de focus sur fond clair |
| `--wasabi-800` | `#4B6300` | Texte et liens verts sur fond clair (contraste ≈ 6:1) |
| `--wasabi-950` | `#2A3310` | Fond de tag en mode sombre |

### 2.2 Neutres

| Jeton | Hex | Usage |
|---|---|---|
| `--noir` | `#0E0F0C` | Fond mode sombre, texte principal mode clair |
| `--charbon` | `#1A1C17` | Cartes et tuiles en mode sombre |
| `--graphite` | `#2A2D25` | Bordures et surfaces élevées en mode sombre |
| `--gris-600` | `#5C6055` | Texte secondaire mode clair |
| `--gris-400` | `#9A9E90` | Texte secondaire mode sombre, placeholders, articles cochés |
| `--gris-200` | `#DEDCD0` | Bordures et séparateurs mode clair |
| `--off-white` | `#F6F4EC` | Fond mode clair, texte principal mode sombre |
| `--papier` | `#FCFBF7` | Cartes et tuiles en mode clair |

### 2.3 Sémantiques

| Jeton | Hex | Usage |
|---|---|---|
| `--piment` | `#E5484D` | Erreur, actions destructives (mode clair) |
| `--piment-sombre` | `#FF6B6B` | Même rôle en mode sombre |
| `--curcuma` | `#F2B33D` | Avertissement |
| `--bleuet` | `#5B8DEF` | Information, indicateur de partage |
| `--aubergine` | `#7A4FC2` | Accent secondaire rare (ex. favoris) |

### 2.4 Allées d'épicerie

Utilisées uniquement en **pastilles de 8 à 12 px** à côté du nom de l'allée, jamais en aplat ni en fond. Peuvent aussi servir aux tags de recettes.

| Jeton | Hex | Allée |
|---|---|---|
| `--allee-fruits-legumes` | `#3FA66A` | Fruits et légumes |
| `--allee-boulangerie` | `#D9A35B` | Boulangerie |
| `--allee-laitiers` | `#7FB6E8` | Produits laitiers et œufs |
| `--allee-viandes-poissons` | `#E0606B` | Viandes et poissons |
| `--allee-garde-manger` | `#E08A3C` | Garde-manger |
| `--allee-surgeles` | `#6FD3D6` | Surgelés |
| `--allee-boissons` | `#8C7BE8` | Boissons |
| `--allee-maison` | `#9A9E90` | Maison et hygiène |

## 3. Jetons de rôle

Les composants n'utilisent **que** les jetons de rôle ci-dessous, jamais les jetons de palette directement (sauf les pastilles d'allée).

| Rôle | Mode clair | Mode sombre |
|---|---|---|
| `--bg` | `--off-white` | `--noir` |
| `--surface` | `--papier` | `--charbon` |
| `--surface-2` | `#EFEDE3` | `--graphite` |
| `--border` | `--gris-200` | `--graphite` |
| `--text` | `--noir` | `--off-white` |
| `--text-muted` | `--gris-600` | `--gris-400` |
| `--text-disabled` | `--gris-400` | `--gris-600` |
| `--accent` | `--wasabi-500` | `--wasabi-500` |
| `--accent-hover` | `--wasabi-300` | `--wasabi-300` |
| `--on-accent` | `--noir` | `--noir` |
| `--accent-text` | `--wasabi-800` | `--wasabi-500` |
| `--tag-bg` | `--wasabi-100` | `--wasabi-950` |
| `--tag-text` | `--wasabi-800` | `--wasabi-500` |
| `--danger` | `--piment` | `--piment-sombre` |
| `--focus-ring` | `--wasabi-600` | `--wasabi-500` |
| `--scrim` | Noir à 45 % (`rgba(14,15,12,0.45)`) | idem | 

## 4. Règles d'usage (obligatoires)

1. **Proportions 60/30/10** : fond (`--bg`) ≈ 60 %, surfaces et texte ≈ 30 %, Wasabi ≤ 10 % de l'écran.
2. **Texte sur Wasabi = toujours `--on-accent` (Noir)**, jamais blanc.
3. **Jamais de texte `--wasabi-500` sur fond clair** (illisible). Pour du texte vert, utiliser `--accent-text`, qui se résout correctement dans les deux modes.
4. **Une seule action Wasabi par écran** : le bouton « Ajouter » de la boîte du bas sur l'épicerie, le « + » sur les recettes. Les actions secondaires sont en contour (`--border`) avec texte `--text`.
5. **`--danger` est réservé aux actions destructives** (« Effacer les cochés », supprimer une liste ou une recette). Toujours accompagné d'une confirmation.
6. **Accessibilité** : contraste minimal WCAG AA (4,5:1 pour le texte, 3:1 pour les éléments d'interface). Ne jamais transmettre une information uniquement par la couleur (ex. article coché = case remplie **et** texte barré).
7. **Aucun hex en dur** dans les composants. Une nouvelle couleur s'ajoute d'abord à ce document et au fichier de jetons.

## 5. Application par composant

### Épicerie
- **Ligne d'article** : fond `--surface`, bordure `--border`, texte `--text`.
- **Case non cochée** : bordure 1,5 px `--text-disabled`, fond transparent.
- **Case cochée** : fond `--accent`, crochet `--on-accent`. Texte de l'article barré en `--text-disabled`.
- **En-tête d'allée** : pastille de la couleur d'allée + libellé en majuscules `--text-muted`.
- **Boîte d'ajout (bas de l'écran)** : champ fond `--surface`, bordure `--border`, placeholder `--text-muted`; au focus, anneau `--focus-ring`. Bouton « Ajouter » : fond `--accent`, texte `--on-accent`.
- **Suggestions d'aliments fréquents** : puces fond `--surface-2`, texte `--text`; pressé → fond `--tag-bg`, texte `--tag-text`.
- **Tout cocher / Tout décocher** : boutons en contour neutre. **Effacer les cochés** : texte `--danger`.
- **Emoji de liste** : affiché sur pastille ronde fond `--surface-2`.

### Recettes
- **Tuile** : photo plein cadre, coins arrondis, fond de repli `--surface-2`. Nom affiché en `--off-white` sur un dégradé Noir (`rgba(14,15,12,0)` → `rgba(14,15,12,0.7)`) au bas de la photo, dans les deux modes.
- **Tuile sans photo** : fond `--surface-2`, emoji ou initiale en `--text-muted`.
- **Tags** : fond `--tag-bg`, texte `--tag-text`, forme pilule. Filtre de tag actif : fond `--accent`, texte `--on-accent`.
- **Catégories (onglets ou puces)** : inactif texte `--text-muted`; actif texte `--text` avec soulignement ou fond `--accent`.
- **Lien vers l'URL de la recette** : texte `--accent-text`.

### Navigation et global
- **Barre d'onglets du bas** : fond `--surface`, bordure supérieure `--border`; icône inactive `--text-muted`, icône active `--text` avec indicateur `--accent`.
- **Indicateur de partage / collaborateur** : `--bleuet`.
- **Toasts** : fond `--noir` (clair) ou `--surface-2` (sombre), texte `--off-white`; liseré gauche selon le type (`--accent` succès, `--curcuma` alerte, `--danger` erreur).
- **Anneau de focus clavier** : 2 px `--focus-ring`, décalage 2 px.

## 6. PWA

- `theme-color` : `#0E0F0C` en mode sombre, `#F6F4EC` en mode clair (deux balises `<meta>` avec attribut `media`).
- `background_color` du manifeste : `#0E0F0C`.
- Icône d'app : symbole Wasabi `#C5F135` sur fond Noir `#0E0F0C` (version masquable avec marge de sécurité).

## 7. Implémentation

Le fichier `tokens.css` fourni avec ce document contient tous les jetons. L'importer une seule fois au point d'entrée de l'app.

Si le projet utilise Tailwind, mapper les jetons de rôle dans le thème plutôt que de redéfinir les hex :

```js
// tailwind.config.js (extrait)
theme: {
  extend: {
    colors: {
      bg: 'var(--bg)',
      surface: 'var(--surface)',
      'surface-2': 'var(--surface-2)',
      border: 'var(--border)',
      text: 'var(--text)',
      'text-muted': 'var(--text-muted)',
      'text-disabled': 'var(--text-disabled)',
      accent: 'var(--accent)',
      'accent-hover': 'var(--accent-hover)',
      'on-accent': 'var(--on-accent)',
      'accent-text': 'var(--accent-text)',
      'tag-bg': 'var(--tag-bg)',
      'tag-text': 'var(--tag-text)',
      danger: 'var(--danger)',
    },
  },
}
```

Balises à mettre dans le `<head>` :

```html
<meta name="theme-color" media="(prefers-color-scheme: light)" content="#F6F4EC">
<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0E0F0C">
```
