# Transforme catalogue.csv (nom, synonymes séparés par « | », cle_allee) en
# catalogue.sql, à passer dans Supabase → SQL Editor. Vérifie au passage les
# clés d'allée et les doublons (un nom ou un synonyme ne peut mener qu'à un
# seul article). Repassable : un article déjà là est mis à jour, pas dupliqué.
#   python3 _dev/catalogue_sql.py
import csv
import os
import re
import sys
import unicodedata

RACINE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
ALLEES = {"fruits_legumes", "boulangerie", "fromages_fins", "viandes", "poissons_fruits_de_mer", "garde_manger", "laitiers_oeufs",
          "boissons", "surgeles", "maison_hygiene", "bebe", "animaux", "autre"}


def normaliser(s):
    """Même règle que lib/noms.js : minuscules, sans accents, espaces simples."""
    s = re.sub("œ", "oe", s, flags=re.I)
    s = re.sub("æ", "ae", s, flags=re.I)
    s = "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", s.lower()).strip()


def sql(s):
    return "'" + s.replace("'", "''") + "'"


lignes, vus, erreurs = [], {}, []
with open(os.path.join(RACINE, "catalogue.csv"), encoding="utf-8", newline="") as f:
    for n, row in enumerate(csv.DictReader(f), start=2):
        nom = row["nom"].strip()
        syn = [x.strip() for x in (row["synonymes"] or "").split("|") if x.strip()]
        allee = row["cle_allee"].strip()
        if not nom:
            continue
        if allee not in ALLEES:
            erreurs.append(f"ligne {n} : allée inconnue « {allee} »")
        for terme in [nom] + syn:
            cle = normaliser(terme)
            if cle in vus:
                erreurs.append(f"ligne {n} : « {terme} » existe déjà (ligne {vus[cle]})")
            vus[cle] = n
        lignes.append((nom, normaliser(nom), syn, allee))

if erreurs:
    sys.exit("catalogue.csv à corriger :\n  " + "\n  ".join(erreurs))

valeurs = ",\n".join(
    f"  ({sql(nom)}, {sql(norm)}, "
    + (f"array[{', '.join(sql(x) for x in syn)}]" if syn else "'{}'::text[]")
    + f", {sql(allee)})"
    for nom, norm, syn, allee in lignes)

with open(os.path.join(RACINE, "catalogue.sql"), "w", encoding="utf-8") as f:
    f.write(f"""-- Wasabi — catalogue d'articles ({len(lignes)} articles).
-- GÉNÉRÉ par _dev/catalogue_sql.py à partir de catalogue.csv : ne pas modifier à la main.
-- Supabase → SQL Editor → New query → coller → Run. Repassable sans danger.

insert into public.catalog_items (name, name_normalized, synonyms, default_aisle_key) values
{valeurs}
on conflict (name_normalized) do update
  set name = excluded.name,
      synonyms = excluded.synonyms,
      default_aisle_key = excluded.default_aisle_key;
""")
print(f"catalogue.sql : {len(lignes)} articles")
