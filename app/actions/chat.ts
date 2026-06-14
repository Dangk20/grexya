"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getOrCreateWorkspace } from "@/lib/data";
import type { AgentMessage } from "@/lib/types";

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

/** Mensajes de la conversación más reciente con un agente, en un proyecto. */
export async function getAgentMessages(
  projectId: string,
  agentKey: string,
): Promise<AgentMessage[]> {
  const userId = await requireUser();
  await assertProjectOwnership(userId, projectId);
  const supabase = createAdminSupabaseClient();
  const { data: thread } = await supabase
    .from("agent_threads")
    .select("id")
    .eq("project_id", projectId)
    .eq("agent_key", agentKey)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!thread) return [];
  const { data } = await supabase
    .from("agent_messages")
    .select("*")
    .eq("thread_id", thread.id)
    .order("created_at", { ascending: true });
  return (data ?? []) as AgentMessage[];
}

/** Borra la conversación con un agente (todos sus threads). */
export async function clearAgentChat(input: {
  projectId: string;
  agentKey: string;
}) {
  const userId = await requireUser();
  await assertProjectOwnership(userId, input.projectId);
  const supabase = createAdminSupabaseClient();
  await supabase
    .from("agent_threads")
    .delete()
    .eq("project_id", input.projectId)
    .eq("agent_key", input.agentKey);
  revalidatePath("/proyectos", "layout");
}
