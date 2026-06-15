"use client";

import { useState } from "react";
import { UserButton } from "@clerk/nextjs";
import { Icon } from "@/components/grexya/icon";
import { ProjectIcon } from "@/components/grexya/project-icon";
import type { ModuleId, Project } from "@/lib/types";

const MODULE_DEFS: { id: ModuleId; label: string; icon: string }[] = [
  { id: "hoy", label: "¿Qué haré hoy?", icon: "target" },
  { id: "kanban", label: "Tablero", icon: "columns" },
  { id: "lista", label: "Tareas", icon: "list" },
  { id: "notas", label: "Notas", icon: "fileText" },
];

export function modulesFor(project: Project) {
  const ids = project.modules?.length ? project.modules : MODULE_DEFS.map((m) => m.id);
  return MODULE_DEFS.filter((m) => ids.includes(m.id));
}

function Switcher({
  inProject,
  activeProject,
  activeType,
  projects,
  onNav,
  onNewProject,
}: {
  inProject: boolean;
  activeProject: Project | null;
  projects: Project[];
  onNav: (route: "command" | "project", id?: string) => void;
  onNewProject: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="sw-wrap">
      <button
        className={`sb-switcher ${open ? "open" : ""}`}
        onClick={() => setOpen((o) => !o)}
        style={inProject && activeProject ? { ["--accent" as string]: activeProject.accent! } : undefined}
      >
        {inProject && activeProject ? (
          <span className="sw-tile emoji">
            <ProjectIcon project={activeProject} />
          </span>
        ) : (
          <span className="sw-tile gen">
            <Icon name="layers" size={17} />
          </span>
        )}
        <span className="sw-meta">
          <span className="sw-name">{inProject && activeProject ? activeProject.name : "Centro de mando"}</span>
          <span className="sw-sub">
            {inProject ? activeProject?.tagline || "Mundo" : "Vista general"}
          </span>
        </span>
        <span className="sw-chevs">
          <Icon name="chevDown" size={15} />
        </span>
      </button>

      {open && (
        <>
          <div className="pop-scrim" onClick={() => setOpen(false)} />
          <div className="switcher-pop">
            <span className="sw-group">Vista general</span>
            <button
              className={`sw-item ${!inProject ? "on" : ""}`}
              onClick={() => {
                onNav("command");
                setOpen(false);
              }}
            >
              <span className="sw-tile gen sm">
                <Icon name="layers" size={15} />
              </span>
              <span className="sw-item-name">Centro de mando</span>
              {!inProject && <Icon name="check" size={15} className="sw-check" />}
            </button>
            <div className="sw-div" />
            <span className="sw-group">Cambiar de mundo</span>
            <div className="sw-projects">
              {projects.map((p) => {
                const on = inProject && activeProject?.id === p.id;
                return (
                  <button
                    key={p.id}
                    className={`sw-item ${on ? "on" : ""}`}
                    onClick={() => {
                      onNav("project", p.id);
                      setOpen(false);
                    }}
                    style={{ ["--accent" as string]: p.accent! }}
                  >
                    <span className="sw-tile emoji sm">
                      <ProjectIcon project={p} />
                    </span>
                    <span className="sw-item-name">{p.name}</span>
                    {on && <Icon name="check" size={15} className="sw-check" />}
                  </button>
                );
              })}
            </div>
            <div className="sw-div" />
            <button
              className="sw-item sw-new"
              onClick={() => {
                onNewProject();
                setOpen(false);
              }}
            >
              <span className="sw-tile add">
                <Icon name="plus" size={16} />
              </span>
              <span className="sw-item-name">Nuevo proyecto</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function Sidebar({
  inProject,
  activeProject,
  activeModule,
  projects,
  onNav,
  onModule,
  onNewProject,
  onCollapse,
  theme,
  onToggleTheme,
  userName,
}: {
  inProject: boolean;
  activeProject: Project | null;
  activeModule: ModuleId;
  projects: Project[];
  onNav: (route: "command" | "project", id?: string) => void;
  onModule: (m: ModuleId) => void;
  onNewProject: () => void;
  onCollapse: () => void;
  theme: string;
  onToggleTheme: () => void;
  userName: string;
}) {
  return (
    <aside
      className="sidebar"
      style={inProject && activeProject ? { ["--accent" as string]: activeProject.accent! } : undefined}
      data-inproject={inProject && activeProject ? "1" : undefined}
    >
      <div className="sb-top">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="sb-logo"
          alt="grexya"
          src={theme === "dark" ? "/brand/wordmark-cream.png" : "/brand/wordmark-ink.png"}
        />
        <div className="sb-top-actions">
          <button className="icon-btn sm" onClick={onToggleTheme} title="Cambiar tema">
            <Icon name={theme === "dark" ? "sun" : "moon"} size={16} />
          </button>
          <button className="icon-btn sm" onClick={onCollapse} title="Ocultar menú">
            <Icon name="sidebar" size={16} />
          </button>
        </div>
      </div>

      <Switcher
        inProject={inProject}
        activeProject={activeProject}
        activeType={activeType}
        projects={projects}
        onNav={onNav}
        onNewProject={onNewProject}
      />

      {inProject && activeProject ? (
        <nav className="sb-modules">
          {modulesFor(activeProject).map((m) => (
            <button
              key={m.id}
              className={`sb-item ${activeModule === m.id ? "on" : ""}`}
              onClick={() => onModule(m.id)}
            >
              <Icon name={m.icon} size={17} />
              <span>{m.label}</span>
            </button>
          ))}
        </nav>
      ) : (
        <nav className="sb-modules">
          <button className="sb-item on">
            <Icon name="layers" size={17} />
            <span>Inicio</span>
          </button>
          <div className="sb-hint">
            Elige un proyecto en el selector de arriba para entrar a su mundo.
          </div>
        </nav>
      )}

      <div className="sb-grow" />

      <div className="sb-bottom">
        <div className="sb-user">
          <UserButton appearance={{ elements: { avatarBox: "width:28px;height:28px" } }} />
          <span className="sb-user-meta">
            <span className="sb-user-name">{userName}</span>
            <span className="sb-user-sub">Builder · Grexya</span>
          </span>
        </div>
      </div>
    </aside>
  );
}
