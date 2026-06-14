"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/grexya/icon";
import { IconField, IconPreview } from "@/components/grexya/icon-field";
import type { ModuleId } from "@/lib/types";

const ACCENTS = ["#5B5BD6","#7C66DC","#E93D82","#0E9888","#B45718","#3E63DD","#2FA363","#E5484D"];
const TOOLS: { id: ModuleId; label: string; icon: string; desc: string }[] = [
  { id: "hoy", label: "¿Qué haré hoy?", icon: "target", desc: "Enfoque del día con matriz de prioridades" },
  { id: "kanban", label: "Tablero", icon: "columns", desc: "Tareas en columnas por estado" },
  { id: "lista", label: "Tareas", icon: "list", desc: "Lista simple y ordenable" },
  { id: "notas", label: "Notas", icon: "fileText", desc: "Documentos del proyecto" },
];

export function NewProjectModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (data: { emoji: string; name: string; accent: string; icon_url: string | null; modules: ModuleId[] }) => void;
}) {
  const [closing, setClosing] = useState(false);
  const [emoji, setEmoji] = useState("🚀");
  const [iconUrl, setIconUrl] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [accent, setAccent] = useState("#5B5BD6");
  const [tools, setTools] = useState<ModuleId[]>(["hoy", "kanban", "lista", "notas"]);

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

  const create = () => {
    const mods = TOOLS.filter((t) => tools.includes(t.id)).map((t) => t.id);
    onCreate({ emoji, name: name.trim() || "Nuevo proyecto", accent, icon_url: iconUrl, modules: mods.length ? mods : ["hoy", "lista"] });
    close();
  };

  return (
    <div className={`modal-wrap ${closing ? "closing" : ""}`} style={{ ["--accent" as string]: accent }}>
      <div className="modal-scrim" onClick={close} />
      <div className="modal">
        <div className="modal-head">
          <span className="section-label">Nuevo proyecto</span>
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
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
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
          <p className="np-hint">Elige las vistas que necesitas. Podrás activar más después.</p>
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

        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={close}>
            Cancelar
          </button>
          <button className="btn btn-accent" onClick={create}>
            <Icon name="plus" size={16} />
            Crear mundo
          </button>
        </div>
      </div>
    </div>
  );
}
