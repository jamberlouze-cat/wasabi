// Garde l'écran allumé (Screen Wake Lock) tant que quelqu'un le demande : le
// mode Cuisine (lib/cuisine.js) et la visionneuse de photos et de PDF.
//
// Le système reprend le verrou dès que la page n'est plus visible (autre app,
// autre onglet, écran verrouillé à la main) : on le redemande au retour. Il
// peut aussi le refuser (économie d'énergie, vieux navigateur) : rien ne
// casse, l'écran suit simplement sa mise en veille habituelle.
// Safari : à partir d'iOS 16.4 ; dans l'app installée sur l'écran d'accueil,
// à partir d'iOS 18.4.

const demandeurs = new Set();
const ecouteurs = new Set();
let verrou = null;
let occupe = false, aRefaire = false;

export const eveilPossible = () => "wakeLock" in navigator;
export const eveilActif = () => !!verrou;
/** `fn(actif)` est appelée chaque fois que l'état peut avoir changé. */
export function surEveil(fn) { ecouteurs.add(fn); }

async function ajuster() {
  if (occupe) { aRefaire = true; return; }
  occupe = true;
  try {
    if (demandeurs.size && !verrou && eveilPossible() && document.visibilityState === "visible") {
      try {
        const v = await navigator.wakeLock.request("screen");
        v.addEventListener("release", () => { if (verrou === v) { verrou = null; annoncer(); } });
        verrou = v;
      } catch { /* refusé : l'écran suit sa mise en veille habituelle */ }
    } else if (!demandeurs.size && verrou) {
      const v = verrou;
      verrou = null;
      await v.release().catch(() => {});
    }
  } finally { occupe = false; }
  annoncer();
  if (aRefaire) { aRefaire = false; ajuster(); }
}
function annoncer() { ecouteurs.forEach((fn) => fn(!!verrou)); }

export function retenirEveil(qui) { demandeurs.add(qui); ajuster(); }
export function relacherEveil(qui) { demandeurs.delete(qui); ajuster(); }

document.addEventListener("visibilitychange", () => { if (!document.hidden) ajuster(); });
