import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

// Carga el .env.local de la app (sin meter secretos en .mcp.json).
function loadDotEnv() {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const txt = readFileSync(join(here, "..", "..", ".env.local"), "utf8");
    for (const line of txt.split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {
    /* si no existe, se usan las variables del entorno */
  }
}
loadDotEnv();

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OWNER_ID = process.env.GREXYA_OWNER_ID; // Clerk user id (opcional)

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY en el entorno.");
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Resuelve el workspace: por GREXYA_OWNER_ID si está, si no el primero. */
async function getWorkspaceId(): Promise<string> {
  let q = sb.from("workspaces").select("id").order("created_at", { ascending: true }).limit(1);
  if (OWNER_ID) q = sb.from("workspaces").select("id").eq("owner_id", OWNER_ID).limit(1);
  const { data, error } = await q.maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("No hay workspace. Entra a la app y crea tu cuenta primero.");
  return data.id;
}

function text(obj: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(obj, null, 2) }] };
}

const server = new McpServer({ name: "grexya-mcp", version: "1.0.0" });

server.tool(
  "list_projects",
  "Lista todos los proyectos del workspace de Grexya.app (fuente canónica de proyectos y tareas de Daniel).",
  {},
  async () => {
    const ws = await getWorkspaceId();
    const { data } = await sb
      .from("projects")
      .select("id,name,slug,type,status,stage,time_target_pct")
      .eq("workspace_id", ws)
      .order("position");
    return text(data ?? []);
  },
);

server.tool(
  "create_project",
  "Crea un proyecto nuevo (con estados Kanban por defecto).",
  {
    name: z.string(),
    emoji: z.string().optional(),
    type: z.enum(["venture", "diario"]).optional(),
  },
  async ({ name, emoji, type }) => {
    const ws = await getWorkspaceId();
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const { data: project, error } = await sb
      .from("projects")
      .insert({ workspace_id: ws, name, slug, emoji: emoji ?? "📦", type: type ?? "venture" })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    await sb.from("project_statuses").insert(
      [
        { name: "Sin empezar", color: "gray" },
        { name: "En progreso", color: "blue" },
        { name: "Listo", color: "green" },
      ].map((s, i) => ({ project_id: project.id, name: s.name, color: s.color, position: i })),
    );
    return text(project);
  },
);

server.tool(
  "list_tasks",
  "FUENTE CANÓNICA de las tareas de Daniel (Grexya.app). Úsala SIEMPRE que pregunte por tareas o pendientes de un proyecto — nunca respondas tareas leyendo archivos. Filtra por slug de proyecto (opcional) y/o solo pendientes.",
  {
    project_slug: z.string().optional(),
    only_pending: z.boolean().optional(),
  },
  async ({ project_slug, only_pending }) => {
    const ws = await getWorkspaceId();
    let projectIds: string[] | null = null;
    if (project_slug) {
      const { data: p } = await sb
        .from("projects")
        .select("id")
        .eq("workspace_id", ws)
        .eq("slug", project_slug)
        .maybeSingle();
      if (!p) throw new Error("Proyecto no encontrado: " + project_slug);
      projectIds = [p.id];
    } else {
      const { data: ps } = await sb.from("projects").select("id").eq("workspace_id", ws);
      projectIds = (ps ?? []).map((x) => x.id);
    }
    let q = sb
      .from("tasks")
      .select("id,title,is_done,priority,front,due_date,project_id,status_id")
      .in("project_id", projectIds)
      .is("parent_task_id", null);
    if (only_pending) q = q.eq("is_done", false);
    const { data } = await q.order("created_at", { ascending: false });
    return text(data ?? []);
  },
);

server.tool(
  "create_task",
  "Crea una tarea formal en Grexya.app (por slug de proyecto). Toda tarea nueva que Daniel dicte se crea aquí, nunca en un archivo.",
  {
    project_slug: z.string(),
    title: z.string(),
    priority: z.enum(["alta", "media", "baja"]).optional(),
    front: z.enum(["business", "tech", "branding", "marketing"]).optional(),
    due_date: z.string().optional(),
  },
  async ({ project_slug, title, priority, front, due_date }) => {
    const ws = await getWorkspaceId();
    const { data: p } = await sb
      .from("projects")
      .select("id")
      .eq("workspace_id", ws)
      .eq("slug", project_slug)
      .maybeSingle();
    if (!p) throw new Error("Proyecto no encontrado: " + project_slug);
    const { data: status } = await sb
      .from("project_statuses")
      .select("id")
      .eq("project_id", p.id)
      .order("position")
      .limit(1)
      .maybeSingle();
    const { data, error } = await sb
      .from("tasks")
      .insert({
        project_id: p.id,
        title,
        priority,
        front,
        due_date,
        status_id: status?.id ?? null,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return text(data);
  },
);

server.tool(
  "update_task",
  "Actualiza una tarea por id (título, prioridad, hecho, plazo, etc.).",
  {
    task_id: z.string(),
    title: z.string().optional(),
    priority: z.enum(["alta", "media", "baja"]).optional(),
    is_done: z.boolean().optional(),
    due_date: z.string().optional(),
  },
  async ({ task_id, ...patch }) => {
    const clean: Record<string, unknown> = Object.fromEntries(
      Object.entries(patch).filter(([, v]) => v !== undefined),
    );
    if (Object.keys(clean).length === 0) throw new Error("Nada que actualizar");
    if ("is_done" in clean) {
      clean.completed_at = clean.is_done ? new Date().toISOString() : null;
    }
    const { data, error } = await sb.from("tasks").update(clean).eq("id", task_id).select("*").single();
    if (error) throw new Error(error.message);
    return text(data);
  },
);

server.tool(
  "add_note",
  "Crea una nota en un proyecto (por slug).",
  { project_slug: z.string(), title: z.string(), body: z.string().optional() },
  async ({ project_slug, title, body }) => {
    const ws = await getWorkspaceId();
    const { data: p } = await sb
      .from("projects")
      .select("id")
      .eq("workspace_id", ws)
      .eq("slug", project_slug)
      .maybeSingle();
    if (!p) throw new Error("Proyecto no encontrado: " + project_slug);
    const { data, error } = await sb
      .from("notes")
      .insert({ project_id: p.id, title, body: body ?? "" })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return text(data);
  },
);

server.tool(
  "search",
  "Busca tareas y notas por texto en todo el workspace.",
  { query: z.string() },
  async ({ query }) => {
    const ws = await getWorkspaceId();
    const { data: ps } = await sb.from("projects").select("id").eq("workspace_id", ws);
    const ids = (ps ?? []).map((x) => x.id);
    const { data: tasks } = await sb
      .from("tasks")
      .select("id,title,project_id")
      .in("project_id", ids)
      .ilike("title", `%${query}%`)
      .limit(20);
    const { data: notes } = await sb
      .from("notes")
      .select("id,title,project_id")
      .in("project_id", ids)
      .ilike("title", `%${query}%`)
      .limit(20);
    return text({ tasks: tasks ?? [], notes: notes ?? [] });
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("grexya-mcp listo (stdio).");
