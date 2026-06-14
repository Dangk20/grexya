"use client";

import { Icon } from "@/components/grexya/icon";
import { usePeople, personFor } from "@/components/grexya/people";
import { getDue, QUAD_META, subStats } from "@/lib/grexya-helpers";
import type { Eisenhower, Front, Project, Task } from "@/lib/types";

const CATS: Record<Front, { label: string; tone: string }> = {
  business: { label: "Business", tone: "blue" },
  tech: { label: "Tech", tone: "violet" },
  branding: { label: "Branding", tone: "rose" },
  marketing: { label: "Marketing", tone: "amber" },
};

export function Avatar({
  id,
  size = 24,
}: {
  id: string | null | undefined;
  size?: number;
}) {
  const ctx = usePeople();
  const p = personFor(id, ctx);
  return (
    <span
      className="avatar"
      title={p.name}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        ["--av" as string]: p.av,
      }}
    >
      {p.initials}
    </span>
  );
}

export function AvatarStack({
  ids,
  size = 24,
  max = 4,
}: {
  ids: string[];
  size?: number;
  max?: number;
}) {
  const show = ids.slice(0, max);
  return (
    <span className="avatar-stack">
      {show.map((id, i) => (
        <Avatar key={id + i} id={id} size={size} />
      ))}
      {ids.length > max && (
        <span
          className="avatar"
          style={{
            width: size,
            height: size,
            fontSize: size * 0.4,
            ["--av" as string]: "var(--field)",
            color: "var(--text-2)",
          }}
        >
          +{ids.length - max}
        </span>
      )}
    </span>
  );
}

export function Chip({
  tone,
  children,
}: {
  tone: string;
  children: React.ReactNode;
}) {
  return <span className={`chip tone-${tone}`}>{children}</span>;
}

export function CategoryChip({ cat }: { cat: Front | null }) {
  if (!cat) return null;
  const c = CATS[cat];
  return <Chip tone={c.tone}>{c.label}</Chip>;
}

/** Prioridad = cuadrante Eisenhower. Muestra Crítica/Alta/Media/Baja. */
export function PriorityChip({ quad }: { quad: Eisenhower | null }) {
  if (!quad || quad === "reunion") return null;
  const m = QUAD_META[quad];
  return (
    <span className={`chip tone-${m.tone}`} title={m.label}>
      <span className="chip-dot" />
      {m.short}
    </span>
  );
}

/** Estado dinámico: nombre + color de la columna del tablero. */
export function StatusChip({ status }: { status: { name: string; color: string } | null }) {
  if (!status) return <span className="faint">—</span>;
  return (
    <Chip tone={status.color}>
      <span className="chip-dot" />
      {status.name}
    </Chip>
  );
}

export function ProjectChip({
  project,
  onClick,
}: {
  project: Pick<Project, "emoji" | "name" | "accent" | "icon_url">;
  onClick?: (e: React.MouseEvent) => void;
}) {
  return (
    <span
      className="proj-chip"
      onClick={onClick}
      style={{ ["--accent" as string]: project.accent ?? "#5B5BD6" }}
    >
      {project.icon_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={project.icon_url}
          alt=""
          style={{ width: 16, height: 16, borderRadius: 4, objectFit: "cover", display: "block" }}
        />
      ) : (
        <span className="chip-emoji">{project.emoji}</span>
      )}
      {project.name}
    </span>
  );
}

export function Check({
  done,
  onClick,
  size = 18,
}: {
  done: boolean;
  onClick?: () => void;
  size?: number;
}) {
  return (
    <button
      className={`cbx ${done ? "done" : ""}`}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      style={{ width: size, height: size }}
      aria-pressed={done}
    >
      <Icon name="check" size={size * 0.66} strokeWidth={2.6} />
    </button>
  );
}

export function Progress({ value, color }: { value: number; color?: string }) {
  return (
    <div className="prog">
      <i
        style={{
          width: `${Math.round(value * 100)}%`,
          background: color || "var(--accent,#0A0A0A)",
        }}
      />
    </div>
  );
}

export function SubCounter({ task, all }: { task: Task; all: Task[] }) {
  const { done, total } = subStats(task, all);
  if (!total) return null;
  return (
    <span className="subcount mono">
      <Icon name="check" size={12} strokeWidth={2.4} />
      {done}/{total}
    </span>
  );
}

export function DueLabel({ dueDate }: { dueDate: string | null }) {
  const d = getDue(dueDate);
  if (!d) return null;
  return (
    <span className={`due ${d.cls}`}>
      <Icon name="calendar" size={12.5} strokeWidth={1.8} />
      {d.label}
    </span>
  );
}
