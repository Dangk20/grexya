"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getOrCreateWorkspace } from "@/lib/data";
import { notionSyncArchive, notionSyncCreate, notionSyncUpdate } from "@/lib/notion-sync";
import { addDays, nextOccurrence } from "@/lib/grexya-helpers";
import type { Eisenhower, Front, Priority, Recurrence, Task } from "@/lib/types";

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

async function assertTaskOwnership(userId: string, taskId: string) {
  const supabase = createAdminSupabaseClient();
  const { data: task } = await supabase
    .from("tasks")
    .select("id, project_id, is_done")
    .eq("id", taskId)
    .maybeSingle();
  if (!task) throw new Error("Tarea no encontrada");
  await assertProjectOwnership(userId, task.project_id);
  return task;
}

function revalidate() {
  revalidatePath("/", "layout");
}

export async function createTask(input: {
  projectId: string;
  title: string;
  statusId?: string | null;
  priority?: Priority | null;
  front?: Front | null;
  start_date?: string | null;
  due_date?: string | null;
  eisenhower?: Eisenhower | null;
  dayDate?: string | null;
  meeting_time?: string | null;
}) {
  const userId = await requireUser();
  await assertProjectOwnership(userId, input.projectId);
  const title = input.title.trim();
  if (!title) return;
  const supabase = createAdminSupabaseClient();

  // columna por defecto = la primera del proyecto si no se especifica
  let statusId = input.statusId ?? null;
  if (statusId === undefined || statusId === null) {
    const { data: first } = await supabase
      .from("project_statuses")
      .select("id")
      .eq("project_id", input.projectId)
      .order("position", { ascending: true })
      .limit(1)
      .maybeSingle();
    statusId = first?.id ?? null;
  }

  const { data: created } = await supabase
    .from("tasks")
    .insert({
      project_id: input.projectId,
      title,
      status_id: statusId,
      front: input.front ?? null,
      start_date: input.start_date ?? null,
      due_date: input.due_date ?? null,
      // prioridad = cuadrante; por defecto "Alta" (no urgente · importante)
      eisenhower: input.eisenhower ?? "ni",
      meeting_time: input.meeting_time ?? null,
      day_date: input.dayDate ?? null,
      assignee_id: userId,
      position: Date.now(),
    })
    .select("*")
    .single();
  if (created) await notionSyncCreate(input.projectId, created as Task);
  revalidate();
  return created?.id as string | undefined;
}

