"use client";

import { useState } from "react";
import Link from "next/link";

import { EquipmentDocumentFormModal } from "@/components/document-form/EquipmentDocumentFormModal";
import { AccessDenied } from "@/components/settings/AccessDenied";
import { backendErrorMessage } from "@/lib/api/error-message";
import {
  EQUIPMENT_LIST_MAX_LIMIT,
  useEquipment,
  type EquipmentResponse,
} from "@/lib/api/hooks/useEquipment";
import { useEquipmentSummary } from "@/lib/api/hooks/useEquipmentSummary";
import { usePersonnel, PERSONNEL_MAX_LIMIT } from "@/lib/api/hooks/usePersonnel";
import { useSiteOptions } from "@/lib/api/hooks/useSiteOptions";
import { isLoaded } from "@/lib/api/query-state";
import { isForbidden } from "@/lib/api/unwrap";
import { hasAtLeast } from "@/lib/auth/permissions";
import { useModulePermission } from "@/lib/auth/useModulePermission";
import { EQUIPMENT_EDIT } from "@/lib/auth/page-gates";
import { useButtonGate } from "@/lib/auth/usePagePermission";
import { buildListTruncation, listTruncationMessage } from "@/lib/list-truncation";

import { equipmentCategoryIcon } from "./category-icon";
import {
  EQUIPMENT_OPERATOR_LOAD_ERROR_LABEL,
  EQUIPMENT_OWNERSHIP_LABELS,
  EQUIPMENT_SITE_LOAD_ERROR_LABEL,
  EQUIPMENT_SITE_UNKNOWN_LABEL,
} from "./equipment-labels";
import { EquipmentCard } from "./EquipmentCard";
import { EquipmentKpiStrip } from "./EquipmentKpiStrip";
import { EquipmentTabsStrip } from "./EquipmentTabsStrip";
import "./equipment.css";
import { navGroupHeadingFor } from "@/components/shell/nav-config";
import { routes } from "@/lib/routes";

/** İzin matrisi anahtarı — MK-1 backend spec: 21. izin modülü `equipment`. */
const EQUIPMENT_PERMISSION_MODULE = "equipment";

/**
 * M1 · `/makine` — mockup `Makine & Ekipman.dc.html` (kanonik). Yorumlardaki
 * sayılar o dosyanın SATIR numaralarıdır.
 *
 * Mockup'ın KENDİ üst barı ve sol menüsü BASILMAZ: kabuk canon kazanır (F3
 * Topbar + Sidebar). Sidebar'daki "Makine & Ekipman" artık ComingSoon'a değil
 * bu rotaya düşer.
 *
 * ⚠️ ÜÇ BAĞIMSIZ VERİ KAYNAĞI (spec — devir notu): ekipman listesi
 * (`useEquipment`), şantiye seçenekleri (`useSiteOptions`) ve personel listesi
 * (`usePersonnel`) ayrı sorgulardır. `EquipmentResponse` yalnız `site_id`/
 * `operator_id` UUID'si taşır, AD taşımaz — kartlar bu üç kaynağı birleştirir.
 * Her biri kendi pending durumunu (`undefined` ⇒ "Yükleniyor…") taşır.
 */
