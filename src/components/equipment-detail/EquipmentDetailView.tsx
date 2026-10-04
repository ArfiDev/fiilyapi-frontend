"use client";

import { useState } from "react";
import Link from "next/link";

import { EquipmentDocumentFormModal } from "@/components/document-form/EquipmentDocumentFormModal";
import { equipmentCategoryIcon } from "@/components/equipment/category-icon";
import { EQUIPMENT_OWNERSHIP_LABELS } from "@/components/equipment/equipment-labels";
import { EquipmentTabsStrip } from "@/components/equipment/EquipmentTabsStrip";
import { AccessDenied } from "@/components/settings/AccessDenied";
import { backendErrorMessage } from "@/lib/api/error-message";
import { useEquipmentDetailScreen } from "@/lib/api/hooks/useEquipmentDetailScreen";
import { isForbidden } from "@/lib/api/unwrap";
import { hasAtLeast } from "@/lib/auth/permissions";
import { useModulePermission } from "@/lib/auth/useModulePermission";
import { EQUIPMENT_EDIT } from "@/lib/auth/page-gates";
import { useButtonGate } from "@/lib/auth/usePagePermission";
import { useSiteOptions } from "@/lib/api/hooks/useSiteOptions";

import { EquipmentDetailBody } from "./EquipmentDetailBody";
import "@/components/equipment/equipment.css";
import "./equipment-detail.css";
import { routes } from "@/lib/routes";

/** İzin matrisi anahtarı — MK-1: 21. izin modülü `equipment` (M1 ile AYNI). */
const EQUIPMENT_PERMISSION_MODULE = "equipment";

/**
 * F-MKD · `/makine/{id}` — mockup `Makine - Ekipman Detay.dc.html` (kanonik).
 * Yorumlardaki `MD:n` o dosyanın SATIR numaralarıdır.
 *
 * 🔴 Bu rota ÖNCE YOKTU: `src/app/(app)/makine/` altında `[id]/duzenle` vardı
 * ama `[id]` yoktu. (Ölçüm düzeltmesi: depoda `/makine/{id}`ye giden bir
 * bağlantı da YOKTU — yani "ölü link" değil, EKSİK EKRAN'dı; ayrıntı raporda.)
 *
 * 🔴 KATMANLAMA: `as_of` ekranın DÖNEMİNİ belirler ve o damga ancak detay
 * yanıtı geldikten sonra bilinir. Dönemden türeyen sorgular (çalışma özeti ×3,
 * yakıt özeti) bu yüzden AYRI bir bileşende (`EquipmentDetailBody`) yaşar ve
 * o bileşen ancak veri geldiğinde MOUNT edilir — böylece Rules of Hooks
 * çiğnenmeden, uydurma bir yer tutucu dönemle ağa çıkılmaz.
 */
export function EquipmentDetailView({ equipmentId }: { equipmentId: string }) {
  const permission = useModulePermission(EQUIPMENT_PERMISSION_MODULE);
  // IZN-F2.x · ekipman belgesi ekle = saha.makine_* Düzenler (VEYA).
  const canWrite = useButtonGate({
    pages: EQUIPMENT_EDIT,
    need: "edit",
    fallback: hasAtLeast(permission.level, "full"),
  });
  const detailQuery = useEquipmentDetailScreen(equipmentId);
  // Şantiye ADLARI ayrı bir kaynaktır (`EquipmentResponse` yalnız `site_id`
  // taşır — M1'in üç-kaynak notunun aynısı) ve DÖNEMDEN bağımsızdır, bu
  // yüzden dış katmanda durur; gövde onu hazır bir çözücü olarak alır.
  const siteOptions = useSiteOptions();
  const [isDocumentFormOpen, setDocumentFormOpen] = useState(false);

  if (!permission.canView || isForbidden(detailQuery.error)) return <AccessDenied />;

  const detail = detailQuery.data;
  // Yazma yüzeyi `full` ister; izinsiz kullanıcıda tetikleyici BASILMAZ (M1).

  const siteLabelById = new Map(siteOptions.options.map((option) => [option.siteId, option.label]));
  /** `undefined` ⇒ seçenekler hâlâ pending · `null` ⇒ atama yok / ad bulunamadı. */
  function resolveSiteLabel(siteId: string | null): string | null | undefined {
    if (siteId === null) return null; // K6 — depoda, atama yok
    if (siteOptions.isLoading) return undefined;
    // kalan-4 #181: hata hâlinde Map BOŞ kalır ve `?? null` "atanmadı" der —
    // ama makine GERÇEKTEN bir şantiyeye atanmış olabilir, sorgu düşmüştür.
    // `undefined` dönmek Hero'da nötr "…" bastırır, YANLIŞ "atanmadı" değil.
    if (siteOptions.isError) return undefined;
    return siteLabelById.get(siteId) ?? null;
  }

  return (
    <div className="makine-det">
      {/* MD:36-38 — kırıntı. Kabuk üst barı bunu basmaz. */}
      <nav className="makine-det__crumb" aria-label="Kırıntı">
        <Link href={routes.equipment.list()}>Makine &amp; Ekipman</Link>
        <span className="makine-det__crumb-sep">/</span>
        <span className="makine-det__crumb-current">
          {detail?.equipment.name ?? "Ekipman Detay"}
        </span>
      </nav>

      <EquipmentTabsStrip activeTab="Ekipman Listesi" />

      {detailQuery.isLoading && <p className="makine-det__notice">Yükleniyor…</p>}
      {detailQuery.isError && (
        <p className="makine-det__notice makine-det__notice--danger" role="alert">
          {backendErrorMessage(detailQuery.error)}
        </p>
      )}

      {detail !== undefined && (
        <>
          <EquipmentDetailBody
            detail={detail}
            resolveSiteLabel={resolveSiteLabel}
            onAddDocumentClick={canWrite ? () => setDocumentFormOpen(true) : undefined}
          />
          {!siteOptions.isLoading && <span hidden data-testid="makine-det-loaded-sites" />}
          {/* Görsel spec KAYNAK BAŞINA iddia kurar (F-İK dersi) — bu, DETAY
              kaynağının damgasıdır; dönemden türeyen kaynaklarınki gövdededir. */}
          <span hidden data-testid="makine-det-loaded-detail" />
        </>
      )}

      {isDocumentFormOpen && detail !== undefined && (
        <EquipmentDocumentFormModal
          equipment={detail.equipment}
          siteLabel={resolveSiteLabel(detail.equipment.site_id)}
          categoryIcon={equipmentCategoryIcon(detail.equipment.category)}
          ownershipLabel={EQUIPMENT_OWNERSHIP_LABELS[detail.equipment.ownership]}
          onClose={() => setDocumentFormOpen(false)}
        />
      )}
    </div>
  );
}
