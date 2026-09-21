-- ============================================================================
--  Wasabi — schéma Supabase (feuille de route, section 5)
--  À coller dans : Supabase → SQL Editor → New query → Run.
--  Peut être repassé sans danger : rien n'est effacé.
--
--  Conventions :
--   - identifiants UUID générés par l'app (création hors ligne) ;
--   - created_at / updated_at partout, updated_at tenu par un déclencheur ;
--   - suppression logique (deleted_at) sur toutes les tables synchronisées ;
--   - household_id sur chaque table : une seule règle RLS, un seul filtre
--     temps réel, un chargement uniforme dans lib/store.js.
-- ============================================================================

-- ---------- Foyer (repris de Calico) ----------------------------------------

create table if not exists public.households (
  id         uuid primary key default gen_random_uuid(),
  name       text not null default 'Notre foyer',
  join_code  text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.household_members (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null,
  color        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (household_id, user_id)
);

create index if not exists idx_hm_user on public.household_members(user_id);

-- ---------- Épicerie --------------------------------------------------------

-- Allées, propres à chaque foyer (ordre personnalisable).
-- key = lien avec le catalogue global ; null pour une allée créée à la main.
create table if not exists public.aisles (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  key          text,
  name         text not null,
  position     int  not null default 0,
  color_key    text,   -- jeton de pastille de la charte (ex. 'fruits-legumes') ; phase 2
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create unique index if not exists uq_aisles_key
  on public.aisles(household_id, key) where key is not null and deleted_at is null;
create index if not exists idx_aisles_hh on public.aisles(household_id);

-- Catalogue global d'aliments : lecture seule pour l'app, semé en phase 2.
create table if not exists public.catalog_items (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  name_normalized   text not null unique,   -- minuscules, sans accents
  synonyms          text[] not null default '{}',
  default_aisle_key text not null default 'autre',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- La mémoire du foyer : tout article déjà ajouté au moins une fois.
create table if not exists public.household_items (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references public.households(id) on delete cascade,
  name            text not null,
  name_normalized text not null,
  catalog_item_id uuid references public.catalog_items(id) on delete set null,
  aisle_id        uuid references public.aisles(id) on delete set null,
  use_count       int  not null default 0,
  last_used_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create unique index if not exists uq_household_items_name
  on public.household_items(household_id, name_normalized) where deleted_at is null;

create table if not exists public.grocery_lists (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name         text not null,
  emoji        text,
  position     int  not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  unique (id, household_id)
);
create index if not exists idx_grocery_lists_hh on public.grocery_lists(household_id);

create table if not exists public.list_items (
  id                uuid primary key default gen_random_uuid(),
  household_id      uuid not null references public.households(id) on delete cascade,
  list_id           uuid not null,
  household_item_id uuid references public.household_items(id) on delete set null,
  name              text not null,   -- dénormalisé pour l'affichage hors ligne
  quantity          int  not null default 1 check (quantity >= 1),   -- jamais mémorisée
  checked           boolean not null default false,
  checked_at        timestamptz,
  note              text,   -- précision libre (marque, type) ; propre à la ligne
  added_by          uuid references public.household_members(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  foreign key (list_id, household_id)
    references public.grocery_lists(id, household_id) on delete cascade
);
alter table public.list_items add column if not exists note text;
create index if not exists idx_list_items_list on public.list_items(list_id);
create index if not exists idx_list_items_hh on public.list_items(household_id);

-- ---------- Recettes (inutilisées avant la phase 3) -------------------------

create table if not exists public.recipe_categories (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name         text not null,
  position     int  not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create index if not exists idx_recipe_categories_hh on public.recipe_categories(household_id);

create table if not exists public.tags (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name         text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  unique (id, household_id)
);
create index if not exists idx_tags_hh on public.tags(household_id);

create table if not exists public.recipes (
  id               uuid primary key default gen_random_uuid(),
  household_id     uuid not null references public.households(id) on delete cascade,
  created_by       uuid references public.household_members(id) on delete set null,
  type             text not null check (type in ('url','manual','file')),
  title            text not null,
  category_id      uuid references public.recipe_categories(id) on delete set null,
  cover_path       text,   -- image de la tuile, dans Storage
  notes            text,   -- tous les types
  url              text,   -- type 'url'
  site_name        text,   -- type 'url'
  ingredients_text text,   -- type 'manual'
  steps_text       text,   -- type 'manual'
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  unique (id, household_id)
);
create index if not exists idx_recipes_hh on public.recipes(household_id);

-- Fichiers d'une recette de type 'file' (ex. une recette sur deux pages).
create table if not exists public.recipe_files (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  recipe_id    uuid not null,
  path         text not null,
  mime_type    text not null,
  position     int  not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  foreign key (recipe_id, household_id)
    references public.recipes(id, household_id) on delete cascade
);
create index if not exists idx_recipe_files_recipe on public.recipe_files(recipe_id);

create table if not exists public.recipe_tags (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  recipe_id    uuid not null,
  tag_id       uuid not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  unique (recipe_id, tag_id),
  foreign key (recipe_id, household_id)
    references public.recipes(id, household_id) on delete cascade,
  foreign key (tag_id, household_id)
    references public.tags(id, household_id) on delete cascade
);

-- ---------- updated_at tenu par la base -------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'households','household_members','aisles','catalog_items','household_items',
    'grocery_lists','list_items','recipe_categories','tags','recipes',
    'recipe_files','recipe_tags'
  ] loop
    execute format('drop trigger if exists trg_touch on public.%I', t);
    execute format(
      'create trigger trg_touch before update on public.%I
         for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

-- ---------- Fonction anti-récursion pour les règles RLS (Calico) ------------
-- SECURITY DEFINER : contourne la RLS pour lister les foyers de l'utilisateur
-- sans que la règle de household_members se référence elle-même.

create or replace function public.user_household_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select household_id from public.household_members where user_id = auth.uid()
$$;

-- ---------- Row Level Security ----------------------------------------------

alter table public.households        enable row level security;
alter table public.household_members enable row level security;
alter table public.catalog_items     enable row level security;

drop policy if exists hh_select on public.households;
create policy hh_select on public.households for select
  using (id in (select public.user_household_ids()));

drop policy if exists hh_update on public.households;
create policy hh_update on public.households for update
  using (id in (select public.user_household_ids()));

drop policy if exists hm_select on public.household_members;
create policy hm_select on public.household_members for select
  using (household_id in (select public.user_household_ids()));

drop policy if exists hm_update_self on public.household_members;
create policy hm_update_self on public.household_members for update
  using (user_id = auth.uid());

drop policy if exists hm_delete_self on public.household_members;
create policy hm_delete_self on public.household_members for delete
  using (user_id = auth.uid());

-- Catalogue : lecture pour tout compte connecté, aucune écriture depuis l'app.
drop policy if exists cat_select on public.catalog_items;
create policy cat_select on public.catalog_items for select
  to authenticated using (true);

-- Toutes les tables du foyer : même règle.
do $$
declare t text;
begin
  foreach t in array array[
    'aisles','household_items','grocery_lists','list_items',
    'recipe_categories','tags','recipes','recipe_files','recipe_tags'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists hh_all on public.%I', t);
    execute format(
      'create policy hh_all on public.%I for all
         using      (household_id in (select public.user_household_ids()))
         with check (household_id in (select public.user_household_ids()))', t);
  end loop;
end $$;

-- ---------- Semis d'un nouveau foyer ----------------------------------------

-- Gabarit d'allées par défaut : 12 allées, dans l'ordre du parcours en magasin
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
    ('fruits_legumes',   'Fruits et légumes',                   10, 'fruits-legumes'),
    ('boulangerie',      'Boulangerie',                         20, 'boulangerie'),
    ('fromages_fins',    'Fromages et épicerie fine',           30, 'laitiers'),
    ('viandes_poissons', 'Viandes, poissons et fruits de mer',  40, 'viandes-poissons'),
    ('garde_manger',     'Garde-manger',                        50, 'garde-manger'),
    ('laitiers_oeufs',   'Produits laitiers et œufs',           60, 'laitiers'),
    ('boissons',         'Boissons',                            70, 'boissons'),
    ('surgeles',         'Surgelés',                            80, 'surgeles'),
    ('maison_hygiene',   'Maison et hygiène',                   90, 'maison'),
    ('bebe',             'Bébé',                               100, 'maison'),
    ('animaux',          'Animaux',                            110, 'maison'),
    ('autre',            'Autre',                              999, 'maison')
  ) as t(key, name, pos, color)
  where not exists (
    select 1 from public.aisles a
    where a.household_id = p_hh and a.key = t.key and a.deleted_at is null
  );
end;
$$;
revoke execute on function public.seed_aisles(uuid) from public, anon, authenticated;

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

-- ---------- RPC : créer / rejoindre un foyer (Calico) -----------------------

create or replace function public.create_household(
  p_household_name text,
  p_member_name    text,
  p_color          text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_hh uuid; v_code text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  loop
    v_code := upper(substr(md5(gen_random_uuid()::text), 1, 4));
    exit when not exists (select 1 from public.households where join_code = v_code);
  end loop;
  insert into public.households (name, join_code)
    values (coalesce(nullif(p_household_name, ''), 'Notre foyer'), v_code)
    returning id into v_hh;
  insert into public.household_members (household_id, user_id, name, color)
    values (v_hh, auth.uid(), p_member_name, p_color);
  perform public.seed_household(v_hh);
  return v_hh;
end;
$$;

create or replace function public.join_household(
  p_code        text,
  p_member_name text,
  p_color       text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_hh uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select id into v_hh from public.households where join_code = upper(p_code);
  if v_hh is null then raise exception 'household not found'; end if;
  if (select count(*) from public.household_members where household_id = v_hh) >= 5 then
    raise exception 'household is full';
  end if;
  insert into public.household_members (household_id, user_id, name, color)
    values (v_hh, auth.uid(), p_member_name, p_color)
    on conflict (household_id, user_id) do update set name = excluded.name;
  return v_hh;
end;
$$;

grant execute on function public.user_household_ids()               to authenticated;
grant execute on function public.create_household(text, text, text) to authenticated;
grant execute on function public.join_household(text, text, text)   to authenticated;

-- ---------- Stockage : compartiment privé recipe-media ----------------------
-- Chemins préfixés par l'identifiant du foyer : <household_id>/<…>

insert into storage.buckets (id, name, public)
  values ('recipe-media', 'recipe-media', false)
  on conflict (id) do nothing;

drop policy if exists recipe_media_all on storage.objects;
create policy recipe_media_all on storage.objects for all
  to authenticated
  using (
    bucket_id = 'recipe-media'
    and (storage.foldername(name))[1] in (select public.user_household_ids()::text)
  )
  with check (
    bucket_id = 'recipe-media'
    and (storage.foldername(name))[1] in (select public.user_household_ids()::text)
  );

-- ---------- Temps réel ------------------------------------------------------
-- Diffuse les changements aux autres appareils du foyer.

do $$
declare t text;
begin
  foreach t in array array[
    'households','household_members','aisles','household_items','grocery_lists',
    'list_items','recipe_categories','tags','recipes','recipe_files','recipe_tags'
  ] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;   -- déjà diffusée
    end;
  end loop;
end $$;
