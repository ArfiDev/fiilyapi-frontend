"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { AccessDenied } from "@/components/settings/AccessDenied";
import { PROJECT_LIST_MAX_LIMIT, useProjects } from "@/lib/api/hooks/useProjects";
import { isForbidden } from "@/lib/api/unwrap";
import { useButtonGate } from "@/lib/auth/usePagePermission";
import { buildListTruncation, listTruncationMessage } from "@/lib/list-truncation";

import { ProjectCard } from "./ProjectCard";
import { ProjectTabs } from "./ProjectTabs";
import { TypeLegend } from "./TypeLegend";
import { parseProjectTab, tabToFilter, type ProjectTab } from "./tabs";
import "./projects.css";
import { routes } from "@/lib/routes";

/**
 * Proje Takvimi (Gantt) rotası — bekçiye kayıtlı olabilmesi için DIŞA AKTARILIR
 * (`projects-routes.test.ts`). Elle yazılmış bir kopya bayatlar.
 */
export const PROJECT_TIMELINE_HREF = routes.projects.calendar();

export function ProjectsView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = parseProjectTab(searchParams.get("tab"));
  // M5_3 #400 — "+ Yeni Proje" eskiden HİÇ izin kontrolüyle sarılmadan
  // render ediliyordu; kapı yalnız hedef formda (ProjectCreateView) vardı.
  // Backend yine de yazmayı reddeder ama liste ekranında görünür/tıklanabilir
  // bir buton yanlış bir yetki izlenimi verirdi.
  // IZN-F2.x · "Yeni proje" = genel.projeler Düzenler (grant yoksa bugünkü modül kararı).
  const canCreateProject = useButtonGate({ pages: "genel.projeler", need: "edit" });

  // Kırpma korkuluğu (F-FIN emsali): tavan AÇIKÇA gönderilir, eksik kalan
  // kayıt `total` üzerinden GÖRÜNÜR bir bantla bildirilir — sessizce
  // kırpılmaz. Mockup (`Ekran 4 - Projeler.dc.html`) sayfalama çubuğu
  // ÇİZMEZ (ölçüldü: 0 eşleşme) — bu yüzden çubuk EKLENMEDİ, yalnızca
  // tavanı aşan portföy bandı görür.
  const projectsQuery = useProjects({ ...tabToFilter(tab), limit: PROJECT_LIST_MAX_LIMIT });

  function handleTabChange(next: ProjectTab) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "all") params.delete("tab");
    else params.set("tab", next);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  if (isForbidden(projectsQuery.error)) return <AccessDenied />;
  if (projectsQuery.isError) return <p className="prj-message">Projeler yüklenemedi</p>;
  if (projectsQuery.isLoading || !projectsQuery.data) {
    return <p className="prj-message">Yükleniyor…</p>;
  }

  const { counts, items, total } = projectsQuery.data;
  // Backend ayri "active" sayaci vermiyor; tamamlanmamis her sey portfoydedir (spec §4.1).
  const activeCount = counts.all - counts.completed;
  const truncation = buildListTruncation(items.length, total);

  return (
    <div className="prj">
      <p className="prj__breadcrumb">Portföy · {activeCount} Aktif Proje</p>
      <div className="prj__title-row">
        <h1 className="prj__title">Projeler</h1>
        <div className="prj__title-actions">
          {/* F-TKV K1 — Proje Takvimi'nin TEK giriş noktası. Sidebar'a satır
              EKLENMEZ (bir nav satırı 44 görsel kareyi birden oynatır); bağlantı
              `projects-routes.test.ts` bekçisine KAYITLIDIR. */}
          <Link href={PROJECT_TIMELINE_HREF} className="prj__timeline-btn">
            Proje Takvimi
          </Link>
          {canCreateProject ? (
            <Link href={routes.projects.new()} className="prj__new-btn">
              + Yeni Proje
            </Link>
          ) : (
            <span
              className="prj__new-btn prj__new-btn--disabled"
              aria-disabled="true"
              title="Bu modülde yazma yetkiniz yok"
            >
              + Yeni Proje
            </span>
          )}
        </div>
      </div>
      <TypeLegend counts={counts} />
      <ProjectTabs active={tab} counts={counts} onChange={handleTabChange} />
      {/* Görünür kırpılma bandı — mockup sayfalama çizmez (F-PRJPAGE),
          bu yüzden sayfa çubuğu EKLENMEDİ; yalnızca tavanı aşan portföy
          bandı basılır. `total <= gösterilen` iken hiçbir şey basmaz. */}
      {truncation.isTruncated && (
        <p className="prj-notice" data-testid="prj-truncation">
          {listTruncationMessage(truncation)}
        </p>
      )}
      {items.length === 0 ? (
        <section className="prj-empty">
          <p className="prj-empty__title">
            {tab === "all" ? "Henüz proje tanımlanmadı" : "Bu sekmede proje yok"}
          </p>
          <p className="prj-empty__hint">
            {tab === "all" ? "+ Yeni Proje ile başlayın" : "Başka bir sekme seçin"}
          </p>
        </section>
      ) : (
        <div className="prj-grid">
          {items.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  );
}