/** Marca/desmarca una tarea como Top 3 del día. Máximo 3 por (proyecto, día). */
export async function setTaskTop3(input: {
  taskId: string;
  dayDate: string;
  on: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  const userId = await requireUser();
  const task = await assertTaskOwnership(userId, input.taskId);
  const supabase = createAdminSupabaseClient();

  if (input.on) {
    const { count } = await supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("project_id", task.project_id)
      .eq("day_date", input.dayDate)
      .eq("is_top3", true)
      .neq("id", input.taskId);
    if ((count ?? 0) >= 3) {
      return {
        ok: false,
        error: "Ya tienes 3 tareas Top del día. Quita una para añadir otra.",
      };
    }
    await supabase
      .from("tasks")
      .update({ is_top3: true, top_rank: (count ?? 0) + 1, day_date: input.dayDate })
      .eq("id", input.taskId);
  } else {
    await supabase
      .from("tasks")
      .update({ is_top3: false, top_rank: null })
      .eq("id", input.taskId);
  }
  revalidate();
  return { ok: true };
}

/** Diferencia en días entre dos fechas YYYY-MM-DD. */
function daysBetween(from: string, to: string): number {
  return Math.round(
    (new Date(to + "T00:00:00Z").getTime() - new Date(from + "T00:00:00Z").getTime()) / 86400000,
  );
}

/**
 * Al completar una tarea recurrente, la clona (con sus subtareas sin marcar)
 * para la siguiente fecha de la serie. `recurrence_from_id` evita duplicarla si
 * se marca y desmarca varias veces.
 */
async function spawnNextOccurrence(userId: string, task: Task, today: string) {
  if (!task.recurrence || task.parent_task_id) return;
  const supabase = createAdminSupabaseClient();

  const { data: already } = await supabase
    .from("tasks")
    .select("id")
    .eq("recurrence_from_id", task.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (already) return;

  // Ancla de la serie: el día para el que estaba programada esta ocurrencia.
  const base = task.start_date ?? task.due_date ?? today;
  const next = nextOccurrence(task.recurrence, base, today);
  const shift = daysBetween(base, next);

  // La copia arranca en la primera columna del tablero, no donde quedó la anterior.
  const { data: firstStatus } = await supabase
    .from("project_statuses")
    .select("id")
    .eq("project_id", task.project_id)
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();

  const { data: clone } = await supabase
    .from("tasks")
    .insert({
      project_id: task.project_id,
      title: task.title,
      description: task.description,
      status_id: firstStatus?.id ?? null,
      assignee_id: task.assignee_id ?? userId,
      priority: task.priority,
      front: task.front,
      eisenhower: task.eisenhower,
      meeting_time: task.meeting_time,
      start_date: next,
      due_date: task.due_date ? addDays(task.due_date, shift) : null,
      recurrence: task.recurrence,
      recurrence_from_id: task.id,
      position: Date.now(),
    })
    .select("*")
    .single();
  if (!clone) return;

  const { data: subs } = await supabase
    .from("tasks")
    .select("title, description, position")
    .eq("parent_task_id", task.id)
    .is("deleted_at", null)
    .order("position", { ascending: true });
  if (subs?.length) {
    await supabase.from("tasks").insert(
      subs.map((s) => ({
        project_id: task.project_id,
        parent_task_id: clone.id,
        title: s.title as string,
        description: s.description as string | null,
        status: "sin",
        assignee_id: userId,
        position: s.position as number,
      })),
    );
  }

  await notionSyncCreate(task.project_id, clone as Task);
}

/** Al desmarcar el completado, deshace la ocurrencia que se creó (si nadie la tocó). */
async function unspawnNextOccurrence(taskId: string) {
  const supabase = createAdminSupabaseClient();
  const { data: clone } = await supabase
    .from("tasks")
    .select("id, project_id, is_done, notion_page_id")
    .eq("recurrence_from_id", taskId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!clone || clone.is_done) return;

  // Si ya hay progreso en sus subtareas, la copia se queda.
  const { count } = await supabase
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("parent_task_id", clone.id)
    .eq("is_done", true);
  if (count) return;

  if (clone.notion_page_id) {
    await notionSyncArchive(clone.project_id as string, clone.notion_page_id as string, true);
  }
  await supabase.from("tasks").delete().eq("id", clone.id); // subtareas caen por cascade
}

/**
 * Alterna el completado (independiente de la columna).
 * `completedAt` permite fechar la completitud en un día distinto a hoy
 * (p. ej. al cerrar una tarea atrasada desde el modal de Planning, se
 * registra en el día del retro que se reporta). Solo aplica al marcar hecha.
 * `today` es la fecha local del navegador: sin ella, el servidor (UTC) puede
 * adelantar un día la próxima ocurrencia de una tarea recurrente.
 */
export async function toggleTask(input: { taskId: string; completedAt?: string; today?: string }) {
  const userId = await requireUser();
  await assertTaskOwnership(userId, input.taskId);
  const supabase = createAdminSupabaseClient();
  const { data: task } = await supabase.from("tasks").select("*").eq("id", input.taskId).single();
  if (!task) throw new Error("Tarea no encontrada");

  const next = !task.is_done;
  const completedAt = next ? input.completedAt ?? new Date().toISOString() : null;
  const { data: updated } = await supabase
    .from("tasks")
    .update({ is_done: next, completed_at: completedAt })
    .eq("id", input.taskId)
    .select("*")
    .single();
  if (updated) await notionSyncUpdate(updated as Task);

  if (task.recurrence && !task.parent_task_id) {
    const today = input.today ?? new Date().toISOString().slice(0, 10);
    if (next) await spawnNextOccurrence(userId, task as Task, today);
    else await unspawnNextOccurrence(input.taskId);
  }

  revalidate();
}

/**
 * Define (o quita) la cadencia de una tarea recurrente.
 * Si la tarea ya estaba completada, engendra la próxima ocurrencia de una vez;
 * al quitar la cadencia, deshace la ocurrencia pendiente que nadie ha tocado.
 */
export async function setTaskRecurrence(input: {
  taskId: string;
  recurrence: Recurrence | null;
  today: string;
}) {
  const userId = await requireUser();
  await assertTaskOwnership(userId, input.taskId);
  const supabase = createAdminSupabaseClient();
  const { data: task } = await supabase.from("tasks").select("*").eq("id", input.taskId).single();
  if (!task || task.parent_task_id) return;

  await supabase.from("tasks").update({ recurrence: input.recurrence }).eq("id", input.taskId);

  if (input.recurrence && task.is_done) {
    await spawnNextOccurrence(userId, { ...task, recurrence: input.recurrence } as Task, input.today);
  } else if (!input.recurrence) {
    await unspawnNextOccurrence(input.taskId);
  }
  revalidate();
}

/** Mueve la tarjeta a otra columna del tablero (status_id). */
export async function moveTask(input: { taskId: string; statusId: string | null }) {
  const userId = await requireUser();
  await assertTaskOwnership(userId, input.taskId);
  const supabase = createAdminSupabaseClient();
  const { data: updated } = await supabase
    .from("tasks")
    .update({ status_id: input.statusId })
    .eq("id", input.taskId)
    .select("*")
    .single();
  if (updated) await notionSyncUpdate(updated as Task);
  revalidate();
}

export async function updateTask(input: {
  taskId: string;
  patch: {
    title?: string;
    description?: string | null;
    status_id?: string | null;
    priority?: Priority | null;
    front?: Front | null;
    start_date?: string | null;
    due_date?: string | null;
    eisenhower?: Eisenhower | null;
    day_date?: string | null;
    is_top3?: boolean;
    top_rank?: number | null;
    meeting_time?: string | null;
    assignee_id?: string | null;
  };
}) {
  const userId = await requireUser();
  await assertTaskOwnership(userId, input.taskId);
  const patch: Record<string, unknown> = Object.fromEntries(
    Object.entries(input.patch).filter(([, v]) => v !== undefined),
  );
  if (Object.keys(patch).length === 0) return;
  const supabase = createAdminSupabaseClient();
  await supabase.from("tasks").update(patch).eq("id", input.taskId);
  // Si el cambio toca un campo espejado en Notion, actualiza la página
  const SYNCED = ["title", "status_id", "due_date", "eisenhower"];
  if (SYNCED.some((k) => k in patch)) {
    const { data: updated } = await supabase.from("tasks").select("*").eq("id", input.taskId).single();
    if (updated) await notionSyncUpdate(updated as Task);
  }
  revalidate();
}

/** Reordena tareas top-level (posición) y opcionalmente mueve de cuadrante (eisenhower). */
export async function reorderTasks(input: {
  projectId: string;
  items: { id: string; position: number; eisenhower?: Eisenhower }[];
}) {
  const userId = await requireUser();
  const ws = await getOrCreateWorkspace(userId);
  const supabase = createAdminSupabaseClient();
  const { data: proj } = await supabase
    .from("projects")
    .select("id")
    .eq("id", input.projectId)
    .eq("workspace_id", ws.id)
    .maybeSingle();
  if (!proj) throw new Error("Proyecto no encontrado");
  await Promise.all(
    input.items.map((it) => {
      const patch: Record<string, unknown> = { position: it.position };
      if (it.eisenhower) patch.eisenhower = it.eisenhower;
      return supabase.from("tasks").update(patch).eq("id", it.id).eq("project_id", input.projectId);
    }),
  );
  revalidate();
}

export async function createSubtask(input: {
  parentTaskId: string;
  title: string;
}) {
  const userId = await requireUser();
  const parent = await assertTaskOwnership(userId, input.parentTaskId);
  const title = input.title.trim();
  if (!title) return;
  const supabase = createAdminSupabaseClient();
  await supabase.from("tasks").insert({
    project_id: parent.project_id,
    parent_task_id: input.parentTaskId,
    title,
    status: "sin",
    assignee_id: userId,
    position: Date.now(),
  });
  revalidate();
}

/** Reordena las subtareas de una tarea (posición = índice). */
export async function reorderSubtasks(input: {
  parentTaskId: string;
  orderedIds: string[];
}) {
  const userId = await requireUser();
  await assertTaskOwnership(userId, input.parentTaskId);
  const supabase = createAdminSupabaseClient();
  await Promise.all(
    input.orderedIds.map((id, i) =>
      supabase
        .from("tasks")
        .update({ position: i })
        .eq("id", id)
        .eq("parent_task_id", input.parentTaskId),
    ),
  );
  revalidate();
}

/** Soft-delete: manda la tarea (y sus subtareas) a la papelera y archiva su página de Notion. */
export async function deleteTask(input: { taskId: string }) {
  const userId = await requireUser();
  const task = await assertTaskOwnership(userId, input.taskId);
  const supabase = createAdminSupabaseClient();
  const { data: row } = await supabase
    .from("tasks")
    .select("notion_page_id")
    .eq("id", input.taskId)
    .maybeSingle();
  await supabase
    .from("tasks")
    .update({ deleted_at: new Date().toISOString() })
    .eq("project_id", task.project_id)
    .or(`id.eq.${input.taskId},parent_task_id.eq.${input.taskId}`);
  if (row?.notion_page_id) await notionSyncArchive(task.project_id, row.notion_page_id, true);
  revalidate();
}

/** Restaura una tarea (y sus subtareas) desde la papelera y la desarchiva en Notion. */
export async function restoreTask(input: { taskId: string }) {
  const userId = await requireUser();
  const task = await assertTaskOwnership(userId, input.taskId);
  const supabase = createAdminSupabaseClient();
  await supabase
    .from("tasks")
    .update({ deleted_at: null })
    .eq("project_id", task.project_id)
    .or(`id.eq.${input.taskId},parent_task_id.eq.${input.taskId}`);
  const { data: row } = await supabase
    .from("tasks")
    .select("notion_page_id")
    .eq("id", input.taskId)
    .maybeSingle();
  if (row?.notion_page_id) await notionSyncArchive(task.project_id, row.notion_page_id, false);
  revalidate();
}

/** Tareas en la papelera de un proyecto (para restaurar o purgar). */
export async function listTrash(projectId: string): Promise<Task[]> {
  const userId = await requireUser();
  const ws = await getOrCreateWorkspace(userId);
  const supabase = createAdminSupabaseClient();
  const { data: proj } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("workspace_id", ws.id)
    .maybeSingle();
  if (!proj) throw new Error("Proyecto no encontrado");
  const { data } = await supabase
    .from("tasks")
    .select("*")
    .eq("project_id", projectId)
    .is("parent_task_id", null)
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });
  return (data ?? []) as Task[];
}

