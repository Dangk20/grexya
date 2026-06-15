"use client";

import { useEffect, useState, useTransition } from "react";
import { Icon } from "@/components/grexya/icon";
import { IconField, IconPreview } from "@/components/grexya/icon-field";
import type { ModuleId, Project } from "@/lib/types";

const ACCENTS = ["#5B5BD6","#7C66DC","#E93D82","#0E9888","#B45718","#3E63DD","#2FA363","#E5484D"];
const TOOLS: { id: ModuleId; label: string; icon: string; desc: string }[] = [
  { id: "hoy", label: "¿Qué haré hoy?", icon: "target", desc: "Enfoque del día con matriz de prioridades" },
  { id: "kanban", label: "Tablero", icon: "columns", desc: "Tareas en columnas por estado" },
  { id: "lista", label: "Tareas", icon: "list", desc: "Lista simple y ordenable" },
  { id: "notas", label: "Notas", icon: "fileText", desc: "Documentos del proyecto" },
];

export function ProjectSettingsModal({
  project,
  onClose,
  onSave,
  onDelete,
  calendar,
  onDisconnectCalendar,
}: {
  project: Project;
  onClose: () => void;
  onSave: (patch: {
    name: string;
    emoji: string;
    tagline: string;
    icon_url: string | null;
    accent: string;
    modules: ModuleId[];
  }) => void;
  onDelete: () => void;
  calendar: { connected: boolean; email: string | null };
  onDisconnectCalendar: () => void;
}) {
  const [closing, setClosing] = useState(false);
  const [name, setName] = useState(project.name);
  const [tagline, setTagline] = useState(project.tagline ?? "");
  const [emoji, setEmoji] = useState(project.emoji ?? "📦");
  const [iconUrl, setIconUrl] = useState<string | null>(project.icon_url);
  const [accent, setAccent] = useState(project.accent ?? "#5B5BD6");
  const [tools, setTools] = useState<ModuleId[]>(project.modules?.length ? project.modules : ["hoy", "lista", "notas"]);
  const [pending, startTransition] = useTransition();

  const toggleTool = (id: ModuleId) =>
    setTools((ts) => (ts.includes(id) ? ts.filter((x) => x !== id) : [...ts, id]));
  const close = () => {
    setClosing(true);
    setTimeout(onClose, 220);
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = () => {
    startTransition(() => {
      onSave({
        name: name.trim() || project.name,
        emoji,
        tagline: tagline.trim() || project.tagline || "",
        icon_url: iconUrl,
        accent,
        modules: tools.length ? tools : ["hoy", "lista"],
      });
      close();
    });
  };

  return (
    <div className={`modal-wrap ${closing ? "closing" : ""}`} style={{ ["--accent" as string]: accent }}>
      <div className="modal-scrim" onClick={close} />
      <div className="modal">
        <div className="modal-head">
          <span className="section-label">Configuración del proyecto</span>
          <button className="icon-btn sm" onClick={close}>
            <Icon name="x" size={17} />
          </button>
        </div>

        <div className="np-identity">
          <IconPreview emoji={emoji} iconUrl={iconUrl} accent={accent} />
          <input
            className="np-name"
            placeholder="Nombre del proyecto"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
          />
        </div>

        <div className="np-field">
          <span className="np-label">Subtítulo</span>
          <input
            className="field"
            style={{ width: "100%" }}
            placeholder="Describe el mundo en una frase"
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
          />
        </div>

        <IconField emoji={emoji} iconUrl={iconUrl} onEmoji={setEmoji} onIconUrl={setIconUrl} />

        <div className="np-field">
          <span className="np-label">Color del mundo</span>
          <div className="accent-row">
            {ACCENTS.map((c) => (
              <button key={c} className={`accent-sw ${accent === c ? "on" : ""}`} style={{ background: c }} onClick={() => setAccent(c)}>
                {accent === c && <Icon name="check" size={14} strokeWidth={3} />}
              </button>
            ))}
          </div>
        </div>

        <div className="np-field">
          <span className="np-label">Herramientas del proyecto</span>
          <div className="tool-list">
            {TOOLS.map((tool) => {
              const on = tools.includes(tool.id);
              return (
                <button key={tool.id} className={`tool-row ${on ? "on" : ""}`} onClick={() => toggleTool(tool.id)}>
                  <span className="tool-ico">
                    <Icon name={tool.icon} size={17} />
                  </span>
                  <span className="tool-meta">
                    <span className="tool-name">{tool.label}</span>
                    <span className="tool-desc">{tool.desc}</span>
                  </span>
                  <span className={`tool-check ${on ? "on" : ""}`}>
                    {on && <Icon name="check" size={13} strokeWidth={3} />}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="np-field">
          <span className="np-label">Google Calendar</span>
          {calendar.connected ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <span className="muted" style={{ fontSize: 13, display: "inline-flex", alignItems: "center", gap: 7 }}>
                <Icon name="calendar" size={15} />
                Conectado{calendar.email ? ` · ${calendar.email}` : ""}
              </span>
              <button className="btn btn-line" onClick={onDisconnectCalendar}>
                Desconectar
              </button>
            </div>
          ) : (
            <a className="btn btn-line" href={`/api/google/connect?projectId=${project.id}`} style={{ width: "fit-content" }}>
              <Icon name="calendar" size={15} />
              Conectar Google Calendar
            </a>
          )}
          <p className="np-hint">
            Las reuniones de este proyecto se sincronizan con la cuenta de Google que conectes
            (cada proyecto puede usar una cuenta distinta).
          </p>
        </div>

        <div className="modal-foot" style={{ justifyContent: "space-between" }}>
          <button
            className="btn btn-ghost"
            style={{ color: "#E5484D" }}
            onClick={() => {
              if (confirm(`¿Eliminar el proyecto "${project.name}" y todo su contenido? Esto no se puede deshacer.`)) {
                onDelete();
                close();
              }
            }}
          >
            <Icon name="trash" size={15} />
            Eliminar proyecto
          </button>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn btn-ghost" onClick={close}>
              Cancelar
            </button>
            <button className="btn btn-accent" onClick={save} disabled={pending}>
              {pending ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
