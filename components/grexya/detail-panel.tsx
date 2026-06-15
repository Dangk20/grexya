"use client";

import { useEffect, useState } from "react";
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
  CategoryChip,
  Check,
  PriorityChip,
  Progress,
  ProjectChip,
  StatusChip,
} from "@/components/grexya/atoms";
import { usePeople, personFor } from "@/components/grexya/people";
import { subStats, todayISO, QUAD_META, type Quad } from "@/lib/grexya-helpers";
import type { Front, Project, ProjectStatusColumn, Task } from "@/lib/types";

const QUAD_OPTS: Quad[] = ["ui", "ni", "un", "nn"];
const FRONT_OPTS: Front[] = ["business", "tech", "branding", "marketing"];

function Popover({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <>
      <div className="pop-scrim" onClick={onClose} />
      <div className="pop">{children}</div>
    </>
  );
}

function PropRow({
  icon,
  label,
  children,
}: {
  icon: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="prop-row">
      <span className="prop-label">
        <Icon name={icon} size={15} className="faint" />
        {label}
      </span>
      <span className="prop-val">{children}</span>
    </div>
  );
}

function SortableSub({
  sub,
  onToggle,
  onDelete,
}: {
  sub: Task;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: sub.id });
  return (
    <div
      ref={setNodeRef}
      className="so-sub"
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        background: isDragging ? "var(--hover)" : undefined,
      }}
    >
      <span
        {...attributes}
        {...listeners}
        title="Arrastrar para reordenar"
        style={{ cursor: "grab", color: "var(--text-3)", display: "flex", touchAction: "none" }}
      >
        <Icon name="grip" size={15} />
      </span>
      <Check done={sub.is_done} onClick={() => onToggle(sub.id)} size={18} />
      <span className={sub.is_done ? "sub-done" : ""} style={{ flex: 1 }}>
        {sub.title}
      </span>
      <button className="icon-btn sm" onClick={() => onDelete(sub.id)} title="Eliminar subtarea">
        <Icon name="x" size={14} />
      </button>
    </div>
  );
}

