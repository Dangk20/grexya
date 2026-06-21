"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Icon } from "@/components/grexya/icon";
import {
  Avatar,
  AvatarStack,
  PriorityChip,
  ProjectChip,
  Check,
  Progress,
  SubCounter,
} from "@/components/grexya/atoms";
import { ProjectIcon } from "@/components/grexya/project-icon";
import {
  dueOffset,
  greeting,
  isMeeting,
  projectProgress,
  coverFor,
  quadOf,
  QUAD_RANK,
  todayISO,
} from "@/lib/grexya-helpers";
import { getTodayMeetingsAll, toggleMeetingDone } from "@/app/actions/calendar";
import type { Meeting } from "@/lib/google";
import type { Project, Task } from "@/lib/types";

function hm(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
}

function ProjectCard({
  project,
  tasks,
  onOpen,
}: {
  project: Project;
  tasks: Task[];
  onOpen: (id: string) => void;
}) {
  const { pct } = projectProgress(tasks);
  const open = tasks.filter((t) => !t.parent_task_id && !t.is_done).length;
  return (
    <button
      className="pcard"
      style={{ ["--accent" as string]: project.accent!, ["--cover" as string]: coverFor(project) }}
      onClick={() => onOpen(project.id)}
    >
      <span className="pcard-band" />
      <span className="pcard-emoji">
        <ProjectIcon project={project} />
      </span>
      <span className="pcard-name">{project.name}</span>
      <span className="pcard-tag">{project.tagline}</span>
      <span className="pcard-foot">
        <span className="pcard-stat mono">{open} abiertas</span>
        <AvatarStack ids={["me"]} size={22} max={3} />
      </span>
      <span className="pcard-prog">
        <Progress value={pct / 100} color="var(--accent)" />
      </span>
    </button>
  );
}

/** Fila de tarea arrastrable de la vista de inicio. */
function SortableTaskRow({
  task,
  project,
  all,
  onOpenTask,
  onToggleTask,
  onSetFilter,
}: {
  task: Task;
  project: Project | undefined;
  all: Task[];
  onOpenTask: (id: string) => void;
  onToggleTask: (id: string) => void;
  onSetFilter: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });
  const done = task.is_done;
  return (
    <div
      ref={setNodeRef}
      className={`trow tbl-row ${done ? "done" : ""}`}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        cursor: "grab",
        ...(isDragging ? { opacity: 0.5, position: "relative", zIndex: 2, background: "var(--hover)" } : {}),
      }}
      onClick={() => onOpenTask(task.id)}
      {...attributes}
      {...listeners}
    >
      <Check done={done} onClick={() => onToggleTask(task.id)} />
      <span className="tcell-task">
        <span className="ttitle">{task.title}</span>
        <SubCounter task={task} all={all} />
      </span>
      <span>
        {project && (
          <ProjectChip
            project={project}
            onClick={(e) => {
              e.stopPropagation();
              onSetFilter(task.project_id);
            }}
          />
        )}
      </span>
      <span>
        <PriorityChip quad={task.eisenhower} />
      </span>
      <span style={{ display: "flex", justifyContent: "center" }}>
        <Avatar id={task.assignee_id} size={26} />
      </span>
    </div>
  );
}

