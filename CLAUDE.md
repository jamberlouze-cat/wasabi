# App recettes et épicerie

## Documents de référence
- `FEUILLE_DE_ROUTE.md` : portée et phases du projet.
- `CHARTE-COULEURS.md` : charte de couleurs. À lire avant de créer ou modifier un composant visuel.
- `REUTILISATION.md` : ce qui est repris de Calico et Panache, et les écarts assumés.
- `README.md` : installation, déploiement, banc d'essai local, structure des fichiers.

## Design
- Toutes les couleurs proviennent de `CHARTE-COULEURS.md` et de `tokens.css`.
- Aucun hex en dur dans les composants : utiliser uniquement les jetons de rôle (`--bg`, `--surface`, `--text`, `--accent`, etc.).
- Texte sur Wasabi toujours en `--on-accent`. Une seule action Wasabi par écran.
- Tout nouveau composant doit fonctionner en mode clair et en mode sombre.

## Technique
- Fichiers statiques, aucun `npm`, aucune compilation (même socle que Calico et Panache).
- Toute écriture passe par `lib/store.js` (`put`, `patch`, `remove`) : jamais d'appel Supabase direct pour les données du foyer. Un `patch` n'envoie que les champs modifiés.
- Toute chaîne visible va dans `lib/textes.js`.
- Après un changement à la coquille : monter `CACHE` dans `sw.js` et tenir `SHELL` à jour.
- Vérifier au banc d'essai (`_test.html`, serveur `wasabi` de `.claude/launch.json`) avant de pousser.
