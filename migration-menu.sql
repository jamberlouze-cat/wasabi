-- ============================================================================
--  Wasabi — migration « Menu de la semaine » (version 0.11.0, 2026-10-14)
--  À passer UNE fois sur une base déjà installée, AVANT de publier l'app :
--  Supabase → SQL Editor → New query → coller → Run.
--  Sans danger : rien n'est perdu, et la repasser ne change rien.
--  (Une nouvelle installation n'en a pas besoin : schema.sql contient déjà tout.)
-- ============================================================================

-- Le menu : une simple liste de repas, sans jour ni date. Un repas est une
-- recette du carnet (recipe_id) ou un texte libre ; title est dénormalisé pour
-- l'affichage hors ligne et pour les repas sans recette.
create table if not exists public.menu_items (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  recipe_id    uuid,
  title        text not null,
  done         boolean not null default false,   -- repas fait
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  foreign key (recipe_id, household_id)
    references public.recipes(id, household_id) on delete cascade
);
create index if not exists idx_menu_items_hh on public.menu_items(household_id);

-- Pastilles de la boîte d'ajout : les recettes le plus souvent mises au menu.
alter table public.recipes add column if not exists menu_count   int not null default 0;
alter table public.recipes add column if not exists last_menu_at timestamptz;

drop trigger if exists trg_touch on public.menu_items;
create trigger trg_touch before update on public.menu_items
  for each row execute function public.touch_updated_at();

alter table public.menu_items enable row level security;
drop policy if exists hh_all on public.menu_items;
create policy hh_all on public.menu_items for all
  using      (household_id in (select public.user_household_ids()))
  with check (household_id in (select public.user_household_ids()));

do $$
begin
  alter publication supabase_realtime add table public.menu_items;
exception when duplicate_object then null;   -- déjà diffusée
end $$;
