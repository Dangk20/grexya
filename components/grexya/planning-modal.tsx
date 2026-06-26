"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Icon } from "@/components/grexya/icon";
import { Check, PriorityChip } from "@/components/grexya/atoms";
import { isMeeting, isScheduledForDay, localISO, QUAD_META, type Quad } from "@/lib/grexya-helpers";
import { getMeetings } from "@/app/actions/calendar";
import { submitPlanning, skipPlanning, type PlanItem } from "@/app/actions/planning";
import { toggleTask, deleteTask, reorderTasks } from "@/app/actions/tasks";
import { getDailyHidden, hideDailyItem, unhideDailyItem } from "@/app/actions/daily";
import type { Meeting } from "@/lib/google";
import type { Project, Task } from "@/lib/types";

const QUAD_ORDER: Quad[] = ["ui", "ni", "un", "nn"];

type Draft = {
  id: number;
  title: string;
  kind: "task" | "meeting";
  eisenhower: Quad;
  top3: boolean;
  time: string;
  google: boolean; // agendar en Google (solo si está conectado)
};

function fmtDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  const s = d.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function shortDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short" });
}

/** Tarea del retro, arrastrable para fijar el orden del daily. */
function RetroTask({
  task,
  subs,
  open,
  onToggleExpand,
  onHide,
}: {
  task: Task;
  subs: Task[];
  open: boolean;
  onToggleExpand: () => void;
  onHide: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  return (
    <div
      ref={setNodeRef}
      className="retro-item"
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        ...(isDragging ? { background: "var(--hover)", borderRadius: 8, position: "relative", zIndex: 2 } : {}),
      }}
    >
      <div className="retro-row">
        <span
          {...attributes}
          {...listeners}
          title="Arrastrar para ordenar"
          style={{ cursor: "grab", color: "var(--text-3)", display: "flex", touchAction: "none" }}
        >
          <Icon name="grip" size={14} />
        </span>
        <Check done size={16} />
        <span className="retro-title">{task.title}</span>
        {subs.length > 0 && (
          <button className="retro-subbtn" onClick={onToggleExpand}>
            <Icon name={open ? "chevDown" : "chevRight"} size={13} />
            {subs.filter((s) => s.is_done).length}/{subs.length}
          </button>
        )}
        <button className="retro-hide" title="Ocultar del daily" onClick={onHide}>
          <Icon name="eyeOff" size={14} />
        </button>
      </div>
      {open &&
        subs.map((s) => (
          <div key={s.id} className="retro-sub">
            <Check done={s.is_done} size={14} />
            <span className={s.is_done ? "retro-sub-done" : ""}>{s.title}</span>
          </div>
        ))}
    </div>
  );
}

/** Bloque arrastrable del retro (Reuniones / Tareas) — se puede reordenar. */
function RetroBlock({ id, label, count, children }: { id: string; label: string; count: number; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
        ...(isDragging ? { position: "relative", zIndex: 2 } : {}),
      }}
    >
      <div className="retro-blockhead">
        <span
          {...attributes}
          {...listeners}
          title="Arrastrar el bloque"
          style={{ cursor: "grab", color: "var(--text-3)", display: "flex", touchAction: "none" }}
        >
          <Icon name="grip" size={13} />
        </span>
        <span className="retro-sec-label" style={{ margin: 0 }}>
          {label}
        </span>
        <span className="plan-retro-count mono" style={{ marginLeft: "auto" }}>
          {count}
        </span>
      </div>
      {children}
    </div>
  );
}

