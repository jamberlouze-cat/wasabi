import { supabase } from "./lib/supabase.js";
import { isConfigured } from "./lib/config.js";
import { T } from "./lib/textes.js";
import { icon } from "./lib/icons.js";
import { esc, toast, closeSheet, sheetIsOpen } from "./lib/ui.js";
import { renderEpicerie } from "./lib/epicerie.js";
import {
  store, restoreCache, clearOfflineData, pull, flush, patch, applyRemote,
  pendingCount, isOffline, on as onStore,
} from "./lib/store.js";

// ------------------------------------------------------------------ state ---
const TAB_KEY = "wasabi-onglet";
const TABS = [
  { id: "epicerie", icone: "panier" },
  { id: "recettes", icone: "livre" },
  { id: "reglages", icone: "reglages" },
];
const ui = {
  tab: TABS.some((t) => t.id === localStorage.getItem(TAB_KEY)) ? localStorage.getItem(TAB_KEY) : "epicerie",
};

// Pastille de membre : une des couleurs de la charte (jeton, jamais de hex).
const MEMBER_COLORS = ["bleuet", "aubergine", "curcuma", "piment", "gris-400"];
const app = document.getElementById("app");

// ------------------------------------------------------------------ utils ---
function frDate(d, opts) { return new Intl.DateTimeFormat("fr-CA", opts).format(d); }
const sameDay = (a, b) => a.toDateString() === b.toDateString();

// ----------------------------------------------------------------- réseau ---
// Bandeau discret en haut : hors ligne et/ou changements en attente.
function sinceText() {
  if (!store.syncedAt) return "";
  const d = new Date(store.syncedAt);
  const heure = frDate(d, { hour: "numeric", minute: "2-digit" });
  return sameDay(d, new Date())
    ? T.aJourA(heure)
    : T.aJourLe(frDate(d, { day: "numeric", month: "short" }), heure);
}
function bannerText() {
  const n = pendingCount();
  if (!isOffline()) return n ? T.envoiEnCours(n) : "";
  return `${T.horsLigne}${sinceText()}${n ? " · " + T.aEnvoyer(n) : ""}`;
}
function renderBanner() {
  const el = document.getElementById("net-banner");
  if (!el) return;
  const text = bannerText();
  el.hidden = !text;
  el.innerHTML = text ? `${icon(isOffline() ? "nuageCoupe" : "nuageEnvoi")} <span>${esc(text)}</span>` : "";
  const sync = document.getElementById("sync-state");
  if (sync) sync.textContent = syncStateText();
}

onStore("change", renderBanner);
onStore("rejected", (op, error) => {
  toast(T.pasEnregistre(error.message), { type: "erreur", ms: 6000 });
  scheduleReload();   // l'écran montre un changement que Supabase a refusé
});

let reloadTimer = null;
function scheduleReload() {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(async () => { if (await pull()) renderScreen(); }, 180);
}

// ------------------------------------------------------------- temps réel ---
// Sur iPhone, l'app en arrière-plan perd sa connexion temps réel sans prévenir.
// On garde le canal sous la main pour vérifier son état au réveil et le rouvrir
// au besoin, et on recharge les données à chaque reconnexion : ce qui s'est
// passé pendant la coupure n'a jamais été reçu.
// Tables de données : la ligne reçue est appliquée telle quelle (pas de
// rechargement complet à chaque coche). Recettes : à ajouter en phase 3.
const REALTIME_TABLES = ["grocery_lists", "list_items", "household_items", "aisles"];
let renderTimer = null;
function onRemoteRow(table, payload) {
  applyRemote(table, payload.new);
  clearTimeout(renderTimer);
  renderTimer = setTimeout(renderScreen, 60);
}
let channel = null;
function subscribeRealtime() {
  if (channel) { supabase.removeChannel(channel); channel = null; }
  let firstJoin = true;
  const hid = store.household.id;
  channel = supabase.channel("hh-" + hid)
    .on("postgres_changes", { event: "*", schema: "public", table: "households", filter: `id=eq.${hid}` }, scheduleReload)
    .on("postgres_changes", { event: "*", schema: "public", table: "household_members", filter: `household_id=eq.${hid}` }, scheduleReload);
  for (const table of REALTIME_TABLES) {
    channel.on("postgres_changes", { event: "*", schema: "public", table, filter: `household_id=eq.${hid}` },
      (payload) => onRemoteRow(table, payload));
  }
  channel.subscribe((status) => {
    if (status !== "SUBSCRIBED") return;
    if (firstJoin) { firstJoin = false; return; }   // les données viennent d'être chargées
    scheduleReload();
  });
}

