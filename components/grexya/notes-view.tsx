"use client";

import { useState } from "react";
import { Icon } from "@/components/grexya/icon";
import { useSyncedState } from "@/lib/use-synced-state";
import type { Note, Project } from "@/lib/types";

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
  const doc = list.find((d) => d.id === activeId) ?? list[0] ?? null;

  return (
    <div className="notes">
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
        <NoteEditor key={doc.id} project={project} note={doc} onUpdate={onUpdate} onDelete={onDelete} />
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
}: {
  project: Project;
  note: Note;
  onUpdate: (id: string, patch: { title?: string; body?: string }) => void;
  onDelete: (id: string) => void;
}) {
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  return (
    <div className="notes-editor card">
      <div className="ne-toolbar">
        <div className="ne-crumbs">
          <span>
            {project.emoji} {project.name}
          </span>
          <Icon name="chevRight" size={13} className="faint" />
          <span className="muted">{title || "Sin título"}</span>
        </div>
        <div className="ne-tools">
          {["bold", "italic", "h1", "list", "quote"].map((n) => (
            <button key={n} className="icon-btn sm">
              <Icon name={n} size={15} />
            </button>
          ))}
          <button className="icon-btn sm" title="Eliminar" onClick={() => onDelete(note.id)}>
            <Icon name="x" size={15} />
          </button>
        </div>
      </div>
      <div className="ne-page">
        <div className="ne-emoji">📄</div>
        <input
          className="ne-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title !== note.title && onUpdate(note.id, { title })}
          placeholder="Sin título"
          style={{ background: "none", border: "none", width: "100%" }}
        />
        <textarea
          className="ne-p"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onBlur={() => body !== note.body && onUpdate(note.id, { body })}
          placeholder="Escribe aquí… (texto y Markdown)"
          rows={18}
          style={{ background: "none", border: "none", width: "100%", resize: "none", outline: "none" }}
        />
      </div>
    </div>
  );
}
