import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { authUrl, googleConfigured } from "@/lib/google";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getOrCreateWorkspace } from "@/lib/data";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.redirect(new URL("/sign-in", req.url));
  if (!googleConfigured()) {
    return new Response("Falta configurar GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en .env.local.", { status: 400 });
  }
  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId");
  if (!projectId) return new Response("projectId requerido", { status: 400 });

  const ws = await getOrCreateWorkspace(userId);
  const sb = createAdminSupabaseClient();
  const { data } = await sb
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("workspace_id", ws.id)
    .maybeSingle();
  if (!data) return new Response("Proyecto no encontrado", { status: 404 });

  const redirectUri = `${url.origin}/api/google/callback`;
  const state = Buffer.from(JSON.stringify({ projectId, userId })).toString("base64url");
  return NextResponse.redirect(authUrl(redirectUri, state));
}
