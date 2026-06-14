import { createClient } from "@supabase/supabase-js";
import { auth } from "@clerk/nextjs/server";

/**
 * Cliente Supabase para Server Components / route handlers.
 * Usa el token de Clerk como accessToken → el RLS de Supabase resuelve
 * `auth.jwt()->>'sub'` con el user id de Clerk. (Se usa desde la Fase 1.)
 */
export async function createServerSupabaseClient() {
  const { getToken } = await auth();
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      async accessToken() {
        return (await getToken()) ?? null;
      },
    },
  );
}
