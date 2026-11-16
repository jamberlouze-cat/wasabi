-- ============================================================================
--  Wasabi — migration « Ordre du menu » (version 0.16.0, 2026-11-16)
--  À passer UNE fois sur une base déjà installée, AVANT de publier l'app :
--  Supabase → SQL Editor → New query → coller → Run.
--  Sans danger : rien n'est perdu, et la repasser ne change rien.
--  (Une nouvelle installation n'en a pas besoin : schema.sql contient déjà tout.)
-- ============================================================================

-- Ordre des repas du Menu, choisi par appui long et glisser-déposer.
-- Les repas déjà au menu gardent leur ordre d'ajout (position 0, puis created_at).
alter table public.menu_items add column if not exists position int not null default 0;