// ------------------------------------------------------------------ écrans ---
function renderApp() {
  app.innerHTML = `
    <div class="net-banner" id="net-banner" hidden></div>
    <main class="screen" id="screen"></main>
    <nav class="tabbar" aria-label="Sections">
      ${TABS.map((t) => `
        <button class="tab" data-tab="${t.id}" aria-current="${t.id === ui.tab ? "page" : "false"}">
          ${icon(t.icone)}<span>${T.onglets[t.id]}</span>
        </button>`).join("")}
    </nav>`;
  renderScreen();
  // Ceinture et bretelles : repartir du haut (iOS peut conserver un décalage
  // de défilement hérité de l'écran de chargement ou du clavier).
  window.scrollTo(0, 0);
  renderBanner();
}

function renderScreen() {
  const screen = document.getElementById("screen");
  if (!screen) return;
  // L'épicerie se met à jour par morceaux (le champ d'ajout garde le focus).
  if (ui.tab === "epicerie") { renderEpicerie(screen); return; }
  // Ne pas reconstruire un écran où l'on est en train d'écrire.
  if (screen.contains(document.activeElement) && document.activeElement.matches("input, textarea")) return;
  document.body.classList.remove("clavier");
  screen.innerHTML = { recettes: recettesHtml, reglages: reglagesHtml }[ui.tab]();
}

function placeholderHtml(titre, icone, texte) {
  return `
    <header class="screen-head"><h1>${titre}</h1></header>
    <div class="empty">
      <div class="empty-icon">${icon(icone)}</div>
      <p>${texte}</p>
    </div>`;
}
const recettesHtml = () => placeholderHtml(T.onglets.recettes, "livre", T.recettesVide);

// --------------------------------------------------------------- réglages ---
function syncStateText() {
  const n = pendingCount();
  if (n) return isOffline() ? T.aEnvoyer(n) : T.envoiEnCours(n);
  if (!store.syncedAt) return T.jamaisSynchronise;
  return isOffline() ? `${T.horsLigne}${sinceText()}` : T.aJour;
}

function reglagesHtml() {
  const membres = store.members.map((m) => `
    <li class="row">
      <span class="dot" style="background:var(--${MEMBER_COLORS.includes(m.color) ? m.color : "gris-400"})"></span>
      <span class="row-main">${esc(m.name)}</span>
      ${m.user_id === store.user.id ? `<span class="muted">${T.toi}</span>` : ""}
    </li>`).join("");
  return `
    <header class="screen-head"><h1>${T.onglets.reglages}</h1></header>

    <section class="card">
      <label class="label" for="set-hh-name">${T.nomDuFoyer}</label>
      <div class="inline">
        <input type="text" id="set-hh-name" value="${esc(store.household.name || "")}" placeholder="${T.foyerParDefaut}" autocomplete="off">
        <button class="btn" data-act="save-hh-name">${T.enregistrer}</button>
      </div>
    </section>

    <section class="card">
      <div class="label">${T.codeInvitation}</div>
      <div class="inline">
        <div class="code">${esc(store.household.join_code || "····")}</div>
        <button class="btn btn-icon" data-act="copy-code" aria-label="${T.copier}">${icon("copier")}</button>
      </div>
      <p class="help">${T.codeInvitationAide}</p>
    </section>

    <section class="card">
      <div class="label">${T.membres}</div>
      <ul class="rows">${membres}</ul>
    </section>

    <section class="card">
      <div class="label">${T.synchro}</div>
      <p class="sync" id="sync-state">${esc(syncStateText())}</p>
    </section>

    <button class="btn btn-block" data-act="signout">${T.seDeconnecter}</button>`;
}

// Passe par la file de patchs : fonctionne hors ligne, et n'envoie que `name`.
function saveHouseholdName() {
  const input = document.getElementById("set-hh-name");
  const name = input.value.trim();
  if (!name) { toast(T.entreNomFoyer, { type: "alerte" }); return; }
  input.blur();
  if (name !== store.household.name) patch("households", store.household.id, { name });
  toast(T.nomFoyerMisAJour);
}

async function signOut() {
  const n = pendingCount();
  if (n && !confirm(T.deconnexionEnAttente(n))) return;
  await supabase.auth.signOut();
}

// ------------------------------------------------------------- auth/onboard ---
const markHtml = `<img class="mark" src="assets/icon-192.png" alt="">`;

function renderConfigNeeded() {
  app.innerHTML = `
    <div class="center-screen">
      ${markHtml}
      <h1>${T.configTitre}</h1>
      <p>${T.configTexte}</p>
    </div>`;
}

