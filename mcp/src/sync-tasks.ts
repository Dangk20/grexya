/**
 * sync-tasks — espejo bidireccional de tareas entre Grexya.app (Supabase)
 * y las carpetas de proyectos (~/Documents/DANGK/Grexya/proyectos/<slug>/tasks/).
 *
 * Semántica:
 *  - La app es la fuente canónica. Los archivos son un espejo editable.
 *  - Archivo nuevo sin `id:` en tasks/  → se crea la tarea en la app.
 *  - Tarea nueva/actualizada en la app  → se escribe/actualiza el archivo.
 *  - Editados ambos lados               → gana el más reciente (mtime vs updated_at).
 *  - Borrar una tarea = borrarla EN LA APP (papelera). El sync elimina el archivo.
 *    Borrar solo el archivo NO borra la tarea: el sync lo regenera.
 *  - Tareas hechas se mueven a tasks/done/.
 *
 * Uso:  tsx sync-tasks.ts [--dry-run]
 */
import { createHash } from "node:crypto";
import {
  existsSync, mkdirSync, readdirSync, readFileSync, renameSync,
  statSync, unlinkSync, writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECTS_DIR = join(process.env.HOME ?? "", "Documents/DANGK/Grexya/proyectos");
const SYNC_DIR = join(PROJECTS_DIR, ".grexya-sync");
const STATE_FILE = join(SYNC_DIR, "state.json");
const LOCK_FILE = join(SYNC_DIR, "lock");
const DRY = process.argv.includes("--dry-run");

// carpeta → slug en la app (cuando difieren)
const FOLDER_TO_APP: Record<string, string> = {
  kora: "kora-shopping",
  "marca-personal": "dangk",
  aupair: "destino-aur",
};
const APP_TO_FOLDER: Record<string, string> = Object.fromEntries(
  Object.entries(FOLDER_TO_APP).map(([f, a]) => [a, f]),
);

function loadDotEnv() {
  try {
    const txt = readFileSync(join(HERE, "..", "..", ".env.local"), "utf8");
    for (const line of txt.split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch { /* usa el entorno */ }
}
loadDotEnv();

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type Task = {
  id: string; project_id: string; title: string; description: string | null;
  priority: string | null; front: string | null; due_date: string | null;
  is_done: boolean; updated_at: string;
};
type StateEntry = { path: string; fileHash: string; remoteUpdated: string };
type DocEntry = { noteId: string; hash: string };
type State = { tasks: Record<string, StateEntry>; docs?: Record<string, DocEntry> };

/** Documentos .md de un proyecto (recursivo), excluyendo tasks/ y meta. */
function walkDocs(folder: string, sub = ""): string[] {
  const out: string[] = [];
  const dir = join(folder, sub);
  if (!existsSync(dir)) return out;
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    if (d.name.startsWith(".") || d.name.startsWith("_")) continue;
    const rel = sub ? join(sub, d.name) : d.name;
    if (d.isDirectory()) {
      if (["tasks", "node_modules"].includes(d.name)) continue;
      out.push(...walkDocs(folder, rel));
    } else if (d.name.endsWith(".md") && d.name !== "CLAUDE.md") {
      out.push(rel);
    }
  }
  return out;
}

const log = (msg: string) =>
  console.log(`${new Date().toISOString()} ${DRY ? "[dry] " : ""}${msg}`);

function sha(s: string) { return createHash("sha256").update(s).digest("hex"); }

function slugify(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "tarea";
}

function yamlEscape(s: string) {
  return /[:#\[\]{}"'\n]|^\s|\s$/.test(s) ? JSON.stringify(s) : s;
}

function renderTask(t: Task): string {
  const lines = ["---", `id: ${t.id}`, `title: ${yamlEscape(t.title)}`, `done: ${t.is_done}`];
  if (t.priority) lines.push(`priority: ${t.priority}`);
  if (t.front) lines.push(`front: ${t.front}`);
  if (t.due_date) lines.push(`due: ${t.due_date}`);
  lines.push(`updated: ${t.updated_at}`, "---", "");
  if (t.description) lines.push(t.description.trimEnd(), "");
  return lines.join("\n");
}

type ParsedFile = {
  id?: string; title?: string; done?: boolean; priority?: string;
  front?: string; due?: string; body: string;
};
function parseTaskFile(content: string, filename: string): ParsedFile {
  const out: ParsedFile = { body: "" };
  const m = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  const bodyRaw = m ? m[2] : content;
  if (m) {
    for (const line of m[1].split("\n")) {
      const kv = line.match(/^(\w+):\s*(.*)$/);
      if (!kv) continue;
      let v = kv[2].trim();
      if (/^".*"$/.test(v)) { try { v = JSON.parse(v); } catch { /* literal */ } }
      const k = kv[1];
      if (k === "id") out.id = v;
      else if (k === "title") out.title = v;
      else if (k === "done") out.done = v === "true";
      else if (k === "priority") out.priority = v;
      else if (k === "front") out.front = v;
      else if (k === "due") out.due = v;
    }
  }
  if (!out.title) {
    const h = bodyRaw.match(/^#\s+(.+)$/m);
    out.title = h ? h[1].trim() : filename.replace(/\.md$/, "").replace(/[-_]+/g, " ").trim();
    out.body = h ? bodyRaw.replace(/^#\s+.+$/m, "").trim() : bodyRaw.trim();
  } else {
    out.body = bodyRaw.trim();
  }
  return out;
}

function taskRelPath(folder: string, t: Task): string {
  const name = `${t.id.slice(0, 8)}-${slugify(t.title)}.md`;
  return join(folder, "tasks", t.is_done ? "done" : "", name);
}

function ensureDir(p: string) { if (!DRY) mkdirSync(p, { recursive: true }); }

function readState(): State {
  try { return JSON.parse(readFileSync(STATE_FILE, "utf8")); }
  catch { return { tasks: {} }; }
}

async function main() {
  // lock para evitar corridas simultáneas
  ensureDir(SYNC_DIR);
  if (existsSync(LOCK_FILE)) {
    const age = Date.now() - statSync(LOCK_FILE).mtimeMs;
    if (age < 10 * 60_000) { log("lock activo, salto esta corrida"); return; }
  }
  if (!DRY) writeFileSync(LOCK_FILE, String(process.pid));

  try {
    const state = readState();

    // ── 1. Proyectos: carpeta ↔ app ────────────────────────────────────────
    const { data: ws } = await sb.from("workspaces").select("id")
      .order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (!ws) throw new Error("No hay workspace en la app.");

    const { data: projects, error: pErr } = await sb.from("projects")
      .select("id,slug,name").eq("workspace_id", ws.id);
    if (pErr) throw new Error(pErr.message);
    const bySlug = new Map((projects ?? []).map((p) => [p.slug, p]));

    const folders = readdirSync(PROJECTS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith("."))
      .map((d) => d.name);

    // carpeta sin proyecto en la app → crearlo
    for (const folder of folders) {
      const appSlug = FOLDER_TO_APP[folder] ?? folder;
      if (bySlug.has(appSlug)) continue;
      log(`proyecto nuevo en app: ${appSlug} (desde carpeta ${folder}/)`);
      if (DRY) continue;
      const name = folder.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      const { data: proj, error } = await sb.from("projects")
        .insert({ workspace_id: ws.id, name, slug: appSlug, emoji: "📁", type: "venture" })
        .select("id,slug,name").single();
      if (error) throw new Error(error.message);
      await sb.from("project_statuses").insert(
        [["Sin empezar", "gray"], ["En progreso", "blue"], ["Listo", "green"]]
          .map(([n, c], i) => ({ project_id: proj.id, name: n, color: c, position: i })),
      );
      bySlug.set(proj.slug, proj);
    }

    // proyecto en la app sin carpeta → crearla
    const folderOf = new Map<string, string>(); // project_id → carpeta absoluta
    for (const p of bySlug.values()) {
      const folder = APP_TO_FOLDER[p.slug] ?? p.slug;
      const abs = join(PROJECTS_DIR, folder);
      if (!existsSync(abs)) { log(`carpeta nueva: ${folder}/ (proyecto '${p.name}')`); ensureDir(abs); }
      ensureDir(join(abs, "tasks"));
      ensureDir(join(abs, "tasks", "done"));
      folderOf.set(p.id, abs);
    }

    // ── 2. Tareas remotas ─────────────────────────────────────────────────
    const { data: remoteData, error: tErr } = await sb.from("tasks")
      .select("id,project_id,title,description,priority,front,due_date,is_done,updated_at")
      .in("project_id", [...folderOf.keys()])
      .is("parent_task_id", null).is("deleted_at", null);
    if (tErr) throw new Error(tErr.message);
    const remote = new Map((remoteData as Task[] ?? []).map((t) => [t.id, t]));

    // ── 3. Archivos locales ───────────────────────────────────────────────
    type LocalFile = { path: string; parsed: ParsedFile; hash: string; mtime: number; projectId: string };
    const locals: LocalFile[] = [];
    for (const [projectId, folder] of folderOf) {
      for (const sub of ["tasks", join("tasks", "done")]) {
        const dir = join(folder, sub);
        if (!existsSync(dir)) continue;
        for (const f of readdirSync(dir)) {
          if (!f.endsWith(".md") || f.startsWith("_") || f.toLowerCase() === "readme.md") continue;
          const path = join(dir, f);
          const content = readFileSync(path, "utf8");
          locals.push({
            path, parsed: parseTaskFile(content, f), hash: sha(content),
            mtime: statSync(path).mtimeMs, projectId,
          });
        }
      }
    }
    const localById = new Map(locals.filter((l) => l.parsed.id).map((l) => [l.parsed.id!, l]));

    const stats = { creadasApp: 0, creadasLocal: 0, subidas: 0, bajadas: 0, borradas: 0, conflictos: 0 };

    const writeMirror = (t: Task, oldPath?: string) => {
      const path = taskRelPath(folderOf.get(t.project_id)!, t);
      if (!DRY) {
        ensureDir(dirname(path));
        if (oldPath && oldPath !== path && existsSync(oldPath)) renameSync(oldPath, path);
        writeFileSync(path, renderTask(t));
      }
      state.tasks[t.id] = { path, fileHash: sha(renderTask(t)), remoteUpdated: t.updated_at };
      return path;
    };

    const pushLocal = async (t: Task, l: LocalFile) => {
      const p = l.parsed;
      const patch: Record<string, unknown> = {
        title: p.title, description: p.body || null,
        priority: p.priority ?? null, front: p.front ?? null,
        due_date: p.due ?? null, is_done: p.done ?? false,
      };
      if ((p.done ?? false) !== t.is_done) {
        patch.completed_at = p.done ? new Date().toISOString() : null;
      }
      if (DRY) { state.tasks[t.id] = state.tasks[t.id]; return; }
      const { data, error } = await sb.from("tasks").update(patch)
        .eq("id", t.id)
        .select("id,project_id,title,description,priority,front,due_date,is_done,updated_at")
        .single();
      if (error) throw new Error(`update ${t.id}: ${error.message}`);
      writeMirror(data as Task, l.path);
    };

    // 3a. archivos sin id → crear tarea en la app
    for (const l of locals.filter((x) => !x.parsed.id)) {
      const p = l.parsed;
      log(`nueva tarea desde archivo: "${p.title}" (${l.path.replace(PROJECTS_DIR + "/", "")})`);
      stats.creadasApp++;
      if (DRY) continue;
      const { data: status } = await sb.from("project_statuses").select("id")
        .eq("project_id", l.projectId).order("position").limit(1).maybeSingle();
      const { data, error } = await sb.from("tasks").insert({
        project_id: l.projectId, title: p.title, description: p.body || null,
        priority: p.priority ?? null, front: p.front ?? null, due_date: p.due ?? null,
        is_done: p.done ?? false, completed_at: p.done ? new Date().toISOString() : null,
        status_id: status?.id ?? null,
      }).select("id,project_id,title,description,priority,front,due_date,is_done,updated_at").single();
      if (error) throw new Error(`insert "${p.title}": ${error.message}`);
      unlinkSync(l.path); // el espejo canónico lo escribe writeMirror
      remote.set((data as Task).id, data as Task); // ya existe: que 3c no la trate como borrada
      writeMirror(data as Task);
    }

    // 3b. reconciliar por id
    for (const [id, t] of remote) {
      const st = state.tasks[id];
      const l = localById.get(id);
      if (!st) { // nunca vista: escribir espejo (si hay archivo local a mano, gana el remoto)
        writeMirror(t, l?.path); stats.creadasLocal++; continue;
      }
      const remoteChanged = t.updated_at !== st.remoteUpdated;
      const fileChanged = l ? l.hash !== st.fileHash : false;
      if (!l) { writeMirror(t); stats.creadasLocal++; continue; } // archivo borrado a mano → regenerar
      if (remoteChanged && fileChanged) {
        stats.conflictos++;
        if (new Date(t.updated_at).getTime() >= l.mtime) {
          log(`conflicto en "${t.title}": gana la app`); writeMirror(t, l.path); stats.bajadas++;
        } else {
          log(`conflicto en "${t.title}": gana el archivo`); await pushLocal(t, l); stats.subidas++;
        }
      } else if (remoteChanged) {
        writeMirror(t, l.path); stats.bajadas++;
      } else if (fileChanged) {
        log(`push: "${l.parsed.title}"`); await pushLocal(t, l); stats.subidas++;
      }
    }

    // 3c. en estado pero ya no en la app (borrada/papelera) → quitar archivo
    for (const [id, st] of Object.entries(state.tasks)) {
      if (remote.has(id)) continue;
      if (existsSync(st.path)) { log(`borrada en app → quito ${st.path.replace(PROJECTS_DIR + "/", "")}`); if (!DRY) unlinkSync(st.path); }
      delete state.tasks[id];
      stats.borradas++;
    }

    // ── 4. Documentos: carpeta → app (una sola vía; la carpeta manda) ────
    state.docs ??= {};
    const dstats = { nuevos: 0, cambiados: 0, quitados: 0 };
    const vistos = new Set<string>();
    for (const [projectId, folder] of folderOf) {
      for (const rel of walkDocs(folder)) {
        const abs = join(folder, rel);
        const content = readFileSync(abs, "utf8");
        const h = sha(content);
        const key = relative(PROJECTS_DIR, abs);
        vistos.add(key);
        const st = state.docs[key];
        if (st && st.hash === h) continue;
        const title =
          content.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? rel.replace(/\.md$/, "");
        if (!st) {
          dstats.nuevos++;
          if (DRY) continue;
          const { data, error } = await sb.from("notes")
            .insert({ project_id: projectId, title, body: content, kind: "doc" })
            .select("id").single();
          if (error) throw new Error(`doc ${key}: ${error.message}`);
          state.docs[key] = { noteId: data.id, hash: h };
        } else {
          dstats.cambiados++;
          if (!DRY) await sb.from("notes").update({ title, body: content }).eq("id", st.noteId);
          state.docs[key] = { ...st, hash: h };
        }
      }
    }
    for (const [key, st] of Object.entries(state.docs)) {
      if (vistos.has(key)) continue;
      dstats.quitados++;
      if (!DRY) await sb.from("notes").delete().eq("id", st.noteId);
      delete state.docs[key];
    }

    if (!DRY) writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    log(`ok — app+${stats.creadasApp} local+${stats.creadasLocal} ↑${stats.subidas} ↓${stats.bajadas} ✕${stats.borradas} ⚠${stats.conflictos} · docs +${dstats.nuevos} ~${dstats.cambiados} ✕${dstats.quitados}`);
  } finally {
    if (!DRY && existsSync(LOCK_FILE)) unlinkSync(LOCK_FILE);
  }
}

main().catch((e) => { console.error("sync falló:", e.message); process.exit(1); });
