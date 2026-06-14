"use client";

import { useEffect, useMemo, useState } from "react";
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
  deriveType,
  dueOffset,
  greeting,
  isMeeting,
  projectProgress,
  coverFor,
  quadOf,
  QUAD_RANK,
  todayISO,
} from "@/lib/grexya-helpers";
import { getTodayMeetingsAll } from "@/app/actions/calendar";
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
  const ptype = deriveType(tasks);
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
      <span className="pcard-name">
        {project.name}
        <span className="pcard-type">{ptype === "diario" ? "Diario" : "Venture"}</span>
      </span>
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

function TasksPanel({
  tasks,
  projects,
  projectById,
  onOpenTask,
  onToggleTask,
}: {
  tasks: Task[];
  projects: Project[];
  projectById: Map<string, Project>;
  onOpenTask: (id: string) => void;
  onToggleTask: (id: string) => void;
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
      return QUAD_RANK[quadOf(a)] - QUAD_RANK[quadOf(b)];
    });
  }, [today, filter, hideDone]);

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
        {rows.map((t) => {
          const done = t.is_done;
          const p = projectById.get(t.project_id);
          return (
            <div
              key={t.id}
              className={`trow tbl-row ${done ? "done" : ""}`}
              onClick={() => onOpenTask(t.id)}
            >
              <Check done={done} onClick={() => onToggleTask(t.id)} />
              <span className="tcell-task">
                <span className="ttitle">{t.title}</span>
                <SubCounter task={t} all={tasks} />
              </span>
              <span>
                {p && (
                  <ProjectChip
                    project={p}
                    onClick={(e) => {
                      e.stopPropagation();
                      setFilter(t.project_id);
                    }}
                  />
                )}
              </span>
              <span>
                <PriorityChip quad={t.eisenhower} />
              </span>
              <span style={{ display: "flex", justifyContent: "center" }}>
                <Avatar id={t.assignee_id} size={26} />
              </span>
            </div>
          );
        })}
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
}: {
  tasks: Task[];
  projectById: Map<string, Project>;
  connectedProjectIds: string[];
  onOpenTask: (id: string) => void;
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
            <button
              key={m.id}
              className="meet-row"
              onClick={() => m.htmlLink && window.open(m.htmlLink, "_blank")}
              style={{ ["--accent" as string]: p?.accent ?? "#5B5BD6" }}
            >
              <span className="meet-row-time mono">{m.allDay ? "Día" : hm(m.start)}</span>
              <span className="meet-row-body">
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
            </button>
          );
        })}
        {meetings.map((t) => {
          const p = projectById.get(t.project_id);
          return (
            <button
              key={t.id}
              className="meet-row"
              onClick={() => onOpenTask(t.id)}
              style={{ ["--accent" as string]: p?.accent ?? "#5B5BD6" }}
            >
              <span className="meet-row-time mono">{t.meeting_time || "—"}</span>
              <span className="meet-row-body">
                <span className="meet-row-title">{t.title}</span>
                <span className="meet-row-meta">{p && <ProjectChip project={p} />}</span>
              </span>
              <Avatar id={t.assignee_id} size={24} />
            </button>
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

export function CommandCenter({
  projects,
  tasks,
  userName,
  onOpenTask,
  onToggleTask,
  onOpenProject,
  onNewProject,
  connectedProjectIds,
}: {
  projects: Project[];
  tasks: Task[];
  userName: string;
  onOpenTask: (id: string) => void;
  onToggleTask: (id: string) => void;
  onOpenProject: (id: string) => void;
  onNewProject: () => void;
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
        />
        <MeetingsPanel
          tasks={tasks}
          projectById={projectById}
          connectedProjectIds={connectedProjectIds}
          onOpenTask={onOpenTask}
        />
      </div>
    </div>
  );
}
