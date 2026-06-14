# CLAUDE.md — grexya-app

Plataforma web **Grexya.app**: el "Notion propio" para builders. Carpeta hermana del workspace de portafolio `../Grexya/` (ese workspace NO es código; este sí). El plan maestro vive en `~/.claude/plans/` (Grexya.app).

## Qué es

Un builder crea **proyectos**, cada uno con contexto, pipeline, **tareas**, equipo y notas. El diferenciador frente a Notion es el **Centro de mando** (`/mando`): fusiona las tareas de *todos* los proyectos en una vista. ADN de UI: tarjetas Kanban arrastrables + vista lista, estilo Notion (light por defecto, dark a gusto).

## Stack y convenciones

- **Next.js 16 App Router + TS**, **Tailwind v4** (CSS-first en `app/globals.css`, sin `tailwind.config`).
- **Tema**: `next-themes` por clase. Tokens de marca en `globals.css` (`--ink`/paper, color solo en chips funcionales). Marca monocroma; fuentes Hanken Grotesk + JetBrains Mono.
- **Auth**: Clerk (`@clerk/nextjs`). Rutas públicas definidas en `middleware.ts`. No construir login propio.
- **Datos**: Supabase con RLS por token de Clerk (`auth.jwt()->>'sub'`). Clientes en `lib/supabase/{server,client}.ts` — usar esos, no crear nuevos.
- **DnD**: dnd-kit para Kanban.
- Working language: **español (es_CO)** en UI y copy.

## Estado actual

Fase 0 (scaffold) lista: marca, temas, Clerk, shell con sidebar + `/mando` + `/proyectos/[slug]` (estados vacíos, datos de `lib/placeholder-data.ts`). Falta Fase 1: migraciones Supabase + CRUD real.

## Comandos

```bash
npm run dev     # http://localhost:3000  (requiere .env.local con claves de Clerk)
npm run build
npm run lint
```
