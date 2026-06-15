// Tipos de dominio de Grexya (escritos a mano, espejo de supabase/migrations).

export type ProjectType = "venture" | "diario";
export type ProjectStatus = "activo" | "pausado" | "archivado";
export type Priority = "alta" | "media" | "baja";
export type Front = "business" | "tech" | "branding" | "marketing";
export type Eisenhower = "ui" | "ni" | "un" | "nn" | "reunion";
export type TaskStatus = "sin" | "prog" | "listo";
export type ModuleId = "hoy" | "kanban" | "lista" | "notas";

export type Workspace = {
  id: string;
  owner_id: string;
  clerk_org_id: string | null;
  name: string;
  slug: string;
  created_at: string;
};

export type Project = {
  id: string;
  workspace_id: string;
  name: string;
  slug: string;
  emoji: string | null;
  color: string | null;
  type: ProjectType;
  accent: string | null;
  cover: string | null;
  tagline: string | null;
  icon_url: string | null;
  modules: ModuleId[];
  context: string | null;
  status: ProjectStatus;
  stage: string | null;
  time_target_pct: number | null;
  active_days: string[] | null;
  position: number;
  created_at: string;
};

export type ProjectStatusColumn = {
  id: string;
  project_id: string;
  name: string;
  color: string;
  position: number;
  created_at: string;
};

export type Task = {
  id: string;
  project_id: string;
  parent_task_id: string | null;
  title: string;
  description: string | null;
  status_id: string | null;
  status: TaskStatus;
  assignee_id: string | null;
  priority: Priority | null;
  front: Front | null;
  start_date: string | null;
  due_date: string | null;
  eisenhower: Eisenhower | null;
  day_date: string | null;
  is_top3: boolean;
  top_rank: number | null;
  meeting_time: string | null;
  is_done: boolean;
  completed_at: string | null;
  position: number;
  created_at: string;
  updated_at: string;
};

// Tarea enriquecida con datos de su proyecto (para el Centro de mando)
export type TaskWithProject = Task & {
  project: Pick<Project, "id" | "name" | "slug" | "emoji" | "color">;
};

export type Note = {
  id: string;
  project_id: string;
  title: string;
  body: string;
  position: number;
  created_at: string;
  updated_at: string;
};

export type AgentMessage = {
  id: string;
  thread_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

export type AgentThread = {
  id: string;
  project_id: string;
  agent_key: string;
  title: string;
  created_at: string;
};
