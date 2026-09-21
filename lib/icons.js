// Icônes de l'interface, en SVG dans la page (trait = couleur du texte courant).
// Aucune police d'icônes à télécharger : rien à mettre en cache pour le hors ligne.

const PATHS = {
  panier: '<path d="M5 9h14l-1.3 9.3a2 2 0 0 1-2 1.7H8.3a2 2 0 0 1-2-1.7z"/><path d="M8.5 9l3-5M15.5 9l-3-5M10 13v3M14 13v3"/>',
  livre: '<path d="M5 5a2 2 0 0 1 2-2h12v15H7a2 2 0 0 0-2 2z"/><path d="M5 20a2 2 0 0 0 2 2h12v-4M9 7h6"/>',
  reglages: '<path d="M4 7h9M19 7h1M4 17h1M11 17h9"/><circle cx="16" cy="7" r="2.5"/><circle cx="8" cy="17" r="2.5"/>',
  nuageCoupe: '<path d="M9.5 6.2A6 6 0 0 1 18 10.5a3.7 3.7 0 0 1 2.4 6.3M17 18H7a4.5 4.5 0 0 1-.6-9"/><path d="M3 3l18 18"/>',
  nuageEnvoi: '<path d="M7 18a4.5 4.5 0 0 1-.5-9A6 6 0 0 1 18 10.5a3.7 3.7 0 0 1 .5 7.4"/><path d="M12 20v-8M9 15l3-3 3 3"/>',
  copier: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  crochet: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
};

export function icon(name) {
  return `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] || ""}</svg>`;
}
