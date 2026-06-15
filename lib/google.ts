import "server-only";
import { google } from "googleapis";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/userinfo.email",
  "openid",
];

// Zona horaria por defecto (cuentas de Daniel). En producción se puede derivar del cliente.
export const DEFAULT_TZ = "America/Bogota";

export type Meeting = {
  id: string;
  title: string;
  start: string | null; // ISO o fecha
  end: string | null;
  allDay: boolean;
  description: string | null;
  location: string | null;
  hangoutLink: string | null;
  htmlLink: string | null;
  attendees: string[];
  done: boolean; // marcada como "ya la tuve" (persistido localmente)
};

export function oauthClient(redirectUri?: string) {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri,
  );
}

export function googleConfigured() {
  return !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;
}

export function authUrl(redirectUri: string, state: string) {
  return oauthClient(redirectUri).generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: GOOGLE_SCOPES,
    state,
    include_granted_scopes: true,
  });
}

/** Cliente de Calendar autenticado para un proyecto (refresca y persiste tokens). */
async function calendarForProject(projectId: string) {
  const sb = createAdminSupabaseClient();
  const { data: conn } = await sb
    .from("project_calendars")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();
  if (!conn || !conn.refresh_token) return null;

  const client = oauthClient();
  client.setCredentials({
    access_token: conn.access_token ?? undefined,
    refresh_token: conn.refresh_token,
    expiry_date: conn.token_expiry ? new Date(conn.token_expiry).getTime() : undefined,
  });
  client.on("tokens", async (tokens) => {
    const patch: Record<string, string> = {};
    if (tokens.access_token) patch.access_token = tokens.access_token;
    if (tokens.refresh_token) patch.refresh_token = tokens.refresh_token;
    if (tokens.expiry_date) patch.token_expiry = new Date(tokens.expiry_date).toISOString();
    if (Object.keys(patch).length)
      await sb.from("project_calendars").update(patch).eq("project_id", projectId);
  });

  const calendar = google.calendar({ version: "v3", auth: client });
  return { calendar, calendarId: conn.calendar_id as string };
}

/** Reuniones de un día (YYYY-MM-DD local) desde el calendario del proyecto. */
export async function listProjectMeetings(
  projectId: string,
  dayISO: string,
): Promise<Meeting[]> {
  const res = await calendarForProject(projectId);
  if (!res) return [];
  const timeMin = new Date(`${dayISO}T00:00:00`);
  const timeMax = new Date(`${dayISO}T23:59:59`);
  try {
    const { data } = await res.calendar.events.list({
      calendarId: res.calendarId,
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 50,
    });
    const meetings: Meeting[] = (data.items ?? []).map((e) => ({
      id: e.id ?? "",
      title: e.summary ?? "(sin título)",
      start: e.start?.dateTime ?? e.start?.date ?? null,
      end: e.end?.dateTime ?? e.end?.date ?? null,
      allDay: !e.start?.dateTime,
      description: e.description ?? null,
      location: e.location ?? null,
      hangoutLink: e.hangoutLink ?? null,
      htmlLink: e.htmlLink ?? null,
      attendees: (e.attendees ?? []).map((a) => a.email ?? "").filter(Boolean),
      done: false,
    }));

    // Marca las que ya se tuvieron (check persistido localmente)
    const ids = meetings.map((m) => m.id).filter(Boolean);
    if (ids.length) {
      const sb = createAdminSupabaseClient();
      const { data: comps } = await sb
        .from("meeting_completions")
        .select("event_id")
        .eq("project_id", projectId)
        .eq("is_done", true)
        .in("event_id", ids);
      const doneSet = new Set((comps ?? []).map((c) => c.event_id as string));
      meetings.forEach((m) => (m.done = doneSet.has(m.id)));
    }
    return meetings;
  } catch {
    return [];
  }
}

/** Crea un evento en el calendario del proyecto. */
export async function createProjectMeeting(
  projectId: string,
  input: {
    title: string;
    dateISO: string;
    startTime: string; // HH:MM
    endTime: string; // HH:MM
    attendees?: string[];
    addMeet?: boolean;
    description?: string;
  },
): Promise<{ ok: boolean; error?: string }> {
  const res = await calendarForProject(projectId);
  if (!res) return { ok: false, error: "Calendario no conectado" };
  try {
    await res.calendar.events.insert({
      calendarId: res.calendarId,
      conferenceDataVersion: input.addMeet ? 1 : 0,
      sendUpdates: "all",
      requestBody: {
        summary: input.title,
        description: input.description,
        start: { dateTime: `${input.dateISO}T${input.startTime}:00`, timeZone: DEFAULT_TZ },
        end: { dateTime: `${input.dateISO}T${input.endTime}:00`, timeZone: DEFAULT_TZ },
        attendees: (input.attendees ?? []).map((email) => ({ email })),
        conferenceData: input.addMeet
          ? { createRequest: { requestId: `gx-${projectId}-${input.dateISO}-${input.startTime}`, conferenceSolutionKey: { type: "hangoutsMeet" } } }
          : undefined,
      },
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error al crear el evento" };
  }
}

/** Guarda la conexión tras el callback de OAuth. */
export async function saveConnection(input: {
  projectId: string;
  email: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  expiryDate: number | null;
  scope: string | null;
}) {
  const sb = createAdminSupabaseClient();
  await sb.from("project_calendars").upsert(
    {
      project_id: input.projectId,
      email: input.email,
      access_token: input.accessToken,
      refresh_token: input.refreshToken,
      token_expiry: input.expiryDate ? new Date(input.expiryDate).toISOString() : null,
      scope: input.scope,
      calendar_id: "primary",
    },
    { onConflict: "project_id" },
  );
}

export async function getConnectionMeta(projectId: string) {
  const sb = createAdminSupabaseClient();
  const { data } = await sb
    .from("project_calendars")
    .select("email, created_at")
    .eq("project_id", projectId)
    .maybeSingle();
  return data ? { email: data.email as string | null, connected: true } : { email: null, connected: false };
}

export async function disconnect(projectId: string) {
  const sb = createAdminSupabaseClient();
  await sb.from("project_calendars").delete().eq("project_id", projectId);
}
