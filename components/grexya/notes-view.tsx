"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Icon } from "@/components/grexya/icon";
import { useSyncedState } from "@/lib/use-synced-state";
import type { Note, Project } from "@/lib/types";

// Hojas AFFiNE (BlockSuite): solo en cliente — son web components sobre lit.
const AffineNoteEditor = dynamic(() => import("./affine-note-editor"), {
  ssr: false,
  loading: () => <div className="ne-page" style={{ color: "var(--text-3)" }}>Cargando hoja…</div>,
});

export function NotesView({
  project,
  notes,
  onCreate,
  onUpdate,
  onDelete,
}: {
  project: Project;
  notes: Note[];
  onCreate: () => void;
  onUpdate: (id: string, patch: { title?: string; body?: string }) => void;
  onDelete: (id: string) => void;
}) {
  const [list] = useSyncedState<Note[]>(notes);
  const [activeId, setActiveId] = useState<string | null>(notes[0]?.id ?? null);
  const [full, setFull] = useState(false);
  const doc = list.find((d) => d.id === activeId) ?? list[0] ?? null;

  // Esc sale de pantalla completa (como en Notion)
  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFull(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [full]);

  return (
    <div className={`notes ${full ? "ne-full" : ""}`}>
      <div className="notes-list">
        <div className="notes-list-head">
          <span className="section-label">Documentos</span>
          <button className="icon-btn sm" onClick={onCreate}>
            <Icon name="plus" size={15} />
          </button>
        </div>
        {list.map((d) => (
          <button
            key={d.id}
            className={`note-item ${doc?.id === d.id ? "on" : ""}`}
            onClick={() => setActiveId(d.id)}
          >
            <span className="note-ico">📄</span>
            <span className="note-meta">
              <span className="note-title">{d.title || "Sin título"}</span>
              <span className="note-upd">
                {new Date(d.updated_at).toLocaleDateString("es-CO", { day: "2-digit", month: "short" })}
              </span>
            </span>
          </button>
        ))}
        <button className="note-new" onClick={onCreate}>
          <Icon name="plus" size={15} />
          Nuevo documento
        </button>
      </div>

      {doc ? (
        <NoteEditor
          key={doc.id}
          project={project}
          note={doc}
          onUpdate={onUpdate}
          onDelete={onDelete}
          full={full}
          onToggleFull={() => setFull((f) => !f)}
        />
      ) : (
        <div className="notes-editor card" style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-3)" }}>
          Crea tu primer documento.
        </div>
      )}
    </div>
  );
}

function NoteEditor({
  project,
  note,
  onUpdate,
  onDelete,
  full,
  onToggleFull,
}: {
  project: Project;
  note: Note;
  onUpdate: (id: string, patch: { title?: string; body?: string }) => void;
  onDelete: (id: string) => void;
  full: boolean;
  onToggleFull: () => void;
}) {
  return (
    <div className="notes-editor card">
      <div className="ne-toolbar">
        <div className="ne-crumbs">
          <span>
            {project.emoji} {project.name}
          </span>
          <Icon name="chevRight" size={13} className="faint" />
          <span className="muted">{note.title || "Sin título"}</span>
        </div>
        <div className="ne-tools">
          <button
            className="icon-btn sm"
            title={full ? "Salir de pantalla completa (Esc)" : "Pantalla completa"}
            onClick={onToggleFull}
          >
            <Icon name={full ? "minimize" : "maximize"} size={15} />
          </button>
          <button className="icon-btn sm" title="Eliminar" onClick={() => onDelete(note.id)}>
            <Icon name="x" size={15} />
          </button>
        </div>
      </div>
      <AffineNoteEditor key={note.id} note={note} onUpdate={onUpdate} />
    </div>
  );
}
