"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui";
import { WarningTriangleIcon, inlineSymbolProps } from "@/components/ui/icons";
import { useCatalogItems } from "@/lib/api/hooks/useCatalogItems";
import type { OfferRevisionRead } from "@/lib/api/hooks/useOffers";

import { OfferCatalogPickerHost } from "./OfferCatalogPickerHost";
import { OfferItemsLegend } from "./OfferItemsLegend";
import { OfferItemsTable } from "./OfferItemsTable";
import { useOfferGroupActions } from "./useOfferGroupActions";
import { useOfferItemEditor } from "./useOfferItemEditor";
import type { OfferItemsSlotContext } from "./OfferDetailView";
import "./offers.css";
import "./offer-items.css";

/** Başarı bildiriminin ekranda kalma süresi (KIK/KAT emsali; `OfferDetailView` ile aynı). */
const NOTICE_MS = 2800;

export interface OfferItemsCardProps {
  offerId: string;
  revNo: number;
  revision: OfferRevisionRead;
  /** Kalemler yazılabilir mi? (son revizyon ∧ taslak ∧ yazma yetkisi) */
  canEdit: boolean;
}

/**
 * TKL-F3.6 · "Teklif kalemleri" kartı (TD:209-274): başlık sayaçları + "+ Katalogdan Ekle" / "+ Grup" + gruplu tablo +
 * lejant. Hesap SUNUCUDADIR (ÜS-F3-1): yazımlar blur'da kaydolur, tutar/toplam yanıtla gelir; kart yalnız gösterir.
 */
export function OfferItemsCard({ offerId, revNo, revision, canEdit }: OfferItemsCardProps) {
  const catalogQuery = useCatalogItems();
  const groupActions = useOfferGroupActions(offerId, revNo);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Ref/Son önerisi + "↺ kat." katalog birleşimi: şirket geneli katalog tek istekte, kimliğe göre eşlenir (N+1 YOK).
  const catalogById = useMemo(
    () => new Map((catalogQuery.data ?? []).map((item) => [item.id, item] as const)),
    [catalogQuery.data],
  );
  const editor = useOfferItemEditor({
    offerId,
    revNo,
    revision,
    catalogUnitMhrOf: (catalogItemId) => catalogById.get(catalogItemId)?.standard_unit_mhr ?? null,
  });

  useEffect(() => {
    if (notice === null) return;
    const timer = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  const itemCount = revision.groups.reduce((sum, group) => sum + group.items.length, 0);
  const unpricedCount = revision.totals.unpriced_count;

  return (
    <section className="oit-card" aria-labelledby="oit-title">
      <header className="oit-head">
        <h2 className="oit-head__title" id="oit-title">
          Teklif kalemleri
        </h2>
        <span className="oit-pill">{`${itemCount} kalem · ${revision.groups.length} grup`}</span>
        {unpricedCount > 0 && (
          <span className="oit-pill oit-pill--warn">
            <WarningTriangleIcon {...inlineSymbolProps} />
            {`${unpricedCount} kalemde fiyat girilmedi`}
          </span>
        )}
        <div className="oit-head__actions">
          <Button size="sm" disabled={!canEdit} onClick={() => setIsPickerOpen(true)}>
            + Katalogdan Ekle
          </Button>
          <Button size="sm" variant="secondary" disabled={!canEdit || groupActions.isBusy} onClick={groupActions.add}>
            + Grup
          </Button>
        </div>
      </header>
      {notice !== null && (
        <p className="offers-toast" role="status">
          {notice}
        </p>
      )}
      {groupActions.error !== null && (
        <p className="offers-error" role="status">
          {groupActions.error}
        </p>
      )}
      <OfferItemsTable
        groups={revision.groups}
        overheadPct={revision.overhead_pct}
        profitPct={revision.profit_pct}
        catalogById={catalogById}
        editor={editor}
        canEdit={canEdit}
        onRenameGroup={groupActions.rename}
        onDeleteGroup={groupActions.remove}
      />
      <OfferItemsLegend />
      {isPickerOpen && (
        <OfferCatalogPickerHost
          offerId={offerId}
          revNo={revNo}
          contextLabel={`${revision.offer_no} Rev.${revNo}`}
          groups={revision.groups}
          onClose={() => setIsPickerOpen(false)}
          onAdded={(count) => setNotice(`${count} kalem eklendi`)}
        />
      )}
    </section>
  );
}

/** `OfferDetailScreen.renderItems` yuvası (F3.5) — kalem kartını detaya bağlar. */
export function renderOfferItemsSlot(context: OfferItemsSlotContext) {
  return <OfferItemsCard {...context} />;
}
