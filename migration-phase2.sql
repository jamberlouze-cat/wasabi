-- ============================================================================
--  Wasabi — migration « phase 2 » : gabarit de 13 allées + note sur un article
--  À passer UNE fois sur une base déjà installée :
--  Supabase → SQL Editor → New query → coller → Run.
--  Fonctionne quel que soit l'état des allées du foyer.
--  Sans danger : rien n'est perdu, et la repasser ne change rien.
--  (Une nouvelle installation n'en a pas besoin : schema.sql contient déjà tout.)
-- ============================================================================

-- Note libre sur une ligne de liste (marque, type : « à fouetter », « sans lactose »…).
alter table public.list_items add column if not exists note text;

-- Gabarit d'allées par défaut : 13 allées, dans l'ordre du parcours en magasin
-- (validé par Maxime le 2026-09-21 ; l'ordre se personnalisera dans Réglages >
-- Allées). color_key = pastille de la charte.
-- Sans danger à repasser : n'ajoute que les allées qui manquent au foyer.
create or replace function public.seed_aisles(p_hh uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.aisles (household_id, key, name, position, color_key)
  select p_hh, t.key, t.name, t.pos, t.color
  from (values
    ('fruits_legumes',         'Fruits et légumes',          10, 'fruits-legumes'),
    ('boulangerie',            'Boulangerie',                20, 'boulangerie'),
    ('fromages_fins',          'Épicerie fine',              30, 'laitiers'),
    ('viandes',                'Viandes',                    40, 'viandes-poissons'),
    ('poissons_fruits_de_mer', 'Poissons et fruits de mer',  50, 'surgeles'),
    ('garde_manger',           'Garde-manger',               60, 'garde-manger'),
    ('laitiers_oeufs',         'Produits laitiers',          70, 'laitiers'),
    ('boissons',               'Boissons',                   80, 'boissons'),
    ('surgeles',               'Surgelés',                   90, 'surgeles'),
    ('maison_hygiene',         'Maison et hygiène',         100, 'maison'),
    ('bebe',                   'Bébé',                      110, 'maison'),
    ('animaux',                'Animaux',                   120, 'maison'),
    ('autre',                  'Autre',                     999, 'maison')
  ) as t(key, name, pos, color)
  where not exists (
    select 1 from public.aisles a
    where a.household_id = p_hh and a.key = t.key and a.deleted_at is null
  );
end;
$$;
revoke execute on function public.seed_aisles(uuid) from public, anon, authenticated;

-- Les nouveaux foyers reçoivent désormais le gabarit complet.
create or replace function public.seed_household(p_hh uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.seed_aisles(p_hh);

  if not exists (select 1 from public.recipe_categories where household_id = p_hh) then
    insert into public.recipe_categories (household_id, name, position)
    select p_hh, c.name, c.pos
    from (values
      ('Entrée', 1), ('Soupe', 2), ('Salade', 3), ('Plat principal', 4),
      ('Accompagnement', 5), ('Dessert', 6), ('Déjeuner', 7),
      ('Collation', 8), ('Boisson', 9)
    ) as c(name, pos);
  end if;
end;
$$;
revoke execute on function public.seed_household(uuid) from public, anon, authenticated;

-- 1. Chaque foyer existant reçoit les allées qui lui manquent.
select public.seed_aisles(id) from public.households;

-- 2. Les allées du gabarit prennent leur nom, leur rang et leur pastille.
update public.aisles a
set name = t.name, position = t.pos, color_key = t.color
from (values
    ('fruits_legumes',         'Fruits et légumes',          10, 'fruits-legumes'),
    ('boulangerie',            'Boulangerie',                20, 'boulangerie'),
    ('fromages_fins',          'Épicerie fine',              30, 'laitiers'),
    ('viandes',                'Viandes',                    40, 'viandes-poissons'),
    ('poissons_fruits_de_mer', 'Poissons et fruits de mer',  50, 'surgeles'),
    ('garde_manger',           'Garde-manger',               60, 'garde-manger'),
    ('laitiers_oeufs',         'Produits laitiers',          70, 'laitiers'),
    ('boissons',               'Boissons',                   80, 'boissons'),
    ('surgeles',               'Surgelés',                   90, 'surgeles'),
    ('maison_hygiene',         'Maison et hygiène',         100, 'maison'),
    ('bebe',                   'Bébé',                      110, 'maison'),
    ('animaux',                'Animaux',                   120, 'maison'),
    ('autre',                  'Autre',                     999, 'maison')
) as t(key, name, pos, color)
where a.key = t.key and a.deleted_at is null
  and (a.name, a.position, a.color_key) is distinct from (t.name, t.pos, t.color);

-- 3. Anciennes allées fusionnées : leurs articles passent dans la nouvelle
--    allée, puis l'ancienne est retirée (suppression logique).
with fusion(old_key, new_key) as (values
  ('viandes_volailles',        'viandes'),
  ('viandes_poissons',         'viandes'),
  ('charcuterie_fromages',     'fromages_fins'),
  ('dejeuner_cereales',        'garde_manger'),
  ('collations',               'garde_manger'),
  ('condiments_huiles_epices', 'garde_manger'),
  ('patisserie',               'garde_manger'),
  ('breuvages',                'boissons'),
  ('biere_vin',                'boissons'),
  ('hygiene_pharmacie',        'maison_hygiene'),
  ('entretien_menager',        'maison_hygiene')
),
paires as (
  select o.id as old_id, n.id as new_id
  from fusion f
  join public.aisles o on o.key = f.old_key and o.deleted_at is null
  join public.aisles n on n.key = f.new_key and n.deleted_at is null
                      and n.household_id = o.household_id
),
deplaces as (
  update public.household_items h set aisle_id = p.new_id
  from paires p where h.aisle_id = p.old_id
  returning h.id
)
update public.aisles a set deleted_at = now()
from paires p where a.id = p.old_id;
