-- ============================================================================
--  Wasabi — migration « allées »
--  À passer UNE fois sur une base installée avant l'arrivée des allées :
--  Supabase → SQL Editor → New query → coller → Run. Sans danger : rien n'est
--  effacé, et la repasser ne change rien.
--  (Une nouvelle installation n'en a pas besoin : schema.sql contient déjà tout.)
-- ============================================================================

-- Gabarit d'allées par défaut (feuille de route, phase 2 — provisoire : l'ordre
-- se personnalisera dans Réglages > Allées). color_key = pastille de la charte
-- (8 couleurs pour 19 allées : les allées voisines partagent une couleur).
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
    ('fruits_legumes',           'Fruits et légumes',              10, 'fruits-legumes'),
    ('boulangerie',              'Boulangerie',                    20, 'boulangerie'),
    ('viandes_volailles',        'Viandes et volailles',           30, 'viandes-poissons'),
    ('poissons_fruits_de_mer',   'Poissons et fruits de mer',      40, 'viandes-poissons'),
    ('charcuterie_fromages',     'Charcuterie et fromages',        50, 'viandes-poissons'),
    ('laitiers_oeufs',           'Produits laitiers et œufs',      60, 'laitiers'),
    ('surgeles',                 'Surgelés',                       70, 'surgeles'),
    ('garde_manger',             'Garde-manger',                   80, 'garde-manger'),
    ('dejeuner_cereales',        'Déjeuner et céréales',           90, 'garde-manger'),
    ('collations',               'Collations',                    100, 'garde-manger'),
    ('condiments_huiles_epices', 'Condiments, huiles et épices',  110, 'garde-manger'),
    ('patisserie',               'Ingrédients à pâtisserie',      120, 'garde-manger'),
    ('breuvages',                'Breuvages',                     130, 'boissons'),
    ('biere_vin',                'Bière et vin',                  140, 'boissons'),
    ('bebe',                     'Bébé',                          150, 'maison'),
    ('hygiene_pharmacie',        'Hygiène et pharmacie',          160, 'maison'),
    ('entretien_menager',        'Entretien ménager',             170, 'maison'),
    ('animaux',                  'Animaux',                       180, 'maison'),
    ('autre',                    'Autre',                         999, 'maison')
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

-- Les foyers existants : l'allée « Autre » prend sa pastille, les autres s'ajoutent.
update public.aisles set color_key = 'maison' where key = 'autre' and color_key is null;
select public.seed_aisles(id) from public.households;
