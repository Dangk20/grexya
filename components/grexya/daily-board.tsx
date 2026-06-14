"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/grexya/icon";
import { Avatar, Check, PriorityChip, SubCounter } from "@/components/grexya/atoms";
import { isMeeting, localISO, quadOf, QUAD_META, type Quad } from "@/lib/grexya-helpers";
import { getMeetings, createMeeting } from "@/app/actions/calendar";
import type { Meeting } from "@/lib/google";
import type { Project, Task } from "@/lib/types";
import type { WorldHandlers } from "@/components/grexya/project-world";

function hm(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
}

const QUAD_ORDER: Quad[] = ["ui", "ni", "un", "nn"];
const DP_MONTHS = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
const DP_WD = ["L", "M", "X", "J", "V", "S", "D"];

function startOfDay(dt: Date) {
  const x = new Date(dt);
  x.setHours(0, 0, 0, 0);
  return x;
}
function diffDays(a: Date, b: Date) {
  return Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / 86400000);
}

function DatePicker({
  selected,
  onPick,
  onClose,
}: {
  selected: Date;
  onPick: (off: number) => void;
  onClose: () => void;
}) {
  const today = startOfDay(new Date());
  const [view, setView] = useState(new Date(selected.getFullYear(), selected.getMonth(), 1));
  const y = view.getFullYear();
  const m = view.getMonth();
  const lead = (new Date(y, m, 1).getDay() + 6) % 7;
  const days = new Date(y, m + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let dd = 1; dd <= days; dd++) cells.push(new Date(y, m, dd));
  const selKey = startOfDay(selected).getTime();
  const todayKey = today.getTime();
  return (
    <>
      <div className="pop-scrim" onClick={onClose} />
      <div className="datepop">
        <div className="dp-head">
          <button className="icon-btn sm" onClick={() => setView(new Date(y, m - 1, 1))}>
            <Icon name="chevLeft" size={16} />
          </button>
          <span className="dp-title">
            {DP_MONTHS[m]} {y}
          </span>
          <button className="icon-btn sm" onClick={() => setView(new Date(y, m + 1, 1))}>
            <Icon name="chevRight" size={16} />
          </button>
        </div>
        <div className="dp-grid">
          {DP_WD.map((w, i) => (
            <span key={"h" + i} className="dp-wdh">
              {w}
            </span>
          ))}
        </div>
        <div className="dp-grid">
          {cells.map((c, i) =>
            c ? (
              <button
                key={i}
                className={`dp-day ${c.getTime() === selKey ? "sel" : ""} ${c.getTime() === todayKey ? "today" : ""}`}
                onClick={() => onPick(diffDays(c, today))}
              >
                {c.getDate()}
              </button>
            ) : (
              <span key={i} className="dp-blank" />
            ),
          )}
        </div>
        <div className="dp-foot">
          <button className="btn btn-soft" onClick={() => onPick(0)}>
            <Icon name="target" size={14} />
            Volver a hoy
          </button>
        </div>
      </div>
    </>
  );
}

function StarBtn({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={on ? "Quitar del Top 3" : "Marcar como Top 3 del día"}
      style={{
        display: "inline-flex",
        color: on ? "#E08E1B" : "var(--text-3)",
        padding: 2,
      }}
    >
      <Icon name="star" size={15} strokeWidth={on ? 2.4 : 1.9} />
    </button>
  );
}

function DailyTask({
  task,
  all,
  topOn,
  onOpen,
  onToggle,
  onStar,
}: {
  task: Task;
  all: Task[];
  topOn: boolean;
  onOpen: (id: string) => void;
  onToggle: (id: string) => void;
  onStar: () => void;
}) {
  const isDone = task.is_done;
  return (
    <div className={`dtask ${isDone ? "done" : ""}`} onClick={() => onOpen(task.id)}>
      <Check done={isDone} onClick={() => onToggle(task.id)} size={17} />
      <span className="dtask-title">{task.title}</span>
      <SubCounter task={task} all={all} />
      <StarBtn on={topOn} onClick={onStar} />
      <Avatar id={task.assignee_id} size={22} />
    </div>
  );
}

