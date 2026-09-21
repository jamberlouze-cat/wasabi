// Faux Supabase en mémoire pour le banc d'essai (_test.html) : fait tourner la
// VRAIE app.js et le VRAI lib/store.js sans réseau ni compte. Dev seulement.
//
//   _test.html                    connecté, foyer de deux membres
//   _test.html?scenario=auth      écran de connexion
//   _test.html?scenario=onboard   connecté, sans foyer
// Dans la console : __fake.offline = true simule une panne de réseau ;
// __fake.db montre les tables ; __fake.log, les requêtes d'écriture reçues.

const SCENARIO = new URLSearchParams(location.search).get("scenario");
const now = () => new Date().toISOString();

const db = {
  households: [{ id: "hh1", name: "Notre foyer", join_code: "WSBI", created_at: now(), updated_at: now() }],
  household_members: [
    { id: "m1", household_id: "hh1", user_id: "u1", name: "Maxime", color: "bleuet", created_at: "2026-09-01T00:00:00Z" },
    { id: "m2", household_id: "hh1", user_id: "u2", name: "Sarah", color: "aubergine", created_at: "2026-09-01T00:01:00Z" },
  ],
  aisles: [
    { id: "a1", household_id: "hh1", key: "autre", name: "Autre", position: 999, color_key: "maison", deleted_at: null, created_at: now() },
    { id: "a2", household_id: "hh1", key: "fruits_legumes", name: "Fruits et légumes", position: 10, color_key: "fruits-legumes", deleted_at: null, created_at: now() },
    { id: "a3", household_id: "hh1", key: "boulangerie", name: "Boulangerie", position: 20, color_key: "boulangerie", deleted_at: null, created_at: now() },
    { id: "a4", household_id: "hh1", key: "laitiers_oeufs", name: "Produits laitiers et œufs", position: 60, color_key: "laitiers", deleted_at: null, created_at: now() },
  ],
  household_items: ["Lait", "Pain", "Œufs", "Bananes", "Beurre", "Café", "Yogourt", "Tomates", "Fromage cheddar", "Oignons", "Pommes", "Riz"].map((name, i) => ({
    id: "hi" + i, household_id: "hh1", name, name_normalized: name.toLowerCase().replace("œ", "oe").normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
    catalog_item_id: null, aisle_id: { Lait: "a4", Pain: "a3", "Œufs": "a4", Bananes: "a2", Tomates: "a2" }[name] || "a1", use_count: 20 - i, last_used_at: now(), deleted_at: null, created_at: now(),
  })),
  grocery_lists: [
    { id: "l1", household_id: "hh1", name: "Épicerie", emoji: "🛒", position: 1, deleted_at: null, created_at: "2026-09-01T00:00:00Z" },
    { id: "l2", household_id: "hh1", name: "Costco", emoji: "🏠", position: 2, deleted_at: null, created_at: "2026-09-02T00:00:00Z" },
  ],
  list_items: [
    { id: "li1", household_id: "hh1", list_id: "l1", household_item_id: "hi0", name: "Lait", quantity: 2, checked: false, checked_at: null, deleted_at: null, created_at: "2026-09-10T00:00:01Z" },
    { id: "li2", household_id: "hh1", list_id: "l1", household_item_id: "hi1", name: "Pain", quantity: 1, checked: false, checked_at: null, deleted_at: null, created_at: "2026-09-10T00:00:02Z" },
    { id: "li3", household_id: "hh1", list_id: "l1", household_item_id: "hi2", name: "Œufs", quantity: 3, checked: true, checked_at: now(), deleted_at: null, created_at: "2026-09-10T00:00:03Z" },
  ],
  catalog_items: [
    { id: "c1", name: "Pommes de terre", name_normalized: "pommes de terre", synonyms: ["Patates"], default_aisle_key: "fruits_legumes" },
    { id: "c2", name: "Baguette", name_normalized: "baguette", synonyms: ["Pain baguette"], default_aisle_key: "boulangerie" },
    { id: "c3", name: "Yogourt", name_normalized: "yogourt", synonyms: ["Yaourt"], default_aisle_key: "laitiers_oeufs" },
    { id: "c4", name: "Café", name_normalized: "cafe", synonyms: [], default_aisle_key: "boissons" },
  ],
  recipe_categories: ["Soupe", "Plat principal", "Dessert"].map((name, i) => ({ id: "rcat" + i, household_id: "hh1", name, position: i + 1, deleted_at: null, created_at: now() })),
  tags: [{ id: "t1", household_id: "hh1", name: "Rapide", deleted_at: null, created_at: now() }, { id: "t2", household_id: "hh1", name: "Végé", deleted_at: null, created_at: now() }],
  recipes: [
    { id: "r1", household_id: "hh1", type: "url", title: "Pâté chinois classique", url: "https://www.ricardocuisine.com/recettes/5541", site_name: "Ricardo", category_id: "rcat1", cover_path: null, notes: "Doubler le maïs.", deleted_at: null, created_at: "2026-09-10T10:00:00Z" },
    { id: "r2", household_id: "hh1", type: "manual", title: "Soupe aux pois de grand-maman", category_id: "rcat0", cover_path: null, ingredients_text: "2 tasses de pois jaunes\n1 os de jambon\n1 oignon", steps_text: "Faire tremper les pois toute la nuit.\nMijoter 3 heures.", notes: null, deleted_at: null, created_at: "2026-09-11T10:00:00Z" },
  ],
  recipe_files: [],
  recipe_tags: [{ id: "rt1", household_id: "hh1", recipe_id: "r1", tag_id: "t1", deleted_at: null, created_at: now() }],
};
if (SCENARIO === "onboard") db.household_members = db.household_members.filter((m) => m.user_id !== "u1");

