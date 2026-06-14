# Grexya.app

**Tu base central para construir y orquestar todos tus proyectos.** El "Notion propio" para builders: cada proyecto con su contexto, pipeline, tareas, equipo y notas — y un **Centro de mando** que fusiona las tareas de *todos* tus proyectos en una sola vista (lo que Notion cobra).

> Público objetivo: builders / business-tech que crean ideas y proyectos a diario.

## Stack

- **Next.js 16** (App Router, TypeScript) — deploy gratis en Vercel
- **Tailwind v4** + componentes propios estilo Notion (light/dark con `next-themes`)
- **Clerk** — autenticación / identidad (login gestionado, Organizations para equipo)
- **Supabase** — Postgres + RLS + Realtime + Storage (datos; desde la Fase 1)
- **dnd-kit** — tableros Kanban arrastrables
- **Anthropic API** — chat con agentes propios (Forge/Aura/grexya…) desde la Fase 2

## Puesta en marcha

1. **Instala dependencias** (ya hecho si clonaste con `node_modules`):
   ```bash
   npm install
   ```

2. **Crea las cuentas y copia las claves** a `.env.local` (parte de `.env.local.example`):
   ```bash
   cp .env.local.example .env.local
   ```
   - **Clerk** → https://dashboard.clerk.com → crea una app → copia `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` y `CLERK_SECRET_KEY`. Habilita Google y/o email.
   - **Supabase** (desde Fase 1) → https://supabase.com → crea un proyecto → copia URL y `anon key`. Conéctalo a Clerk en *Authentication → Third-Party Auth → Clerk*.

3. **Arranca:**
   ```bash
   npm run dev
   ```
   Abre http://localhost:3000 → te redirige a `/sign-in` (Clerk) → tras entrar, `/mando`.

## Estructura

```
app/
  (auth)/          # sign-in y sign-up (Clerk)
  (app)/
    mando/         # Centro de mando: todas las tareas de todos los proyectos
    proyectos/[slug]/   # proyecto: Kanban | Lista | Notas | Chat IA
components/         # sidebar, theme, marca, ui
lib/
  supabase/        # clientes server/cliente (Clerk + Supabase)
  placeholder-data.ts
supabase/          # migraciones + seed (Fase 1)
mcp/               # grexya-mcp para que Claude controle la DB (Fase 1.5)
```

## Roadmap

- **Fase 0 — Scaffold** ✅ marca, temas light/dark, Clerk, shell con sidebar y Centro de mando.
- **Fase 1 — Núcleo** Supabase + modelo de datos + CRUD proyectos/tareas + Kanban/Lista + Centro de mando real + seed.
- **Fase 1.5 — grexya-mcp** Claude controla la DB desde la terminal + notas.
- **Fase 2 — Chat IA** agentes propios dentro de cada proyecto.
- **Fase 3 — Equipo** invitaciones (Clerk Organizations), roles, realtime, pipeline E0→E6.

## Tipos de proyecto

Además del proyecto "venture" (Quepa, Wenú…), Grexya soportará un **proyecto tipo Diario/Empleo** con vista de planificación diaria: tareas por día, matriz de Eisenhower (urgente/importante), **Top 3 del día** y **subtareas**. Ver el plan maestro.
