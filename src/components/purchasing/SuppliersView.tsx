"use client";

import { useState } from "react";

import { AccessDenied } from "@/components/settings/AccessDenied";
import { Button } from "@/components/ui";
import { backendErrorMessage } from "@/lib/api/error-message";
import { useSuppliers } from "@/lib/api/hooks/useSuppliers";
import { isForbidden } from "@/lib/api/unwrap";
import { useModulePermission } from "@/lib/auth/useModulePermission";
import { PROCUREMENT_EDIT, PROCUREMENT_VIEW_PAGES } from "@/lib/auth/page-gates";
import { useButtonGate } from "@/lib/auth/usePagePermission";
import { buildListTruncation, listTruncationMessage } from "@/lib/list-truncation";

import { PurchasingTabs } from "./PurchasingTabs";
import { MaskedNote } from "@/components/ui/hidden-mark/HiddenMark";
import { COST_HIDDEN_CATEGORIES } from "@/lib/auth/finance-hidden";
import { useCategoryHidden } from "@/lib/auth/useCategoryHidden";
import { SupplierGridCard } from "./SupplierGridCard";
import { SupplierModal } from "./SupplierModal";
import {
  PURCHASING_EYEBROW,
  PURCHASING_LIST_MAX_LIMIT,
  PURCHASING_PERMISSION_MODULE,
} from "./purchasing-labels";
import "./purchasing.css";

/**
 * TED · `/satinalma/tedarikciler` — mockup `Satınalma - Tedarikçiler.dc.html`
 * (kanonik). Yorumlardaki sayılar O dosyanın SATIR numaralarıdır.
 *
 * Mockup'ın KENDİ üst barı (14-22) ve sol menüsü (24-31) BASILMAZ: kabuk
 * canon kazanır. Mockup'ın sol menüsündeki dörtlü alt liste (27-30) ile SAT
 * 89-94'teki sekme şeridi AYNI dört yüzeydir — burada şerit basılır
 * (`PurchasingTabs`), sidebar'a alt öğe EKLENMEZ (kabuk canon'u değişmez).
 */
export function SuppliersView() {
  const permission = useModulePermission(PURCHASING_PERMISSION_MODULE);
  // IZN-F2.x · tedarikçi ekle/düzenle = stok.tedarikciler Düzenler (VEYA siparişler/teklif karşılaştırma).
  const canEditSuppliers = useButtonGate({ pages: PROCUREMENT_EDIT, need: "edit", fallback: permission.canWrite });
  // IZN-F5-ön · görüntüleme kapısı = stok.* satınalma sayfaları Görür (VEYA); grant yoksa modül izni.
  const canViewProcurement = useButtonGate({
    pages: PROCUREMENT_VIEW_PAGES,
    need: "view",
    fallback: permission.canView,
  });
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const isCostHidden = useCategoryHidden(COST_HIDDEN_CATEGORIES);

  // Kırpılma korkuluğu (ARCHITECTURE §5): tavan AÇIKÇA gönderilir.
  // ⚠️ `is_active` süzgeci GÖNDERİLMEZ: mockup dört kartın dördünü de
  // "Aktif" çizer ama pasif tedarikçiyi GİZLEMEK bir süzgeç kararıdır ve
  // mockup'ta böyle bir süzgeç yoktur — pasif kart tonu düşük rozetle görünür.
  const suppliersQuery = useSuppliers({ limit: PURCHASING_LIST_MAX_LIMIT });

  if (!canViewProcurement || isForbidden(suppliersQuery.error)) return <AccessDenied />;

  const suppliers = suppliersQuery.data?.items ?? [];
  const truncation = buildListTruncation(suppliers.length, suppliersQuery.data?.total);

  return (
    <div className="ted">
      {/* 33 */}
      <p className="sat__eyebrow">{PURCHASING_EYEBROW}</p>

      {/* 34-37 */}
      <div className="sat__head">
        <h1 className="sat__title">Tedarikçiler</h1>
        <div className="sat__actions">
          {/* 36 — türetilmiş minimal diyalog (spec K5) */}
          {canEditSuppliers && (
            <Button variant="primary" onClick={() => setIsDialogOpen(true)}>
              + Tedarikçi Ekle
            </Button>
          )}
        </div>
      </div>

      {/* SAT ile ORTAK şerit (SAT 89-94 = TED 27-30) */}
      <PurchasingTabs active="suppliers" />

      {truncation.isTruncated && (
        <p className="sat__notice" data-testid="ted-truncation-notice">
          {listTruncationMessage(truncation)}
        </p>
      )}

      {suppliersQuery.isError && (
        <p className="sat__notice" data-testid="ted-error-notice">
          {backendErrorMessage(suppliersQuery.error, "Tedarikçi listesi yüklenemedi.")}
        </p>
      )}

      {/* 39-130 · üç sütunlu kart ızgarası */}
      {/* IZN-F4d.2: kartlardaki maskeli "Bu Yıl Toplam Sipariş" için listenin üstünde TEK kilit notu. */}
      <MaskedNote isHidden={isCostHidden} values={suppliers.map((supplier) => supplier.orders_total_this_year)} />
      <div className="ted-grid">
        {suppliers.map((supplier, index) => (
          <SupplierGridCard key={supplier.id} supplier={supplier} index={index} />
        ))}

        {/* 124-128 · kesikli "Yeni Tedarikçi Ekle" kartı — başlıktaki düğmeyle
            AYNI diyaloğu açar (mockup ikisini de çizer) */}
        {canEditSuppliers && (
          <button
            type="button"
            className="ted-add"
            onClick={() => setIsDialogOpen(true)}
            data-testid="ted-add-card"
          >
            <span className="ted-add__plus" aria-hidden="true">
              +
            </span>
            <span className="ted-add__label">Yeni Tedarikçi Ekle</span>
          </button>
        )}
      </div>

      {/* Mockup'ın dört örnek kartı SABİT BASILMAZ — boş kurulumda ızgara
          yalnız ekleme kartını taşır; durum metni ayrıca yazılır. */}
      {suppliers.length === 0 && !suppliersQuery.isLoading && !suppliersQuery.isError && (
        <p className="ted-empty" data-testid="ted-empty">
          Henüz tedarikçi kaydı yok. “+ Tedarikçi Ekle” ile ilk kaydı oluşturun.
        </p>
      )}
      {suppliersQuery.isLoading && (
        <p className="ted-empty" data-testid="ted-loading">
          Tedarikçi listesi yükleniyor…
        </p>
      )}

      {isDialogOpen && <SupplierModal onClose={() => setIsDialogOpen(false)} />}
    </div>
  );
}
