import type { Project } from "@/lib/types";

/** Renderiza el logo subido (icon_url) o, si no hay, el emoji del proyecto. */
export function ProjectIcon({
  project,
}: {
  project: Pick<Project, "emoji" | "icon_url">;
}) {
  if (project.icon_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={project.icon_url}
        alt=""
        style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit", display: "block" }}
      />
    );
  }
  return <>{project.emoji}</>;
}
