"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useState } from "react";

import { downloadBoqExport } from "@/lib/api/boq-client";
import { BoqItemFormModal, type BoqItemFormMode } from "@/components/boq/BoqItemFormModal";
import { BoqTable } from "@/components/boq/BoqTable";
import { BoqTotalsStrip } from "@/components/boq/BoqTotalsStrip";
import { AccessDenied } from "@/components/settings/AccessDenied";
import { SiteDetailTabs } from "@/components/site-detail/SiteDetailTabs";
import { Button } from "@/components/ui/button/Button";
import { useBoq, type BoqItem, type BoqListResponse } from "@/lib/api/hooks/useBoq";
import { useSite } from "@/lib/api/hooks/useSites";
import { isForbidden } from "@/lib/api/unwrap";
import { useModulePermission } from "@/lib/auth/useModulePermission";
import { BOQ_EDIT } from "@/lib/auth/page-gates";
import { useButtonGate } from "@/lib/auth/usePagePermission";
import "@/components/boq/boq.css";
import { routes } from "@/lib/routes";

// Ekran 13 · İş Kalemleri (BOQ) — spec §2.1. Rota `[projectId]/layout.tsx`
// altindadir; o layout artik yalniz stylesheet yukler (DRILL-KALDIR
// 2026-08-29). Bu sayfa KENDI LAYOUT'UNU KURMAZ.
export default function BoqPage() {
  const pathname = usePathname();
  // 🔴 URL-3 — ADRES anahtarlari.
  const { projectId: projectKey, siteId: siteKey } = useParams<{
    projectId: string;
    siteId: string;
  }>();
  // Santiye sorgusu breadcrumb icindir. 🔴 DRILL-KALDIR: drill kabugu ayni
  // anahtari cekiyordu, artik cekmiyor — bu ekranin TEK cagirani burasidir.
  const siteQuery = useSite(siteKey, { project: projectKey });
  // SLUG -> KANONIK KIMLIK: `GET /sites/{id}/boq` (ve indirme ucu) UUID bekler.
  const siteId = siteQuery.data?.id ?? "";
  const boqQuery = useBoq(siteId);
  // Yazma yuzeyleri kapisi (spec §2.5). Yetki zorlamasi HER ZAMAN backend'de;
  // bu kapi yalniz salt-okunur role calismayan buton gostermemek icin.
  // `canDelete` AYRI kapidir: silme uclari `admin` seviyesindedir (§7.5.6).
  const { canWrite: moduleCanWrite, canDelete: moduleCanDelete } = useModulePermission("boq");
  // IZN-F2.x · kalem/grup yaz = santiye.is_kalemleri/bolum_dagilimi Düzenler (VEYA); kalem SİLME = yalnız SA.
  const canWrite = useButtonGate({ pages: BOQ_EDIT, need: "edit", fallback: moduleCanWrite });
  const canDelete = useButtonGate({ pages: BOQ_EDIT, need: "sa", fallback: moduleCanDelete });
  // Tek modal, iki kip (spec §7.1): `null` = kapali.
  const [formMode, setFormMode] = useState<BoqItemFormMode | null>(null);
  // Excel indirme durumu (spec §8.3). Sunucu hatasi sayfada gorunur kalir;
  // sessiz basarisizlik yok.
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  async function handleExport() {
    setIsExporting(true);
    setExportError(null);
    try {
      await downloadBoqExport(siteId);
    } catch (error: unknown) {
      // Metinler §9.2 envanterinden; envanterde olmayan dize uydurulmaz.
      setExportError(
        isForbidden(error) ? "Bu işlem için yetkiniz yok" : "Excel dosyası indirilemedi.",
      );
    } finally {
      setIsExporting(false);
    }
  }

  if (isForbidden(boqQuery.error) || isForbidden(siteQuery.error)) return <AccessDenied />;

  const site = siteQuery.data;

  return (
    <div className="boq">
      {/* Kayıt 303 — sekme şeridi TEK kaynaktan (`SiteDetailTabs`); bu sayfa
          kardeş görünümlerin (Stok/Puantaj/Belgeler/Günlük) hepsinin bastığı
          şeridi hiç basmıyordu. */}
      <SiteDetailTabs projectKey={projectKey} siteKey={siteKey} activePath={pathname} />
      {/* Breadcrumb (mockup 62) — onayli sapma C: sozlesme numarasi basilmaz.
          Santiye adi bilinmeden hic basilmaz; uydurma etiket yazilmaz. */}
      {site && (
        <p className="boq__crumb">
          <Link
            className="boq__crumb-link"
            href={routes.projects.sites.detail({ projectId: projectKey, siteId: siteKey })}
          >
            ← {site.name}
          </Link>
          {` · ${site.project.name} / ${site.name}`}
        </p>
      )}

      <div className="boq__title-bar">
        <h1 className="boq__title">İş Kalemleri (BOQ)</h1>
        {/* "Excel Indir" okuma ucudur (`boq:view` yeter) → HER ZAMAN gorunur;
            "+ Is Kalemi" yazma yuzeyidir → izin kapisinin arkasinda (§2.5). */}
        <div className="boq__actions">
          {/* BDG · K2: kalem x bölüm dağılımı AYRI sayfadır, okuma yüzeyidir
              (`boq:view` yeter) → "Excel İndir" gibi HER ZAMAN görünür. Adres
              ADRES anahtarlarından kurulur (site yüklenmeden de çalışır). */}
          <Link
            className="btn btn--secondary btn--md boq-action"
            href={routes.projects.sites.boqDistribution({ projectId: projectKey, siteId: siteKey })}
          >
            Bölüm Dağılımı
          </Link>
          <Button
            variant="secondary"
            className="boq-action"
            onClick={handleExport}
            disabled={isExporting}
          >
            {isExporting ? "İndiriliyor…" : "Excel İndir"}
          </Button>
          {canWrite && (
            <Button
              variant="primary"
              className="boq-action boq-action--primary"
              onClick={() => setFormMode({ kind: "create" })}
            >
              + İş Kalemi
            </Button>
          )}
        </div>
      </div>

      {exportError && (
        <p className="boq__message" role="alert">
          {exportError}
        </p>
      )}

      {/* Kart seridi yukleme/hata/bos durumlarinda da basilir (spec §9 sonu);
          dordu de yer tutucudur (spec §4). */}
      <BoqTotalsStrip totals={boqQuery.data?.totals} />

      <BoqBody
        isError={boqQuery.isError}
        data={boqQuery.data}
        canWrite={canWrite}
        onCreate={() => setFormMode({ kind: "create" })}
        onEditItem={(item, groupId) => setFormMode({ kind: "edit", item, groupId })}
      />

      {formMode && (
        <BoqItemFormModal
          siteId={siteId}
          projectId={siteQuery.data?.project.id ?? ""}
          groups={boqQuery.data?.groups ?? []}
          mode={formMode}
          canDelete={canDelete}
          onClose={() => setFormMode(null)}
        />
      )}
    </div>
  );
}

// Durum dallari (spec §9): 403 sayfa duzeyinde yakalanir, kalan iki dal burada.
// Baslik seridi ve kart seridi her durumda basilir, yalniz govde degisir.
function BoqBody({
  isError,
  data,
  canWrite,
  onCreate,
  onEditItem,
}: {
  isError: boolean;
  data?: BoqListResponse;
  canWrite: boolean;
  onCreate: () => void;
  onEditItem: (item: BoqItem, groupId: string) => void;
}) {
  if (isError) return <p className="boq__message">İş kalemleri yüklenemedi</p>;
  if (!data) return <p className="boq__message">Yükleniyor…</p>;
  return (
    <BoqTable
      groups={data.groups}
      totals={data.totals}
      canWrite={canWrite}
      onCreate={onCreate}
      onEditItem={onEditItem}
    />
  );
}
