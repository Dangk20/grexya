"use client";

import { useRef, useState, useTransition } from "react";
import { Icon } from "@/components/grexya/icon";
import { uploadProjectIcon } from "@/app/actions/projects";

export const EMOJIS = ["🚀","🛰️","🪐","⚡","🎨","🧭","🔮","🌱","🛠️","📦","🧪","🎯","🔥","💎","🌊","🦊","🏗️","🧩","📡","🍊"];

/** Preview del icono (logo subido o emoji), para usar en los modales. */
export function IconPreview({
  emoji,
  iconUrl,
  accent,
}: {
  emoji: string;
  iconUrl: string | null;
  accent: string;
}) {
  return (
    <div
      className="np-emoji-preview"
      style={{ background: `color-mix(in oklab, ${accent} 14%, var(--card))`, overflow: "hidden" }}
    >
      {iconUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={iconUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        emoji
      )}
    </div>
  );
}

/** Selector de icono: emoji o imagen subida (con medidas recomendadas). */
export function IconField({
  emoji,
  iconUrl,
  onEmoji,
  onIconUrl,
}: {
  emoji: string;
  iconUrl: string | null;
  onEmoji: (e: string) => void;
  onIconUrl: (u: string | null) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, startUpload] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function pick(file: File) {
    setErr(null);
    const fd = new FormData();
    fd.append("file", file);
    startUpload(async () => {
      const res = await uploadProjectIcon(fd);
      if ("error" in res) setErr(res.error);
      else onIconUrl(res.url);
    });
  }

  return (
    <div className="np-field">
      <span className="np-label">Icono</span>
      <p className="np-hint">
        Elige un emoji o sube tu logo. Recomendado: imagen <b>cuadrada de 256×256 px</b>{" "}
        (PNG, JPG, WebP o SVG), máx 2MB.
      </p>
      <div className="emoji-grid">
        {EMOJIS.map((e) => (
          <button
            key={e}
            className={`emoji-btn ${emoji === e && !iconUrl ? "on" : ""}`}
            onClick={() => {
              onEmoji(e);
              onIconUrl(null);
            }}
          >
            {e}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 11, alignItems: "center", flexWrap: "wrap" }}>
        <button className="btn btn-soft" onClick={() => fileRef.current?.click()} disabled={uploading}>
          <Icon name="upload" size={15} />
          {uploading ? "Subiendo…" : iconUrl ? "Cambiar imagen" : "Subir imagen"}
        </button>
        {iconUrl && (
          <button className="btn btn-ghost" onClick={() => onIconUrl(null)}>
            Quitar imagen
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) pick(f);
            e.target.value = "";
          }}
        />
      </div>
      {err && <p style={{ color: "#E5484D", fontSize: 12, marginTop: 6 }}>{err}</p>}
    </div>
  );
}
