"use client";

import { createContext, useContext } from "react";

export type Person = { id: string; name: string; initials: string; av: string };

const PeopleContext = createContext<{ me: Person; map: Record<string, Person> }>({
  me: { id: "me", name: "Tú", initials: "T", av: "#0A0A0A" },
  map: {},
});

export function PeopleProvider({
  me,
  children,
}: {
  me: Person;
  children: React.ReactNode;
}) {
  return (
    <PeopleContext.Provider value={{ me, map: { [me.id]: me, me: me } }}>
      {children}
    </PeopleContext.Provider>
  );
}

export function usePeople() {
  return useContext(PeopleContext);
}

export function personFor(
  id: string | null | undefined,
  ctx: { me: Person; map: Record<string, Person> },
): Person {
  if (!id) return ctx.me;
  return ctx.map[id] ?? ctx.me;
}
