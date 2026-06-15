"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getOrCreateWorkspace } from "@/lib/data";
import type { ModuleId } from "@/lib/types";

function coverFor(accent: string) {
  return `linear-gradient(120deg, ${accent}, color-mix(in oklab, ${accent} 55%, #fff))`;
}

async function requireUser() {
  const { userId } = await auth();
  if (!userId) throw new Error("No autenticado");
  return userId;
}

function slugify(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "proyecto";
}

const VENTURE_STATUSES = [
  { name: "Sin empezar", color: "gray" },
  { name: "En progreso", color: "blue" },
  { name: "Listo", color: "green" },
];

export async function createProject(input: {
  name: string;
  emoji?: string;
  tagline?: string;
  accent?: string;
  icon_url?: string | null;
  modules?: ModuleId[];
}) {
  const userId = await requireUser();
  const name = input.name.trim();
  if (!name) throw new Error("El nombre es obligatorio");
  const accent = input.accent ?? "#5B5BD6";

  const ws = await getOrCreateWorkspace(userId);
  const supabase = createAdminSupabaseClient();

  // slug único dentro del workspace
  const base = slugify(name);
  let slug = base;
  let n = 1;
  while (true) {
    const { data } = await supabase
      .from("projects")
      .select("id")
      .eq("workspace_id", ws.id)
      .eq("slug", slug)
      .maybeSingle();
    if (!data) break;
    slug = `${base}-${++n}`;
  }

  const { count } = await supabase
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", ws.id);

  const modules =
    input.modules && input.modules.length
      ? input.modules
      : (["hoy", "kanban", "lista", "notas"] as ModuleId[]);

  const { data: project, error } = await supabase
    .from("projects")
    .insert({
      workspace_id: ws.id,
      name,
      slug,
      emoji: input.emoji || "🚀",
      accent,
      cover: coverFor(accent),
      tagline: input.tagline?.trim() || "Nuevo mundo en construcción",
      icon_url: input.icon_url ?? null,
      modules,
      position: count ?? 0,
    })
    .select("*")
    .single();
  if (error) throw error;

  await supabase.from("project_statuses").insert(
    VENTURE_STATUSES.map((s, idx) => ({
      project_id: project.id,
      name: s.name,
      color: s.color,
      position: idx,
    })),
  );

  revalidatePath("/", "layout");
  return project.slug as string;
}

async function assertProjectOwnership(userId: string, projectId: string) {
  const ws = await getOrCreateWorkspace(userId);
  const supabase = createAdminSupabaseClient();
  const { data } = await supabase
    .from("projects")
    .select("id, slug")
    .eq("id", projectId)
    .eq("workspace_id", ws.id)
    .maybeSingle();
  if (!data) throw new Error("Proyecto no encontrado");
  return data;
}

export async function updateProject(input: {
  projectId: string;
  name?: string;
  emoji?: string;
  accent?: string;
  cover?: string;
  tagline?: string;
  icon_url?: string | null;
  modules?: ModuleId[];
  context?: string;
  status?: string;
  stage?: string;
  time_target_pct?: number | null;
  active_days?: string[] | null;
}) {
  const userId = await requireUser();
  await assertProjectOwnership(userId, input.projectId);
  const { projectId, ...rest } = input;
  const patch = Object.fromEntries(
    Object.entries(rest).filter(([, v]) => v !== undefined),
  );
  const supabase = createAdminSupabaseClient();
  await supabase.from("projects").update(patch).eq("id", projectId);
  revalidatePath("/", "layout");
}

/** Sube una imagen de icono y devuelve su URL pública. */
export async function uploadProjectIcon(
  formData: FormData,
): Promise<{ url: string } | { error: string }> {
  await requireUser();
  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "Archivo inválido" };
  if (file.size > 2 * 1024 * 1024) return { error: "La imagen supera 2MB" };
  const ext = (file.name.split(".").pop() || "png").toLowerCase();
  const supabase = createAdminSupabaseClient();
  const path = `${crypto.randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error } = await supabase.storage
    .from("project-icons")
    .upload(path, buffer, { contentType: file.type, upsert: true });
  if (error) return { error: error.message };
  const { data } = supabase.storage.from("project-icons").getPublicUrl(path);
  return { url: data.publicUrl };
}

export async function deleteProject(input: { projectId: string }) {
  const userId = await requireUser();
  await assertProjectOwnership(userId, input.projectId);
  const supabase = createAdminSupabaseClient();
  await supabase.from("projects").delete().eq("id", input.projectId);
  revalidatePath("/", "layout");
}
