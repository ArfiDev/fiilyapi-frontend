"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";

import { cx } from "@/lib/cx";
import { AccessDenied } from "@/components/settings/AccessDenied";
import { ProjectHeroBar } from "@/components/project-detail/ProjectHeroBar";
import { SiteCard } from "@/components/project-detail/SiteCard";
import { SiteTotalsStrip } from "@/components/project-detail/SiteTotalsStrip";
import { useProject, type ProjectType } from "@/lib/api/hooks/useProjects";
import { useSites } from "@/lib/api/hooks/useSites";
import { isForbidden } from "@/lib/api/unwrap";
import { SITE_EDIT } from "@/lib/auth/page-gates";
import { useButtonGate } from "@/lib/auth/usePagePermission";
import "@/components/project-detail/project-detail.css";
import { routes } from "@/lib/routes";

// "+ Şantiye Ekle" eylemi hem ust bardaki butonda hem bos durum icinde
// gorunur (spec §7.4); ikisi de AYNI tam sayfa forma gider (§2.3) — modal
// kaldirildi. `project-detail__add-btn` sinifi KORUNUR: gorsel stil degismez.
// IZN-F5c: POST /projects/{id}/sites = proje.santiyeler Düzenler; grant yoksa
// bugünkü davranış (düğme görünür — önceden kapısızdı).
function AddSiteLink({ projectKey, className }: { projectKey: string; className?: string }) {
  const canCreate = useButtonGate({ pages: SITE_EDIT, need: "edit", fallback: true, projectId: projectKey });
  if (!canCreate) return null;
  return (
    <Link
      href={routes.projects.sites.new({ projectId: projectKey })}
      className={cx("project-detail__add-btn", className)}
    >
      + Şantiye Ekle
    </Link>
  );
}

// Şantiye listesi kendi sorgusuna sahiptir ve proje sorgusundan BAĞIMSIZ
// başarısız olabilir (kod inceleme bulgusu: yalnız `.data` dallanınca 403/500
// sonsuza kadar "Yükleniyor…" gösteriyordu). Şantiye Detay'daki sıralamanın
// aynısı: 403 → erişim reddi, diğer hatalar → dürüst hata metni, yükleniyor.
function SiteListSection({
  projectKey,
  projectType,
  sitesQuery,
}: {
  projectKey: string;
  projectType: ProjectType;
  sitesQuery: ReturnType<typeof useSites>;
}) {
  if (isForbidden(sitesQuery.error)) return <AccessDenied />;
  if (sitesQuery.isError) {
    return <p className="project-detail__message">Şantiyeler yüklenemedi</p>;
  }
  if (sitesQuery.isLoading || !sitesQuery.data) {
    return <p className="project-detail__message">Yükleniyor…</p>;
  }

  return (
    <div className="project-detail__site-grid" data-testid="site-list-grid">
      {sitesQuery.data.items.map((site) => (
        <SiteCard key={site.id} projectKey={projectKey} projectType={projectType} site={site} />
      ))}
    </div>
  );
}

// Proje Detay › Şantiyeler (spec §4). SiteCard ızgarası Task 5'te eklendi;
// SiteTotalsStrip (§4.4) + bos durum eylemi Task 6'da eklendi; santiye ekleme
// modali T11'de KALDIRILDI — iki "+ Şantiye Ekle" de tam sayfa forma gider.
export default function ProjectDetailPage() {
  const pathname = usePathname();
  // 🔴 URL-3 · rota parametresi artik "slug VEYA UUID"dur (kullanicinin
  // gordugu degisiklik: `/projeler/kopru-guclendirme`). Eski UUID linkleri de
  // AYNEN calisir — uc okuma ucu ikisini de kabul eder, yonlendirme YOK.
  const { projectId: projectKey } = useParams<{ projectId: string }>();
  const projectQuery = useProject(projectKey);
  // 🔴 SLUG -> KANONIK KIMLIK GECIS NOKTASI. `GET /projects/{project_id}/sites`
  // UUID BEKLER (slug kabul eden yalniz UC uc var); anahtari dogrudan
  // gecirmek slug'li URL'de bu listeyi 422/404'e dusururdu. Bos id ile aga
  // cikilmaz — `sitesQueryOptions` kendi `enabled` kapisini tasir.
  const projectId = projectQuery.data?.id ?? "";
  const sitesQuery = useSites(projectId);

  if (isForbidden(projectQuery.error)) return <AccessDenied />;
  if (projectQuery.isError) {
    return <p className="project-detail__message">Proje yüklenemedi</p>;
  }
  if (projectQuery.isLoading || !projectQuery.data) {
    return <p className="project-detail__message">Yükleniyor…</p>;
  }

  const project = projectQuery.data;

  return (
    <div className="project-detail">
      <ProjectHeroBar project={project} projectKey={projectKey} activePath={pathname} />
      <div className="project-detail__section-head">
        <h2 className="project-detail__section-title">Şantiyeler ({project.site_count})</h2>
        <AddSiteLink projectKey={projectKey} />
      </div>
      {project.site_count === 0 ? (
        <div className="project-detail__empty">
          <p>Bu projede henüz şantiye yok.</p>
          <AddSiteLink projectKey={projectKey} className="project-detail__empty-action" />
        </div>
      ) : (
        <SiteListSection
          projectKey={projectKey}
          projectType={project.project_type}
          sitesQuery={sitesQuery}
        />
      )}
      {sitesQuery.data && <SiteTotalsStrip totals={sitesQuery.data.totals} />}
    </div>
  );
}
