"use client";

import { useMemo } from "react";
import { createClient } from "@supabase/supabase-js";
import { useSession } from "@clerk/nextjs";

/**
 * Cliente Supabase para componentes cliente. Inyecta el token de Clerk
 * para que el RLS funcione con el user id de Clerk. (Se usa desde la Fase 1.)
 */
export function useSupabaseBrowserClient() {
  const { session } = useSession();

  return useMemo(
    () =>
      createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          async accessToken() {
            return (await session?.getToken()) ?? null;
          },
        },
      ),
    [session],
  );
}
