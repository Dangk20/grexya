"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
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

async function assertNoteOwnership(userId: string, noteId: string) {
  const supabase = createAdminSupabaseClient();
  const { data: note } = await supabase
    .from("notes")
    .select("id, project_id")
    .eq("id", noteId)
    .maybeSingle();
  if (!note) throw new Error("Nota no encontrada");
  await assertProjectOwnership(userId, note.project_id);
}

export async function createNote(input: { projectId: string }) {
  const userId = await requireUser();
  await assertProjectOwnership(userId, input.projectId);
  const supabase = createAdminSupabaseClient();
  const { data } = await supabase
    .from("notes")
    .insert({ project_id: input.projectId, title: "Sin título", body: "" })
    .select("id")
    .single();
  revalidatePath("/proyectos", "layout");
  return data?.id as string | undefined;
}

export async function updateNote(input: {
  noteId: string;
  title?: string;
  body?: string;
}) {
  const userId = await requireUser();
  await assertNoteOwnership(userId, input.noteId);
  const patch: Record<string, string> = {};
  if (input.title !== undefined) patch.title = input.title;
  if (input.body !== undefined) patch.body = input.body;
  if (Object.keys(patch).length === 0) return;
  const supabase = createAdminSupabaseClient();
  await supabase.from("notes").update(patch).eq("id", input.noteId);
  revalidatePath("/proyectos", "layout");
}

export async function deleteNote(input: { noteId: string }) {
  const userId = await requireUser();
  await assertNoteOwnership(userId, input.noteId);
  const supabase = createAdminSupabaseClient();
  await supabase.from("notes").delete().eq("id", input.noteId);
  revalidatePath("/proyectos", "layout");
}