function renderAuth() {
  app.innerHTML = `
    <div class="center-screen">
      ${markHtml}
      <h1>${T.app}</h1>
      <p>${T.slogan}</p>
      <form id="auth-form" class="form">
        <div class="field">
          <label class="label" for="auth-email">${T.courriel}</label>
          <input type="email" id="auth-email" name="email" inputmode="email" autocomplete="username" placeholder="${T.courrielExemple}">
        </div>
        <div class="field">
          <label class="label" for="auth-pass">${T.motDePasse}</label>
          <input type="password" id="auth-pass" name="password" autocomplete="current-password" placeholder="••••••••">
        </div>
        <button type="submit" id="auth-submit" class="btn btn-primary btn-block">${T.continuer}</button>
      </form>
      <p class="help">${T.premiereConnexion}</p>
    </div>`;
}

async function submitAuth() {
  const email = document.getElementById("auth-email").value.trim();
  const password = document.getElementById("auth-pass").value;
  if (!email || !email.includes("@")) { toast(T.courrielInvalide, { type: "alerte" }); return; }
  if (!password || password.length < 6) { toast(T.motDePasseCourt, { type: "alerte" }); return; }
  const btn = document.getElementById("auth-submit");
  btn.disabled = true; btn.textContent = T.connexionEnCours;

  // 1) essayer de se connecter
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (!error) return; // SIGNED_IN → boot()

  // 2) sinon, créer le compte
  const { data: d2, error: e2 } = await supabase.auth.signUp({ email, password });
  btn.disabled = false; btn.textContent = T.continuer;
  if (!e2) {
    if (d2.session) return; // connecté → boot()
    toast(T.confirmationCourriel, { type: "alerte", ms: 6000 });
    return;
  }

  const msg = (e2.message || "").toLowerCase();
  if (msg.includes("already") || msg.includes("registered")) toast(T.motDePasseIncorrect, { type: "erreur" });
  else if (msg.includes("confirm")) toast(T.confirmationCourriel, { type: "alerte", ms: 6000 });
  else toast(e2.message, { type: "erreur", ms: 6000 });
}

function renderOnboarding() {
  app.innerHTML = `
    <div class="center-screen">
      ${markHtml}
      <h1>${T.bienvenue}</h1>
      <p>${T.bienvenueTexte}</p>
      <div class="form">
        <div class="field">
          <label class="label" for="ob-name">${T.tonPrenom}</label>
          <input type="text" id="ob-name" autocomplete="given-name" placeholder="${T.prenomExemple}">
        </div>
        <button class="btn btn-primary btn-block" data-act="create-household">${T.creerFoyer}</button>
        <div class="field spaced">
          <label class="label" for="ob-code">${T.ouRejoindre}</label>
          <input type="text" id="ob-code" class="code-input" autocomplete="off" autocapitalize="characters" maxlength="4" placeholder="ABCD">
        </div>
        <button class="btn btn-block" data-act="join-household">${T.rejoindreFoyer}</button>
      </div>
    </div>`;
}

async function createHousehold() {
  const name = document.getElementById("ob-name").value.trim();
  if (!name) { toast(T.entrePrenom, { type: "alerte" }); return; }
  const { error } = await supabase.rpc("create_household", {
    p_household_name: T.foyerParDefaut, p_member_name: name, p_color: MEMBER_COLORS[0],
  });
  if (error) { toast(error.message, { type: "erreur", ms: 6000 }); return; }
  await afterMembership();
}

async function joinHousehold() {
  const name = document.getElementById("ob-name").value.trim();
  const code = document.getElementById("ob-code").value.trim().toUpperCase();
  if (!name) { toast(T.entrePrenom, { type: "alerte" }); return; }
  if (!code) { toast(T.entreCode, { type: "alerte" }); return; }
  const { error } = await supabase.rpc("join_household", { p_code: code, p_member_name: name, p_color: MEMBER_COLORS[1] });
  if (error) {
    const msg = error.message.includes("not found") ? T.codeIntrouvable
      : error.message.includes("full") ? T.foyerPlein : error.message;
    toast(msg, { type: "erreur", ms: 4000 });
    return;
  }
  await afterMembership();
}

// --------------------------------------------------------------- lifecycle ---
// Renvoie true / false (pas de foyer), ou null si Supabase est injoignable.
async function fetchMembership() {
  const res = await supabase
    .from("household_members")
    .select("*, households(*)")
    .eq("user_id", store.user.id)
    .maybeSingle();
  if (res.error) return null;
  if (res.data) {
    const { households, ...member } = res.data;
    store.member = member;
    store.household = households;
  }
  return !!res.data;
}

async function afterMembership() {
  await fetchMembership();
  if (!(await pull())) toast(T.chargementImpossible, { type: "erreur", ms: 8000 });
  subscribeRealtime();
  renderApp();
}

