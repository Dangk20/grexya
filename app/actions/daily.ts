"use server";

import { auth } from "@clerk/nextjs/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getOrCreateWorkspace } from "@/lib/data";

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

/** Ítems ocultados del daily de un proyecto (ids de tarea o de evento de Google). */
export async function getDailyHidden(projectId: string): Promise<string[]> {
  const userId = await requireUser();
  await assertProjectOwnership(userId, projectId);
  const supabase = createAdminSupabaseClient();
  const { data } = await supabase.from("daily_hidden").select("item_id").eq("project_id", projectId);
  return (data ?? []).map((r) => r.item_id as string);
}

export async function hideDailyItem(projectId: string, itemId: string): Promise<void> {
  const userId = await requireUser();
  await assertProjectOwnership(userId, projectId);
  const supabase = createAdminSupabaseClient();
  await supabase
    .from("daily_hidden")
    .upsert({ project_id: projectId, item_id: itemId }, { onConflict: "project_id,item_id" });
}

export async function unhideDailyItem(projectId: string, itemId: string): Promise<void> {
  const userId = await requireUser();
  await assertProjectOwnership(userId, projectId);
  const supabase = createAdminSupabaseClient();
  await supabase.from("daily_hidden").delete().eq("project_id", projectId).eq("item_id", itemId);
}
