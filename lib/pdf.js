// Rendu des PDF en images, page par page, avec pdf.js (embarqué dans
// lib/vendor : l'app fonctionne hors ligne). Chargé seulement au premier PDF.
//
// Pourquoi : iOS ne montre que la première page d'un PDF intégré dans une
// page web. En dessinant chaque page nous-mêmes, la visionneuse offre pour un
// PDF exactement ce qu'elle offre pour des photos : zoom, glissement, hors
// ligne. La première page sert aussi de vignette de tuile.

let lib = null;
async function pdfjs() {
  if (!lib) {
    lib = await import("./vendor/pdf.min.mjs");
    lib.GlobalWorkerOptions.workerSrc = new URL("./vendor/pdf.worker.min.mjs", import.meta.url).href;
  }
  return lib;
}

const docs = new Map();   // chemin → document ouvert (le temps de la page)

/** Ouvre un PDF (Blob) et renvoie { pages, render(n, maxPx) → Blob JPEG }. */
export async function openPdf(key, blob) {
  if (docs.has(key)) return docs.get(key);
  const { getDocument } = await pdfjs();
  const doc = await getDocument({ data: await blob.arrayBuffer() }).promise;
  const handle = {
    pages: doc.numPages,
    async render(n, maxPx) {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const scale = maxPx / Math.max(base.width, base.height);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      // intent "print" : pdf.js dessine sans attendre requestAnimationFrame,
      // qui ne vient jamais quand la page est en arrière-plan.
      await page.render({ canvasContext: canvas.getContext("2d"), viewport, intent: "print" }).promise;
      return new Promise((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("rendu"))), "image/jpeg", 0.85));
    },
  };
  docs.set(key, handle);
  return handle;
}
