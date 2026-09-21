// ⚙️  CONFIGURATION — à remplir une seule fois.
//
// Supabase → Project Settings → API : « Project URL » et la clé publique.
// (La clé publique est faite pour vivre dans le navigateur : la sécurité
//  réelle est assurée par les règles RLS du fichier schema.sql.)

export const SUPABASE_URL = "https://tehzdqzsahjgfsnkcbdy.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_3ciEuWiISyJMAf4MpuKZEw_1GqJUgGf";

export function isConfigured() {
  if (globalThis.__WASABI_FAKE_SUPABASE__) return true;   // banc d'essai (_test.html)
  return !SUPABASE_URL.includes("VOTRE-PROJET") &&
         !SUPABASE_ANON_KEY.includes("VOTRE_CLE");
}