export function DetailPanel({
  task,
  project,
  statuses,
  allTasks,
  onClose,
  onUpdate,
  onToggle,
  onCreateSub,
  onDeleteTask,
  onSetTop3,
  onReorderSubtasks,
}: {
  task: Task;
  project: Project;
  statuses: ProjectStatusColumn[];
  allTasks: Task[];
  onClose: () => void;
  onUpdate: (id: string, patch: Record<string, unknown>) => void;
  onToggle: (id: string) => void;
  onCreateSub: (parentId: string, title: string) => void;
  onDeleteTask: (id: string) => void;
  onSetTop3: (taskId: string, dayDate: string, on: boolean) => Promise<{ ok: boolean; error?: string }>;
  onReorderSubtasks: (parentId: string, ids: string[]) => void;
}) {
  const ctx = usePeople();
  const [closing, setClosing] = useState(false);
  const [menu, setMenu] = useState<string | null>(null);
  const [title, setTitle] = useState(task.title);
  const [desc, setDesc] = useState(task.description ?? "");
  const [newSub, setNewSub] = useState("");
  const [topMsg, setTopMsg] = useState<string | null>(null);

  const close = () => {
    setClosing(true);
    setTimeout(onClose, 260);
  };
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const subs = allTasks.filter((t) => t.parent_task_id === task.id);
  // orden local de subtareas (se resincroniza solo si cambia el conjunto, no al reordenar)
  const setKey = subs.map((s) => s.id).slice().sort().join(",");
  const [order, setOrder] = useState<string[]>(subs.map((s) => s.id));
  const [orderKey, setOrderKey] = useState(setKey);
  if (orderKey !== setKey) {
    setOrderKey(setKey);
    setOrder(subs.map((s) => s.id));
  }
  const orderedSubs = order
    .map((id) => subs.find((s) => s.id === id))
    .filter(Boolean) as Task[];
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const onSubDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (over && active.id !== over.id) {
      const next = arrayMove(order, order.indexOf(String(active.id)), order.indexOf(String(over.id)));
      setOrder(next);
      onReorderSubtasks(task.id, next);
    }
  };
  const { done, total, ratio } = subStats(task, allTasks);
  const isDone = task.is_done;
  const currentStatus = task.status_id ? statuses.find((s) => s.id === task.status_id) ?? null : null;

  return (
    <div className={`slideover ${closing ? "closing" : ""}`} style={{ ["--accent" as string]: project.accent! }}>
      <div className="so-scrim" onClick={close} />
      <div className="so-panel">
        <div className="so-head">
          <ProjectChip project={project} />
          <div className="so-head-actions">
            <div style={{ position: "relative" }}>
              <button className="icon-btn" title="Opciones" onClick={() => setMenu(menu === "head" ? null : "head")}>
                <Icon name="more" size={18} />
              </button>
              <Popover open={menu === "head"} onClose={() => setMenu(null)}>
                <button
                  className="pop-item"
                  style={{ color: "#E5484D" }}
                  onClick={() => {
                    setMenu(null);
                    if (confirm(`¿Eliminar la tarea "${task.title}"?`)) {
                      onDeleteTask(task.id);
                      close();
                    }
                  }}
                >
                  <Icon name="trash" size={15} />
                  Eliminar tarea
                </button>
              </Popover>
            </div>
            <button className="icon-btn" onClick={close}>
              <Icon name="x" size={18} />
            </button>
          </div>
        </div>

        <div className="so-body">
          <div className="so-titlerow">
            <Check done={isDone} onClick={() => onToggle(task.id)} size={24} />
            <textarea
              className={`so-title ${isDone ? "done" : ""}`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => title.trim() && title !== task.title && onUpdate(task.id, { title: title.trim() })}
              rows={1}
              style={{ background: "none", border: "none", resize: "none" }}
            />
          </div>

          <div className="so-props">
            <PropRow icon="layers" label="Estado">
              <button className="prop-btn" onClick={() => setMenu(menu === "status" ? null : "status")}>
                <StatusChip status={currentStatus} />
                <Popover open={menu === "status"} onClose={() => setMenu(null)}>
                  {statuses.map((s) => (
                    <button key={s.id} className="pop-item" onClick={() => { onUpdate(task.id, { status_id: s.id }); setMenu(null); }}>
                      <StatusChip status={s} />
                      {task.status_id === s.id && <Icon name="check" size={15} style={{ marginLeft: "auto" }} />}
                    </button>
                  ))}
                </Popover>
              </button>
            </PropRow>
            <PropRow icon="flag" label="Prioridad">
              <button className="prop-btn" onClick={() => setMenu(menu === "prio" ? null : "prio")}>
                {task.eisenhower && task.eisenhower !== "reunion" ? (
                  <PriorityChip quad={task.eisenhower} />
                ) : (
                  <span className="faint">—</span>
                )}
                <Popover open={menu === "prio"} onClose={() => setMenu(null)}>
                  {QUAD_OPTS.map((q) => (
                    <button key={q} className="pop-item" onClick={() => { onUpdate(task.id, { eisenhower: q }); setMenu(null); }}>
                      <PriorityChip quad={q} />
                      <span className="faint" style={{ fontSize: 12 }}>{QUAD_META[q].label}</span>
                      {task.eisenhower === q && <Icon name="check" size={15} style={{ marginLeft: "auto" }} />}
                    </button>
                  ))}
                </Popover>
              </button>
            </PropRow>
            <PropRow icon="star" label="Top 3 del día">
              <button
                className="prop-btn"
                onClick={async () => {
                  setTopMsg(null);
                  const day = task.day_date ?? todayISO();
                  const res = await onSetTop3(task.id, day, !task.is_top3);
                  if (res && !res.ok && res.error) setTopMsg(res.error);
                }}
                style={{ gap: 7, color: task.is_top3 ? "#E08E1B" : "var(--text-2)" }}
              >
                <Icon name="star" size={16} strokeWidth={task.is_top3 ? 2.4 : 1.9} />
                {task.is_top3 ? "En el Top 3" : "Marcar Top 3"}
              </button>
            </PropRow>
            <PropRow icon="grid" label="Categoría">
              <button className="prop-btn" onClick={() => setMenu(menu === "cat" ? null : "cat")}>
                {task.front ? <CategoryChip cat={task.front} /> : <span className="faint">—</span>}
                <Popover open={menu === "cat"} onClose={() => setMenu(null)}>
                  {FRONT_OPTS.map((f) => (
                    <button key={f} className="pop-item" onClick={() => { onUpdate(task.id, { front: f }); setMenu(null); }}>
                      <CategoryChip cat={f} />
                      {task.front === f && <Icon name="check" size={15} />}
                    </button>
                  ))}
                </Popover>
              </button>
            </PropRow>
            <PropRow icon="users" label="Responsable">
              <span className="front-val">
                <Avatar id={task.assignee_id} size={22} />
                {personFor(task.assignee_id, ctx).name}
              </span>
            </PropRow>
            <PropRow icon="calendar" label="Inicio">
              <input
                type="date"
                defaultValue={task.start_date ?? ""}
                max={task.due_date ?? undefined}
                onChange={(e) => onUpdate(task.id, { start_date: e.target.value || null })}
                className="prop-plain"
                style={{ background: "var(--field)", border: "none", borderRadius: 8, padding: "4px 8px", color: "var(--text)" }}
              />
            </PropRow>
            <PropRow icon="calendar" label="Plazo">
              <input
                type="date"
                defaultValue={task.due_date ?? ""}
                min={task.start_date ?? undefined}
                onChange={(e) => onUpdate(task.id, { due_date: e.target.value || null })}
                className="prop-plain"
                style={{ background: "var(--field)", border: "none", borderRadius: 8, padding: "4px 8px", color: "var(--text)" }}
              />
            </PropRow>
          </div>

          {topMsg && (
            <div className="chip tone-amber" style={{ height: "auto", padding: "7px 11px", gap: 7 }}>
              <Icon name="warn" size={14} />
              {topMsg}
            </div>
          )}

          <div className="so-sec">
            <span className="section-label">Descripción</span>
            <textarea
              className="so-desc"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              onBlur={() => desc !== (task.description ?? "") && onUpdate(task.id, { description: desc || null })}
              placeholder="Añade contexto, enlaces o criterios de aceptación…"
              rows={3}
              style={{ background: "none", border: "none", width: "100%", resize: "none", marginTop: 10 }}
            />
          </div>

          <div className="so-sec">
            <div className="so-sec-head">
              <span className="section-label">Subtareas</span>
              {total > 0 && <span className="subprog mono">{done}/{total}</span>}
            </div>
            {total > 0 && <Progress value={ratio} color="var(--accent)" />}
            <div className="so-subs">
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onSubDragEnd}>
                <SortableContext items={order} strategy={verticalListSortingStrategy}>
                  {orderedSubs.map((s) => (
                    <SortableSub key={s.id} sub={s} onToggle={onToggle} onDelete={onDeleteTask} />
                  ))}
                </SortableContext>
              </DndContext>
              <div className="so-sub add">
                <span className="cbx ghost">
                  <Icon name="plus" size={13} />
                </span>
                <input
                  placeholder="Añadir subtarea…"
                  value={newSub}
                  onChange={(e) => setNewSub(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newSub.trim()) {
                      onCreateSub(task.id, newSub.trim());
                      setNewSub("");
                    }
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
