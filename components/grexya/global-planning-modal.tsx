"use client";

/**
 * Planear (global): modal para volcar tareas a lo Notion — primero escribes
 * absolutamente todo (Enter, Enter, Enter…), luego priorizas y asignas
 * proyecto a cada una, y al final se crean todas de un golpe.
 * La prioridad es la unificada del modelo de trabajo: cuadrante Eisenhower.
 */
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/grexya/icon";
import { ProjectIcon } from "@/components/grexya/project-icon";
import { QUAD_META, type Quad } from "@/lib/grexya-helpers";
import type { Project } from "@/lib/types";

type DraftRow = {
  key: number;
  title: string;
  projectId: string | null;
  quad: Quad | null;
  /** entra al Top 3 de hoy */
  top: boolean;
  start: string;
  due: string;
};

const hoy = () => new Date().toISOString().slice(0, 10);

const QUADS: Quad[] = ["ui", "ni", "un", "nn"];

export function GlobalPlanningModal({
  projects,
  project,
  onClose,
  onCreate,
}: {
  projects: Project[];
  /** Si se planea desde un proyecto: se fija por defecto y se oculta la columna. */
  project?: Project;
  onClose: () => void;
  onCreate: (
    rows: {
      projectId: string;
      title: string;
      eisenhower: Quad | null;
      start_date: string | null;
      due_date: string | null;
      top: boolean;
    }[],
  ) => Promise<void>;
}) {
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  // los menús se posicionan fixed a partir del rect del botón: así ningún
  // contenedor con scroll los recorta
  const [menu, setMenu] = useState<
    { kind: "quad" | "proj"; key: number; x: number; y: number } | null
  >(null);
  const openMenu = (kind: "quad" | "proj", key: number, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setMenu((m) => (m?.kind === kind && m.key === key ? null : { kind, key, x: r.left, y: r.bottom + 5 }));
  };
  const keyRef = useRef(1);
  const captureRef = useRef<HTMLInputElement>(null);
  const projectById = (id: string | null) => projects.find((p) => p.id === id) ?? null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [menu]);

  const addDraft = () => {
    const t = draft.trim();
    if (!t) return;
    setRows((rs) => [
      ...rs,
      {
        key: keyRef.current++,
        title: t,
        projectId: project?.id ?? null,
        quad: null,
        top: false,
        start: "",
        due: "",
      },
    ]);
    setDraft("");
    captureRef.current?.focus();
  };

  const patchRow = (key: number, patch: Partial<DraftRow>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const ready = rows.length > 0 && rows.every((r) => r.projectId && r.title.trim());
  const sinProyecto = rows.filter((r) => !r.projectId).length;

  const save = async () => {
    if (!ready || saving) return;
    setSaving(true);
    try {
      await onCreate(
        rows.map((r) => ({
          projectId: r.projectId!,
          title: r.title.trim(),
          eisenhower: r.quad,
          start_date: r.start || null,
          due_date: r.due || null,
          top: r.top,
        })),
      );
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="plan-scrim" onClick={onClose}>
      <div
        className={`plan-modal card ${project ? "plan-modal-proj" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="plan-head">
          <div>
            <h2>{project ? `Planear · ${project.name}` : "Planear"}</h2>
            <p className="muted">
              {project
                ? "Vuelca todo lo de este proyecto. Después priorizas."
                : "Vuelca todo lo que tengas en la cabeza. Después priorizas y asignas."}
            </p>
          </div>
          <button className="icon-btn" onClick={onClose}>
            <Icon name="x" size={17} />
          </button>
        </div>

        <input
          ref={captureRef}
          className="plan-capture"
          autoFocus
          placeholder="Escribe una tarea y presiona Enter…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addDraft()}
        />

        {rows.length > 0 && (
          <div className="plan-table">
            <div className="plan-row plan-row-head">
              <span>Tarea</span>
              <span title="Top 3 del día">Top</span>
              <span>Prioridad</span>
              {!project && <span>Proyecto</span>}
              <span>Inicio</span>
              <span>Fin</span>
              <span />
            </div>
            {rows.map((r) => (
              <div key={r.key} className={`plan-row ${!r.projectId ? "plan-row-pending" : ""}`}>
                <textarea
                  className="plan-title"
                  rows={1}
                  value={r.title}
                  ref={(el) => {
                    if (el) {
                      el.style.height = "auto";
                      el.style.height = `${el.scrollHeight}px`;
                    }
                  }}
                  onChange={(e) => {
                    e.target.style.height = "auto";
                    e.target.style.height = `${e.target.scrollHeight}px`;
                    patchRow(r.key, { title: e.target.value });
                  }}
                />
                <button
                  className={`plan-star ${r.top ? "on" : ""}`}
                  title={r.top ? "Quitar del Top 3 de hoy" : "Marcar en el Top 3 de hoy"}
                  onClick={() => patchRow(r.key, { top: !r.top })}
                >
                  <Icon name="star" size={16} />
                </button>
                <button
                  className={`chip ${r.quad ? `tone-${QUAD_META[r.quad].tone}` : "tone-gray"}`}
                  title="Prioridad (modelo Eisenhower)"
                  onClick={(e) => {
                    e.stopPropagation();
                    openMenu("quad", r.key, e.currentTarget);
                  }}
                >
                  <span className="chip-dot" />
                  {r.quad ? QUAD_META[r.quad].short : "prioridad"}
                  <Icon name="chevDown" size={12} />
                </button>
                {!project && (
                <button
                  className="plan-select"
                  onClick={(e) => {
                    e.stopPropagation();
                    openMenu("proj", r.key, e.currentTarget);
                  }}
                >
                  {r.projectId ? (
                    <>
                      <span className="plan-proj-ico">
                        <ProjectIcon project={projectById(r.projectId)!} />
                      </span>
                      <span className="plan-select-label">{projectById(r.projectId)!.name}</span>
                    </>
                  ) : (
                    <span className="plan-select-label muted">Asignar proyecto…</span>
                  )}
                  <Icon name="chevDown" size={12} />
                </button>
                )}
                <input
                  type="date"
                  className="plan-date"
                  value={r.start}
                  onChange={(e) => patchRow(r.key, { start: e.target.value })}
                />
                <input
                  type="date"
                  className="plan-date"
                  value={r.due}
                  onChange={(e) => patchRow(r.key, { due: e.target.value })}
                />
                <button
                  className="icon-btn sm"
                  title="Quitar"
                  onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                >
                  <Icon name="x" size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="plan-foot">
          <span className="muted">
            {rows.length === 0
              ? "Nada aún — escribe arriba y presiona Enter."
              : !project && sinProyecto > 0
                ? `${rows.length} tareas · falta asignar proyecto a ${sinProyecto}`
                : `${rows.length} tareas listas`}
          </span>
          <button className="btn btn-accent" disabled={!ready || saving} onClick={save}>
            {saving ? "Creando…" : `Crear ${rows.length || ""} tareas`}
          </button>
        </div>
      </div>

      {menu && (
        <div
          className="plan-pop"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {menu.kind === "quad"
            ? QUADS.map((q) => {
                const row = rows.find((x) => x.key === menu.key);
                return (
                  <button
                    key={q}
                    onClick={() => {
                      patchRow(menu.key, { quad: q });
                      setMenu(null);
                    }}
                  >
                    <span className={`chip tone-${QUAD_META[q].tone}`}>
                      <span className="chip-dot" />
                      {QUAD_META[q].short}
                    </span>
                    <span className="plan-pop-sub">{QUAD_META[q].label}</span>
                    {row?.quad === q && <Icon name="check" size={14} style={{ marginLeft: "auto" }} />}
                  </button>
                );
              })
            : projects.map((p) => {
                const row = rows.find((x) => x.key === menu.key);
                return (
                  <button
                    key={p.id}
                    onClick={() => {
                      patchRow(menu.key, { projectId: p.id });
                      setMenu(null);
                    }}
                  >
                    <span className="plan-proj-ico">
                      <ProjectIcon project={p} />
                    </span>
                    {p.name}
                    {row?.projectId === p.id && (
                      <Icon name="check" size={14} style={{ marginLeft: "auto" }} />
                    )}
                  </button>
                );
              })}
        </div>
      )}
    </div>
  );
}
