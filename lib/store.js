// Couche hors ligne : copie des données du foyer sur l'appareil + file de
// patchs à envoyer. Généralise la file « une coche » de Calico et la file
// « un score » de Panache à toutes les tables.
//
// - Toute action s'applique d'abord ici (l'écran est à jour tout de suite),
//   puis part vers Supabase ; sans réseau elle attend dans la file.
// - Création = `upsert` de la ligne complète. Modification = `update` des SEULS
//   champs touchés : si l'un coche un article pendant que l'autre en change la
//   quantité, les deux changements survivent (dernière écriture gagnante par
//   champ, pas par ligne).
// - Suppression = patch `deleted_at` (suppression logique).
// - Tout vit dans localStorage, comme Calico et Panache. Les images et PDF de
//   recettes (phase 3) iront dans l'API Cache, pas ici.

import { supabase } from "./supabase.js";

// Tables du foyer gardées sur l'appareil. Toutes ont id, household_id,
// deleted_at. (Au-delà de 1000 lignes par table, il faudra paginer : limite
// par défaut de l'API Supabase.)
export const SYNCED_TABLES = [
  "aisles", "household_items", "grocery_lists", "list_items",
  "recipe_categories", "tags", "recipes", "recipe_files", "recipe_tags",
];

// Le banc d'essai (_test.html) garde ses fausses données à part de la vraie app.
const PREFIX = globalThis.__WASABI_FAKE_SUPABASE__ ? "wasabi-essai" : "wasabi";
const CACHE_KEY = `${PREFIX}-cache-v1`;
const QUEUE_KEY = `${PREFIX}-queue-v1`;

function readJson(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}
function writeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* stockage plein ou bloqué */ }
}

const emptyData = () => Object.fromEntries(SYNCED_TABLES.map((t) => [t, []]));

export const store = {
  user: null,
  member: null,
  household: null,
  members: [],
  data: emptyData(),   // { table: [lignes non supprimées] }
  catalog: [],         // catalogue global d'articles (lecture seule)
  offline: false,      // la dernière tentative de joindre Supabase a échoué
  syncedAt: null,      // dernier chargement réussi (ms)
};

// File des changements pas encore envoyés, dans l'ordre des gestes.
// { type: 'upsert' | 'update', table, id, values, cond? }
let queue = (readJson(QUEUE_KEY) || []).map(({ sending, ...op }) => op);
const saveQueue = () => writeJson(QUEUE_KEY, queue.map(({ sending, ...op }) => op));

export const pendingCount = () => queue.length;
export const isOffline = () => store.offline || !navigator.onLine;
export const newId = () => crypto.randomUUID();

// Une requête qui n'a jamais atteint Supabase revient avec status 0.
export const isNetworkFailure = (res) => !!res.error && (res.status === 0 || !navigator.onLine);

// ------------------------------------------------------------ copie locale ---

export function saveCache() {
  if (!store.user || !store.member) return;
  writeJson(CACHE_KEY, {
    userId: store.user.id, member: store.member, household: store.household,
    members: store.members, data: store.data, catalog: store.catalog, syncedAt: store.syncedAt,
  });
}

export function restoreCache() {
  const c = readJson(CACHE_KEY);
  if (!c?.userId || !c.member || !c.household) return false;
  store.user = { id: c.userId };
  store.member = c.member;
  store.household = c.household;
  store.members = c.members || [];
  store.data = { ...emptyData(), ...(c.data || {}) };
  store.catalog = c.catalog || [];
  store.syncedAt = c.syncedAt || null;
  return true;
}

export function clearOfflineData() {
  try { localStorage.removeItem(CACHE_KEY); localStorage.removeItem(QUEUE_KEY); } catch { /* rien */ }
  queue = [];
  store.user = null; store.member = null; store.household = null;
  store.members = []; store.data = emptyData(); store.catalog = []; store.syncedAt = null;
}

// ----------------------------------------------------------------- gestes ---

function applyOp(op) {
  if (op.table === "households") {
    if (store.household?.id === op.id) Object.assign(store.household, op.values);
    return;
  }
  const rows = (store.data[op.table] ||= []);
  const i = rows.findIndex((r) => r.id === op.id);
  if (i < 0 && op.type !== "upsert") return;   // ligne disparue entre-temps
  const row = { ...(i >= 0 ? rows[i] : {}), ...op.values, id: op.id };
  if (row.deleted_at) { if (i >= 0) rows.splice(i, 1); return; }
  if (i >= 0) rows[i] = row; else rows.push(row);
}

// Deux gestes de suite sur la même ligne fusionnent en une seule entrée, sauf
// si la première est déjà en route vers Supabase.
function enqueue(op) {
  const prev = !op.cond && queue.find((q) => q.table === op.table && q.id === op.id && !q.sending && !q.cond);
  if (prev) {
    prev.values = { ...prev.values, ...op.values };
    if (op.type === "upsert") prev.type = "upsert";
  } else queue.push(op);
  saveQueue();
}

function act(op) {
  applyOp(op);
  enqueue(op);
  saveCache();
  flush();
}

