import { routes } from "@/lib/routes";

import type { OfferListItem } from "./offer-types";

export interface OfferProjectLink {
  label: string;
  href: string;
}

/**
 * TKL-F5.5 · dönüştürülmüş teklifin "Proje: {ad} →" bağlantısı (ÜS-F5-4, TL:145). Proje rotası "slug VEYA UUID"
 * kabul eder (URL-3): slug varsa o, yoksa kimlik. Künye okunamadıysa (yalnız `project_id`) "Projeyi aç →";
 * ikisi de yoksa `null` (bağlantı uydurulmaz).
 */
export function offerProjectLink(offer: Pick<OfferListItem, "project" | "project_id">): OfferProjectLink | null {
  const { project, project_id: projectId } = offer;
  if (project !== null && project !== undefined) {
    return { label: `Proje: ${project.name} →`, href: routes.projects.detail({ projectId: project.slug ?? project.id }) };
  }
  if (projectId !== null && projectId !== undefined) {
    return { label: "Projeyi aç →", href: routes.projects.detail({ projectId }) };
  }
  return null;
}
