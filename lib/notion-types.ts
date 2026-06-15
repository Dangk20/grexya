// Tipos compartidos de la integración con Notion (sin código de servidor,
// para poder importarlos también desde componentes cliente).

export type NotionProp = { name: string; type: string; options: string[] };
export type NotionSchema = { databaseId: string; title: string; properties: NotionProp[] };
export type NotionUser = { id: string; name: string };

/** Mapeo de campos de Grexya → propiedades de la DB de Notion. */
export type NotionMapping = {
  title?: { name: string };
  due?: { name: string };
  // status/select: la clave es el status_id de Grexya, o "__done__" para completada
  status?: { name: string; type: "status" | "select"; map: Record<string, string> };
  // select/status: la clave es el cuadrante Eisenhower (ui/ni/un/nn)
  priority?: { name: string; type: "select" | "status"; map: Record<string, string> };
  assignee?: { name: string };
};

export type NotionConn = {
  access_token: string;
  database_id: string;
  notion_user_id: string | null;
  mapping: NotionMapping;
};

export type NotionConfig = {
  connected: boolean;
  databaseTitle: string | null;
  notionUserId: string | null;
  mapping: NotionMapping;
  properties: NotionProp[];
  users: NotionUser[];
};
