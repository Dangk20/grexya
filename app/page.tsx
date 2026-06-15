import { redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";
import { getAppData } from "@/lib/data";
import { AppShell } from "@/components/grexya/app-shell";
import type { Person } from "@/components/grexya/people";

export default async function Home() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const [data, user] = await Promise.all([getAppData(userId), currentUser()]);

  const name = user?.firstName ?? user?.username ?? "Builder";
  const initials =
    name
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase() || "B";
  const me: Person = { id: userId, name, initials, av: "#0A0A0A" };

  return (
    <AppShell
      projects={data.projects}
      tasks={data.tasks}
      notes={data.notes}
      statuses={data.statuses}
      calendars={data.calendars}
      plannings={data.plannings}
      me={me}
    />
  );
}