/** Crée une ligne (ou la remplace au complet). Renvoie la ligne, avec son id.
 *  `values.id` peut être fourni (identifiant stable, voir lib/noms.js). */
export function put(table, values) {
  const row = {
    id: newId(), household_id: store.household.id,
    created_at: new Date().toISOString(), ...values,
  };
  const { id, ...rest } = row;
  act({ type: "upsert", table, id, values: rest });
  return row;
}

/** Modifie seulement les champs donnés. `cond` = { champ: valeur } que la ligne
 *  doit encore avoir CÔTÉ SERVEUR pour que le changement s'applique. */
export function patch(table, id, fields, cond) {
  act({ type: "update", table, id, values: { ...fields }, ...(cond ? { cond } : {}) });
}

/** Suppression logique. Avec `cond`, seulement si la ligne est encore dans cet
 *  état sur le serveur (ex. « Effacer les cochés » : seulement si encore coché). */
export function remove(table, id, cond) {
  patch(table, id, { deleted_at: new Date().toISOString() }, cond);
}

/** Une ligne arrivée par le temps réel : on la prend telle quelle, puis les
 *  gestes pas encore envoyés repassent par-dessus. */
export function applyRemote(table, row) {
  const rows = store.data[table];
  if (!rows || !row?.id || row.household_id !== store.household?.id) return;
  const i = rows.findIndex((r) => r.id === row.id);
  if (row.deleted_at) { if (i >= 0) rows.splice(i, 1); }
  else if (i >= 0) rows[i] = row; else rows.push(row);
  queue.filter((q) => q.table === table && q.id === row.id).forEach(applyOp);
  saveCache();
}

// ------------------------------------------------------------------ envoi ---

const listeners = { change: [], rejected: [] };
export function on(event, fn) { listeners[event].push(fn); }
const emit = (event, ...args) => listeners[event].forEach((fn) => fn(...args));

function sendOp(op) {
  if (op.type === "upsert") {
    return supabase.from(op.table).upsert({ ...op.values, id: op.id }, { onConflict: "id" });
  }
  let q = supabase.from(op.table).update(op.values).eq("id", op.id);
  for (const [k, v] of Object.entries(op.cond || {})) q = q.eq(k, v);
  return q;
}

// Envoie la file à Supabase, dans l'ordre. Panne de réseau : on s'arrête et on
// garde tout pour plus tard. Refus de Supabase : on abandonne l'entrée et on le
// dit. Renvoie true si quelque chose a été abandonné (l'écran est à recharger).
let flushPromise = null;
export function flush() {
  // Le « finally » passe toujours après l'affectation, même si la file est vide
  // (sinon flushPromise resterait pris pour toujours).
  flushPromise ||= sendQueue().finally(() => { flushPromise = null; emit("change"); });
  emit("change");
  return flushPromise;
}

async function sendQueue() {
  let dropped = false;
  while (queue.length) {
    const op = queue[0];
    op.sending = true;
    const res = await sendOp(op);
    if (isNetworkFailure(res)) {
      op.sending = false;
      store.offline = true;
      break;
    }
    store.offline = false;
    if (res.error) { dropped = true; emit("rejected", op, res.error); }
    queue = queue.filter((q) => q !== op);
    saveQueue();
  }
  return dropped;
}

// ------------------------------------------------------------- chargement ---

// Recharge tout le foyer depuis Supabase. Si une requête échoue, on garde
// l'état actuel et on renvoie false : il ne faut jamais remplacer les données
// par des listes vides.
export async function pull() {
  const hid = store.household?.id;
  if (!hid) return false;
  // Le catalogue est global (pas de foyer, pas de suppression logique). S'il ne
  // se charge pas, on garde celui qu'on a : ce n'est jamais bloquant.
  const catalogue = supabase.from("catalog_items")
    .select("id, name, name_normalized, synonyms, default_aisle_key").order("name");
  const results = await Promise.all([
    supabase.from("households").select("*").eq("id", hid).maybeSingle(),
    supabase.from("household_members").select("*").eq("household_id", hid).order("created_at"),
    ...SYNCED_TABLES.map((t) =>
      supabase.from(t).select("*").eq("household_id", hid).is("deleted_at", null).order("created_at")),
  ]);
  if (store.household?.id !== hid) return false;   // déconnexion pendant le chargement
  const failed = results.find((r) => r.error);
  if (failed) {
    console.warn("Chargement impossible :", failed.error.message);
    store.offline = store.offline || !navigator.onLine || results.some(isNetworkFailure);
    emit("change");
    return false;
  }
  const cat = await catalogue;
  if (store.household?.id !== hid) return false;
  if (!cat.error && cat.data) store.catalog = cat.data;
  const [hh, members, ...tables] = results;
  if (hh.data) store.household = hh.data;
  store.members = members.data || [];
  store.member = store.members.find((m) => m.user_id === store.user.id) || store.member;
  SYNCED_TABLES.forEach((t, i) => { store.data[t] = tables[i].data || []; });
  // Les gestes pas encore envoyés repassent par-dessus ce qui vient d'arriver.
  queue.forEach(applyOp);
  store.offline = false;
  store.syncedAt = Date.now();
  saveCache();
  emit("change");
  return true;
}
