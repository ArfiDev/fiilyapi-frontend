"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";

import { AccessDenied } from "@/components/settings/AccessDenied";
import { SectionCard } from "@/components/site-detail/SectionCard";
import { SiteDetailTabs } from "@/components/site-detail/SiteDetailTabs";
import { SiteHeroBar } from "@/components/site-detail/SiteHeroBar";
import { useSite } from "@/lib/api/hooks/useSites";
import { isForbidden } from "@/lib/api/unwrap";
import { SECTION_CREATE_EDIT } from "@/lib/auth/page-gates";
import { useButtonGate } from "@/lib/auth/usePagePermission";
import "@/components/site-detail/site-detail.css";
import { routes } from "@/lib/routes";

// "A-Blok Bölümleri (5)" — site adının sonundaki " Şantiyesi" ekini kırpar
// (mockup deseni, spec §5.4 satır 211).
function sectionListTitle(siteName: string, count: number): string {
  return `${siteName.replace(/ Şantiyesi$/, "")} Bölümleri (${count})`;
}

// Şantiye Detay › Bölümler (spec §5). Hero + sekme barı Task 8'de kuruldu;
// Task 9 SectionCard listesini ve dürüst boş durumu (§7.4) ekledi. "+ Bölüm
// Ekle" eylemleri F-P6 T3'te tam sayfa forma link verir (`SectionFormModal`
// EMEKLİ edildi, bkz. task-3-brief.md).
export default function SiteDetailPage() {
  const pathname = usePathname();
  // 🔴 URL-3 — iki rota parametresi de "slug VEYA UUID"dur.
  const { projectId: projectKey, siteId: siteKey } = useParams<{
    projectId: string;
    siteId: string;
  }>();
  // `GET /sites/{site_id}` slug KABUL EDER; kapsam (`?project=`) veriliyor
  // cunku `sites.slug` PROJE ICINDE tekildir, kuresel DEGIL — kapsamsiz
  // cagride belirsizlik 404 olurdu (fail-closed).
  const siteQuery = useSite(siteKey, { project: projectKey });
  // IZN-F5c · "+ Bölüm Ekle" (POST /sites/{id}/sections) = santiye.bolumler Düzenler; grant yoksa bugünkü (görünür) davranış.
  const canCreateSection = useButtonGate({ pages: SECTION_CREATE_EDIT, need: "edit", fallback: true, projectId: projectKey });

  if (isForbidden(siteQuery.error)) return <AccessDenied />;
  if (siteQuery.isError) {
    return <p className="site-detail__message">Şantiye yüklenemedi</p>;
  }
  if (siteQuery.isLoading || !siteQuery.data) {
    return <p className="site-detail__message">Yükleniyor…</p>;
  }

  const site = siteQuery.data;
  // YOL baglantilari ADRESTEKI anahtarlarla kurulur (bkz. `SiteDetailTabs`).
  const newSectionHref = routes.projects.sites.sections.new({
    projectId: projectKey,
    siteId: siteKey,
  });

  return (
    <div className="site-detail">
      <SiteHeroBar site={site} />
      <SiteDetailTabs projectKey={projectKey} siteKey={siteKey} activePath={pathname} />
      {site.section_count === 0 ? (
        <div className="site-detail__empty">
          <p>Bu şantiyede henüz bölüm tanımlanmadı.</p>
          {canCreateSection && (
            <Link href={newSectionHref} className="site-detail__empty-action">
              + Bölüm Ekle
            </Link>
          )}
        </div>
      ) : (
        <>
          <div className="site-detail__section-title">{sectionListTitle(site.name, site.section_count)}</div>
          <ul className="section-card-list" data-testid="section-list">
            {site.sections.map((section) => (
              <li key={section.id}>
                <SectionCard projectKey={projectKey} siteKey={siteKey} section={section} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
