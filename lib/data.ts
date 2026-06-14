import "server-only";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type {
  AgentThread,
  Note,
  Project,
  ProjectStatusColumn,
  Task,
  TaskWithProject,
  Workspace,
} from "@/lib/types";

// NOTA(deuda técnica): por ahora usamos el cliente admin (service role) y
// AISLAMOS por userId de Clerk en cada consulta. El RLS queda como segunda
// barrera. Cuando validemos que el token de Clerk llega con role=authenticated,
// migramos las lecturas/escrituras al cliente con token de usuario. Ver
// tech/notas-tecnicas-privado.md.

const db = () => createAdminSupabaseClient();

const VENTURE_STATUSES = [
  { name: "Sin empezar", color: "gray" },
  { name: "En progreso", color: "blue" },
  { name: "Listo", color: "green" },
];

const SEED_PROJECTS = [
  { name: "Quepa", slug: "quepa", emoji: "✳️", type: "venture" as const,
    accent: "#5B5BD6", tagline: "Agente IA de recomendaciones por WhatsApp",
    modules: ["hoy", "kanban", "lista", "notas"] },
  { name: "Wenú", slug: "wenu", emoji: "🍽️", type: "venture" as const,
    accent: "#0E9888", tagline: "SaaS para restaurantes — suscripciones",
    modules: ["hoy", "kanban", "lista", "notas"] },
  { name: "Vektora", slug: "vektora", emoji: "🧭", type: "venture" as const,
    accent: "#7C66DC", tagline: "CRM inteligente + constructor de agentes",
    modules: ["hoy", "kanban", "lista", "notas"] },
  { name: "Empleo (Linktic)", slug: "empleo", emoji: "💼", type: "diario" as const,
    accent: "#B45718", tagline: "Operación diaria — QA & automatización",
    modules: ["hoy", "lista", "notas"] },
];

function coverFor(accent: string) {
  return `linear-gradient(120deg, ${accent}, color-mix(in oklab, ${accent} 55%, #fff))`;
}

