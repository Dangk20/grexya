"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Icon } from "@/components/grexya/icon";
import { PeopleProvider, type Person } from "@/components/grexya/people";
import { Sidebar, modulesFor } from "@/components/grexya/sidebar";
import { CommandCenter } from "@/components/grexya/command-center";
import { ProjectWorld, type WorldHandlers } from "@/components/grexya/project-world";
import { DetailPanel } from "@/components/grexya/detail-panel";
import { ChatPanel } from "@/components/grexya/chat-panel";
import { NewProjectModal } from "@/components/grexya/new-project-modal";
import { ProjectSettingsModal } from "@/components/grexya/project-settings-modal";
import { useSyncedState } from "@/lib/use-synced-state";
import * as taskActions from "@/app/actions/tasks";
import * as statusActions from "@/app/actions/statuses";
import {
  createProject,
  updateProject as updateProjectAction,
  deleteProject as deleteProjectAction,
} from "@/app/actions/projects";
import { createNote, deleteNote, updateNote } from "@/app/actions/notes";
import { disconnectCalendar } from "@/app/actions/calendar";
import { disconnectNotion } from "@/app/actions/notion";
import type { CalendarConn, NotionConn } from "@/lib/data";
import type { ModuleId, Note, Planning, Project, ProjectStatusColumn, Task } from "@/lib/types";

