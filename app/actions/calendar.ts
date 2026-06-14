"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getOrCreateWorkspace } from "@/lib/data";
import {
  listProjectMeetings,
  createProjectMeeting,
  disconnect,
  type Meeting,
} from "@/lib/google";

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

/** Reuniones de Google de un proyecto para un día (YYYY-MM-DD local). */
export async function getMeetings(projectId: string, dayISO: string): Promise<Meeting[]> {
  const userId = await requireUser();
  await assertProjectOwnership(userId, projectId);
  return listProjectMeetings(projectId, dayISO);
}

/** Reuniones de hoy de TODOS los proyectos conectados (Centro de mando). */
export async function getTodayMeetingsAll(
  dayISO: string,
): Promise<(Meeting & { projectId: string })[]> {
  const userId = await requireUser();
  const ws = await getOrCreateWorkspace(userId);
  const supabase = createAdminSupabaseClient();
  const { data: conns } = await supabase
    .from("project_calendars")
    .select("project_id, projects!inner(workspace_id)")
    .eq("projects.workspace_id", ws.id);
  const ids = (conns ?? []).map((c) => c.project_id as string);
  const lists = await Promise.all(
    ids.map(async (pid) => (await listProjectMeetings(pid, dayISO)).map((m) => ({ ...m, projectId: pid }))),
  );
  return lists.flat();
}

export async function createMeeting(
  projectId: string,
  input: {
    title: string;
    dateISO: string;
    startTime: string;
    endTime: string;
    attendees?: string[];
    addMeet?: boolean;
    description?: string;
  },
): Promise<{ ok: boolean; error?: string }> {
  const userId = await requireUser();
  await assertProjectOwnership(userId, projectId);
  return createProjectMeeting(projectId, input);
}

export async function disconnectCalendar(projectId: string) {
  const userId = await requireUser();
  await assertProjectOwnership(userId, projectId);
  await disconnect(projectId);
  revalidatePath("/", "layout");
}
