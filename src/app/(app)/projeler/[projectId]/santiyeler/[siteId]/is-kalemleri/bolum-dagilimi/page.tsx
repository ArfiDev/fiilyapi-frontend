"use client";

import { useParams } from "next/navigation";

import { AccessDenied } from "@/components/settings/AccessDenied";
import { SectionDistributionView } from "@/components/boq-section-distribution/SectionDistributionView";
import { useSite } from "@/lib/api/hooks/useSites";
import { isForbidden } from "@/lib/api/unwrap";
import { routes } from "@/lib/routes";

// BDG · Bölüm Dağılımı. Rota is-kalemleri sayfasının altındadır; slug → kanonik
// kimlik deseni AYNI (`GET /sites/{id}/boq/section-distribution` UUID bekler).
export default function SectionDistributionPage() {
  // 🔴 URL-3 — ADRES anahtarları.
  const { projectId: projectKey, siteId: siteKey } = useParams<{
    projectId: string;
    siteId: string;
  }>();
  const siteQuery = useSite(siteKey, { project: projectKey });
  const siteId = siteQuery.data?.id ?? "";

  if (isForbidden(siteQuery.error)) return <AccessDenied />;

  return (
    <SectionDistributionView
      siteId={siteId}
      isSiteError={siteQuery.isError}
      boqHref={routes.projects.sites.boq({ projectId: projectKey, siteId: siteKey })}
    />
  );
}