export function EquipmentView() {
  const permission = useModulePermission(EQUIPMENT_PERMISSION_MODULE);

  // Kırpılma korkuluğu (TB3/F-TH dersi): sunucu varsayılanı 50'dir, tavan
  // AÇIKÇA gönderilir.
  const equipmentQuery = useEquipment({ limit: EQUIPMENT_LIST_MAX_LIMIT });
  const summaryQuery = useEquipmentSummary();
  const siteOptions = useSiteOptions();
  const personnelQuery = usePersonnel({ limit: PERSONNEL_MAX_LIMIT });

  // F-BLG T2b · "Belge Ekle" diyaloğu (`Form - Ekipman Belgesi.dc.html`).
  // Yazma yüzeyi `full` ister; izinsiz kullanıcıda tetikleyici BASILMAZ.
  const [documentTarget, setDocumentTarget] = useState<EquipmentResponse | null>(null);
  // IZN-F2.x · ekipman belgesi ekle = saha.makine_* Düzenler (VEYA).
  const canWrite = useButtonGate({
    pages: EQUIPMENT_EDIT,
    need: "edit",
    fallback: hasAtLeast(permission.level, "full"),
  });

  // IZN-F2.y · "+ Ekipman Ekle" ve kartlardaki "Düzenle" = POST/PATCH /equipment = saha.makine_* Düzenler
  // (VEYA). Bugün bu ikisi izin bakmadan basılıyor → sayfa izni hiç yoksa (fallback) görünür kalır.
  const canEditEquipment = useButtonGate({ pages: EQUIPMENT_EDIT, need: "edit", fallback: true });

  if (!permission.canView || isForbidden(equipmentQuery.error)) return <AccessDenied />;

  const items = equipmentQuery.data?.items;
  const truncation = buildListTruncation(items?.length ?? 0, equipmentQuery.data?.total);

  const siteLabelById = new Map(siteOptions.options.map((option) => [option.siteId, option.label]));
  const personnelNameById = new Map(
    (personnelQuery.data?.items ?? []).map((person) => [person.id, person.full_name]),
  );

  function resolveSiteLabel(siteId: string | null): string | null | undefined {
    if (siteId === null) return null; // K6 — depoda, atama yok
    if (siteOptions.isError) return EQUIPMENT_SITE_LOAD_ERROR_LABEL;
    if (siteOptions.isLoading) return undefined;
    // #76 — harita YÜKLENDİ ama site_id DOLU kayıt onda yoksa (dar proje
    // erişimi/kırpılma) bu "atanmadı" DEĞİLDİR; `null` dönseydi kart yanlışlıkla
    // "Depoda (Atanmadı)" basardı.
    return siteLabelById.get(siteId) ?? EQUIPMENT_SITE_UNKNOWN_LABEL;
  }

  function resolveOperatorName(operatorId: string | null): string | null | undefined {
    if (operatorId === null) return null; // K3 — operatör/şoför atanmadı
    if (personnelQuery.isError) return EQUIPMENT_OPERATOR_LOAD_ERROR_LABEL;
    if (personnelQuery.isLoading) return undefined;
    return personnelNameById.get(operatorId) ?? null;
  }

  return (
    <div className="makine">
      {/* 59 */}
      <p className="makine__eyebrow">{navGroupHeadingFor(routes.equipment.list())}</p>
      {/* 60-63 */}
      <div className="makine__head">
        <h1 className="makine__title">Makine &amp; Ekipman</h1>
        {/* 62 — hedef form (M2) bu dilimin kapsamı dışında; rota şimdiden bağlanır
            (K4 "Düzenle" ile aynı karar), catch-all ComingSoon karşılar. */}
        {canEditEquipment && (
          <Link href={routes.equipment.new()} className="btn btn--primary btn--md">
            + Ekipman Ekle
          </Link>
        )}
      </div>

      <EquipmentTabsStrip activeTab="Ekipman Listesi" />

      {truncation.isTruncated && (
        <p className="makine__notice" data-testid="makine-truncation-notice">
          {listTruncationMessage(truncation)}
        </p>
      )}

      {/* 66-83 */}
      <EquipmentKpiStrip summary={summaryQuery.data} />

      {equipmentQuery.isLoading && <p className="makine__notice">Yükleniyor…</p>}
      {equipmentQuery.isError && (
        <p className="makine__notice makine__notice--danger" role="alert">
          {backendErrorMessage(equipmentQuery.error)}
        </p>
      )}
      {!equipmentQuery.isLoading && !equipmentQuery.isError && items?.length === 0 && (
        <p className="makine__notice">Kayıtlı ekipman yok.</p>
      )}

      {/* 86-166 */}
      {items !== undefined && items.length > 0 && (
        <div className="makine-grid" data-testid="makine-grid">
          {items.map((equipment) => (
            <EquipmentCard
              key={equipment.id}
              equipment={equipment}
              siteLabel={resolveSiteLabel(equipment.site_id)}
              operatorName={resolveOperatorName(equipment.operator_id)}
              onAddDocumentClick={canWrite ? setDocumentTarget : undefined}
              canEdit={canEditEquipment}
            />
          ))}
        </div>
      )}

      {/* Görsel spec (T5b) "yüklendi" iddiasını KAYNAK BAŞINA kurar — F-İK
          dersi: tek bayrak, ikinci kaynağın hâlâ pending olduğunu GİZLER ve
          kadraj "Yükleniyor…" hâlini donmuş yakalayabilir. Bu ekranın DÖRT
          bağımsız kaynağı vardır (ekipman · özet · şantiye · personel). */}
      {equipmentQuery.data !== undefined && <span hidden data-testid="makine-loaded-equipment" />}
      {summaryQuery.data !== undefined && <span hidden data-testid="makine-loaded-summary" />}
      {isLoaded(siteOptions) && <span hidden data-testid="makine-loaded-sites" />}
      {personnelQuery.data !== undefined && <span hidden data-testid="makine-loaded-personnel" />}

      {documentTarget && (
        <EquipmentDocumentFormModal
          equipment={documentTarget}
          siteLabel={resolveSiteLabel(documentTarget.site_id)}
          categoryIcon={equipmentCategoryIcon(documentTarget.category)}
          ownershipLabel={EQUIPMENT_OWNERSHIP_LABELS[documentTarget.ownership]}
          onClose={() => setDocumentTarget(null)}
        />
      )}
    </div>
  );
}
