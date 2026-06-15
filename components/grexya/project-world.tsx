"use client";

import { useState } from "react";
import { Icon } from "@/components/grexya/icon";
import {
  Avatar,
  AvatarStack,
  CategoryChip,
  Check,
  DueLabel,
  PriorityChip,
  Progress,
  StatusChip,
  SubCounter,
} from "@/components/grexya/atoms";
import { DailyBoard } from "@/components/grexya/daily-board";
import { NotesView } from "@/components/grexya/notes-view";
import { ProjectIcon } from "@/components/grexya/project-icon";
import { coverFor, deriveType, projectProgress, subStats } from "@/lib/grexya-helpers";
import type { ModuleId, Note, Planning, Project, ProjectStatusColumn, Task } from "@/lib/types";

export const COLOR_HEX: Record<string, string> = {
  gray: "#8A8A84", blue: "#3E63DD", green: "#2FA363", amber: "#E08E1B",
  violet: "#7C66DC", rose: "#E93D82", teal: "#12A594", red: "#E5484D",
};
const COLOR_LIST = Object.keys(COLOR_HEX);

export type WorldHandlers = {
  onBack: () => void;
  onOpenTask: (id: string) => void;
  onToggleTask: (id: string) => void;
  onMoveTask: (id: string, statusId: string | null) => void;
  onCreateTask: (input: {
    projectId: string;
    title: string;
    statusId?: string | null;
    start_date?: string | null;
    due_date?: string | null;
    dayDate?: string | null;
    eisenhower?: Task["eisenhower"];
  }) => void;
  onUpdateTask: (id: string, patch: Record<string, unknown>) => void;
  onSetTop3: (taskId: string, dayDate: string, on: boolean) => Promise<{ ok: boolean; error?: string }>;
  onDeleteTask: (id: string) => void;
  onDeleteTasks: (ids: string[]) => void;
  onOpenSettings: () => void;
  onCreateStatus: (projectId: string) => void;
  onUpdateStatus: (statusId: string, patch: { name?: string; color?: string }) => void;
  onDeleteStatus: (statusId: string) => void;
  onCreateNote: (projectId: string) => void;
  onUpdateNote: (id: string, patch: { title?: string; body?: string }) => void;
  onDeleteNote: (id: string) => void;
};

function KanbanCard({
  task,
  all,
  onOpen,
  onToggle,
  onDragStart,
  onDragEnd,
  dragging,
}: {
  task: Task;
  all: Task[];
  onOpen: (id: string) => void;
  onToggle: (id: string) => void;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragEnd: () => void;
  dragging: boolean;
}) {
  const { ratio, total } = subStats(task, all);
  const isDone = task.is_done;
  return (
    <div
      className={`kcard ${isDone ? "done" : ""} ${dragging ? "drag" : ""}`}
      draggable
      onClick={() => onOpen(task.id)}
      onDragStart={(e) => onDragStart(e, task.id)}
      onDragEnd={onDragEnd}
    >
      <div className="kcard-top">
        <Check done={isDone} onClick={() => onToggle(task.id)} size={17} />
        <span className="kcard-title">{task.title}</span>
      </div>
      <div className="kcard-chips">
        <CategoryChip cat={task.front} />
        <PriorityChip quad={task.eisenhower} />
      </div>
      <div className="kcard-foot">
        <div className="kcard-foot-l">
          {total > 0 && <SubCounter task={task} all={all} />}
          <DueLabel dueDate={task.due_date} />
        </div>
        <Avatar id={task.assignee_id} size={24} />
      </div>
      <Progress value={ratio} color="var(--accent)" />
    </div>
  );
}

function AddCard({ onAdd }: { onAdd: (title: string) => void }) {
  const [adding, setAdding] = useState(false);
  const [val, setVal] = useState("");
  if (!adding)
    return (
      <button className="kcol-addcard" onClick={() => setAdding(true)}>
        <Icon name="plus" size={15} />
        Añadir tarjeta
      </button>
    );
  return (
    <textarea
      autoFocus
      className="kcard"
      style={{ padding: "12px 13px", resize: "none", outline: "none" }}
      rows={2}
      value={val}
      onChange={(e) => setVal(e.target.value)}
      placeholder="Título…"
      onBlur={() => {
        if (val.trim()) onAdd(val.trim());
        setVal("");
        setAdding(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          if (val.trim()) onAdd(val.trim());
          setVal("");
          setAdding(false);
        }
        if (e.key === "Escape") {
          setVal("");
          setAdding(false);
        }
      }}
    />
  );
}

