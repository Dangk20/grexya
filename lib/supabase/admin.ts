import { createClient } from "@supabase/supabase-js";

/**
 * Cliente admin (service role) — SOLO en servidor. Salta el RLS.
 * Úsalo únicamente para tareas de sistema (p. ej. el bootstrap/seed inicial),
 * nunca para servir datos directamente al usuario.
 */
export function createAdminSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