/** Tarea del plan de hoy, arrastrable para ordenar el daily. */
function PlanTask({
  task,
  subs,
  open,
  done,
  onToggle,
  onToggleExpand,
}: {
  task: Task;
  subs: Task[];
  open: boolean;
  done: boolean;
  onToggle: () => void;
  onToggleExpand: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  return (
    <div
      ref={setNodeRef}
      className="retro-item"
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        ...(isDragging ? { background: "var(--hover)", borderRadius: 8, position: "relative", zIndex: 2 } : {}),
      }}
    >
      <div className="retro-row">
        <span
          {...attributes}
          {...listeners}
          title="Arrastrar para ordenar"
          style={{ cursor: "grab", color: "var(--text-3)", display: "flex", touchAction: "none" }}
        >
          <Icon name="grip" size={14} />
        </span>
        <Check done={done} onClick={onToggle} size={16} />
        <PriorityChip quad={task.eisenhower} />
        <span className={`retro-title ${done ? "retro-sub-done" : ""}`}>{task.title}</span>
        {subs.length > 0 && (
          <button className="retro-subbtn" onClick={onToggleExpand}>
            <Icon name={open ? "chevDown" : "chevRight"} size={13} />
            {subs.filter((s) => s.is_done).length}/{subs.length}
          </button>
        )}
      </div>
      {open &&
        subs.map((s) => (
          <div key={s.id} className="retro-sub">
            <Check done={s.is_done} size={14} />
            <span className={s.is_done ? "retro-sub-done" : ""}>{s.title}</span>
          </div>
        ))}
    </div>
  );
}

function hm(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
}

