// Images et PDF des recettes : compression, copie sur l'appareil, envoi différé.
//
// - Tout fichier est d'abord rangé dans l'API Cache de l'appareil (localStorage
//   ne convient pas aux images) : il s'affiche tout de suite, même hors ligne.
// - L'envoi vers Supabase Storage (compartiment privé `recipe-media`, chemins
//   préfixés par le foyer) se fait ensuite, et reprend tout seul au retour du
//   réseau.
// - À l'affichage : l'appareil d'abord, sinon téléchargement puis mise en cache.
//   Les vignettes de tuiles sont préchargées ; les fichiers complets (photos,
//   PDF) sont mis en cache à leur première ouverture.

import { supabase } from "./supabase.js";

const BUCKET = "recipe-media";
const CACHE = "wasabi-media-v1";   // sw.js ne l'efface pas à ses mises à jour
const PENDING_KEY = `${globalThis.__WASABI_FAKE_SUPABASE__ ? "wasabi-essai" : "wasabi"}-uploads-v1`;
const RETRY_MS = 60000;

export const TAILLE_FICHIER = 1600;    // plus grand côté d'une photo de recette (px)
export const TAILLE_VIGNETTE = 600;    // plus grand côté d'une image de tuile (px)
export const MAX_PDF = 25 * 1024 * 1024;

const urls = new Map();      // chemin → URL d'objet prête pour <img>
const echecs = new Map();    // chemin → moment du dernier échec (pas de réessai en boucle)
const keyOf = (path) => new Request(new URL(`/_media/${path}`, location.origin).href);
const openCache = async () => { try { return await caches.open(CACHE); } catch { return null; } };

function readPending() { try { return JSON.parse(localStorage.getItem(PENDING_KEY)) || []; } catch { return []; } }
function writePending(list) { try { localStorage.setItem(PENDING_KEY, JSON.stringify(list)); } catch { /* rien */ } }
export const pendingUploads = () => readPending().length;

/** Range un fichier sur l'appareil et le met en file d'envoi. */
export async function saveLocal(path, blob) {
  const cache = await openCache();
  if (cache) await cache.put(keyOf(path), new Response(blob, { headers: { "content-type": blob.type || "application/octet-stream" } }));
  urls.set(path, URL.createObjectURL(blob));
  writePending([...readPending().filter((p) => p !== path), path]);
  flushUploads();
}

let flushing = null;
export function flushUploads() {
  flushing ||= (async () => {
    const cache = await openCache();
    for (const path of readPending()) {
      const hit = cache && await cache.match(keyOf(path));
      if (hit) {
        const blob = await hit.blob();
        const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { upsert: true, contentType: blob.type });
        if (error) {
          if (!navigator.onLine || error.status === 0 || /fetch|network/i.test(error.message || "")) break;   // plus tard
          console.warn("Envoi refusé :", path, error.message);
        }
      }
      writePending(readPending().filter((p) => p !== path));
    }
  })().finally(() => { flushing = null; });
  return flushing;
}

/** Le fichier : depuis l'appareil, sinon depuis Supabase (puis gardé sur l'appareil). */
export async function getBlob(path) {
  const cache = await openCache();
  const hit = cache && await cache.match(keyOf(path));
  if (hit) return hit.blob();
  if (!navigator.onLine || Date.now() - (echecs.get(path) || 0) < RETRY_MS) return null;
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) { echecs.set(path, Date.now()); return null; }
  if (cache) cache.put(keyOf(path), new Response(data, { headers: { "content-type": data.type } })).catch(() => {});
  return data;
}

export async function getUrl(path) {
  if (!path) return null;
  if (urls.has(path)) return urls.get(path);
  const blob = await getBlob(path);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urls.set(path, url);
  return url;
}

/** Remplit les <img data-media="chemin"> d'un bloc de page. */
export function hydrate(root) {
  root.querySelectorAll("img[data-media]:not([src])").forEach(async (img) => {
    const url = await getUrl(img.dataset.media);
    if (url) img.src = url; else img.closest("[data-media-box]")?.classList.add("sans-image");
  });
}

/** Précharge discrètement (une à la fois) les vignettes pas encore sur l'appareil. */
let prefetching = false;
export async function prefetch(paths) {
  if (prefetching || !navigator.onLine) return;
  prefetching = true;
  try { for (const p of paths) if (p && !urls.has(p)) await getUrl(p); } finally { prefetching = false; }
}

/** Adresse temporaire (1 h) pour ouvrir un PDF dans la visionneuse du téléphone. */
export async function signedUrl(path) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  return error ? null : data.signedUrl;
}

/** Réduit une image côté téléphone (JPEG), en respectant son orientation. */
export async function compressImage(blob, max) {
  let source;
  try { source = await createImageBitmap(blob, { imageOrientation: "from-image" }); }
  catch {
    source = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = URL.createObjectURL(blob);
    });
  }
  const w = source.width || source.naturalWidth, h = source.height || source.naturalHeight;
  const ratio = Math.min(1, max / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * ratio);
  canvas.height = Math.round(h * ratio);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";   // fond des PNG transparents (donnée d'image, pas une couleur d'interface)
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  source.close?.();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("compression"))), "image/jpeg", 0.82));
}

window.addEventListener("online", flushUploads);
