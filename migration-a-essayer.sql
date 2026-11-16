-- ============================================================================
--  Wasabi — migration « À essayer » (version 0.17.0, 2026-11-16)
--  À passer UNE fois sur une base déjà installée, AVANT de publier l'app :
--  Supabase → SQL Editor → New query → coller → Run.
--  Sans danger : rien n'est perdu, et la repasser ne change rien.
--  (Une nouvelle installation n'a besoin que de la 1re instruction : schema.sql l'a déjà.)
-- ============================================================================

-- « À essayer » : un état de la recette, plus un tag. Les recettes déjà au
-- carnet ne sont pas marquées (comptées comme essayées).
alter table public.recipes add column if not exists a_essayer boolean not null default false;

-- La version 0.16.0 en faisait un tag : les recettes qui le portaient passent
-- à l'état « à essayer », puis le tag et ses liens sont retirés.
update public.recipes r set a_essayer = true
 where exists (
   select 1 from public.recipe_tags rt
     join public.tags t on t.id = rt.tag_id and t.household_id = rt.household_id
    where rt.recipe_id = r.id and rt.deleted_at is null
      and t.deleted_at is null and t.name = 'À essayer');

update public.recipe_tags set deleted_at = now()
 where deleted_at is null
   and tag_id in (select id from public.tags where name = 'À essayer' and deleted_at is null);

update public.tags set deleted_at = now()
 where name = 'À essayer' and deleted_at is null;
