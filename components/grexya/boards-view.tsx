"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Icon } from "@/components/grexya/icon";
import { useSyncedState } from "@/lib/use-synced-state";
import type { Note, Project } from "@/lib/types";

const AffineNoteEditor = dynamic(() => import("./affine-note-editor"), {
  ssr: false,
  loading: () => <div style={{ color: "var(--text-3)", padding: 40 }}>Cargando board…</div>,
});

/**
 * Módulo Board: pool de boards infinitos (edgeless) por proyecto, estilo
 * galería de Figma. Cada board es una fila de `notes` con kind='board'.
 */
export function BoardsView({
  project,
  boards,
  onCreate,
  onUpdate,
  onDelete,
}: {
  project: Project;
  boards: Note[];
  onCreate: () => Promise<string | undefined>;
  onUpdate: (id: string, patch: { title?: string; body?: string }) => void;
  onDelete: (id: string) => void;
}) {
  const [list] = useSyncedState<Note[]>(boards);
  const [openId, setOpenId] = useState<string | null>(null);
  const [full, setFull] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const open = openId ? list.find((b) => b.id === openId) ?? null : null;

  // cerrar el menú ⋯ al hacer clic fuera
  useEffect(() => {
    if (!menuId) return;
    const close = () => setMenuId(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [menuId]);

  // crear → directo a la vista de trabajo, en pantalla completa
  const handleCreate = async () => {
    const id = await onCreate();
    if (id) {
      setOpenId(id);
      setFull(true);
    }
  };

  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFull(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [full]);

  if (open) {
    return (
      <div className={`board-open card ${full ? "ne-full" : ""}`}>
        <div className="ne-toolbar">
          <div className="ne-crumbs">
            <button className="icon-btn sm" title="Volver al pool" onClick={() => { setOpenId(null); setFull(false); }}>
              <Icon name="arrowLeft" size={15} />
            </button>
            <span>
              {project.emoji} {project.name}
            </span>
            <Icon name="chevRight" size={13} className="faint" />
            <BoardTitle key={open.id} board={open} onUpdate={onUpdate} />
          </div>
          <div className="ne-tools">
            <button
              className="icon-btn sm"
              title={full ? "Salir de pantalla completa (Esc)" : "Pantalla completa"}
              onClick={() => setFull((f) => !f)}
            >
              <Icon name={full ? "minimize" : "maximize"} size={15} />
            </button>
            <button
              className="icon-btn sm"
              title="Eliminar board"
              onClick={() => { onDelete(open.id); setOpenId(null); }}
            >
              <Icon name="trash" size={15} />
            </button>
          </div>
        </div>
        <AffineNoteEditor key={open.id} note={open} onUpdate={(id, patch) => onUpdate(id, { body: patch.body })} mode="edgeless" />
      </div>
    );
  }

  return (
    <div className="boards-pool">
      <div className="boards-head">
        <span className="section-label">Boards</span>
        <button className="btn btn-line" onClick={handleCreate}>
          <Icon name="plus" size={15} />
          Nuevo board
        </button>
      </div>
      {list.length === 0 ? (
        <div className="boards-empty">
          <Icon name="shapes" size={28} />
          <p>Lienzos infinitos para pensar en grande.</p>
          <button className="btn btn-accent" onClick={handleCreate}>Crear el primer board</button>
        </div>
      ) : (
        <div className="boards-grid">
          {list.map((b) => (
            <div
              key={b.id}
              className="board-card card"
              role="button"
              tabIndex={0}
              onClick={() => renamingId !== b.id && setOpenId(b.id)}
              onKeyDown={(e) => e.key === "Enter" && renamingId !== b.id && setOpenId(b.id)}
            >
              <div className="board-cover">
                <Icon name="shapes" size={26} />
              </div>
              <div className="board-meta">
                {renamingId === b.id ? (
                  <input
                    className="board-rename"
                    autoFocus
                    defaultValue={b.title}
                    placeholder="Nombre del board"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      if (e.key === "Escape") setRenamingId(null);
                    }}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== b.title) onUpdate(b.id, { title: v });
                      setRenamingId(null);
                    }}
                  />
                ) : (
                  <span className="board-title">{b.title || "Sin título"}</span>
                )}
                <span className="board-upd">
                  Editado{" "}
                  {new Date(b.updated_at).toLocaleDateString("es-CO", { day: "2-digit", month: "short" })}
                </span>
              </div>
              <button
                className="icon-btn sm board-menu-btn"
                title="Opciones"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuId(menuId === b.id ? null : b.id);
                }}
              >
                <Icon name="moreH" size={15} />
              </button>
              {menuId === b.id && (
                <div className="board-menu" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => { setRenamingId(b.id); setMenuId(null); }}>
                    <Icon name="pencil" size={14} /> Renombrar
                  </button>
                  <button className="danger" onClick={() => { onDelete(b.id); setMenuId(null); }}>
                    <Icon name="trash" size={14} /> Eliminar
                  </button>
                </div>
              )}
            </div>
          ))}
          <button className="board-card board-new" onClick={handleCreate}>
            <div className="board-cover">
              <Icon name="plus" size={24} />
            </div>
            <div className="board-meta">
              <span className="board-title">Nuevo board</span>
              <span className="board-upd">Lienzo infinito</span>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}

/** Título editable inline del board, estilo Google Docs (clic para editar). */
function BoardTitle({
  board,
  onUpdate,
}: {
  board: Note;
  onUpdate: (id: string, patch: { title?: string }) => void;
}) {
  const [title, setTitle] = useState(board.title);
  return (
    <input
      className="board-title-input"
      value={title}
      placeholder="Sin título"
      size={Math.max(title.length, 9)}
      onChange={(e) => setTitle(e.target.value)}
      onFocus={(e) => e.target.select()}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      onBlur={() => title.trim() !== board.title && onUpdate(board.id, { title: title.trim() })}
    />
  );
}
