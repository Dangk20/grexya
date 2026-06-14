# Notas técnicas privadas — Grexya.app

Companion privado (no es deliverable). Aquí van las verdades duras, la deuda técnica y lo provisional.

## Deuda técnica conocida

### 1. Capa de datos usa service role (admin) + aislamiento por userId, no RLS por token
- **Qué:** `lib/data.ts` y `app/actions/tasks.ts` usan el cliente admin (service role) y **filtran manualmente por el `userId` de Clerk** (`auth()`), en vez de usar el cliente con token de usuario y dejar que el RLS aísle.
- **Por qué:** desbloquear la Fase 1 sin depender de que el token de sesión de Clerk llegue a Supabase con el claim `role: authenticated`. El RLS está **activo en la base** como segunda barrera; las policies existen y funcionan.
- **Riesgo:** si una query olvida filtrar por `userId`, el aislamiento se rompe (el RLS no salva porque admin lo salta). Hoy es monousuario (Daniel) → riesgo bajo.
- **Cómo migrar:** validar que `getToken()` de Clerk produce un JWT que Supabase acepta como `authenticated` (probar con `lib/supabase/server.ts`). Cuando pase, cambiar lecturas/escrituras al cliente con token de usuario y quitar el filtro manual (el RLS lo hace). Endurecer antes de invitar equipo (Fase 3).

### 2. `supabase gen types` requiere PAT
- La versión 2.106 del CLI exige `SUPABASE_ACCESS_TOKEN` aun con `--db-url`. Por eso los tipos están **a mano** en `lib/types.ts` (espejo del esquema). Si crece el esquema, mantenerlos sincronizados, o generar un PAT y automatizar `gen types`.

### 3. Kanban: mover entre columnas sí; reordenar dentro de la columna, no aún
- El drag cambia `status_id` (mueve de columna) pero no persiste orden fino dentro de la columna. `position` se setea con `Date.now()`. Falta reordenamiento intra-columna (dnd-kit sortable).

### 4. Avatares / responsables
- Solo se muestra inicial del usuario actual. No hay datos de otros miembros (Clerk) todavía. Llega con Fase 3 (equipo).

### 5. `middleware.ts` deprecado en Next 16
- Next 16 pide renombrar a `proxy.ts`. Funciona con warning. Cambiar cuando Clerk documente el convenio nuevo.

## Pendientes de producto (capturados, sin construir)
- Vista **Diario** (proyectos tipo `diario`): día + Eisenhower + Top 3 + subtareas con checkbox. El modelo ya soporta los campos (`day_date`, `eisenhower`, `is_top3`, `parent_task_id`); falta la UI.
- **Asignación de tiempo** por proyecto (`time_target_pct`, `active_days`) + Dash de dedicación.
- Rotar el `sb_secret` de Supabase y el password de la DB (pasaron por chat en setup).
