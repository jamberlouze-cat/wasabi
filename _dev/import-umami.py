# Import de l'export Umami dans Wasabi (feuille de route, phase 4).
# Python seul, aucune dépendance. Exécuté localement, une fois.
#
#   python3 _dev/import-umami.py "~/Downloads/Umami Export.zip"            # simulation : rapport, rien d'écrit
#   python3 _dev/import-umami.py "~/Downloads/Umami Export.zip" --ecrire   # écrit pour de vrai
#
# Ce que l'export contient (inspecté le 2026-09-22) : un JSON schema.org
# « Recipe » par recette, classé dans un dossier par livre (= catégorie Umami).
# Les liens d'origine ne sont PAS dans l'export (le champ url pointe vers
# umami.recipes) : ils ont été relevés à la main sur les pages Umami, connecté
# au compte, dans umami-sources.json (identifiant Umami → URL).
#   - recette avec source → type « lien » (url) ; ingrédients et étapes gardés
#     dans les notes, au cas où le site disparaîtrait ;
#   - recette sans source → type « écrite » (manual).
# L'image vient de l'API d'Umami (publique), réduite par l'API elle-même, et
# copiée dans Storage. Les notes texte d'Umami viennent de l'export .txt (le
# JSON ne les a pas) : « Umami Export 2.zip » à côté du JSON, s'il existe.
#
# Repassable sans doublon : identifiants déterministes tirés de l'identifiant
# Umami de chaque recette. Le script se connecte avec TON compte (courriel +
# mot de passe demandés) : il n'a besoin d'aucune clé secrète et respecte les
# mêmes règles de sécurité que l'app.

import getpass
import json
import os
import re
import sys
import unicodedata
import urllib.error
import urllib.request
import uuid
import zipfile

RACINE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
NS = uuid.UUID("7d0b2a4e-5c1f-4c8a-9e1d-2f3a4b5c6d7e")   # espace des identifiants Wasabi ← Umami

# Livres Umami → catégories Wasabi (semées à la création du foyer). À VALIDER.
CATEGORIES = {
    "Plats": "Plat principal",
    "Soupes": "Soupe",
    "Salades": "Salade",
    "Desserts": "Dessert",
    "Entrées": "Entrée",
    "Déjeuners": "Déjeuner",
    "Collations": "Collation",
    "Boissons": "Boisson",
    "Accompagnements": "Accompagnement",
}
TAILLE_TUILE = 600
SOURCES = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "umami-sources.json"), encoding="utf-8"))


def hote(url):
    return re.sub(r"^www\.", "", url.split("/")[2])


def notes_umami(chemin_json):
    """Les notes de chaque recette, depuis l'export texte voisin (titre → note)."""
    p = re.sub(r"\.zip$", " 2.zip", os.path.expanduser(chemin_json))
    if not os.path.exists(p):
        return {}
    out = {}
    z = zipfile.ZipFile(p)
    for nom in z.namelist():
        if nom.endswith(".txt"):
            t = z.read(nom).decode("utf-8", "replace")
            titre = t.split("\n", 1)[0].strip()
            m = re.search(r"^Notes\n(.*)\Z", t, re.S | re.M)
            if m and m.group(1).strip():
                out[titre] = m.group(1).strip()
    return out


def sans_emoji(s):
    """« Plats 🥘 » → « Plats »."""
    return re.sub(r"[\U0001F000-\U0001FAFF☀-➿️‍]+", "", s or "").strip()


def normaliser(s):
    s = re.sub("œ", "oe", s, flags=re.I)
    s = "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", s.lower()).strip()


def duree(iso):
    """« P0Y0M0DT0H20M0S » → « 20 min », « 1 h 30 » ; None si zéro."""
    m = re.match(r"P(?:\d+Y)?(?:\d+M)?(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?", iso or "")
    if not m:
        return None
    j, h, mn = (int(x or 0) for x in m.groups())
    h += j * 24
    if not h and not mn:
        return None
    if h and mn:
        return f"{h} h {mn:02d}"
    return f"{h} h" if h else f"{mn} min"


