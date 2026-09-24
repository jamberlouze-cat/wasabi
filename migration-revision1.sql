-- ============================================================================
--  Wasabi — migration « révision 1 » (relecture du 2026-09-24)
--  À passer UNE fois sur une base déjà installée :
--  Supabase → SQL Editor → New query → coller → Run.
--  Sans danger : rien n'est perdu, et la repasser ne change rien.
--  (Une nouvelle installation n'en a pas besoin : schema.sql contient déjà tout.)
-- ============================================================================

-- 1. Un membre ne modifie que son nom et sa couleur : jamais household_id
--    (ce serait entrer dans un autre foyer sans son code) ni user_id.
revoke update on public.household_members from anon, authenticated;
grant update (name, color) on public.household_members to authenticated;

-- 2. Un seul lien actif par (recette, tag) ; un lien supprimé ne bloque plus
--    son retour sous un autre identifiant (liens importés d'Umami).
alter table public.recipe_tags drop constraint if exists recipe_tags_recipe_id_tag_id_key;
create unique index if not exists uq_recipe_tags
  on public.recipe_tags(recipe_id, tag_id) where deleted_at is null;

-- 3. Créer un foyer quand on en a déjà un renvoie celui-ci (un double toucher
--    en créait deux, et l'app ne démarrait plus) ; rejoindre un second foyer
--    est refusé.
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
  -- Déjà dans un foyer (double toucher, ou second essai) : on le renvoie.
  select household_id into v_hh from public.household_members
    where user_id = auth.uid() order by created_at limit 1;
  if v_hh is not null then return v_hh; end if;
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
  if exists (select 1 from public.household_members
             where user_id = auth.uid() and household_id <> v_hh) then
    raise exception 'already in another household';
  end if;
  if (select count(*) from public.household_members where household_id = v_hh) >= 5 then
    raise exception 'household is full';
  end if;
  insert into public.household_members (household_id, user_id, name, color)
    values (v_hh, auth.uid(), p_member_name, p_color)
    on conflict (household_id, user_id) do update set name = excluded.name;
  return v_hh;
end;
$$;