const state = { offline: false, db, log: [] };
const NETWORK_ERROR = { data: null, error: { message: "TypeError: Failed to fetch" }, status: 0 };

class Query {
  constructor(table) { this.table = table; this.filters = []; this.op = "select"; }
  select(cols = "*") { this.cols = cols; return this; }
  eq(k, v) { this.filters.push((r) => r[k] === v); (this.conds ||= {})[k] = v; return this; }
  is(k, v) { this.filters.push((r) => (r[k] ?? null) === v); return this; }
  in(k, vs) { this.filters.push((r) => vs.includes(r[k])); return this; }
  order(k) { this.orderBy = k; return this; }
  limit() { return this; }
  maybeSingle() { this.single = true; return this; }
  upsert(row) { this.op = "upsert"; this.values = row; return this; }
  update(values) { this.op = "update"; this.values = values; return this; }

  run() {
    if (state.offline) return NETWORK_ERROR;
    const rows = (db[this.table] ||= []);
    if (this.op === "upsert") {
      state.log.push({ op: "upsert", table: this.table, values: this.values });
      const i = rows.findIndex((r) => r.id === this.values.id);
      const row = { deleted_at: null, ...(i >= 0 ? rows[i] : {}), ...this.values, updated_at: now() };
      if (i >= 0) rows[i] = row; else rows.push(row);
      return { data: null, error: null, status: 201 };
    }
    if (this.op === "update") {
      state.log.push({ op: "update", table: this.table, values: this.values });
      rows.filter((r) => this.filters.every((f) => f(r)))
        .forEach((r) => Object.assign(r, this.values, { updated_at: now() }));
      return { data: null, error: null, status: 204 };
    }
    let out = rows.filter((r) => this.filters.every((f) => f(r))).map((r) => ({ ...r }));
    if (this.orderBy) out.sort((a, b) => String(a[this.orderBy]).localeCompare(String(b[this.orderBy])));
    if (this.cols?.includes("households(*)")) {
      out = out.map((r) => ({ ...r, households: { ...db.households.find((h) => h.id === r.household_id) } }));
    }
    return { data: this.single ? (out[0] || null) : out, error: null, status: 200 };
  }
  then(resolve, reject) {
    return new Promise((r) => setTimeout(() => r(this.run()), 60)).then(resolve, reject);
  }
}

let session = SCENARIO === "auth" ? null : { user: { id: "u1", email: "maxime@exemple.com" } };
const authListeners = [];
const fire = (event) => setTimeout(() => authListeners.forEach((cb) => cb(event, session)), 0);

const auth = {
  async getSession() { return { data: { session }, error: null }; },
  onAuthStateChange(cb) { authListeners.push(cb); return { data: { subscription: { unsubscribe() {} } } }; },
  async signInWithPassword({ email }) {
    if (state.offline) return { data: {}, error: { message: "Failed to fetch" } };
    session = { user: { id: "u1", email } };
    fire("SIGNED_IN");
    return { data: { session }, error: null };
  },
  async signUp(creds) { return this.signInWithPassword(creds); },
  async signOut() { session = null; fire("SIGNED_OUT"); return { error: null }; },
};

const rpcs = {
  create_household({ p_household_name, p_member_name, p_color }) {
    const id = crypto.randomUUID();
    db.households.push({ id, name: p_household_name, join_code: "NEUF", created_at: now() });
    db.household_members.push({ id: crypto.randomUUID(), household_id: id, user_id: session.user.id, name: p_member_name, color: p_color, created_at: now() });
    return { data: id, error: null };
  },
  join_household({ p_code, p_member_name, p_color }) {
    const hh = db.households.find((h) => h.join_code === p_code);
    if (!hh) return { data: null, error: { message: "household not found" } };
    db.household_members.push({ id: crypto.randomUUID(), household_id: hh.id, user_id: session.user.id, name: p_member_name, color: p_color, created_at: now() });
    return { data: hh.id, error: null };
  },
};

// Storage en mémoire (les fichiers vivent le temps de la page).
const fichiers = new Map();
const storage = {
  from: () => ({
    async upload(path, blob) {
      if (state.offline) return { data: null, error: { message: "Failed to fetch", status: 0 } };
      fichiers.set(path, blob);
      state.log.push({ op: "upload", table: "storage", values: { path, octets: blob.size, type: blob.type } });
      return { data: { path }, error: null };
    },
    async download(path) {
      return fichiers.has(path) ? { data: fichiers.get(path), error: null } : { data: null, error: { message: "not found" } };
    },
    async createSignedUrl(path) {
      return fichiers.has(path) ? { data: { signedUrl: URL.createObjectURL(fichiers.get(path)) }, error: null } : { data: null, error: { message: "not found" } };
    },
  }),
};

export const fake = {
  auth,
  storage,
  from: (table) => new Query(table),
  async rpc(name, args) { return state.offline ? NETWORK_ERROR : rpcs[name](args); },
  channel() {
    const ch = { state: "joined", on() { return ch; }, subscribe(cb) { setTimeout(() => cb?.("SUBSCRIBED"), 0); return ch; } };
    return ch;
  },
  removeChannel() {},
};

globalThis.__fake = state;