def lire_export(chemin):
    z = zipfile.ZipFile(os.path.expanduser(chemin))
    notes_txt = notes_umami(chemin)
    recettes = []
    for nom in z.namelist():
        if not nom.endswith(".json"):
            continue
        d = json.loads(z.read(nom))
        umami_id = (d.get("url") or "").rstrip("/").split("/")[-1] or nom
        livre = sans_emoji(os.path.dirname(nom)) or sans_emoji(d.get("recipeCategory"))
        etapes = []
        for e in d.get("recipeInstructions") or []:
            t = (e.get("text") if isinstance(e, dict) else str(e)) or ""
            if t.strip():
                etapes.append(t.strip())
        tag = sans_emoji(d.get("recipeCuisine"))
        description = (d.get("description") or "").strip()
        if sans_emoji(description) == tag:
            description = ""   # Umami recopie le tag dans la description
        infos = []
        if d.get("recipeYield"):
            portions = re.sub(r"\bservings?\b", "portions", str(d["recipeYield"]))
            infos.append(f"Donne : {portions}")
        for cle, lib in (("prepTime", "Préparation"), ("cookTime", "Cuisson")):
            v = duree(d.get(cle))
            if v:
                infos.append(f"{lib} : {v}")
        titre = (d.get("name") or "Sans titre").strip()
        notes = "\n".join(x for x in [notes_txt.get(titre, ""), description, " · ".join(infos)] if x) or None
        recettes.append({
            "id": str(uuid.uuid5(NS, "recipe:" + umami_id)),
            "umami_id": umami_id,
            "source": SOURCES.get(umami_id),
            "title": titre,
            "livre": livre,
            "categorie": CATEGORIES.get(livre),
            "tag": tag or None,
            "ingredients": [x.strip() for x in d.get("recipeIngredient") or [] if x.strip()],
            "etapes": etapes,
            "notes": notes,
            "image": (d.get("image") or [None])[0],
            "created_at": d.get("datePublished"),
        })
    return sorted(recettes, key=lambda r: r["created_at"] or "")


def rapport(recettes):
    print(f"{len(recettes)} recettes dans l'export\n")
    print("Livres Umami → catégories Wasabi :")
    for livre in sorted({r['livre'] for r in recettes}):
        n = sum(1 for r in recettes if r["livre"] == livre)
        print(f"  {livre!r:22} → {CATEGORIES.get(livre) or '(aucune : à ajouter dans CATEGORIES)'}  ({n})")
    tags = sorted({r["tag"] for r in recettes if r["tag"]})
    print(f"\nTags : {', '.join(tags) or 'aucun'}")
    n_src = sum(1 for r in recettes if r["source"])
    print(f"Sources : {n_src} recettes deviennent des liens, {len(recettes) - n_src} restent écrites\n")
    for r in recettes:
        drapeaux = []
        if not r["ingredients"]:
            drapeaux.append("SANS INGRÉDIENTS")
        if not r["etapes"]:
            drapeaux.append("sans étapes")
        if not r["image"]:
            drapeaux.append("sans image")
        if r["notes"] and not r["notes"].startswith("Donne"):
            drapeaux.append("note")
        print(f"  {r['title'][:48]:48} {r['categorie'] or '-':15} {r['tag'] or '':5} "
              f"{len(r['ingredients']):2d} ingr. {len(r['etapes']):2d} ét.  "
              f"{('→ ' + hote(r['source'])) if r['source'] else 'écrite':28} {' · '.join(drapeaux)}")


# ------------------------------------------------------------------ Supabase ---
class Supabase:
    def __init__(self):
        cfg = open(os.path.join(RACINE, "lib", "config.js"), encoding="utf-8").read()
        self.url = re.search(r'SUPABASE_URL = "([^"]+)"', cfg).group(1)
        self.key = re.search(r'SUPABASE_ANON_KEY = "([^"]+)"', cfg).group(1)
        self.jwt = None

    def _req(self, path, data=None, method=None, headers=None, raw=None):
        h = {"apikey": self.key, "Authorization": f"Bearer {self.jwt or self.key}"}
        if data is not None:
            h["Content-Type"] = "application/json"
            body = json.dumps(data).encode()
        else:
            body = raw
        h.update(headers or {})
        req = urllib.request.Request(self.url + path, data=body, method=method or ("POST" if body is not None else "GET"), headers=h)
        try:
            with urllib.request.urlopen(req, timeout=60) as res:
                out = res.read()
                return json.loads(out) if out and res.headers.get_content_type() == "application/json" else out
        except urllib.error.HTTPError as e:
            sys.exit(f"Supabase a refusé {path} : {e.code} {e.read().decode(errors='replace')[:300]}")

    def connexion(self):
        email = input("Courriel Wasabi : ").strip()
        mdp = getpass.getpass("Mot de passe : ")
        r = self._req("/auth/v1/token?grant_type=password", {"email": email, "password": mdp})
        self.jwt = r["access_token"]
        m = self._req("/rest/v1/household_members?select=id,household_id&limit=1")
        if not m:
            sys.exit("Ce compte n'est dans aucun foyer.")
        self.member_id, self.household_id = m[0]["id"], m[0]["household_id"]

    def select(self, table, query):
        return self._req(f"/rest/v1/{table}?{query}")

    def upsert(self, table, rows):
        if rows:
            self._req(f"/rest/v1/{table}?on_conflict=id", rows, headers={"Prefer": "resolution=merge-duplicates,return=minimal"})

    def upload(self, path, octets, mime):
        self._req(f"/storage/v1/object/recipe-media/{path}", raw=octets, method="POST",
                  headers={"Content-Type": mime, "x-upsert": "true"})


