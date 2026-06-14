import { auth } from "@clerk/nextjs/server";
import Anthropic from "@anthropic-ai/sdk";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getOrCreateWorkspace } from "@/lib/data";
import { getAgent } from "@/lib/agents";

export const runtime = "nodejs";

const MODEL = "claude-sonnet-4-6";

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response("No autenticado", { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || !apiKey.startsWith("sk-ant")) {
    return new Response(
      "Falta configurar ANTHROPIC_API_KEY en .env.local para usar el chat IA.",
      { status: 400 },
    );
  }

  const { projectId, agentKey, message } = await req.json();
  if (!projectId || !agentKey || !message?.trim()) {
    return new Response("Petición inválida", { status: 400 });
  }

  const supabase = createAdminSupabaseClient();

  // Verificar propiedad + traer contexto del proyecto
  const ws = await getOrCreateWorkspace(userId);
  const { data: project } = await supabase
    .from("projects")
    .select("id, name, type, context")
    .eq("id", projectId)
    .eq("workspace_id", ws.id)
    .maybeSingle();
  if (!project) return new Response("Proyecto no encontrado", { status: 404 });

  // Hilo (uno por agente; reusar el más reciente o crear)
  let threadId: string;
  const { data: existing } = await supabase
    .from("agent_threads")
    .select("id")
    .eq("project_id", projectId)
    .eq("agent_key", agentKey)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) {
    threadId = existing.id;
  } else {
    const { data: created } = await supabase
      .from("agent_threads")
      .insert({ project_id: projectId, agent_key: agentKey })
      .select("id")
      .single();
    threadId = created!.id;
  }

  // Historial previo
  const { data: history } = await supabase
    .from("agent_messages")
    .select("role, content")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });

  // Guardar mensaje del usuario
  await supabase
    .from("agent_messages")
    .insert({ thread_id: threadId, role: "user", content: message });

  const agent = getAgent(agentKey);
  const system = `${agent.system}\n\nContexto del proyecto actual — Nombre: "${project.name}" · Tipo: ${project.type}.${
    project.context ? ` Contexto: ${project.context}` : ""
  }`;

  const messages = [
    ...(history ?? []).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user" as const, content: message },
  ];

  const anthropic = new Anthropic({ apiKey });

  const encoder = new TextEncoder();
  let full = "";

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const ai = anthropic.messages.stream({
          model: MODEL,
          max_tokens: 1500,
          system,
          messages,
        });
        ai.on("text", (delta) => {
          full += delta;
          controller.enqueue(encoder.encode(delta));
        });
        await ai.finalMessage();
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Error al contactar la IA";
        controller.enqueue(encoder.encode(`\n\n[Error: ${msg}]`));
      } finally {
        if (full.trim()) {
          await supabase
            .from("agent_messages")
            .insert({ thread_id: threadId, role: "assistant", content: full });
        }
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Thread-Id": threadId,
      "Cache-Control": "no-cache",
    },
  });
}
