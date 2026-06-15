import "server-only";
import type { Task } from "@/lib/types";
import type {
  NotionConn,
  NotionMapping,
  NotionProp,
  NotionSchema,
  NotionUser,
} from "@/lib/notion-types";

export type { NotionConn, NotionMapping, NotionProp, NotionSchema, NotionUser } from "@/lib/notion-types";

const NOTION_VERSION = "2022-06-28";
const API = "https://api.notion.com/v1";

/** Extrae el ID de la DB desde una URL de Notion o un ID suelto (con o sin guiones). */
export function parseDatabaseId(input: string): string | null {
  const clean = input.trim();
  // Toma la última secuencia de 32 hex (ignora guiones), típica de los IDs de Notion
  const m = clean.replace(/-/g, "").match(/[0-9a-fA-F]{32}/g);
  if (!m || !m.length) return null;
  const id = m[m.length - 1].toLowerCase();
  // formatea con guiones (8-4-4-4-12)
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
}

async function notionFetch(token: string, path: string, init?: RequestInit) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.message || `Notion API ${res.status}`);
  }
  return data;
}

function optionsOf(prop: Record<string, unknown>): string[] {
  const type = prop.type as string;
  const cfg = prop[type] as { options?: { name: string }[] } | undefined;
  if (cfg?.options) return cfg.options.map((o) => o.name);
  return [];
}

/** Lee el esquema de la DB (título + propiedades con sus opciones). */
export async function retrieveDatabase(token: string, databaseId: string): Promise<NotionSchema> {
  const db = await notionFetch(token, `/databases/${databaseId}`);
  const props = (db.properties ?? {}) as Record<string, Record<string, unknown>>;
  const properties: NotionProp[] = Object.entries(props).map(([name, p]) => ({
    name,
    type: p.type as string,
    options: optionsOf(p),
  }));
  const title = (db.title ?? []).map((t: { plain_text?: string }) => t.plain_text ?? "").join("") || "Notion";
  return { databaseId, title, properties };
}

/** Lista los usuarios "persona" del workspace (para elegir el Responsable = tú). */
export async function listUsers(token: string): Promise<NotionUser[]> {
  const data = await notionFetch(token, `/users?page_size=100`);
  return ((data.results ?? []) as { id: string; name?: string; type?: string }[])
    .filter((u) => u.type === "person")
    .map((u) => ({ id: u.id, name: u.name ?? "(sin nombre)" }));
}

/** Construye el payload de propiedades de Notion para una tarea, según el mapeo. */
function buildProperties(conn: NotionConn, task: Task): Record<string, unknown> {
  const m = conn.mapping;
  const props: Record<string, unknown> = {};

  if (m.title?.name) {
    props[m.title.name] = { title: [{ text: { content: task.title || "" } }] };
  }
  if (m.due?.name) {
    props[m.due.name] = task.due_date ? { date: { start: task.due_date } } : { date: null };
  }
  if (m.status?.name) {
    const key = task.is_done ? "__done__" : task.status_id ?? "";
    const opt = m.status.map?.[key];
    if (opt) {
      props[m.status.name] = m.status.type === "status" ? { status: { name: opt } } : { select: { name: opt } };
    }
  }
  if (m.priority?.name && task.eisenhower && task.eisenhower !== "reunion") {
    const opt = m.priority.map?.[task.eisenhower];
    if (opt) {
      props[m.priority.name] = m.priority.type === "status" ? { status: { name: opt } } : { select: { name: opt } };
    }
  }
  if (m.assignee?.name && conn.notion_user_id) {
    props[m.assignee.name] = { people: [{ id: conn.notion_user_id }] };
  }
  return props;
}

/** Crea la página en Notion y devuelve su id. */
export async function createNotionPage(conn: NotionConn, task: Task): Promise<string> {
  const data = await notionFetch(conn.access_token, `/pages`, {
    method: "POST",
    body: JSON.stringify({
      parent: { database_id: conn.database_id },
      properties: buildProperties(conn, task),
    }),
  });
  return data.id as string;
}

/** Actualiza la página espejo en Notion. */
export async function updateNotionPage(conn: NotionConn, pageId: string, task: Task): Promise<void> {
  await notionFetch(conn.access_token, `/pages/${pageId}`, {
    method: "PATCH",
    body: JSON.stringify({ properties: buildProperties(conn, task) }),
  });
}

const includesAny = (s: string, words: string[]) => words.some((w) => s.includes(w));

/** Construye un mapeo por defecto detectando propiedades por tipo/nombre. */
export function defaultMapping(schema: NotionSchema): NotionMapping {
  const byType = (t: string) => schema.properties.filter((p) => p.type === t);
  const m: NotionMapping = {};

  const titleP = byType("title")[0];
  if (titleP) m.title = { name: titleP.name };

  const dateP = byType("date")[0];
  if (dateP) m.due = { name: dateP.name };

  // estado: prop tipo "status" o un select cuyo nombre sugiera estado
  const statusP =
    byType("status")[0] ??
    byType("select").find((p) => includesAny(p.name.toLowerCase(), ["estado", "status"]));
  if (statusP) {
    const done = statusP.options.find((o) => includesAny(o.toLowerCase(), ["hech", "listo", "done", "complet", "termin"]));
    m.status = {
      name: statusP.name,
      type: statusP.type === "status" ? "status" : "select",
      map: done ? { __done__: done } : {},
    };
  }

  // prioridad: select cuyo nombre sugiera prioridad
  const prioP =
    byType("select").find((p) => includesAny(p.name.toLowerCase(), ["priorid", "priority"])) ??
    byType("status").find((p) => includesAny(p.name.toLowerCase(), ["priorid", "priority"]));
  if (prioP) {
    const find = (...w: string[]) => prioP.options.find((o) => includesAny(o.toLowerCase(), w));
    const alta = find("alta", "high");
    const media = find("media", "medium", "normal");
    const baja = find("baja", "low");
    const map: Record<string, string> = {};
    if (alta) map.ui = alta;
    if (media ?? alta) map.ni = (media ?? alta)!;
    if (media ?? baja) map.un = (media ?? baja)!;
    if (baja) map.nn = baja;
    m.priority = { name: prioP.name, type: prioP.type === "status" ? "status" : "select", map };
  }

  const peopleP = byType("people")[0];
  if (peopleP) m.assignee = { name: peopleP.name };

  return m;
}
