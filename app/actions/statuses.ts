"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getOrCreateWorkspace } from "@/lib/data";

const COLORS = ["gray", "blue", "green", "amber", "violet", "rose", "teal", "red"];

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

async function statusProject(userId: string, statusId: string) {
  const supabase = createAdminSupabaseClient();
  const { data } = await supabase
    .from("project_statuses")
    .select("id, project_id")
    .eq("id", statusId)
    .maybeSingle();
  if (!data) throw new Error("Columna no encontrada");
  await assertProjectOwnership(userId, data.project_id);
  return data;
}

function revalidate() {
  revalidatePath("/", "layout");
}

export async function createStatus(input: { projectId: string; name?: string }) {
  const userId = await requireUser();
  await assertProjectOwnership(userId, input.projectId);
  const supabase = createAdminSupabaseClient();
  const { count } = await supabase
    .from("project_statuses")
    .select("id", { count: "exact", head: true })
    .eq("project_id", input.projectId);
  const n = count ?? 0;
  await supabase.from("project_statuses").insert({
    project_id: input.projectId,
    name: input.name?.trim() || "Nueva columna",
    color: COLORS[n % COLORS.length],
    position: n,
  });
  revalidate();
}

export async function updateStatus(input: {
  statusId: string;
  name?: string;
  color?: string;
}) {
  const userId = await requireUser();
  await statusProject(userId, input.statusId);
  const patch: Record<string, string> = {};
  if (input.name !== undefined) patch.name = input.name.trim() || "Columna";
  if (input.color !== undefined) patch.color = input.color;
  if (Object.keys(patch).length === 0) return;
  const supabase = createAdminSupabaseClient();
  await supabase.from("project_statuses").update(patch).eq("id", input.statusId);
  revalidate();
}

export async function deleteStatus(input: { statusId: string }) {
  const userId = await requireUser();
  const st = await statusProject(userId, input.statusId);
  const supabase = createAdminSupabaseClient();
  // reasignar tareas de esa columna a otra del proyecto (la primera distinta)
  const { data: others } = await supabase
    .from("project_statuses")
    .select("id")
    .eq("project_id", st.project_id)
    .neq("id", input.statusId)
    .order("position", { ascending: true })
    .limit(1);
  const fallback = others?.[0]?.id ?? null;
  await supabase
    .from("tasks")
    .update({ status_id: fallback })
    .eq("status_id", input.statusId);
  await supabase.from("project_statuses").delete().eq("id", input.statusId);
  revalidate();
}

export async function reorderStatuses(input: {
  projectId: string;
  orderedIds: string[];
}) {
  const userId = await requireUser();
  await assertProjectOwnership(userId, input.projectId);
  const supabase = createAdminSupabaseClient();
  await Promise.all(
    input.orderedIds.map((id, i) =>
      supabase.from("project_statuses").update({ position: i }).eq("id", id),
    ),
  );
  revalidate();
}
