# grexya-mcp

Servidor MCP que deja a **Claude controlar la base de datos de Grexya** desde la terminal: listar/crear proyectos, listar/crear/actualizar tareas, agregar notas y buscar.

## Instalar

```bash
cd grexya-app/mcp
npm install
```

## Variables de entorno

El servidor **lee automáticamente el `.env.local` de la app** (`../.env.local`),
así que NO hay que poner secretos en `.mcp.json`. Necesita de ahí:

- `NEXT_PUBLIC_SUPABASE_URL` (o `SUPABASE_URL`)
- `SUPABASE_SERVICE_ROLE_KEY`
- `GREXYA_OWNER_ID` (opcional) — tu Clerk user id; si no, usa el primer workspace.

## Registrar en Claude Code

Agrega esta entrada a `mcpServers` en `DANGK/Grexya/.mcp.json` (sin secretos):

```json
"grexya": {
  "command": "npx",
  "args": ["tsx", "/Users/danielpena/Documents/DANGK/grexya-app/mcp/src/index.ts"],
  "env": {}
}
```

Reinicia Claude Code y tendrás las tools: `list_projects`, `create_project`,
`list_tasks`, `create_task`, `update_task`, `add_note`, `search`.

## Herramientas

| Tool | Qué hace |
|---|---|
| `list_projects` | Lista proyectos del workspace |
| `create_project` | Crea proyecto + estados Kanban |
| `list_tasks` | Lista tareas (filtro por proyecto / solo pendientes) |
| `create_task` | Crea tarea en un proyecto |
| `update_task` | Actualiza tarea (título, prioridad, hecho, plazo) |
| `add_note` | Crea nota en un proyecto |
| `search` | Busca tareas y notas por texto |