export function PlanningModal({
  project,
  tasks,
  calendarConn,
  dayISO,
  blocking = false,
  onClose,
}: {
  project: Project;
  tasks: Task[];
  calendarConn: { connected: boolean; email: string | null };
  dayISO: string;
  blocking?: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [input, setInput] = useState("");
  const [retroOpen, setRetroOpen] = useState(true);
  const [planOpen, setPlanOpen] = useState(true);
  const [pendOpen, setPendOpen] = useState(true);
  const [pendHandled, setPendHandled] = useState<Set<string>>(new Set());
  const [gRetro, setGRetro] = useState<Meeting[]>([]);
  const [gToday, setGToday] = useState<Meeting[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const idRef = useRef(1);

  // Cerrar con Escape solo cuando no es bloqueante (apertura manual / daily)
  useEffect(() => {
    if (blocking) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [blocking, onClose]);

  // ---- Retro: último día con actividad (tareas/reuniones completadas) antes de dayISO ----
  const retro = useMemo(() => {
    const doneTop = tasks.filter((t) => !t.parent_task_id && t.is_done && t.completed_at);
    const dayOf = (t: Task) => localISO(new Date(t.completed_at!));
    const days = doneTop.map(dayOf).filter((d) => d < dayISO);
    if (!days.length) return { day: null as string | null, tasks: [] as Task[], meetings: [] as Task[] };
    const day = days.sort().at(-1)!;
    const sameDay = doneTop.filter((t) => dayOf(t) === day);
    return {
      day,
      tasks: sameDay.filter((t) => !isMeeting(t)).sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
      meetings: sameDay.filter((t) => isMeeting(t)),
    };
  }, [tasks, dayISO]);

  // Orden local del retro (para arrastrar y soltar el orden del daily)
  const retroIds = retro.tasks.map((t) => t.id);
  const retroKey = retroIds.slice().sort().join(",");
  const [retroOrder, setRetroOrder] = useState<string[]>(retroIds);
  const [retroOrderKey, setRetroOrderKey] = useState(retroKey);
  if (retroOrderKey !== retroKey) {
    setRetroOrderKey(retroKey);
    setRetroOrder(retroIds);
  }
  const orderedRetro = retroOrder
    .map((id) => retro.tasks.find((t) => t.id === id))
    .filter(Boolean) as Task[];
  const retroSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const onRetroDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const next = arrayMove(retroOrder, retroOrder.indexOf(String(active.id)), retroOrder.indexOf(String(over.id)));
    setRetroOrder(next);
    reorderTasks({ projectId: project.id, items: next.map((id, i) => ({ id, position: i })) })
      .then(() => router.refresh())
      .catch(() => {});
  };

  const toggleExpand = (id: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  // Reuniones del retro (del sistema + Google) unificadas
  const retroMeetings = useMemo(
    () => [
      ...retro.meetings.map((t) => ({ id: t.id, time: t.meeting_time || "—", title: t.title })),
      ...gRetro.map((m) => ({ id: m.id, time: m.allDay ? "Día" : hm(m.start), title: m.title })),
    ],
    [retro.meetings, gRetro],
  );

  // Ocultar ítems del retro (para no leerlos en el daily) — persistido por proyecto
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  useEffect(() => {
    let active = true;
    getDailyHidden(project.id)
      .then((ids) => active && setHidden(new Set(ids)))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [project.id]);
  const hide = (id: string) => {
    setHidden((s) => new Set(s).add(id));
    hideDailyItem(project.id, id).catch(() => {});
  };
  const unhide = (id: string) => {
    setHidden((s) => {
      const n = new Set(s);
      n.delete(id);
      return n;
    });
    unhideDailyItem(project.id, id).catch(() => {});
  };

  // Orden de los bloques del retro (Reuniones primero por defecto)
  const [blockOrder, setBlockOrder] = useState<("reuniones" | "tareas")[]>(["reuniones", "tareas"]);
  const blockSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const onBlockDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setBlockOrder((bo) => arrayMove(bo, bo.indexOf(active.id as "reuniones" | "tareas"), bo.indexOf(over.id as "reuniones" | "tareas")));
  };

  const hiddenRetro = {
    tasks: orderedRetro.filter((t) => hidden.has(t.id)),
    meetings: retroMeetings.filter((m) => hidden.has(m.id)),
  };
  const hiddenCount = hiddenRetro.tasks.length + hiddenRetro.meetings.length;

  // ---- Plan de hoy: lo que ya está agendado para dayISO (tareas + reuniones) ----
  const plan = useMemo(() => {
    const all = tasks.filter((t) => !t.parent_task_id && isScheduledForDay(t, dayISO));
    return {
      tasks: all.filter((t) => !isMeeting(t)).sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
      meetings: all.filter((t) => isMeeting(t)),
    };
  }, [tasks, dayISO]);
  const planCount = plan.tasks.length + plan.meetings.length + gToday.length;

  // Orden local del plan de hoy (para arrastrar y soltar el orden del daily)
  const planIds = plan.tasks.map((t) => t.id);
  const planKey = planIds.slice().sort().join(",");
  const [planOrder, setPlanOrder] = useState<string[]>(planIds);
  const [planOrderKey, setPlanOrderKey] = useState(planKey);
  if (planOrderKey !== planKey) {
    setPlanOrderKey(planKey);
    setPlanOrder(planIds);
  }
  const orderedPlan = planOrder
    .map((id) => plan.tasks.find((t) => t.id === id))
    .filter(Boolean) as Task[];
  const planSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const onPlanDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const next = arrayMove(planOrder, planOrder.indexOf(String(active.id)), planOrder.indexOf(String(over.id)));
    setPlanOrder(next);
    reorderTasks({ projectId: project.id, items: next.map((id, i) => ({ id, position: i })) })
      .then(() => router.refresh())
      .catch(() => {});
  };

  // Reuniones de hoy (del sistema + Google) unificadas, para el plan del día
  const planMeetings = useMemo(
    () => [
      ...plan.meetings.map((t) => ({ id: t.id, time: t.meeting_time || "—", title: t.title, done: t.is_done })),
      ...gToday.map((m) => ({ id: m.id, time: m.allDay ? "Día" : hm(m.start), title: m.title, done: m.done })),
    ],
    [plan.meetings, gToday],
  );

  // ---- Pendientes: sin terminar cuyo día objetivo ya pasó (propuesta para reorganizar) ----
  const carried = useMemo(() => {
    return tasks
      .filter((t) => {
        if (t.parent_task_id || t.is_done || pendHandled.has(t.id)) return false;
        const target = t.due_date ?? t.start_date;
        return target != null && target < dayISO;
      })
      .sort((a, b) => (a.due_date ?? a.start_date ?? "").localeCompare(b.due_date ?? b.start_date ?? ""));
  }, [tasks, dayISO, pendHandled]);

  const pendDone = async (id: string) => {
    setPendHandled((s) => new Set(s).add(id));
    await toggleTask({ taskId: id }).catch(() => {});
    router.refresh();
  };

  // Completar tareas desde el plan de hoy → quedan con completed_at = hoy,
  // así aparecen mañana en el retro "¿Qué hiciste…?". Optimista hasta el refresh.
  const [planDone, setPlanDone] = useState<Map<string, boolean>>(new Map());
  const isPlanDone = (t: Task) => (planDone.has(t.id) ? planDone.get(t.id)! : t.is_done);
  const planToggle = async (t: Task) => {
    const next = !isPlanDone(t);
    setPlanDone((m) => new Map(m).set(t.id, next));
    await toggleTask({ taskId: t.id }).catch(() => {});
    router.refresh();
  };
  const pendDelete = async (id: string) => {
    setPendHandled((s) => new Set(s).add(id));
    await deleteTask({ taskId: id }).catch(() => {});
    router.refresh();
  };

  useEffect(() => {
    if (!calendarConn.connected || !retro.day) return;
    let active = true;
    getMeetings(project.id, retro.day)
      .then((m) => active && setGRetro(m.filter((x) => x.done)))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [calendarConn.connected, retro.day, project.id]);

  // Reuniones de hoy (Google) — para repasarlas antes del daily y poder ocultarlas
  useEffect(() => {
    if (!calendarConn.connected) return;
    let active = true;
    getMeetings(project.id, dayISO)
      .then((m) => active && setGToday(m))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [calendarConn.connected, dayISO, project.id]);

  const subsOf = (id: string) => tasks.filter((t) => t.parent_task_id === id);
  const topCount = drafts.filter((d) => d.kind === "task" && d.top3).length;
  const retroCount = retro.tasks.length + retro.meetings.length + gRetro.length;

  const addDraft = (title: string) => {
    const t = title.trim();
    if (!t) return;
    setDrafts((ds) => [
      ...ds,
      { id: idRef.current++, title: t, kind: "task", eisenhower: "ni", top3: false, time: "09:00", google: false },
    ]);
  };
  const patch = (id: number, p: Partial<Draft>) =>
    setDrafts((ds) => ds.map((d) => (d.id === id ? { ...d, ...p } : d)));
  const remove = (id: number) => setDrafts((ds) => ds.filter((d) => d.id !== id));
  const toggleTop = (id: number) =>
    setDrafts((ds) =>
      ds.map((d) => {
        if (d.id !== id) return d;
        if (!d.top3 && topCount >= 3) return d; // máximo 3
        return { ...d, top3: !d.top3 };
      }),
    );

  const finish = async () => {
    setSaving(true);
    setErr(null);
    const items: PlanItem[] = drafts
      .filter((d) => d.title.trim())
      .map((d) =>
        d.kind === "meeting"
          ? {
              title: d.title,
              kind: "meeting",
              meeting_time: d.google ? null : d.time,
              google: d.google && calendarConn.connected ? { time: d.time, addMeet: true } : null,
            }
          : { title: d.title, kind: "task", eisenhower: d.eisenhower, top3: d.top3 },
      );
    const res = await submitPlanning({ projectId: project.id, dayDate: dayISO, items });
    setSaving(false);
    if (!res.ok) {
      setErr(res.error ?? "No se pudo guardar la planeación");
      return;
    }
    router.refresh();
    onClose();
  };

  const skip = async () => {
    setSaving(true);
    await skipPlanning(project.id, dayISO).catch(() => {});
    setSaving(false);
    router.refresh();
    onClose();
  };

  return (
    <div className="planning-wrap" style={{ ["--accent" as string]: project.accent ?? "#5B5BD6" }}>
      <div className="planning">
        <div className="planning-head">
          <div className="planning-kicker">
            <Icon name="target" size={16} />
            Planning time
          </div>
          <span className="planning-day">{fmtDay(dayISO)}</span>
          {!blocking && (
            <button className="icon-btn sm" onClick={onClose} title="Cerrar" style={{ marginLeft: 4 }}>
              <Icon name="x" size={17} />
            </button>
          )}
        </div>

        <div className="planning-scroll">
        {/* ---- Retro: ¿qué hiciste? ---- */}
        <div className="plan-retro">
          <button className="plan-retro-head" onClick={() => setRetroOpen((o) => !o)}>
            <Icon name={retroOpen ? "chevDown" : "chevRight"} size={16} />
            <span>
              ¿Qué hiciste {retro.day ? `el ${fmtDay(retro.day).toLowerCase()}` : "antes"}?
            </span>
            <span className="plan-retro-count mono">{retroCount}</span>
          </button>
          {retroOpen && (
            <div className="plan-retro-body">
              {retroCount === 0 && (
                <p className="faint" style={{ fontSize: 13, margin: "4px 2px" }}>
                  Sin actividad completada en días anteriores.
                </p>
              )}
              <DndContext sensors={blockSensors} collisionDetection={closestCenter} onDragEnd={onBlockDragEnd}>
                <SortableContext items={blockOrder} strategy={verticalListSortingStrategy}>
                  {blockOrder.map((b) => {
                    if (b === "reuniones") {
                      const vis = retroMeetings.filter((m) => !hidden.has(m.id));
                      if (vis.length === 0) return null;
                      return (
                        <RetroBlock key={b} id={b} label="Reuniones" count={vis.length}>
                          {vis.map((m) => (
                            <div key={m.id} className="retro-row">
                              <Check done size={16} />
                              <span className="retro-time mono">{m.time}</span>
                              <span className="retro-title">{m.title}</span>
                              <button className="retro-hide" title="Ocultar del daily" onClick={() => hide(m.id)}>
                                <Icon name="eyeOff" size={14} />
                              </button>
                            </div>
                          ))}
                        </RetroBlock>
                      );
                    }
                    const vis = orderedRetro.filter((t) => !hidden.has(t.id));
                    if (vis.length === 0) return null;
                    return (
                      <RetroBlock key={b} id={b} label="Tareas" count={vis.length}>
                        <DndContext sensors={retroSensors} collisionDetection={closestCenter} onDragEnd={onRetroDragEnd}>
                          <SortableContext items={vis.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                            {vis.map((t) => (
                              <RetroTask
                                key={t.id}
                                task={t}
                                subs={subsOf(t.id)}
                                open={expanded.has(t.id)}
                                onToggleExpand={() => toggleExpand(t.id)}
                                onHide={() => hide(t.id)}
                              />
                            ))}
                          </SortableContext>
                        </DndContext>
                      </RetroBlock>
                    );
                  })}
                </SortableContext>
              </DndContext>

              {hiddenCount > 0 && (
                <div className="retro-hidden">
                  <div className="retro-sec-label" style={{ marginTop: 10 }}>
                    Ocultas del daily · {hiddenCount}
                  </div>
                  {hiddenRetro.tasks.map((t) => (
                    <div key={t.id} className="retro-row hidden-row">
                      <span className="retro-title">{t.title}</span>
                      <button className="retro-hide" title="Volver a mostrar" onClick={() => unhide(t.id)}>
                        <Icon name="eye" size={14} />
                      </button>
                    </div>
                  ))}
                  {hiddenRetro.meetings.map((m) => (
                    <div key={m.id} className="retro-row hidden-row">
                      <span className="retro-time mono">{m.time}</span>
                      <span className="retro-title">{m.title}</span>
                      <button className="retro-hide" title="Volver a mostrar" onClick={() => unhide(m.id)}>
                        <Icon name="eye" size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ---- Pendientes de días anteriores (propuesta) ---- */}
        {carried.length > 0 && (
          <div className="plan-retro plan-pend">
            <button className="plan-retro-head" onClick={() => setPendOpen((o) => !o)}>
              <Icon name={pendOpen ? "chevDown" : "chevRight"} size={16} />
              <span>Vienen de días anteriores · sin terminar</span>
              <span className="plan-retro-count mono">{carried.length}</span>
            </button>
            {pendOpen && (
              <div className="plan-retro-body">
                <p className="faint" style={{ fontSize: 12.5, margin: "2px 2px 8px" }}>
                  Propuesta: déjalas (siguen en hoy), márcalas hechas o elimínalas.
                </p>
                {carried.map((t) => (
                  <div key={t.id} className="pend-row">
                    <Check done={false} onClick={() => pendDone(t.id)} size={16} />
                    <PriorityChip quad={t.eisenhower} />
                    <span className="retro-title">{t.title}</span>
                    <span className="pend-tag mono">↩ {shortDay(t.due_date ?? t.start_date!)}</span>
                    <button className="icon-btn sm" title="Eliminar" onClick={() => pendDelete(t.id)} style={{ color: "#E5484D" }}>
                      <Icon name="x" size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ---- Plan de hoy: lo que ya diligenciaste ---- */}
        {planCount > 0 && (
          <div className="plan-retro">
            <button className="plan-retro-head" onClick={() => setPlanOpen((o) => !o)}>
              <Icon name={planOpen ? "chevDown" : "chevRight"} size={16} />
              <span>Plan de {fmtDay(dayISO).toLowerCase()}</span>
              <span className="plan-retro-count mono">{planCount}</span>
            </button>
            {planOpen && (
              <div className="plan-retro-body">
                <DndContext sensors={planSensors} collisionDetection={closestCenter} onDragEnd={onPlanDragEnd}>
                  <SortableContext items={orderedPlan.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                    {orderedPlan.map((t) => (
                      <PlanTask
                        key={t.id}
                        task={t}
                        subs={subsOf(t.id)}
                        open={expanded.has(t.id)}
                        done={isPlanDone(t)}
                        onToggle={() => planToggle(t)}
                        onToggleExpand={() => toggleExpand(t.id)}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
                {planMeetings.some((m) => !hidden.has(m.id)) && <div className="retro-sec-label">Reuniones</div>}
                {planMeetings
                  .filter((m) => !hidden.has(m.id))
                  .map((m) => (
                    <div key={m.id} className="retro-row">
                      <Check done={m.done} size={16} />
                      <span className="retro-time mono">{m.time}</span>
                      <span className={`retro-title ${m.done ? "retro-sub-done" : ""}`}>{m.title}</span>
                      <button className="retro-hide" title="Ocultar del daily" onClick={() => hide(m.id)}>
                        <Icon name="eyeOff" size={14} />
                      </button>
                    </div>
                  ))}
                {planMeetings.some((m) => hidden.has(m.id)) && (
                  <div className="retro-hidden">
                    <div className="retro-sec-label" style={{ marginTop: 10 }}>
                      Ocultas del daily · {planMeetings.filter((m) => hidden.has(m.id)).length}
                    </div>
                    {planMeetings
                      .filter((m) => hidden.has(m.id))
                      .map((m) => (
                        <div key={m.id} className="retro-row hidden-row">
                          <span className="retro-time mono">{m.time}</span>
                          <span className="retro-title">{m.title}</span>
                          <button className="retro-hide" title="Volver a mostrar" onClick={() => unhide(m.id)}>
                            <Icon name="eye" size={14} />
                          </button>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ---- ¿Qué harás hoy? ---- */}
        <div className="plan-today">
          <div className="plan-steps">
            <span className={`plan-step ${step === 1 ? "on" : ""}`}>1 · Escribe</span>
            <span className="plan-step-sep" />
            <span className={`plan-step ${step === 2 ? "on" : ""}`}>2 · Prioriza</span>
          </div>

          {step === 1 ? (
            <>
              <h3 className="plan-h">¿Qué harás hoy? Escríbelo todo.</h3>
              <div className="plan-input">
                <Icon name="plus" size={16} />
                <input
                  autoFocus
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Una tarea o reunión… (Enter para añadir)"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && input.trim()) {
                      addDraft(input);
                      setInput("");
                    }
                  }}
                />
              </div>
              <div className="plan-list">
                {drafts.map((d) => (
                  <div key={d.id} className="plan-draft">
                    <span className="plan-draft-title">{d.title}</span>
                    <button className="icon-btn sm" onClick={() => remove(d.id)} title="Quitar">
                      <Icon name="x" size={14} />
                    </button>
                  </div>
                ))}
                {drafts.length === 0 && (
                  <p className="faint" style={{ fontSize: 13 }}>
                    Vuelca aquí todo lo del día sin pensar en el orden. Luego lo priorizas.
                  </p>
                )}
              </div>
            </>
          ) : (
            <>
              <h3 className="plan-h">Asígnale prioridad a cada cosa.</h3>
              <div className="plan-list">
                {drafts.map((d) => (
                  <div key={d.id} className="plan-prio">
                    <div className="plan-prio-top">
                      <span className="plan-draft-title">{d.title}</span>
                      <button
                        className={`plan-kindbtn ${d.kind === "meeting" ? "on" : ""}`}
                        onClick={() => patch(d.id, { kind: d.kind === "meeting" ? "task" : "meeting" })}
                        title={d.kind === "meeting" ? "Es una reunión" : "Marcar como reunión"}
                      >
                        <Icon name="users" size={14} />
                        Reunión
                      </button>
                      <button className="icon-btn sm" onClick={() => remove(d.id)} title="Quitar">
                        <Icon name="x" size={14} />
                      </button>
                    </div>
                    {d.kind === "task" ? (
                      <div className="plan-prio-ctrls">
                        <div className="plan-quads">
                          {QUAD_ORDER.map((q) => (
                            <button
                              key={q}
                              className={`plan-quad ${d.eisenhower === q ? "on" : ""}`}
                              onClick={() => patch(d.id, { eisenhower: q })}
                              title={QUAD_META[q].label}
                            >
                              <PriorityChip quad={q} />
                            </button>
                          ))}
                        </div>
                        <button
                          className="plan-starbtn"
                          onClick={() => toggleTop(d.id)}
                          disabled={!d.top3 && topCount >= 3}
                          title={d.top3 ? "Quitar del Top 3" : "Marcar Top 3 del día"}
                          style={{ color: d.top3 ? "#E08E1B" : "var(--text-3)" }}
                        >
                          <Icon name="star" size={16} strokeWidth={d.top3 ? 2.4 : 1.9} />
                          Top 3
                        </button>
                      </div>
                    ) : (
                      <div className="plan-prio-ctrls">
                        <div className="plan-meet-time">
                          <Icon name="clock" size={14} className="faint" />
                          <input
                            type="time"
                            className="field"
                            style={{ width: 120 }}
                            value={d.time}
                            onChange={(e) => patch(d.id, { time: e.target.value })}
                          />
                        </div>
                        {calendarConn.connected && (
                          <button
                            className={`plan-gbtn ${d.google ? "on" : ""}`}
                            onClick={() => patch(d.id, { google: !d.google })}
                            title="Agendar en Google Calendar (con Meet)"
                          >
                            <Icon name="calendar" size={14} />
                            {d.google ? "Se agenda en Google" : "Solo en el sistema"}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
        </div>

        {err && (
          <div className="chip tone-amber" style={{ height: "auto", padding: "7px 11px", gap: 7, margin: "0 24px" }}>
            <Icon name="warn" size={14} />
            {err}
          </div>
        )}

        <div className="planning-foot">
          {blocking ? (
            <button className="btn btn-ghost" onClick={skip} disabled={saving}>
              Hoy no planifico
            </button>
          ) : (
            <button className="btn btn-ghost" onClick={onClose} disabled={saving}>
              Cerrar
            </button>
          )}
          <div style={{ display: "flex", gap: 10 }}>
            {step === 2 && (
              <button className="btn btn-soft" onClick={() => setStep(1)} disabled={saving}>
                <Icon name="chevLeft" size={15} />
                Volver
              </button>
            )}
            {step === 1 ? (
              <button
                className="btn btn-accent"
                onClick={() => setStep(2)}
                disabled={drafts.length === 0}
              >
                Siguiente
                <Icon name="chevRight" size={15} />
              </button>
            ) : (
              <button className="btn btn-accent" onClick={finish} disabled={saving}>
                {saving ? "Guardando…" : "Empezar el día"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