function QuadAdd({ onAdd }: { onAdd: (title: string) => void }) {
  const [val, setVal] = useState("");
  return (
    <div className="quad-add" style={{ cursor: "text" }}>
      <Icon name="plus" size={14} />
      <input
        value={val}
        onChange={(e) => setVal(e.target.value)}
        placeholder="Añadir"
        style={{ background: "none", border: "none", outline: "none", color: "inherit", font: "inherit", flex: 1 }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && val.trim()) {
            onAdd(val.trim());
            setVal("");
          }
        }}
      />
    </div>
  );
}

export function DailyBoard({
  project,
  tasks,
  calendarConn,
  h,
}: {
  project: Project;
  tasks: Task[];
  calendarConn: { connected: boolean; email: string | null };
  h: WorldHandlers;
}) {
  const [offset, setOffset] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [topMsg, setTopMsg] = useState<string | null>(null);
  const [gmeetings, setGmeetings] = useState<Meeting[]>([]);
  const [meetFormOpen, setMeetFormOpen] = useState(false);
  const d = new Date();
  d.setDate(d.getDate() + offset);
  let dlabel = d.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });
  dlabel = dlabel.charAt(0).toUpperCase() + dlabel.slice(1);
  const pill = offset === 0 ? "Hoy" : offset === 1 ? "Mañana" : offset === -1 ? "Ayer" : "";
  const dayISO = localISO(d);

  const refetchMeetings = () => {
    if (calendarConn.connected) getMeetings(project.id, dayISO).then(setGmeetings).catch(() => {});
  };
  useEffect(() => {
    if (!calendarConn.connected) return;
    let active = true;
    getMeetings(project.id, dayISO)
      .then((m) => active && setGmeetings(m))
      .catch(() => {});
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendarConn.connected, project.id, dayISO]);

  const open = tasks.filter((t) => !t.parent_task_id && !t.is_done);
  const meetings = open
    .filter((t) => isMeeting(t))
    .sort((a, b) => (a.meeting_time ?? "").localeCompare(b.meeting_time ?? ""));
  const board = open.filter((t) => !isMeeting(t));

  // Top 3 = etiqueta explícita, del día seleccionado
  const isTopForDay = (t: Task) => t.is_top3 && t.day_date === dayISO;
  const top3 = board.filter(isTopForDay).sort((a, b) => (a.top_rank ?? 9) - (b.top_rank ?? 9));

  const star = async (t: Task) => {
    const willOn = !isTopForDay(t);
    setTopMsg(null);
    const res = await h.onSetTop3(t.id, dayISO, willOn);
    if (res && !res.ok && res.error) setTopMsg(res.error);
  };

  return (
    <div className="daily-board">
      <div className="daily-top">
        <div className="daily-intro">
          <Icon name="target" size={16} />
          <span>Enfoca el día, no la lista infinita</span>
        </div>
        <div className="daynav">
          <button className="icon-btn btn-line" style={{ width: 32 }} onClick={() => setOffset((o) => o - 1)}>
            <Icon name="chevLeft" size={17} />
          </button>
          <div className="daynav-cal">
            <button className="daynav-date btn-line" onClick={() => setPickerOpen((o) => !o)}>
              <Icon name="calendar" size={15} />
              <b>{dlabel}</b>
              {pill && <span className="daynav-pill">{pill}</span>}
            </button>
            {pickerOpen && (
              <DatePicker
                selected={d}
                onPick={(off) => {
                  setOffset(off);
                  setPickerOpen(false);
                }}
                onClose={() => setPickerOpen(false)}
              />
            )}
          </div>
          <button className="icon-btn btn-line" style={{ width: 32 }} onClick={() => setOffset((o) => o + 1)}>
            <Icon name="chevRight" size={17} />
          </button>
        </div>
      </div>

      <div className="top3">
        <div className="top3-label">
          <Icon name="star" size={16} />
          <span>Top 3 del día</span>
          <span className="faint" style={{ fontWeight: 500 }}>· máximo 3</span>
        </div>
        {topMsg && (
          <div
            className="chip tone-amber"
            style={{ height: "auto", padding: "7px 11px", marginBottom: 11, gap: 7 }}
          >
            <Icon name="warn" size={14} />
            {topMsg}
          </div>
        )}
        {top3.length > 0 ? (
          <div className="top3-cards">
            {top3.map((t, i) => (
              <div key={t.id} className="top3-card" onClick={() => h.onOpenTask(t.id)}>
                <span className="top3-num mono">{t.top_rank || i + 1}</span>
                <div className="top3-body">
                  <div className="top3-top">
                    <Check done={t.is_done} onClick={() => h.onToggleTask(t.id)} size={18} />
                    <span className={`top3-title ${t.is_done ? "done" : ""}`}>{t.title}</span>
                  </div>
                  <div className="top3-meta">
                    <PriorityChip quad={t.eisenhower} />
                    <SubCounter task={t} all={tasks} />
                    <StarBtn on onClick={() => star(t)} />
                    <Avatar id={t.assignee_id} size={22} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="faint" style={{ fontSize: 13 }}>
            Marca con ⭐ hasta 3 tareas de hoy como tu Top 3 — los focos del día.
          </p>
        )}
      </div>

      <div className="daily-matrix">
        {QUAD_ORDER.map((qid) => {
          const q = QUAD_META[qid];
          const list = board.filter((t) => quadOf(t) === qid);
          return (
            <div key={qid} className={`quad tone-${q.tone}`} style={{ gridArea: qid }}>
              <div className="quad-head">
                <span className="quad-icon">
                  <Icon name={q.icon} size={15} />
                </span>
                <div className="quad-titles">
                  <span className="quad-title">{q.label}</span>
                  <span className="quad-sub">{q.sub}</span>
                </div>
                <span className="quad-count mono">{list.length}</span>
              </div>
              <div className="quad-tasks">
                {list.map((t) => (
                  <DailyTask
                    key={t.id}
                    task={t}
                    all={tasks}
                    topOn={isTopForDay(t)}
                    onOpen={h.onOpenTask}
                    onToggle={h.onToggleTask}
                    onStar={() => star(t)}
                  />
                ))}
                {list.length === 0 && <div className="quad-empty">Vacío</div>}
                <QuadAdd
                  onAdd={(title) =>
                    h.onCreateTask({ projectId: project.id, title, dayDate: dayISO, eisenhower: qid })
                  }
                />
              </div>
            </div>
          );
        })}
        <div className="quad meet tone-violet" style={{ gridArea: "meet" }}>
          <div className="quad-head">
            <span className="quad-icon">
              <Icon name="users" size={15} />
            </span>
            <div className="quad-titles">
              <span className="quad-title">Reuniones</span>
              <span className="quad-sub">
                {calendarConn.connected ? "Google Calendar" : "Bloques de hoy"}
              </span>
            </div>
            <span className="quad-count mono">{gmeetings.length + meetings.length}</span>
          </div>
          <div className="quad-tasks">
            {calendarConn.connected &&
              gmeetings.map((m) => (
                <div
                  key={m.id}
                  className="meet-item"
                  onClick={() => m.htmlLink && window.open(m.htmlLink, "_blank")}
                >
                  <span className="meet-time mono">{m.allDay ? "Día" : hm(m.start)}</span>
                  <span className="meet-title">{m.title}</span>
                  {m.hangoutLink && (
                    <button
                      title="Unirse por Google Meet"
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(m.hangoutLink!, "_blank");
                      }}
                      style={{ display: "flex", color: "#2FA363" }}
                    >
                      <Icon name="users" size={14} />
                    </button>
                  )}
                </div>
              ))}
            {meetings.map((t) => (
              <div key={t.id} className="meet-item" onClick={() => h.onOpenTask(t.id)}>
                <span className="meet-time mono">{t.meeting_time || "—"}</span>
                <span className="meet-title">{t.title}</span>
                <Avatar id={t.assignee_id} size={20} />
              </div>
            ))}
            {gmeetings.length + meetings.length === 0 && (
              <div className="quad-empty">Sin reuniones</div>
            )}
            {calendarConn.connected ? (
              <button className="quad-add" onClick={() => setMeetFormOpen(true)}>
                <Icon name="plus" size={14} />
                Nueva reunión
              </button>
            ) : (
              <>
                <QuadAdd
                  onAdd={(title) =>
                    h.onCreateTask({ projectId: project.id, title, dayDate: dayISO, eisenhower: "reunion" })
                  }
                />
                <a
                  className="quad-add"
                  href={`/api/google/connect?projectId=${project.id}`}
                  style={{ color: "color-mix(in oklab, var(--accent) 62%, var(--text))" }}
                >
                  <Icon name="calendar" size={14} />
                  Conectar Google Calendar
                </a>
              </>
            )}
          </div>
        </div>
      </div>

      {meetFormOpen && (
        <NewMeetingModal
          accent={project.accent ?? "#5B5BD6"}
          dayLabel={dlabel}
          onClose={() => setMeetFormOpen(false)}
          onCreate={async (data) => {
            const res = await createMeeting(project.id, { ...data, dateISO: dayISO });
            if (res.ok) {
              setMeetFormOpen(false);
              refetchMeetings();
            }
            return res;
          }}
        />
      )}
    </div>
  );
}