/** Devuelve el workspace del usuario; si no existe, lo crea con datos semilla. */
export async function getOrCreateWorkspace(userId: string): Promise<Workspace> {
  const supabase = db();
  const { data: existing } = await supabase
    .from("workspaces")
    .select("*")
    .eq("owner_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existing) return existing as Workspace;

  // --- Crear workspace ---
  const { data: ws, error } = await supabase
    .from("workspaces")
    .insert({ owner_id: userId, name: "Mi portafolio", slug: "principal" })
    .select("*")
    .single();
  if (error) throw error;

  await supabase.from("workspace_members").insert({
    workspace_id: ws.id,
    user_id: userId,
    role: "owner",
  });

  // --- Proyectos semilla + estados ---
  for (let i = 0; i < SEED_PROJECTS.length; i++) {
    const p = SEED_PROJECTS[i];
    const { data: project } = await supabase
      .from("projects")
      .insert({
        workspace_id: ws.id,
        name: p.name,
        slug: p.slug,
        emoji: p.emoji,
        type: p.type,
        accent: p.accent,
        cover: coverFor(p.accent),
        tagline: p.tagline,
        modules: p.modules,
        position: i,
      })
      .select("*")
      .single();
    if (!project) continue;

    const statuses = VENTURE_STATUSES.map((s, idx) => ({
      project_id: project.id,
      name: s.name,
      color: s.color,
      position: idx,
    }));
    const { data: createdStatuses } = await supabase
      .from("project_statuses")
      .insert(statuses)
      .select("id, position");
    // mapa enum semilla → status_id por posición (sin=0, prog=1, listo=2)
    const statusByEnum: Record<string, string | null> = {
      sin: createdStatuses?.find((s) => s.position === 0)?.id ?? null,
      prog: createdStatuses?.find((s) => s.position === 1)?.id ?? null,
      listo: createdStatuses?.find((s) => s.position === 2)?.id ?? null,
    };

    const seed = SEED_TASKS[p.slug];
    if (seed) {
      await supabase.from("tasks").insert(
        seed.map((task, idx) => {
          const { due, top, status, ...rest } = task;
          return {
            project_id: project.id,
            assignee_id: userId,
            position: idx,
            status_id: statusByEnum[status] ?? null,
            is_done: status === "listo",
            due_date: due === undefined ? null : isoOffset(due),
            is_top3: top != null,
            top_rank: top ?? null,
            day_date: top != null ? isoOffset(0) : null,
            ...rest,
          };
        }),
      );
    }
  }

  return ws as Workspace;
}

function isoOffset(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  // fecha LOCAL (no UTC) para que coincida con el "hoy" del cliente
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

type SeedTask = {
  title: string;
  status: "sin" | "prog" | "listo";
  front: "business" | "tech" | "branding" | "marketing";
  eisenhower: "ui" | "ni" | "un" | "nn" | "reunion"; // prioridad = cuadrante
  due?: number;
  meeting_time?: string;
  top?: number; // 1..3 → Top 3 del día (de hoy)
};

const SEED_TASKS: Record<string, SeedTask[]> = {
  quepa: [
    { title: "Responder validación de pricing antes de hoy", status: "prog", front: "business", eisenhower: "ui", due: 0, top: 1 },
    { title: "Cerrar el flujo de WhatsApp del MVP", status: "prog", front: "tech", eisenhower: "ui", due: 0, top: 2 },
    { title: "Definir el ICP y el job-to-be-done", status: "sin", front: "business", eisenhower: "ni", due: 0, top: 3 },
    { title: "Actualizar Business Plan acorde al prototipo", status: "prog", front: "business", eisenhower: "ni", due: 2 },
    { title: "Diseñar las Quepa Stars (curaduría)", status: "sin", front: "branding", eisenhower: "nn", due: 4 },
    { title: "Testear cloud design para videos", status: "listo", front: "marketing", eisenhower: "nn", due: -2 },
  ],
  wenu: [
    { title: "Ajustar landing de suscripciones", status: "prog", front: "marketing", eisenhower: "ui", due: 0 },
    { title: "Integrar pasarela de pago", status: "sin", front: "tech", eisenhower: "ni", due: 3 },
    { title: "Cerrar copy del onboarding", status: "sin", front: "marketing", eisenhower: "nn", due: 5 },
    { title: "Brandbook v2", status: "listo", front: "branding", eisenhower: "nn", due: -1 },
  ],
  vektora: [
    { title: "Definir el primer servicio (Agente Calificador)", status: "prog", front: "business", eisenhower: "ui", due: 1 },
    { title: "Arquitectura del constructor de agentes", status: "sin", front: "tech", eisenhower: "ni", due: 6 },
  ],
  empleo: [
    { title: "Responder propuesta de Acme antes de las 5pm", status: "prog", front: "business", eisenhower: "ui", due: 0, top: 1 },
    { title: "Cerrar deploy de producción del cliente", status: "prog", front: "tech", eisenhower: "ui", due: 0, top: 2 },
    { title: "Planear roadmap de QA del trimestre", status: "sin", front: "business", eisenhower: "ni", due: 0, top: 3 },
    { title: "Aprobar facturas pendientes del mes", status: "sin", front: "business", eisenhower: "un", due: 0 },
    { title: "Contestar correos de soporte acumulados", status: "sin", front: "marketing", eisenhower: "un", due: 0 },
    { title: "Leer newsletter de testing guardada", status: "sin", front: "tech", eisenhower: "nn", due: 1 },
    { title: "Daily con el equipo", status: "sin", front: "business", eisenhower: "reunion", meeting_time: "09:30", due: 0 },
    { title: "Reunión de automatización", status: "sin", front: "tech", eisenhower: "reunion", meeting_time: "14:00", due: 0 },
  ],
};

async function requireWorkspace(userId: string) {
  return getOrCreateWorkspace(userId);
}

export async function listProjects(userId: string): Promise<Project[]> {
  const ws = await requireWorkspace(userId);
  const { data } = await db()
    .from("projects")
    .select("*")
    .eq("workspace_id", ws.id)
    .order("position", { ascending: true });
  return (data ?? []) as Project[];
}

export async function getProjectBySlug(
  userId: string,
  slug: string,
): Promise<Project | null> {
  const ws = await requireWorkspace(userId);
  const { data } = await db()
    .from("projects")
    .select("*")
    .eq("workspace_id", ws.id)
    .eq("slug", slug)
    .maybeSingle();
  return (data as Project) ?? null;
}

export async function listProjectStatuses(
  projectId: string,
): Promise<ProjectStatusColumn[]> {
  const { data } = await db()
    .from("project_statuses")
    .select("*")
    .eq("project_id", projectId)
    .order("position", { ascending: true });
  return (data ?? []) as ProjectStatusColumn[];
}

export async function listTasksForProject(projectId: string): Promise<Task[]> {
  const { data } = await db()
    .from("tasks")
    .select("*")
    .eq("project_id", projectId)
    .order("position", { ascending: true });
  return (data ?? []) as Task[];
}

/** Tareas de un proyecto para un día concreto (vista Diario). */
export async function listTasksForDay(
  projectId: string,
  day: string,
): Promise<Task[]> {
  const { data } = await db()
    .from("tasks")
    .select("*")
    .eq("project_id", projectId)
    .eq("day_date", day)
    .order("position", { ascending: true });
  return (data ?? []) as Task[];
}

/** Carga todo el workspace para el shell: proyectos + tareas + notas. */
export type CalendarConn = { project_id: string; email: string | null };

export async function getAppData(userId: string): Promise<{
  projects: Project[];
  tasks: Task[];
  notes: Note[];
  statuses: ProjectStatusColumn[];
  calendars: CalendarConn[];
}> {
  const ws = await getOrCreateWorkspace(userId);
  const supabase = db();
  const { data: projects } = await supabase
    .from("projects")
    .select("*")
    .eq("workspace_id", ws.id)
    .neq("status", "archivado")
    .order("position", { ascending: true });
  const ids = (projects ?? []).map((p) => p.id);
  if (ids.length === 0) {
    return { projects: (projects ?? []) as Project[], tasks: [], notes: [], statuses: [], calendars: [] };
  }
  const [tasksRes, notesRes, statusesRes, calsRes] = await Promise.all([
    supabase
      .from("tasks")
      .select("*")
      .in("project_id", ids)
      .order("position", { ascending: true }),
    supabase
      .from("notes")
      .select("*")
      .in("project_id", ids)
      .order("updated_at", { ascending: false }),
    supabase
      .from("project_statuses")
      .select("*")
      .in("project_id", ids)
      .order("position", { ascending: true }),
    supabase.from("project_calendars").select("project_id, email").in("project_id", ids),
  ]);
  return {
    projects: (projects ?? []) as Project[],
    tasks: (tasksRes.data ?? []) as Task[],
    notes: (notesRes.data ?? []) as Note[],
    statuses: (statusesRes.data ?? []) as ProjectStatusColumn[],
    calendars: (calsRes.data ?? []) as CalendarConn[],
  };
}

export async function listNotes(projectId: string): Promise<Note[]> {
  const { data } = await db()
    .from("notes")
    .select("*")
    .eq("project_id", projectId)
    .order("updated_at", { ascending: false });
  return (data ?? []) as Note[];
}

export async function listThreads(projectId: string): Promise<AgentThread[]> {
  const { data } = await db()
    .from("agent_threads")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  return (data ?? []) as AgentThread[];
}

/** Todas las tareas de todos los proyectos del usuario (Centro de mando). */
export async function listAllTasks(userId: string): Promise<TaskWithProject[]> {
  const ws = await requireWorkspace(userId);
  const { data } = await db()
    .from("tasks")
    .select("*, project:projects!inner(id,name,slug,emoji,color,workspace_id)")
    .eq("project.workspace_id", ws.id)
    .is("parent_task_id", null)
    .order("created_at", { ascending: false });
  return (data ?? []) as unknown as TaskWithProject[];
}