function ColumnHead({
  col,
  count,
  h,
}: {
  col: ProjectStatusColumn;
  count: number;
  h: WorldHandlers;
}) {
  const [editing, setEditing] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  return (
    <div className="kcol-head">
      <span style={{ position: "relative", display: "flex" }}>
        <button
          className="kcol-dot"
          title="Color"
          style={{ background: COLOR_HEX[col.color] ?? "#8A8A84", border: "none", cursor: "pointer" }}
          onClick={() => setColorOpen((o) => !o)}
        />
        {colorOpen && (
          <>
            <div className="pop-scrim" onClick={() => setColorOpen(false)} />
            <div className="pop" style={{ minWidth: "auto", flexDirection: "row", flexWrap: "wrap", gap: 6, width: 132 }}>
              {COLOR_LIST.map((c) => (
                <button
                  key={c}
                  style={{ width: 22, height: 22, borderRadius: 6, background: COLOR_HEX[c] }}
                  onClick={() => {
                    h.onUpdateStatus(col.id, { color: c });
                    setColorOpen(false);
                  }}
                />
              ))}
            </div>
          </>
        )}
      </span>

      {editing ? (
        <input
          autoFocus
          defaultValue={col.name}
          className="kcol-title"
          style={{ flex: 1, background: "var(--field)", border: "none", borderRadius: 6, padding: "2px 6px", outline: "none" }}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v && v !== col.name) h.onUpdateStatus(col.id, { name: v });
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") setEditing(false);
          }}
        />
      ) : (
        <span className="kcol-title" style={{ flex: 1 }} onDoubleClick={() => setEditing(true)}>
          {col.name}
        </span>
      )}
      <span className="kcol-count">{count}</span>
      <button className="icon-btn sm kcol-act" title="Renombrar" onClick={() => setEditing(true)}>
        <Icon name="pencil" size={13} />
      </button>
      <button
        className="icon-btn sm kcol-act"
        title="Eliminar columna"
        onClick={() => {
          if (confirm(`¿Eliminar la columna "${col.name}"? Sus tareas se moverán a otra columna.`))
            h.onDeleteStatus(col.id);
        }}
      >
        <Icon name="x" size={14} />
      </button>
    </div>
  );
}

function Kanban({
  project,
  tasks,
  statuses,
  h,
}: {
  project: Project;
  tasks: Task[];
  statuses: ProjectStatusColumn[];
  h: WorldHandlers;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  const top = tasks.filter((t) => !t.parent_task_id);
  const cols = statuses;
  const known = new Set(cols.map((c) => c.id));
  const firstId = cols[0]?.id ?? null;
  const colOf = (t: Task) => (t.status_id && known.has(t.status_id) ? t.status_id : firstId);

  const onDragStart = (e: React.DragEvent, id: string) => {
    setDragId(id);
    e.dataTransfer.effectAllowed = "move";
  };
  const onDragEnd = () => {
    setDragId(null);
    setOverCol(null);
  };
  const drop = (statusId: string) => {
    if (dragId) h.onMoveTask(dragId, statusId);
    onDragEnd();
  };

  return (
    <div className="kanban" style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(0,1fr)) 220px` }}>
      {cols.map((col) => {
        const list = top.filter((t) => colOf(t) === col.id);
        return (
          <div
            key={col.id}
            className={`kcol ${overCol === col.id ? "over" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setOverCol(col.id);
            }}
            onDragLeave={() => setOverCol((c) => (c === col.id ? null : c))}
            onDrop={() => drop(col.id)}
          >
            <ColumnHead col={col} count={list.length} h={h} />
            <div className="kcards">
              {list.map((t) => (
                <KanbanCard
                  key={t.id}
                  task={t}
                  all={tasks}
                  onOpen={h.onOpenTask}
                  onToggle={h.onToggleTask}
                  dragging={dragId === t.id}
                  onDragStart={onDragStart}
                  onDragEnd={onDragEnd}
                />
              ))}
              <AddCard
                onAdd={(title) => h.onCreateTask({ projectId: project.id, title, statusId: col.id })}
              />
            </div>
          </div>
        );
      })}
      <button className="kcol-add-col" onClick={() => h.onCreateStatus(project.id)}>
        <Icon name="plus" size={16} />
        Añadir columna
      </button>
    </div>
  );
}

