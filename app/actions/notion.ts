"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getOrCreateWorkspace } from "@/lib/data";
import { parseDatabaseId, retrieveDatabase, listUsers, defaultMapping } from "@/lib/notion";
import type { NotionConfig, NotionMapping, NotionProp, NotionUser } from "@/lib/notion-types";

export type { NotionConfig } from "@/lib/notion-types";

async function requireUser() {
  const { userId } = await auth();
  if (!userId) throw new Error("No autenticado");
  return userId;
}

async function assertProjectOwnership(userId: string, projectId: string) {
  const ws = await getOrCreateWorkspace(userId);
  const supabase = createAdminSupabaseClient();
  const { data } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("workspace_id", ws.id)
    .maybeSingle();
  if (!data) throw new Error("Proyecto no encontrado");
}

function revalidate() {
  revalidatePath("/", "layout");
}

/** Conecta un proyecto a una DB de Notion con un token interno. Valida y arma el mapeo por defecto. */
export async function connectNotion(
  projectId: string,
  token: string,
  databaseInput: string,
): Promise<{ ok: boolean; error?: string }> {
  const userId = await requireUser();
  await assertProjectOwnership(userId, projectId);

  const databaseId = parseDatabaseId(databaseInput);
  if (!databaseId) return { ok: false, error: "No pude leer el ID de la base de datos. Pega la URL o el ID de la DB." };

  try {
    const schema = await retrieveDatabase(token.trim(), databaseId);
    const mapping = defaultMapping(schema);
    const supabase = createAdminSupabaseClient();
    await supabase.from("project_notions").upsert(
      {
        project_id: projectId,
        access_token: token.trim(),
        database_id: databaseId,
        database_title: schema.title,
        mapping,
      },
      { onConflict: "project_id" },
    );
    revalidate();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo conectar con Notion" };
  }
}

/** Devuelve el esquema de la DB + usuarios + mapeo actual, para el editor de ajustes. */
export async function getNotionConfig(projectId: string): Promise<NotionConfig> {
  const userId = await requireUser();
  await assertProjectOwnership(userId, projectId);
  const supabase = createAdminSupabaseClient();
  const { data } = await supabase
    .from("project_notions")
    .select("access_token, database_id, database_title, notion_user_id, mapping")
    .eq("project_id", projectId)
    .maybeSingle();
  if (!data) {
    return { connected: false, databaseTitle: null, notionUserId: null, mapping: {}, properties: [], users: [] };
  }
  let properties: NotionProp[] = [];
  let users: NotionUser[] = [];
  try {
    const [schema, us] = await Promise.all([
      retrieveDatabase(data.access_token, data.database_id),
      listUsers(data.access_token).catch(() => [] as NotionUser[]),
    ]);
    properties = schema.properties;
    users = us;
  } catch {
    /* la DB pudo dejar de compartirse; devolvemos lo guardado */
  }
  return {
    connected: true,
    databaseTitle: data.database_title ?? null,
    notionUserId: data.notion_user_id ?? null,
    mapping: (data.mapping ?? {}) as NotionMapping,
    properties,
    users,
  };
}

/** Guarda el mapeo y el usuario de Notion (Responsable = tú). */
export async function saveNotionMapping(
  projectId: string,
  mapping: NotionMapping,
  notionUserId: string | null,
): Promise<{ ok: boolean }> {
  const userId = await requireUser();
  await assertProjectOwnership(userId, projectId);
  const supabase = createAdminSupabaseClient();
  await supabase
    .from("project_notions")
    .update({ mapping, notion_user_id: notionUserId })
    .eq("project_id", projectId);
  revalidate();
  return { ok: true };
}

export async function disconnectNotion(projectId: string): Promise<void> {
  const userId = await requireUser();
  await assertProjectOwnership(userId, projectId);
  const supabase = createAdminSupabaseClient();
  await supabase.from("project_notions").delete().eq("project_id", projectId);
  revalidate();
}