function renderUnreachable() {
  app.innerHTML = `
    <div class="center-screen">
      ${markHtml}
      <h1>${T.pasDeReseau}</h1>
      <p>${T.pasDeReseauTexte}</p>
      <button class="btn btn-primary btn-block" data-act="retry-boot">${T.reessayer}</button>
    </div>`;
}

// Démarrage : on affiche d'abord la copie gardée sur l'appareil (instantané, et
// ça marche sans réseau), puis on se met à jour auprès de Supabase si possible.
async function boot() {
  if (!isConfigured()) { renderConfigNeeded(); return; }
  // Empêche iOS de restaurer un ancien décalage de défilement au lancement.
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";

  const fromCache = restoreCache();
  if (fromCache) { store.offline = !navigator.onLine; renderApp(); }
  else app.innerHTML = `<div class="loading-screen"><div class="spinner"></div></div>`;

  const { data: { session }, error } = await supabase.auth.getSession();
  if (!session) {
    // Jeton impossible à rafraîchir faute de réseau : on reste sur la copie.
    if (fromCache && error?.name === "AuthRetryableFetchError") { store.offline = true; renderBanner(); return; }
    resetToSignedOut();
    return;
  }
  if (fromCache && session.user.id !== store.user.id) { clearOfflineData(); return boot(); }
  store.user = session.user;

  const hasMember = await fetchMembership();
  if (hasMember === null) {
    if (fromCache) { store.offline = true; renderBanner(); } else renderUnreachable();
    return;
  }
  if (!hasMember) { clearOfflineData(); store.user = session.user; renderOnboarding(); return; }

  await flush();
  const loaded = await pull();
  if (!loaded && !fromCache) toast(T.chargementImpossible, { type: "erreur", ms: 8000 });
  subscribeRealtime();
  // Déjà à l'écran depuis la copie : ne pas tout reconstruire.
  if (fromCache && document.getElementById("screen")) renderScreen(); else renderApp();
}

function resetToSignedOut() {
  closeSheet();
  clearOfflineData();
  if (channel) { supabase.removeChannel(channel); channel = null; }
  renderAuth();
}

supabase.auth.onAuthStateChange((event, session) => {
  if (event === "SIGNED_IN" && !store.member) { store.user = session.user; boot(); }
  if (event === "SIGNED_OUT") resetToSignedOut();
});

// --------------------------------------------------------- event delegation ---
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-act], [data-tab]");
  if (!btn) return;

  if (btn.dataset.tab) {
    ui.tab = btn.dataset.tab;
    try { localStorage.setItem(TAB_KEY, ui.tab); } catch { /* rien */ }
    document.querySelectorAll(".tab").forEach((b) => b.setAttribute("aria-current", b.dataset.tab === ui.tab ? "page" : "false"));
    document.activeElement?.blur();
    if (sheetIsOpen()) closeSheet();
    document.getElementById("screen").innerHTML = "";   // repartir d'un écran neuf
    renderScreen();
    window.scrollTo(0, 0);
    return;
  }

  switch (btn.dataset.act) {
    case "retry-boot": return boot();
    case "create-household": return createHousehold();
    case "join-household": return joinHousehold();
    case "save-hh-name": return saveHouseholdName();
    case "copy-code":
      navigator.clipboard?.writeText(store.household.join_code);
      toast(T.codeCopie); return;
    case "signout": return signOut();
  }
});

// Soumission du formulaire de connexion (touche Entrée + gestionnaire de mots
// de passe iOS/Trousseau).
document.addEventListener("submit", (e) => {
  if (e.target && e.target.id === "auth-form") { e.preventDefault(); submitAuth(); }
});

// ------------------------------------------------------------------ réveil ---
// Quand on revient dans l'app (autre app, écran verrouillé, onglet), les
// données peuvent dater de plusieurs heures et la connexion temps réel est
// peut-être morte. On rafraîchit tout, une fois à la fois.
let wakePromise = null;
function wakeUp() {
  if (!store.member || document.hidden) return;
  if (wakePromise) return;
  wakePromise = (async () => {
    try {
      await flush();
      if (await pull()) renderScreen();
      if (!channel || (channel.state !== "joined" && channel.state !== "joining")) subscribeRealtime();
    } finally {
      wakePromise = null;
    }
  })();
}
document.addEventListener("visibilitychange", wakeUp);
window.addEventListener("pageshow", wakeUp);
window.addEventListener("online", wakeUp);
window.addEventListener("offline", () => { store.offline = true; renderBanner(); });
// Tant qu'on est hors ligne ou qu'il reste des changements à envoyer, on
// retente régulièrement : l'événement « online » n'est pas fiable sur iOS.
setInterval(() => { if (store.offline || pendingCount()) wakeUp(); }, 30000);

boot();