function TasksPanel({
  tasks,
  projects,
  projectById,
  onOpenTask,
  onToggleTask,
  onReorderTasks,
}: {
  tasks: Task[];
  projects: Project[];
  projectById: Map<string, Project>;
  onOpenTask: (id: string) => void;
  onToggleTask: (id: string) => void;
  onReorderTasks: (projectId: string, items: { id: string; position: number }[]) => void;
}) {
  const [filter, setFilter] = useState<string>("all");
  const [hideDone, setHideDone] = useState(true);
  const [selOpen, setSelOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const today = useMemo(
    () => tasks.filter((t) => !t.parent_task_id && dueOffset(t.due_date) === 0),
    [tasks],
  );
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: 0 };
    projects.forEach((p) => (c[p.id] = 0));
    today.forEach((t) => {
      if (!t.is_done) {
        c.all++;
        c[t.project_id] = (c[t.project_id] || 0) + 1;
      }
    });
    return c;
  }, [today, projects]);
  const rows = useMemo(() => {
    let l = today.filter((t) => (filter === "all" ? true : t.project_id === filter));
    if (hideDone) l = l.filter((t) => !t.is_done);
    return l.slice().sort((a, b) => {
      const ad = a.is_done ? 1 : 0;
      const bd = b.is_done ? 1 : 0;
      if (ad !== bd) return ad - bd;
      const pd = (a.position ?? 0) - (b.position ?? 0);
      if (pd !== 0) return pd;
      return QUAD_RANK[quadOf(a)] - QUAD_RANK[quadOf(b)];
    });
  }, [today, filter, hideDone]);

  // Arrastrar y soltar para ordenar manualmente la lista de hoy.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = rows.map((t) => t.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    const next = arrayMove(ids, from, to);
    // posición global secuencial → preserva el orden aunque se mezclen proyectos
    const byProject = new Map<string, { id: string; position: number }[]>();
    next.forEach((id, i) => {
      const t = today.find((x) => x.id === id);
      if (!t) return;
      const arr = byProject.get(t.project_id) ?? [];
      arr.push({ id, position: i });
      byProject.set(t.project_id, arr);
    });
    byProject.forEach((items, projectId) => onReorderTasks(projectId, items));
  };

  const cur = filter === "all" ? null : projectById.get(filter);

  return (
    <section className="panel tasks-panel">
      <div className="panel-head">
        <div className="panel-title">
          <Icon name="target" size={17} />
          <span>Tus tareas de hoy</span>
          <span className="panel-count mono">{counts.all}</span>
        </div>
        <div className="panel-tools">
          <div className="selector-wrap">
            <button
              className={`selector ${selOpen ? "open" : ""}`}
              onClick={() => {
                setSelOpen((o) => !o);
                setMenuOpen(false);
              }}
              style={cur ? { ["--accent" as string]: cur.accent! } : undefined}
            >
              {cur ? (
                <>
                  <span className="chip-emoji">{cur.emoji}</span>
                  <span className="selector-lbl">{cur.name}</span>
                </>
              ) : (
                <span className="selector-lbl">Todos los proyectos</span>
              )}
              <Icon name="chevDown" size={15} className="faint" />
            </button>
            {selOpen && (
              <>
                <div className="pop-scrim" onClick={() => setSelOpen(false)} />
                <div className="selector-pop">
                  <button
                    className={`sel-item ${filter === "all" ? "on" : ""}`}
                    onClick={() => {
                      setFilter("all");
                      setSelOpen(false);
                    }}
                  >
                    <Icon name="layers" size={15} />
                    <span className="sel-name">Todos los proyectos</span>
                    <span className="sel-count mono">{counts.all}</span>
                    {filter === "all" && <Icon name="check" size={15} />}
                  </button>
                  <div className="sel-div" />
                  {projects.map((p) => (
                    <button
                      key={p.id}
                      className={`sel-item ${filter === p.id ? "on" : ""}`}
                      onClick={() => {
                        setFilter(p.id);
                        setSelOpen(false);
                      }}
                    >
                      <span className="chip-emoji">{p.emoji}</span>
                      <span className="sel-name">{p.name}</span>
                      <span className="sel-count mono">{counts[p.id]}</span>
                      {filter === p.id && <Icon name="check" size={15} />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <div className="selector-wrap">
            <button
              className="icon-btn sm"
              onClick={() => {
                setMenuOpen((o) => !o);
                setSelOpen(false);
              }}
              title="Opciones"
            >
              <Icon name="moreH" size={18} />
            </button>
            {menuOpen && (
              <>
                <div className="pop-scrim" onClick={() => setMenuOpen(false)} />
                <div className="more-menu">
                  <button
                    className="menu-item"
                    onClick={() => {
                      setHideDone((h) => !h);
                      setMenuOpen(false);
                    }}
                  >
                    <Icon name={hideDone ? "eye" : "eyeOff"} size={16} />
                    <span>{hideDone ? "Mostrar hechas" : "Ocultar hechas"}</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="tbl">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={rows.map((t) => t.id)} strategy={verticalListSortingStrategy}>
            {rows.map((t) => (
              <SortableTaskRow
                key={t.id}
                task={t}
                project={projectById.get(t.project_id)}
                all={tasks}
                onOpenTask={onOpenTask}
                onToggleTask={onToggleTask}
                onSetFilter={setFilter}
              />
            ))}
          </SortableContext>
        </DndContext>
        {rows.length === 0 && (
          <div className="tbl-empty">
            <Icon name="check" size={20} className="faint" />
            <span>{hideDone ? "¡Nada pendiente para hoy! ✦" : "Sin tareas para hoy"}</span>
          </div>
        )}
      </div>
    </section>
  );
}

function MeetingsPanel({
  tasks,
  projectById,
  connectedProjectIds,
  onOpenTask,
  onToggleTask,
}: {
  tasks: Task[];
  projectById: Map<string, Project>;
  connectedProjectIds: string[];
  onOpenTask: (id: string) => void;
  onToggleTask: (id: string) => void;
}) {
  const [gmeetings, setGmeetings] = useState<(Meeting & { projectId: string })[]>([]);
  const connectedKey = connectedProjectIds.join(",");
  useEffect(() => {
    if (!connectedProjectIds.length) return;
    let active = true;
    getTodayMeetingsAll(todayISO())
      .then((m) => active && setGmeetings(m))
      .catch(() => {});
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectedKey]);

  const toggleGMeeting = async (m: Meeting & { projectId: string }) => {
    const next = !m.done;
    setGmeetings((ms) => ms.map((x) => (x.id === m.id ? { ...x, done: next } : x)));
    await toggleMeetingDone(m.projectId, m.id, next).catch(() => {});
  };

  const meetings = tasks
    .filter((t) => !t.parent_task_id && isMeeting(t) && dueOffset(t.due_date) === 0)
    .sort((a, b) => (a.meeting_time ?? "").localeCompare(b.meeting_time ?? ""));
  const total = gmeetings.length + meetings.length;

  return (
    <aside className="panel meet-side">
      <div className="panel-head">
        <div className="panel-title">
          <Icon name="users" size={17} />
          <span>Reuniones de hoy</span>
        </div>
        <span className="panel-count mono">{total}</span>
      </div>
      <div className="meet-list">
        {gmeetings.map((m) => {
          const p = projectById.get(m.projectId);
          return (
            <div
              key={m.id}
              className={`meet-row ${m.done ? "done" : ""}`}
              style={{ ["--accent" as string]: p?.accent ?? "#5B5BD6" }}
            >
              <Check done={m.done} onClick={() => toggleGMeeting(m)} size={17} />
              <span className="meet-row-time mono">{m.allDay ? "Día" : hm(m.start)}</span>
              <span
                className="meet-row-body"
                style={{ cursor: m.htmlLink ? "pointer" : "default" }}
                onClick={() => m.htmlLink && window.open(m.htmlLink, "_blank")}
              >
                <span className="meet-row-title">{m.title}</span>
                <span className="meet-row-meta">{p && <ProjectChip project={p} />}</span>
              </span>
              {m.hangoutLink ? (
                <button
                  title="Google Meet"
                  onClick={(e) => {
                    e.stopPropagation();
                    window.open(m.hangoutLink!, "_blank");
                  }}
                  style={{ display: "flex", color: "#2FA363" }}
                >
                  <Icon name="users" size={16} />
                </button>
              ) : (
                <Icon name="calendar" size={15} className="faint" />
              )}
            </div>
          );
        })}
        {meetings.map((t) => {
          const p = projectById.get(t.project_id);
          return (
            <div
              key={t.id}
              className={`meet-row ${t.is_done ? "done" : ""}`}
              style={{ ["--accent" as string]: p?.accent ?? "#5B5BD6" }}
            >
              <Check done={t.is_done} onClick={() => onToggleTask(t.id)} size={17} />
              <span className="meet-row-time mono">{t.meeting_time || "—"}</span>
              <span
                className="meet-row-body"
                style={{ cursor: "pointer" }}
                onClick={() => onOpenTask(t.id)}
              >
                <span className="meet-row-title">{t.title}</span>
                <span className="meet-row-meta">{p && <ProjectChip project={p} />}</span>
              </span>
              <Avatar id={t.assignee_id} size={24} />
            </div>
          );
        })}
        {total === 0 && (
          <div className="meet-empty">
            <Icon name="clock" size={20} className="faint" />
            <span>Sin reuniones hoy</span>
          </div>
        )}
      </div>
    </aside>
  );
}

/** Barra apilada: del total de tareas hechas, qué % aportó cada proyecto. */
function WorkSplitBar({ projects, tasks }: { projects: Project[]; tasks: Task[] }) {
  const { rows, total } = useMemo(() => {
    const r = projects
      .map((p) => ({
        p,
        done: tasks.filter((t) => t.project_id === p.id && !t.parent_task_id && t.is_done).length,
      }))
      .filter((x) => x.done > 0)
      .sort((a, b) => b.done - a.done);
    return { rows: r, total: r.reduce((s, x) => s + x.done, 0) };
  }, [projects, tasks]);

  const pct = (n: number) => Math.round((n / total) * 100);

  if (total === 0) {
    return (
      <div className="worksplit empty">
        <span className="worksplit-label">Distribución de trabajo</span>
        <p className="faint" style={{ fontSize: 13, margin: 0 }}>
          Aún no has completado tareas. Cuando marques tareas como hechas verás aquí en qué proyecto avanzas más.
        </p>
      </div>
    );
  }

  const top = rows[0];
  return (
    <div className="worksplit">
      <div className="worksplit-head">
        <span className="worksplit-label">Distribución de trabajo · {total} hechas</span>
        <span className="worksplit-top">
          Más avance:{" "}
          <b style={{ color: top.p.accent ?? "var(--text)" }}>{top.p.name}</b> · {pct(top.done)}%
        </span>
      </div>
      <div className="worksplit-bar">
        {rows.map((r) => (
          <span
            key={r.p.id}
            className="worksplit-seg"
            style={{ width: `${pct(r.done)}%`, background: r.p.accent ?? "#8A8A84" }}
            title={`${r.p.name} · ${r.done} hechas (${pct(r.done)}%)`}
          />
        ))}
      </div>
      <div className="worksplit-legend">
        {rows.map((r) => (
          <span key={r.p.id} className="worksplit-leg">
            <span className="worksplit-dot" style={{ background: r.p.accent ?? "#8A8A84" }} />
            {r.p.name}
            <b className="mono">{pct(r.done)}%</b>
          </span>
        ))}
      </div>
    </div>
  );
}

export function CommandCenter({
  projects,
  tasks,
  userName,
  onOpenTask,
  onToggleTask,
  onOpenProject,
  onNewProject,
  onReorderTasks,
  connectedProjectIds,
}: {
  projects: Project[];
  tasks: Task[];
  userName: string;
  onOpenTask: (id: string) => void;
  onToggleTask: (id: string) => void;
  onOpenProject: (id: string) => void;
  onNewProject: () => void;
  onReorderTasks: (projectId: string, items: { id: string; position: number }[]) => void;
  connectedProjectIds: string[];
}) {
  const projectById = useMemo(
    () => new Map(projects.map((p) => [p.id, p])),
    [projects],
  );
  const todayCount = tasks.filter(
    (t) => !t.parent_task_id && dueOffset(t.due_date) === 0 && !t.is_done,
  ).length;
  const meetCount = tasks.filter(
    (t) => !t.parent_task_id && isMeeting(t) && dueOffset(t.due_date) === 0,
  ).length;

  return (
    <div className="main-inner home fade-in">
      <header className="home-hero">
        <span className="home-eyebrow">
          {greeting()}, {userName} 👋
        </span>
        <h1 className="home-title">¿Qué proyecto quieres trabajar hoy?</h1>
        <p className="home-summary">
          Tienes <b>{todayCount} tareas</b> para hoy y <b>{meetCount} reuniones</b>{" "}
          agendadas en tus {projects.length} mundos.
        </p>
      </header>

      <WorkSplitBar projects={projects} tasks={tasks} />

      <div className="pcards">
        {projects.map((p) => (
          <ProjectCard
            key={p.id}
            project={p}
            tasks={tasks.filter((t) => t.project_id === p.id)}
            onOpen={onOpenProject}
          />
        ))}
        <button className="pcard pcard-add" onClick={onNewProject}>
          <span className="pcard-add-plus">
            <Icon name="plus" size={24} />
          </span>
          <span className="pcard-add-label">Nuevo proyecto</span>
          <span className="pcard-add-sub">Crea un mundo nuevo</span>
        </button>
      </div>

      <div className="home-lower">
        <TasksPanel
          tasks={tasks}
          projects={projects}
          projectById={projectById}
          onOpenTask={onOpenTask}
          onToggleTask={onToggleTask}
          onReorderTasks={onReorderTasks}
        />
        <MeetingsPanel
          tasks={tasks}
          projectById={projectById}
          connectedProjectIds={connectedProjectIds}
          onOpenTask={onOpenTask}
          onToggleTask={onToggleTask}
        />
      </div>
    </div>
  );
}
