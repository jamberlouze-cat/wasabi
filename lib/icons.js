// Icônes de l'interface, en SVG dans la page (trait = couleur du texte courant).
// Aucune police d'icônes à télécharger : rien à mettre en cache pour le hors ligne.

const PATHS = {
  panier: '<path d="M2.5 4h2.6l2.4 10.6a1.6 1.6 0 0 0 1.6 1.2h8.3a1.6 1.6 0 0 0 1.5-1.2L20.5 8H6"/><circle cx="9.5" cy="19.6" r="1.5"/><circle cx="17.2" cy="19.6" r="1.5"/>',
  moins: '<path d="M5 12h14"/>',
  livre: '<path d="M5 5a2 2 0 0 1 2-2h12v15H7a2 2 0 0 0-2 2z"/><path d="M5 20a2 2 0 0 0 2 2h12v-4M9 7h6"/>',
  reglages: '<path d="M4 7h9M19 7h1M4 17h1M11 17h9"/><circle cx="16" cy="7" r="2.5"/><circle cx="8" cy="17" r="2.5"/>',
  nuageCoupe: '<path d="M9.5 6.2A6 6 0 0 1 18 10.5a3.7 3.7 0 0 1 2.4 6.3M17 18H7a4.5 4.5 0 0 1-.6-9"/><path d="M3 3l18 18"/>',
  nuageEnvoi: '<path d="M7 18a4.5 4.5 0 0 1-.5-9A6 6 0 0 1 18 10.5a3.7 3.7 0 0 1 .5 7.4"/><path d="M12 20v-8M9 15l3-3 3 3"/>',
  copier: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  suivant: '<path d="M9 5l7 7-7 7"/>',
  retour: '<path d="M15 5l-7 7 7 7"/>',
  points: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
  corbeille: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
  crayon: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  carre: '<rect x="4.5" y="4.5" width="15" height="15" rx="3.5"/>',
  haut: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  bas: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  crochet: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
};

export function icon(name) {
  return `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] || ""}</svg>`;
}
