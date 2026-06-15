"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getOrCreateWorkspace } from "@/lib/data";
import { createProjectMeeting } from "@/lib/google";
import type { Eisenhower } from "@/lib/types";

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

/** Suma 30 minutos a una hora "HH:MM" (para el fin de reuniones de Google). */
function plus30(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const total = (h * 60 + m + 30) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export type PlanItem = {
  title: string;
  kind: "task" | "meeting";
  eisenhower?: Eisenhower; // solo tareas (cuadrante)
  top3?: boolean; // solo tareas
  meeting_time?: string | null; // reunión escrita en el sistema (HH:MM)
  google?: { time: string; addMeet: boolean } | null; // reunión agendada en Google
};

/** Guarda la planeación del día: crea tareas/reuniones, Top 3, y marca el día como planeado. */
export async function submitPlanning(input: {
  projectId: string;
  dayDate: string;
  items: PlanItem[];
}): Promise<{ ok: boolean; error?: string }> {
  const userId = await requireUser();
  await assertProjectOwnership(userId, input.projectId);
  const supabase = createAdminSupabaseClient();

  // columna por defecto del proyecto
  const { data: firstStatus } = await supabase
    .from("project_statuses")
    .select("id")
    .eq("project_id", input.projectId)
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();
  const statusId = firstStatus?.id ?? null;

  let topCounter = 0;
  const rows: Record<string, unknown>[] = [];
  const base = Date.now();

  for (let i = 0; i < input.items.length; i++) {
    const item = input.items[i];
    const title = item.title.trim();
    if (!title) continue;

    // Reunión agendada en Google → solo evento, sin fila en el sistema
    if (item.kind === "meeting" && item.google) {
      await createProjectMeeting(input.projectId, {
        title,
        dateISO: input.dayDate,
        startTime: item.google.time,
        endTime: plus30(item.google.time),
        addMeet: item.google.addMeet,
      });
      continue;
    }

    const isMeet = item.kind === "meeting";
    const isTop = !!item.top3 && !isMeet && topCounter < 3;
    if (isTop) topCounter++;

    rows.push({
      project_id: input.projectId,
      title,
      status_id: statusId,
      assignee_id: userId,
      position: base + i,
      eisenhower: isMeet ? "reunion" : item.eisenhower ?? "ni",
      start_date: input.dayDate,
      due_date: isMeet ? input.dayDate : null,
      meeting_time: isMeet ? item.meeting_time ?? null : null,
      is_top3: isTop,
      top_rank: isTop ? topCounter : null,
      day_date: isTop ? input.dayDate : null,
    });
  }

  if (rows.length) {
    const { error } = await supabase.from("tasks").insert(rows);
    if (error) return { ok: false, error: error.message };
  }

  await supabase
    .from("project_plannings")
    .upsert(
      { project_id: input.projectId, day_date: input.dayDate, status: "planned" },
      { onConflict: "project_id,day_date" },
    );

  revalidate();
  return { ok: true };
}

/** Marca un día como "sin planear a propósito" para que el modal no reabra. */
export async function skipPlanning(projectId: string, dayDate: string): Promise<{ ok: boolean }> {
  const userId = await requireUser();
  await assertProjectOwnership(userId, projectId);
  const supabase = createAdminSupabaseClient();
  await supabase
    .from("project_plannings")
    .upsert(
      { project_id: projectId, day_date: dayDate, status: "skipped" },
      { onConflict: "project_id,day_date" },
    );
  revalidate();
  return { ok: true };
}
