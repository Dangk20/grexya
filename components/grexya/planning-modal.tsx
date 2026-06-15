"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/grexya/icon";
import { Check, PriorityChip } from "@/components/grexya/atoms";
import { isMeeting, localISO, QUAD_META, type Quad } from "@/lib/grexya-helpers";
import { getMeetings } from "@/app/actions/calendar";
import { submitPlanning, skipPlanning, type PlanItem } from "@/app/actions/planning";
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

function hm(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
}

export function PlanningModal({
  project,
  tasks,
  calendarConn,
  dayISO,
  onClose,
}: {
  project: Project;
  tasks: Task[];
  calendarConn: { connected: boolean; email: string | null };
  dayISO: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [input, setInput] = useState("");
  const [retroOpen, setRetroOpen] = useState(true);
  const [gRetro, setGRetro] = useState<Meeting[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const idRef = useRef(1);

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
      tasks: sameDay.filter((t) => !isMeeting(t)),
      meetings: sameDay.filter((t) => isMeeting(t)),
    };
  }, [tasks, dayISO]);

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
        </div>

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
              {retro.tasks.map((t) => {
                const subs = subsOf(t.id);
                const open = expanded.has(t.id);
                return (
                  <div key={t.id} className="retro-item">
                    <div className="retro-row">
                      <Check done size={16} />
                      <span className="retro-title">{t.title}</span>
                      {subs.length > 0 && (
                        <button
                          className="retro-subbtn"
                          onClick={() =>
                            setExpanded((s) => {
                              const n = new Set(s);
                              if (n.has(t.id)) n.delete(t.id);
                              else n.add(t.id);
                              return n;
                            })
                          }
                        >
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
              })}
              {(retro.meetings.length > 0 || gRetro.length > 0) && (
                <div className="retro-sec-label">Reuniones</div>
              )}
              {retro.meetings.map((t) => (
                <div key={t.id} className="retro-row">
                  <Check done size={16} />
                  <span className="retro-time mono">{t.meeting_time || "—"}</span>
                  <span className="retro-title">{t.title}</span>
                </div>
              ))}
              {gRetro.map((m) => (
                <div key={m.id} className="retro-row">
                  <Check done size={16} />
                  <span className="retro-time mono">{m.allDay ? "Día" : hm(m.start)}</span>
                  <span className="retro-title">{m.title}</span>
                  <Icon name="calendar" size={13} className="faint" />
                </div>
              ))}
            </div>
          )}
        </div>

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

        {err && (
          <div className="chip tone-amber" style={{ height: "auto", padding: "7px 11px", gap: 7, margin: "0 24px" }}>
            <Icon name="warn" size={14} />
            {err}
          </div>
        )}

        <div className="planning-foot">
          <button className="btn btn-ghost" onClick={skip} disabled={saving}>
            Hoy no planifico
          </button>
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