def image_reduite(url):
    """L'API d'Umami sait réduire : on lui demande la taille de la tuile."""
    u = re.sub(r"[?&]w=\d+", "", url)
    u = re.sub(r"[?&]q=\d+", "", u)
    u += ("&" if "?" in u else "?") + f"w={TAILLE_TUILE}&q=80"
    req = urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=60) as res:
        mime = res.headers.get_content_type()
        return res.read(), (mime if mime.startswith("image/") else "image/jpeg")


def ecrire(recettes):
    sb = Supabase()
    sb.connexion()
    hh = sb.household_id
    cats = {normaliser(c["name"]): c["id"] for c in sb.select("recipe_categories", f"select=id,name&household_id=eq.{hh}&deleted_at=is.null")}
    tags = {normaliser(t["name"]): t["id"] for t in sb.select("tags", f"select=id,name&household_id=eq.{hh}&deleted_at=is.null")}
    manquantes = sorted({r["categorie"] for r in recettes if r["categorie"] and normaliser(r["categorie"]) not in cats})
    if manquantes:
        sys.exit(f"Catégories absentes du foyer : {', '.join(manquantes)}. Crée-les dans Réglages, ou corrige CATEGORIES.")

    # Tags manquants
    nouveaux = []
    for nom in sorted({r["tag"] for r in recettes if r["tag"]}):
        if normaliser(nom) not in tags:
            tid = str(uuid.uuid5(NS, "tag:" + normaliser(nom)))
            tags[normaliser(nom)] = tid
            nouveaux.append({"id": tid, "household_id": hh, "name": nom})
    sb.upsert("tags", nouveaux)
    print(f"tags : {len(nouveaux)} créé(s)")

    lignes, liens = [], []
    for i, r in enumerate(recettes, 1):
        cover = None
        if r["image"]:
            try:
                octets, mime = image_reduite(r["image"])
                ext = {"image/webp": "webp", "image/png": "png"}.get(mime, "jpg")
                cover = f"{hh}/{r['id']}/tuile-umami.{ext}"
                sb.upload(cover, octets, mime)
            except Exception as e:   # l'image n'est jamais bloquante
                print(f"  image impossible pour « {r['title']} » : {e}")
        etapes = "\n".join(f"{n}. {t}" for n, t in enumerate(r["etapes"], 1))
        ingredients = "\n".join(r["ingredients"])
        ligne = {
            "id": r["id"], "household_id": hh, "created_by": sb.member_id,
            "title": r["title"], "category_id": cats.get(normaliser(r["categorie"] or "")),
            "cover_path": cover, "created_at": r["created_at"], "deleted_at": None,
        }
        if r["source"]:
            # Lien : ingrédients et étapes conservés dans les notes (le site peut disparaître).
            copie = "\n\n".join(x for x in [
                f"Ingrédients\n{ingredients}" if ingredients else "",
                f"Étapes\n{etapes}" if etapes else ""] if x)
            ligne.update({
                "type": "url", "url": r["source"], "site_name": hote(r["source"]),
                "notes": "\n\n".join(x for x in [r["notes"] or "", copie] if x) or None,
                "ingredients_text": None, "steps_text": None,
            })
        else:
            ligne.update({
                "type": "manual", "url": None, "site_name": None, "notes": r["notes"],
                "ingredients_text": ingredients or None, "steps_text": etapes or None,
            })
        lignes.append(ligne)
        if r["tag"]:
            tid = tags[normaliser(r["tag"])]
            liens.append({"id": str(uuid.uuid5(NS, f"rt:{r['id']}:{tid}")), "household_id": hh,
                          "recipe_id": r["id"], "tag_id": tid, "deleted_at": None})
        print(f"  {i:2d}/{len(recettes)} {r['title'][:60]}{'' if cover else '  (sans image)'}")
    sb.upsert("recipes", lignes)
    sb.upsert("recipe_tags", liens)
    print(f"\n{len(lignes)} recettes écrites, {len(liens)} tags liés. Ferme et rouvre l'app.")


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        sys.exit(__doc__ or "usage : import-umami.py <export.zip> [--ecrire]")
    recettes = lire_export(args[0])
    rapport(recettes)
    if "--ecrire" in sys.argv:
        print("\n=== ÉCRITURE ===")
        ecrire(recettes)
    else:
        print("\nSimulation seulement. Ajoute --ecrire pour écrire dans Wasabi.")
