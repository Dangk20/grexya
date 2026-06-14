import type { Project, Task } from "@/lib/types";

export const WD = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

/** Fecha calendario LOCAL en formato YYYY-MM-DD (sin saltos de zona horaria). */
export function localISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export function todayISO(): string {
  return localISO(new Date());
}

/** Offset entero en días respecto a hoy (0=hoy, 1=mañana, -2=hace 2 días). */
export function dueOffset(dueDate: string | null): number | null {
  if (!dueDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dueDate + "T00:00:00");
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

export function getDue(
  dueDate: string | null,
): { label: string; cls: string } | null {
  const off = dueOffset(dueDate);
  if (off === null) return null;
  if (off === 0) return { label: "Hoy", cls: "due-today" };
  if (off === 1) return { label: "Mañana", cls: "" };
  if (off === -1) return { label: "Ayer", cls: "due-over" };
  const d = new Date();
  d.setDate(d.getDate() + off);
  return { label: `${WD[d.getDay()]} ${d.getDate()}`, cls: off < 0 ? "due-over" : "" };
}

/** Subtareas = filas con parent_task_id. */
export function subStats(task: Task, all: Task[]) {
  const subs = all.filter((t) => t.parent_task_id === task.id);
  const total = subs.length;
  const done = subs.filter((s) => s.is_done).length;
  return { total, done, ratio: total ? done / total : task.is_done ? 1 : 0 };
}

/** Tipo derivado: muchas tareas abiertas hoy ⇒ operación diaria. */
export function deriveType(tasks: Task[]): "venture" | "diario" {
  const todayOpen = tasks.filter(
    (t) => !t.parent_task_id && dueOffset(t.due_date) === 0 && !t.is_done,
  ).length;
  return todayOpen >= 4 ? "diario" : "venture";
}

export function isMeeting(t: Task) {
  return t.eisenhower === "reunion";
}

export type Quad = "ui" | "ni" | "un" | "nn";

/** Prioridad unificada = cuadrante Eisenhower. Es el único eje de prioridad. */
export const QUAD_META: Record<
  Quad,
  { label: string; short: string; sub: string; tone: string; icon: string }
> = {
  ui: { label: "Urgente · Importante", short: "Crítica", sub: "Hazlo ya", tone: "red", icon: "zap" },
  ni: { label: "No urgente · Importante", short: "Alta", sub: "Agéndalo", tone: "blue", icon: "target" },
  un: { label: "Urgente · No importante", short: "Media", sub: "Delégalo", tone: "amber", icon: "clock" },
  nn: { label: "No urgente · No importante", short: "Baja", sub: "Cuando sobre", tone: "gray", icon: "layers" },
};
export const QUAD_RANK: Record<Quad, number> = { ui: 0, ni: 1, un: 2, nn: 3 };

/** Cuadrante de una tarea (explícito; fallback derivado del plazo). */
export function quadOf(t: Task): Quad {
  if (t.eisenhower && t.eisenhower !== "reunion") return t.eisenhower as Quad;
  const off = dueOffset(t.due_date);
  const urgente = off !== null && off <= 1;
  return urgente ? "ui" : "ni";
}

export function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
}

export function projectProgress(tasks: Task[]) {
  const top = tasks.filter((t) => !t.parent_task_id);
  const total = top.length;
  const done = top.filter((t) => t.is_done).length;
  return { total, done, pct: total ? Math.round((done / total) * 100) : 0 };
}

export function coverFor(project: Project) {
  return (
    project.cover ||
    `linear-gradient(120deg, ${project.accent ?? "#5B5BD6"}, color-mix(in oklab, ${
      project.accent ?? "#5B5BD6"
    } 55%, #fff))`
  );
}