function ProjectList({
  projectId,
  tasks,
  statuses,
  h,
}: {
  projectId: string;
  tasks: Task[];
  statuses: ProjectStatusColumn[];
  h: WorldHandlers;
}) {
  const [selMode, setSelMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const submitNew = () => {
    const t = newTitle.trim();
    if (t) h.onCreateTask({ projectId, title: t, statusId: statuses[0]?.id ?? null });
    setNewTitle("");
  };
  const statusById = new Map(statuses.map((s) => [s.id, s]));
  const rows = tasks
    .filter((t) => !t.parent_task_id)
    .slice()
    .sort((a, b) => {
      const ad = a.is_done ? 1 : 0;
      const bd = b.is_done ? 1 : 0;
      if (ad !== bd) return ad - bd;
      return (a.due_date ?? "9").localeCompare(b.due_date ?? "9");
    });

  const toggleSel = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const exitSel = () => {
    setSelMode(false);
    setSelected(new Set());
  };
  const allSelected = rows.length > 0 && selected.size === rows.length;
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(rows.map((t) => t.id)));
  const bulkDelete = () => {
    if (selected.size === 0) return;
    if (confirm(`¿Eliminar ${selected.size} tarea(s)?`)) {
      h.onDeleteTasks([...selected]);
      exitSel();
    }
  };

  return (
    <div>
      <div className="list-toolbar">
        <span className="muted" style={{ fontSize: 13.5 }}>
          {rows.length} tarea{rows.length === 1 ? "" : "s"}
        </span>
        {selMode ? (
          <div className="bulk-bar">
            <span className="count">{selected.size} seleccionada{selected.size === 1 ? "" : "s"}</span>
            <button className="list-tool-btn" onClick={toggleAll}>
              {allSelected ? "Ninguna" : "Todas"}
            </button>
            <button
              className="list-tool-btn"
              style={selected.size ? { color: "#E5484D", borderColor: "color-mix(in oklab,#E5484D 40%,var(--line))" } : undefined}
              onClick={bulkDelete}
              disabled={selected.size === 0}
            >
              <Icon name="trash" size={15} />
              Eliminar
            </button>
            <button className="list-tool-btn" onClick={exitSel}>
              Cancelar
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="list-tool-btn"
              style={{ background: "var(--ink-btn)", color: "var(--ink-btn-text)", borderColor: "transparent" }}
              onClick={() => setAdding(true)}
            >
              <Icon name="plus" size={15} />
              Nueva tarea
            </button>
            <button className="list-tool-btn" onClick={() => setSelMode(true)}>
              <Icon name="check" size={15} />
              Seleccionar
            </button>
          </div>
        )}
      </div>

      <div className="tbl card plist">
        <div className="tbl-head trow">
          <span style={{ display: "flex", alignItems: "center" }}>
            {selMode && (
              <span
                className={`row-sel ${allSelected ? "on" : ""}`}
                title={allSelected ? "Deseleccionar todas" : "Seleccionar todas"}
                onClick={toggleAll}
              >
                {allSelected && <Icon name="check" size={12} strokeWidth={3} />}
              </span>
            )}
          </span>
          <span>Tarea</span>
          <span>Estado</span>
          <span>Plazo</span>
          <span>Prioridad</span>
          <span style={{ textAlign: "center" }}>Resp.</span>
          <span />
        </div>
        {rows.map((t) => {
          const done = t.is_done;
          const sel = selected.has(t.id);
          const st = t.status_id ? statusById.get(t.status_id) ?? null : null;
          return (
            <div
              key={t.id}
              className={`trow tbl-row ${done ? "done" : ""} ${sel ? "selected" : ""}`}
              onClick={() => (selMode ? toggleSel(t.id) : h.onOpenTask(t.id))}
            >
              {selMode ? (
                <span
                  className={`row-sel ${sel ? "on" : ""}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleSel(t.id);
                  }}
                >
                  {sel && <Icon name="check" size={12} strokeWidth={3} />}
                </span>
              ) : (
                <Check done={done} onClick={() => h.onToggleTask(t.id)} />
              )}
              <span className="tcell-task">
                <span className="ttitle">{t.title}</span>
                <SubCounter task={t} all={tasks} />
              </span>
              <span>
                <StatusChip status={st} />
              </span>
              <span>
                <DueLabel dueDate={t.due_date} />
              </span>
              <span>
                <PriorityChip quad={t.eisenhower} />
              </span>
              <span style={{ display: "flex", justifyContent: "center" }}>
                <Avatar id={t.assignee_id} size={26} />
              </span>
              {!selMode && (
                <button
                  className="row-del"
                  title="Eliminar tarea"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`¿Eliminar la tarea "${t.title}"?`)) h.onDeleteTask(t.id);
                  }}
                >
                  <Icon name="trash" size={15} />
                </button>
              )}
            </div>
          );
        })}
        {rows.length === 0 && !adding && (
          <div className="tbl-empty">Sin tareas todavía.</div>
        )}

        {adding ? (
          <div className="trow tbl-row" style={{ cursor: "default" }}>
            <span />
            <span className="tcell-task">
              <input
                autoFocus
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Escribe la tarea y Enter…"
                style={{ flex: 1, background: "none", border: "none", outline: "none", color: "var(--text)", fontSize: 14.5 }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitNew();
                  if (e.key === "Escape") {
                    setNewTitle("");
                    setAdding(false);
                  }
                }}
                onBlur={() => {
                  if (!newTitle.trim()) setAdding(false);
                }}
              />
            </span>
            <span /><span /><span /><span /><span />
          </div>
        ) : (
          !selMode && (
            <button className="tbl-add-row" onClick={() => setAdding(true)}>
              <Icon name="plus" size={15} />
              Nueva tarea
            </button>
          )
        )}
      </div>
    </div>
  );
}

export function ProjectWorld({
  project,
  tasks,
  notes,
  statuses,
  calendarConn,
  plannings,
  module: mod,
  h,
}: {
  project: Project;
  tasks: Task[];
  notes: Note[];
  statuses: ProjectStatusColumn[];
  calendarConn: { connected: boolean; email: string | null };
  plannings: Planning[];
  module: ModuleId;
  h: WorldHandlers;
}) {
  const { total, done, pct } = projectProgress(tasks);
  const ptype = deriveType(tasks);
  return (
    <div
      className="world fade-in"
      style={{ ["--accent" as string]: project.accent!, ["--cover" as string]: coverFor(project) }}
    >
      <div className="world-cover">
        <div className="world-cover-band">
          <button className="cover-back" onClick={h.onBack}>
            <Icon name="arrowLeft" size={16} />
            Centro de mando
          </button>
        </div>
        <div className="world-head">
          <div className="world-emoji">
            <ProjectIcon project={project} />
          </div>
          <div className="world-titlerow">
            <div>
              <div className="world-title">
                {project.name}
                <span className="world-type">{ptype === "diario" ? "Operación diaria" : "Venture"}</span>
              </div>
              <div className="world-tagline">{project.tagline}</div>
            </div>
            <div className="world-vmeta">
              <AvatarStack ids={["me"]} size={30} />
              <button className="btn btn-line">
                <Icon name="users" size={15} />
                Invitar
              </button>
              <button
                className="icon-btn btn-line"
                style={{ width: 34 }}
                title="Configuración del proyecto"
                onClick={h.onOpenSettings}
              >
                <Icon name="settings" size={17} />
              </button>
            </div>
          </div>
          <div className="world-meta">
            <div className="world-metric">
              <b>{total}</b>
              <span>Tareas</span>
            </div>
            <div className="world-metric">
              <b>{done}</b>
              <span>Hechas</span>
            </div>
            <div className="world-metric">
              <b>{pct}%</b>
              <span>Progreso</span>
              <Progress value={pct / 100} color="var(--accent)" />
            </div>
          </div>
        </div>
      </div>

      <div className="world-body">
        {mod === "hoy" && (
          <DailyBoard project={project} tasks={tasks} calendarConn={calendarConn} plannings={plannings} h={h} />
        )}
        {mod === "kanban" && <Kanban project={project} tasks={tasks} statuses={statuses} h={h} />}
        {mod === "lista" && (
          <ProjectList projectId={project.id} tasks={tasks} statuses={statuses} h={h} />
        )}
        {mod === "notas" && (
          <NotesView
            project={project}
            notes={notes}
            onCreate={() => h.onCreateNote(project.id)}
            onUpdate={h.onUpdateNote}
            onDelete={h.onDeleteNote}
          />
        )}
      </div>
    </div>
  );
}