export function AppShell({
  projects: pProjects,
  tasks: pTasks,
  notes: pNotes,
  statuses: pStatuses,
  calendars: pCalendars,
  plannings: pPlannings,
  notions: pNotions,
  me,
}: {
  projects: Project[];
  tasks: Task[];
  notes: Note[];
  statuses: ProjectStatusColumn[];
  calendars: CalendarConn[];
  plannings: Planning[];
  notions: NotionConn[];
  me: Person;
}) {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  const [projects] = useSyncedState<Project[]>(pProjects);
  const [tasks, setTasks] = useSyncedState<Task[]>(pTasks);
  const [notes] = useSyncedState<Note[]>(pNotes);
  const [statuses, setStatuses] = useSyncedState<ProjectStatusColumn[]>(pStatuses);
  const [calendars] = useSyncedState<CalendarConn[]>(pCalendars);
  const [plannings] = useSyncedState<Planning[]>(pPlannings);
  const [notions] = useSyncedState<NotionConn[]>(pNotions);

  const [route, setRoute] = useState<"command" | "project">("command");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeModule, setActiveModule] = useState<ModuleId>("hoy");
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [newProjOpen, setNewProjOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);
  const [pendingSlug, setPendingSlug] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ids: string[] } | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const refresh = () => router.refresh();

  const firstModule = (id: string): ModuleId => {
    const p = projects.find((x) => x.id === id);
    return (p && modulesFor(p)[0]?.id) || "hoy";
  };
  const nav = (r: "command" | "project", id?: string) => {
    setRoute(r);
    if (id !== undefined) setActiveId(id);
    else if (r === "command") setActiveId(null);
    if (r === "project" && id) setActiveModule(firstModule(id));
    document.querySelector(".main")?.scrollTo({ top: 0 });
  };

  // navega al proyecto recién creado cuando aparezca en los datos
  useEffect(() => {
    if (!pendingSlug) return;
    const p = projects.find((x) => x.slug === pendingSlug);
    if (p) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPendingSlug(null);
      nav("project", p.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, pendingSlug]);

  // ---- mutaciones (optimista + acción + refresh) ----
  const toggleTask = async (id: string) => {
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, is_done: !t.is_done } : t)));
    await taskActions.toggleTask({ taskId: id });
    refresh();
  };
  const moveTask = async (id: string, statusId: string | null) => {
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, status_id: statusId } : t)));
    await taskActions.moveTask({ taskId: id, statusId });
    refresh();
  };
  const createStatus = async (projectId: string) => {
    await statusActions.createStatus({ projectId });
    refresh();
  };
  const updateStatus = async (statusId: string, patch: { name?: string; color?: string }) => {
    setStatuses((ss) => ss.map((s) => (s.id === statusId ? { ...s, ...patch } : s)));
    await statusActions.updateStatus({ statusId, ...patch });
    refresh();
  };
  const deleteStatus = async (statusId: string) => {
    setStatuses((ss) => ss.filter((s) => s.id !== statusId));
    await statusActions.deleteStatus({ statusId });
    refresh();
  };
  const updateTask = async (id: string, patch: Record<string, unknown>) => {
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    await taskActions.updateTask({ taskId: id, patch });
    refresh();
  };
  const createTask: WorldHandlers["onCreateTask"] = async (input) => {
    await taskActions.createTask(input);
    refresh();
  };
  const setTop3 = async (taskId: string, dayDate: string, on: boolean) => {
    if (on) {
      setTasks((ts) => ts.map((t) => (t.id === taskId ? { ...t, is_top3: true, day_date: dayDate } : t)));
    } else {
      setTasks((ts) => ts.map((t) => (t.id === taskId ? { ...t, is_top3: false, top_rank: null } : t)));
    }
    const res = await taskActions.setTaskTop3({ taskId, dayDate, on });
    refresh();
    return res;
  };
  const createSub = async (parentId: string, title: string) => {
    await taskActions.createSubtask({ parentTaskId: parentId, title });
    refresh();
  };
  const reorderSubtasks = async (parentId: string, ids: string[]) => {
    setTasks((ts) => ts.map((t) => {
      const i = ids.indexOf(t.id);
      return i >= 0 ? { ...t, position: i } : t;
    }));
    await taskActions.reorderSubtasks({ parentTaskId: parentId, orderedIds: ids });
    refresh();
  };
  const deleteTask = async (id: string) => {
    setTasks((ts) => ts.filter((t) => t.id !== id && t.parent_task_id !== id));
    await taskActions.deleteTask({ taskId: id });
    setToast({ msg: "Tarea movida a la papelera", ids: [id] });
    refresh();
  };
  const deleteTasks = async (ids: string[]) => {
    const set = new Set(ids);
    setTasks((ts) => ts.filter((t) => !set.has(t.id) && !(t.parent_task_id && set.has(t.parent_task_id))));
    await taskActions.deleteTasks({ taskIds: ids });
    setToast({ msg: `${ids.length} ${ids.length === 1 ? "tarea movida" : "tareas movidas"} a la papelera`, ids });
    refresh();
  };
  const undoDelete = async () => {
    const ids = toast?.ids ?? [];
    setToast(null);
    if (!ids.length) return;
    await Promise.all(ids.map((id) => taskActions.restoreTask({ taskId: id })));
    refresh();
  };
  const onCreateProject = async (data: {
    emoji: string;
    name: string;
    tagline: string;
    accent: string;
    icon_url: string | null;
    modules: ModuleId[];
  }) => {
    const slug = await createProject(data);
    setPendingSlug(slug);
    refresh();
  };
  const onUpdateProject = async (
    projectId: string,
    patch: { name: string; emoji: string; tagline: string; icon_url: string | null; accent: string; modules: ModuleId[] },
  ) => {
    const cover = `linear-gradient(120deg, ${patch.accent}, color-mix(in oklab, ${patch.accent} 55%, #fff))`;
    await updateProjectAction({ projectId, ...patch, cover });
    refresh();
  };
  const onDeleteProject = async (projectId: string) => {
    await deleteProjectAction({ projectId });
    setSettingsOpen(false);
    nav("command");
    refresh();
  };
  const onDisconnectCalendar = async (projectId: string) => {
    await disconnectCalendar(projectId);
    refresh();
  };
  const calConn = (pid: string) => {
    const c = calendars.find((x) => x.project_id === pid);
    return { connected: !!c, email: c?.email ?? null };
  };
  const onDisconnectNotion = async (projectId: string) => {
    await disconnectNotion(projectId);
    refresh();
  };
  const notionConn = (pid: string) => {
    const n = notions.find((x) => x.project_id === pid);
    return { connected: !!n, databaseTitle: n?.database_title ?? null };
  };
  const onCreateNote = async (projectId: string) => {
    await createNote({ projectId });
    refresh();
  };
  const onUpdateNote = async (id: string, patch: { title?: string; body?: string }) => {
    await updateNote({ noteId: id, ...patch });
    refresh();
  };
  const onDeleteNote = async (id: string) => {
    await deleteNote({ noteId: id });
    refresh();
  };

  if (!mounted) return <div style={{ height: "100vh", background: "var(--bg)" }} />;

  const theme = resolvedTheme ?? "light";
  const activeProject = projects.find((p) => p.id === activeId) ?? null;
  const inProject = route === "project" && !!activeProject;
  const projTasks = (pid: string) => tasks.filter((t) => t.project_id === pid);
  const openTask = openTaskId ? tasks.find((t) => t.id === openTaskId) ?? null : null;
  const openTaskProject = openTask ? projects.find((p) => p.id === openTask.project_id) ?? null : null;
  const chatProject = activeProject ?? projects[0] ?? null;

  const worldHandlers: WorldHandlers = {
    onBack: () => nav("command"),
    onOpenTask: setOpenTaskId,
    onToggleTask: toggleTask,
    onMoveTask: moveTask,
    onCreateTask: createTask,
    onUpdateTask: updateTask,
    onSetTop3: setTop3,
    onDeleteTask: deleteTask,
    onDeleteTasks: deleteTasks,
    onOpenSettings: () => setSettingsOpen(true),
    onCreateStatus: createStatus,
    onUpdateStatus: updateStatus,
    onDeleteStatus: deleteStatus,
    onCreateNote,
    onUpdateNote,
    onDeleteNote,
  };

  return (
    <PeopleProvider me={me}>
      <div className={`app ${navOpen ? "" : "nav-collapsed"}`}>
        {!navOpen && (
          <button className="nav-show" onClick={() => setNavOpen(true)} title="Mostrar menú">
            <Icon name="sidebar" size={17} />
          </button>
        )}

        <Sidebar
          inProject={inProject}
          activeProject={activeProject}
          activeModule={activeModule}
          projects={projects}
          onNav={nav}
          onModule={setActiveModule}
          onNewProject={() => setNewProjOpen(true)}
          onCollapse={() => setNavOpen(false)}
          theme={theme}
          onToggleTheme={() => setTheme(theme === "dark" ? "light" : "dark")}
          userName={me.name}
        />

        <main className="main">
          {route === "command" && (
            <CommandCenter
              projects={projects}
              tasks={tasks}
              userName={me.name}
              onOpenTask={setOpenTaskId}
              onToggleTask={toggleTask}
              onOpenProject={(id) => nav("project", id)}
              onNewProject={() => setNewProjOpen(true)}
              connectedProjectIds={calendars.map((c) => c.project_id)}
            />
          )}
          {route === "project" && activeProject && (
            <ProjectWorld
              key={activeProject.id}
              project={activeProject}
              tasks={projTasks(activeProject.id)}
              notes={notes.filter((n) => n.project_id === activeProject.id)}
              statuses={statuses.filter((s) => s.project_id === activeProject.id)}
              calendarConn={calConn(activeProject.id)}
              plannings={plannings.filter((p) => p.project_id === activeProject.id)}
              module={activeModule}
              h={worldHandlers}
            />
          )}
        </main>

        {openTask && openTaskProject && (
          <DetailPanel
            task={openTask}
            project={openTaskProject}
            statuses={statuses.filter((s) => s.project_id === openTaskProject.id)}
            allTasks={tasks}
            onClose={() => setOpenTaskId(null)}
            onUpdate={updateTask}
            onToggle={toggleTask}
            onCreateSub={createSub}
            onDeleteTask={deleteTask}
            onSetTop3={setTop3}
            onReorderSubtasks={reorderSubtasks}
          />
        )}

        {newProjOpen && (
          <NewProjectModal onClose={() => setNewProjOpen(false)} onCreate={onCreateProject} />
        )}

        {settingsOpen && activeProject && (
          <ProjectSettingsModal
            project={activeProject}
            statuses={statuses.filter((s) => s.project_id === activeProject.id)}
            onClose={() => setSettingsOpen(false)}
            onSave={(patch) => onUpdateProject(activeProject.id, patch)}
            onDelete={() => onDeleteProject(activeProject.id)}
            calendar={calConn(activeProject.id)}
            onDisconnectCalendar={() => onDisconnectCalendar(activeProject.id)}
            notion={notionConn(activeProject.id)}
            onDisconnectNotion={() => onDisconnectNotion(activeProject.id)}
          />
        )}

        {!chatOpen && (
          <button
            className="chat-fab"
            onClick={() => setChatOpen(true)}
            title="Chat IA"
            style={activeProject ? { ["--accent" as string]: activeProject.accent! } : undefined}
          >
            <Icon name="sparkles" size={22} />
          </button>
        )}
        {chatOpen && <ChatPanel project={chatProject} onClose={() => setChatOpen(false)} />}

        {toast && <UndoToast msg={toast.msg} onUndo={undoDelete} onClose={() => setToast(null)} />}
      </div>
    </PeopleProvider>
  );
}

function UndoToast({ msg, onUndo, onClose }: { msg: string; onUndo: () => void; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 8000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="gx-toast" role="status">
      <Icon name="trash" size={15} className="faint" />
      <span className="gx-toast-msg">{msg}</span>
      <button className="gx-toast-undo" onClick={onUndo}>
        Deshacer
      </button>
      <button className="icon-btn sm" onClick={onClose} title="Cerrar">
        <Icon name="x" size={14} />
      </button>
    </div>
  );
}