function NewMeetingModal({
  accent,
  dayLabel,
  onClose,
  onCreate,
}: {
  accent: string;
  dayLabel: string;
  onClose: () => void;
  onCreate: (data: {
    title: string;
    startTime: string;
    endTime: string;
    attendees: string[];
    addMeet: boolean;
  }) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [title, setTitle] = useState("");
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("09:30");
  const [attendees, setAttendees] = useState("");
  const [meet, setMeet] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!title.trim()) return;
    setSaving(true);
    setErr(null);
    const res = await onCreate({
      title: title.trim(),
      startTime: start,
      endTime: end,
      attendees: attendees.split(",").map((s) => s.trim()).filter(Boolean),
      addMeet: meet,
    });
    setSaving(false);
    if (!res.ok) setErr(res.error ?? "No se pudo crear");
  };

  return (
    <div className="modal-wrap" style={{ ["--accent" as string]: accent }}>
      <div className="modal-scrim" onClick={onClose} />
      <div className="modal" style={{ maxWidth: 440 }}>
        <div className="modal-head">
          <span className="section-label">Nueva reunión · {dayLabel}</span>
          <button className="icon-btn sm" onClick={onClose}>
            <Icon name="x" size={17} />
          </button>
        </div>

        <input
          className="np-name"
          style={{ fontSize: 18, marginBottom: 18 }}
          placeholder="Título de la reunión"
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <div className="np-field">
          <span className="np-label">Hora</span>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input type="time" className="field" style={{ width: 130 }} value={start} onChange={(e) => setStart(e.target.value)} />
            <span className="muted">a</span>
            <input type="time" className="field" style={{ width: 130 }} value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>

        <div className="np-field">
          <span className="np-label">Invitados (correos, separados por coma)</span>
          <input
            className="field"
            style={{ width: "100%" }}
            placeholder="ana@empresa.com, juan@gmail.com"
            value={attendees}
            onChange={(e) => setAttendees(e.target.value)}
          />
        </div>

        <button
          className={`tool-row ${meet ? "on" : ""}`}
          onClick={() => setMeet((v) => !v)}
          style={{ marginBottom: 6 }}
        >
          <span className="tool-ico">
            <Icon name="users" size={17} />
          </span>
          <span className="tool-meta">
            <span className="tool-name">Añadir Google Meet</span>
            <span className="tool-desc">Genera un enlace de videollamada automático</span>
          </span>
          <span className={`tool-check ${meet ? "on" : ""}`}>
            {meet && <Icon name="check" size={13} strokeWidth={3} />}
          </span>
        </button>

        {err && <p style={{ color: "#E5484D", fontSize: 12.5, marginTop: 6 }}>{err}</p>}

        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-accent" onClick={submit} disabled={saving || !title.trim()}>
            {saving ? "Creando…" : "Crear reunión"}
          </button>
        </div>
      </div>
    </div>
  );
}
