import "server-only";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createNotionPage, updateNotionPage, type NotionConn } from "@/lib/notion";
import type { Task } from "@/lib/types";

/** Conexión de Notion de un proyecto (o null si no está conectado). */
async function connFor(projectId: string): Promise<NotionConn | null> {
  const sb = createAdminSupabaseClient();
  const { data } = await sb
    .from("project_notions")
    .select("access_token, database_id, notion_user_id, mapping")
    .eq("project_id", projectId)
    .maybeSingle();
  if (!data) return null;
  return data as NotionConn;
}

/** Tras crear una tarea (top-level): crea su página en Notion y guarda el page_id. */
export async function notionSyncCreate(projectId: string, task: Task): Promise<void> {
  if (task.parent_task_id) return; // las subtareas no se espejan
  try {
    const conn = await connFor(projectId);
    if (!conn) return;
    const pageId = await createNotionPage(conn, task);
    const sb = createAdminSupabaseClient();
    await sb.from("tasks").update({ notion_page_id: pageId }).eq("id", task.id);
  } catch (e) {
    console.error("[notion] create falló:", e instanceof Error ? e.message : e);
  }
}

/** Tras actualizar una tarea: actualiza su página espejo (o la crea si aún no existe). */
export async function notionSyncUpdate(task: Task): Promise<void> {
  if (task.parent_task_id) return;
  try {
    const conn = await connFor(task.project_id);
    if (!conn) return;
    if (task.notion_page_id) {
      await updateNotionPage(conn, task.notion_page_id, task);
    } else {
      const pageId = await createNotionPage(conn, task);
      const sb = createAdminSupabaseClient();
      await sb.from("tasks").update({ notion_page_id: pageId }).eq("id", task.id);
    }
  } catch (e) {
    console.error("[notion] update falló:", e instanceof Error ? e.message : e);
  }
}
