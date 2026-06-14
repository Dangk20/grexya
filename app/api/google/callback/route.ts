import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { google } from "googleapis";
import { oauthClient, saveConnection } from "@/lib/google";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getOrCreateWorkspace } from "@/lib/data";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const stateRaw = url.searchParams.get("state");
  const err = url.searchParams.get("error");
  if (err) return NextResponse.redirect(new URL(`/?gcal=error`, req.url));
  if (!code || !stateRaw) return NextResponse.redirect(new URL("/", req.url));

  let projectId = "";
  let stateUser = "";
  try {
    const s = JSON.parse(Buffer.from(stateRaw, "base64url").toString());
    projectId = s.projectId;
    stateUser = s.userId;
  } catch {
    return new Response("state inválido", { status: 400 });
  }

  const { userId } = await auth();
  if (!userId || userId !== stateUser) {
    return NextResponse.redirect(new URL("/sign-in", req.url));
  }

  const ws = await getOrCreateWorkspace(userId);
  const sb = createAdminSupabaseClient();
  const { data: proj } = await sb
    .from("projects")
    .select("id, slug")
    .eq("id", projectId)
    .eq("workspace_id", ws.id)
    .maybeSingle();
  if (!proj) return new Response("Proyecto no encontrado", { status: 404 });

  const redirectUri = `${url.origin}/api/google/callback`;
  const client = oauthClient(redirectUri);
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  let email: string | null = null;
  try {
    const oauth2 = google.oauth2({ version: "v2", auth: client });
    const { data } = await oauth2.userinfo.get();
    email = data.email ?? null;
  } catch {
    /* ignore */
  }

  await saveConnection({
    projectId,
    email,
    accessToken: tokens.access_token ?? null,
    refreshToken: tokens.refresh_token ?? null,
    expiryDate: tokens.expiry_date ?? null,
    scope: tokens.scope ?? null,
  });

  return NextResponse.redirect(new URL(`/?p=${proj.slug}&gcal=connected`, req.url));
}
