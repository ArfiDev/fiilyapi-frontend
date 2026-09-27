import type { components } from "@/lib/api/schema";

import { ProjectCard } from "./ProjectCard";
import "./dashboard.css";
import type { DeepScale, WithPlainProgressPct } from "@/lib/api/scale";

type Project = WithPlainProgressPct<DeepScale<components["schemas"]["DashboardProjectCard"]>>;

export function ProjectGrid({ projects }: { projects: Project[] }) {
  if (projects.length === 0) {
    return (
      <section className="dash-card dash-projects-empty">
        <p className="dash-empty__title">Henüz proje tanımlanmadı</p>
        <p className="dash-empty__hint">Projeler tanımlandığında burada listelenir</p>
      </section>
    );
  }

  return (
    <div className="dash-projects">
      {projects.map((project) => (
        <ProjectCard key={project.id} project={project} />
      ))}
    </div>
  );
}