/** Borra definitivamente una tarea (y sus subtareas, por cascade). No reversible. */
export async function hardDeleteTask(input: { taskId: string }) {
  const userId = await requireUser();
  await assertTaskOwnership(userId, input.taskId);
  const supabase = createAdminSupabaseClient();
  await supabase.from("tasks").delete().eq("id", input.taskId);
  revalidate();
}

/** Soft-delete de varias tareas a la vez (scoped al workspace del usuario). */
export async function deleteTasks(input: { taskIds: string[] }) {
  const userId = await requireUser();
  if (input.taskIds.length === 0) return;
  const ws = await getOrCreateWorkspace(userId);
  const supabase = createAdminSupabaseClient();
  const { data: projs } = await supabase
    .from("projects")
    .select("id")
    .eq("workspace_id", ws.id);
  const pids = (projs ?? []).map((p) => p.id);
  const idList = input.taskIds.join(",");
  const { data: rows } = await supabase
    .from("tasks")
    .select("project_id, notion_page_id")
    .in("id", input.taskIds)
    .in("project_id", pids);
  await supabase
    .from("tasks")
    .update({ deleted_at: new Date().toISOString() })
    .in("project_id", pids)
    .or(`id.in.(${idList}),parent_task_id.in.(${idList})`);
  for (const r of rows ?? []) {
    if (r.notion_page_id) await notionSyncArchive(r.project_id as string, r.notion_page_id as string, true);
  }
  revalidate();
}
