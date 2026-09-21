// Toutes les chaînes de l'interface, regroupées ici (français du Québec).
// Pas d'infrastructure i18n : ce fichier suffit à en faciliter l'ajout un jour.

const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? "s" : ""}`;

export const T = {
  app: "Wasabi",
  slogan: "L'épicerie et les recettes du foyer.",

  onglets: { epicerie: "Épicerie", recettes: "Recettes", reglages: "Réglages" },

  // Connexion
  courriel: "Ton courriel",
  courrielExemple: "nom@exemple.com",
  motDePasse: "Mot de passe",
  continuer: "Continuer",
  connexionEnCours: "Connexion…",
  premiereConnexion: "Première connexion ? Entre un courriel et un mot de passe pour créer ton compte.",
  courrielInvalide: "Entre un courriel valide",
  motDePasseCourt: "Mot de passe : au moins 6 caractères",
  motDePasseIncorrect: "Mot de passe incorrect",
  confirmationCourriel: "Désactive « Confirm email » dans Supabase, puis réessaie.",

  // Foyer
  bienvenue: "Bienvenue !",
  bienvenueTexte: "Crée ton foyer, ou rejoins-en un avec son code d'invitation.",
  tonPrenom: "Ton prénom",
  prenomExemple: "Maxime",
  creerFoyer: "Créer un foyer",
  ouRejoindre: "…ou rejoindre avec un code",
  rejoindreFoyer: "Rejoindre ce foyer",
  entrePrenom: "Entre ton prénom",
  entreCode: "Entre le code du foyer",
  codeIntrouvable: "Code introuvable",
  foyerPlein: "Ce foyer est complet",
  foyerParDefaut: "Notre foyer",

  // Réglages
  nomDuFoyer: "Nom du foyer",
  enregistrer: "Enregistrer",
  entreNomFoyer: "Entre un nom de foyer",
  nomFoyerMisAJour: "Nom du foyer mis à jour",
  codeInvitation: "Code d'invitation",
  codeInvitationAide: "Partage ce code : l'autre personne choisit « Rejoindre ce foyer » et l'entre.",
  copier: "Copier",
  codeCopie: "Code copié",
  membres: "Membres",
  toi: "toi",
  synchro: "Synchronisation",
  aJour: "Tout est à jour",
  jamaisSynchronise: "Pas encore synchronisé",
  seDeconnecter: "Se déconnecter",
  deconnexionEnAttente: (n) => `${pluriel(n, "changement")} pas encore envoyé${n > 1 ? "s" : ""} : ils seront perdus. Se déconnecter quand même ?`,

  // Écrans à venir
  epicerieVide: "Les listes d'épicerie arrivent à la phase 1.",
  recettesVide: "Le carnet de recettes arrive à la phase 3.",

  // Réseau
  horsLigne: "Hors ligne",
  aEnvoyer: (n) => `${pluriel(n, "changement")} à envoyer`,
  envoiEnCours: (n) => `Envoi de ${pluriel(n, "changement")}…`,
  aJourA: (heure) => ` — à jour à ${heure}`,
  aJourLe: (jour, heure) => ` — à jour le ${jour} à ${heure}`,
  pasEnregistre: (msg) => `Pas enregistré : ${msg}`,
  chargementImpossible: "Impossible de charger les données — vérifie la connexion",
  pasDeReseau: "Pas de réseau",
  pasDeReseauTexte: "Wasabi n'arrive pas à joindre le serveur. La prochaine fois, tes listes s'afficheront même hors ligne.",
  reessayer: "Réessayer",

  // Configuration manquante
  configTitre: "Presque prêt",
  configTexte: "L'app n'est pas encore reliée à Supabase. Ouvre lib/config.js et colle l'adresse du projet (Project URL).",
};
