"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/grexya/icon";
import { IconField, IconPreview } from "@/components/grexya/icon-field";
import { connectNotion, getNotionConfig, saveNotionMapping } from "@/app/actions/notion";
import { QUAD_META, type Quad } from "@/lib/grexya-helpers";
import type { NotionConfig, NotionMapping } from "@/lib/notion-types";
import type { ModuleId, Project, ProjectStatusColumn } from "@/lib/types";

const QUADS: Quad[] = ["ui", "ni", "un", "nn"];

const ACCENTS = ["#5B5BD6","#7C66DC","#E93D82","#0E9888","#B45718","#3E63DD","#2FA363","#E5484D"];
const TOOLS: { id: ModuleId; label: string; icon: string; desc: string }[] = [
  { id: "hoy", label: "¿Qué haré hoy?", icon: "target", desc: "Enfoque del día con matriz de prioridades" },
  { id: "kanban", label: "Tablero", icon: "columns", desc: "Tareas en columnas por estado" },
  { id: "lista", label: "Tareas", icon: "list", desc: "Lista simple y ordenable" },
  { id: "notas", label: "Notas", icon: "fileText", desc: "Documentos del proyecto" },
];

export function ProjectSettingsModal({
  project,
  statuses,
  onClose,
  onSave,
  onDelete,
  calendar,
  onDisconnectCalendar,
  notion,
  onDisconnectNotion,
}: {
  project: Project;
  statuses: ProjectStatusColumn[];
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
  notion: { connected: boolean; databaseTitle: string | null };
  onDisconnectNotion: () => void;
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

        <NotionSection
          project={project}
          statuses={statuses}
          notion={notion}
          onDisconnect={onDisconnectNotion}
        />

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

function PropSelect({
  value,
  onChange,
  placeholder,
  list,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  list: { name: string }[];
}) {
  return (
    <select className="nmap-sel" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {list.map((p) => (
        <option key={p.name} value={p.name}>
          {p.name}
        </option>
      ))}
    </select>
  );
}

function MapRow({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="nmap-row">
      <span className="nmap-from">{label}</span>
      <Icon name="chevRight" size={13} className="faint" />
      <select className="nmap-sel" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

function NotionSection({
  project,
  statuses,
  notion,
  onDisconnect,
}: {
  project: Project;
  statuses: ProjectStatusColumn[];
  notion: { connected: boolean; databaseTitle: string | null };
  onDisconnect: () => void;
}) {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [dbInput, setDbInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [cfg, setCfg] = useState<NotionConfig | null>(null);
  const [mapping, setMapping] = useState<NotionMapping>({});
  const [userId, setUserId] = useState<string | null>(null);
  const [showMap, setShowMap] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!notion.connected) return;
    let active = true;
    getNotionConfig(project.id)
      .then((c) => {
        if (!active) return;
        setCfg(c);
        setMapping(c.mapping ?? {});
        setUserId(c.notionUserId);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [notion.connected, project.id]);

  const connect = async () => {
    if (!token.trim() || !dbInput.trim()) return;
    setBusy(true);
    setErr(null);
    const res = await connectNotion(project.id, token, dbInput);
    setBusy(false);
    if (!res.ok) {
      setErr(res.error ?? "No se pudo conectar");
      return;
    }
    setToken("");
    setDbInput("");
    setShowMap(true);
    router.refresh();
  };

  const props = cfg?.properties ?? [];
  const optProps = props.filter((p) => p.type === "status" || p.type === "select");
  const dateProps = props.filter((p) => p.type === "date");
  const peopleProps = props.filter((p) => p.type === "people");
  const optsOf = (name?: string) => props.find((p) => p.name === name)?.options ?? [];
  const typeOf = (name?: string): "status" | "select" =>
    props.find((p) => p.name === name)?.type === "status" ? "status" : "select";

  const setOptProp = (field: "status" | "priority", name: string) =>
    setMapping((m) => {
      const entry = name
        ? { name, type: typeOf(name), map: m[field]?.name === name ? m[field]!.map : {} }
        : undefined;
      return field === "status" ? { ...m, status: entry } : { ...m, priority: entry };
    });
  const setOptMap = (field: "status" | "priority", key: string, opt: string) =>
    setMapping((m) => {
      const cur = m[field];
      if (!cur) return m;
      const next = { ...cur, map: { ...cur.map, [key]: opt } };
      return field === "status" ? { ...m, status: next } : { ...m, priority: next };
    });

  const save = async () => {
    setBusy(true);
    await saveNotionMapping(project.id, mapping, userId);
    setBusy(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
    router.refresh();
  };

  return (
    <div className="np-field">
      <span className="np-label">Notion · base de datos del equipo</span>
      {!notion.connected ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <input
            className="field"
            type="password"
            placeholder="Internal Integration Secret (ntn_…)"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            style={{ width: "100%" }}
          />
          <input
            className="field"
            placeholder="URL o ID de la base de datos"
            value={dbInput}
            onChange={(e) => setDbInput(e.target.value)}
            style={{ width: "100%" }}
          />
          <button className="btn btn-line" style={{ width: "fit-content" }} onClick={connect} disabled={busy}>
            <Icon name="layers" size={15} />
            {busy ? "Conectando…" : "Conectar Notion"}
          </button>
          {err && <p style={{ color: "#E5484D", fontSize: 12.5, margin: 0 }}>{err}</p>}
          <p className="np-hint">
            Crea una integración interna en notion.so/my-integrations, comparte la DB del equipo con
            ella, y pega aquí el secret + la URL de la DB. Las tareas que crees en este proyecto se
            reflejarán en esa base de datos.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <span className="muted" style={{ fontSize: 13, display: "inline-flex", alignItems: "center", gap: 7 }}>
              <Icon name="layers" size={15} />
              Conectado{notion.databaseTitle ? ` · ${notion.databaseTitle}` : ""}
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-line" onClick={() => setShowMap((s) => !s)}>
                {showMap ? "Ocultar mapeo" : "Configurar mapeo"}
              </button>
              <button className="btn btn-line" onClick={onDisconnect}>
                Desconectar
              </button>
            </div>
          </div>

          {showMap &&
            (cfg ? (
              <div className="notion-map">
                <div className="nmap-block">
                  <span className="nmap-h">Estado</span>
                  <PropSelect
                    value={mapping.status?.name ?? ""}
                    onChange={(v) => setOptProp("status", v)}
                    placeholder="— Propiedad de estado —"
                    list={optProps}
                  />
                  {mapping.status?.name && (
                    <div className="nmap-rows">
                      {statuses.map((s) => (
                        <MapRow
                          key={s.id}
                          label={s.name}
                          value={mapping.status?.map[s.id] ?? ""}
                          options={optsOf(mapping.status?.name)}
                          onChange={(v) => setOptMap("status", s.id, v)}
                        />
                      ))}
                      <MapRow
                        label="Completada"
                        value={mapping.status?.map["__done__"] ?? ""}
                        options={optsOf(mapping.status?.name)}
                        onChange={(v) => setOptMap("status", "__done__", v)}
                      />
                    </div>
                  )}
                </div>

                <div className="nmap-block">
                  <span className="nmap-h">Prioridad</span>
                  <PropSelect
                    value={mapping.priority?.name ?? ""}
                    onChange={(v) => setOptProp("priority", v)}
                    placeholder="— Propiedad de prioridad —"
                    list={optProps}
                  />
                  {mapping.priority?.name && (
                    <div className="nmap-rows">
                      {QUADS.map((q) => (
                        <MapRow
                          key={q}
                          label={QUAD_META[q].label}
                          value={mapping.priority?.map[q] ?? ""}
                          options={optsOf(mapping.priority?.name)}
                          onChange={(v) => setOptMap("priority", q, v)}
                        />
                      ))}
                    </div>
                  )}
                </div>

                <div className="nmap-block">
                  <span className="nmap-h">Fecha de vencimiento</span>
                  <PropSelect
                    value={mapping.due?.name ?? ""}
                    onChange={(v) => setMapping((m) => ({ ...m, due: v ? { name: v } : undefined }))}
                    placeholder="— Propiedad de fecha —"
                    list={dateProps}
                  />
                </div>

                <div className="nmap-block">
                  <span className="nmap-h">Responsable (tú)</span>
                  <PropSelect
                    value={mapping.assignee?.name ?? ""}
                    onChange={(v) => setMapping((m) => ({ ...m, assignee: v ? { name: v } : undefined }))}
                    placeholder="— Propiedad de persona —"
                    list={peopleProps}
                  />
                  <select className="nmap-sel" value={userId ?? ""} onChange={(e) => setUserId(e.target.value || null)}>
                    <option value="">— Tu usuario de Notion —</option>
                    {cfg.users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <button className="btn btn-accent" onClick={save} disabled={busy}>
                    {busy ? "Guardando…" : "Guardar mapeo"}
                  </button>
                  {saved && (
                    <span style={{ fontSize: 12.5, color: "#2FA363", display: "inline-flex", alignItems: "center", gap: 5 }}>
                      <Icon name="check" size={13} />
                      Guardado
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <p className="np-hint">Cargando propiedades de la DB…</p>
            ))}
        </div>
      )}
    </div>
  );
}
