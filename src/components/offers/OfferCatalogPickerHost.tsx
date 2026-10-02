"use client";

import { useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { CatalogPickerModal } from "@/components/work-item-picker/CatalogPickerModal";
import { OFFER_PICKER_TARGET } from "@/components/work-item-picker/picker-target";
import type { PickerGroup } from "@/components/work-item-picker/picker-model";
import { useCatalogPickerSubmit } from "@/components/work-item-picker/useCatalogPickerSubmit";
import { CATALOG_ITEMS_QUERY_KEY } from "@/lib/api/hooks/catalog-query-keys";
import { offerDetailKey, offerRevisionKey } from "@/lib/api/hooks/offer-query-keys";
import { useCreateOfferGroup, useCreateOfferItemsBulk, type OfferItemsBulkBody } from "@/lib/api/hooks/useOfferMutations";
import type { OfferRevisionRead } from "@/lib/api/hooks/useOffers";
import { BackendError } from "@/lib/api/unwrap";
import { routes } from "@/lib/routes";
import { openTab } from "@/lib/workspace-tabs/tabs-reducer";
import { workspaceTabsStore } from "@/lib/workspace-tabs/tabs-store";

/** Kaynağın değiştiği/başkasının yazdığı anlamına gelen durumlar: revizyon + katalog görünümü bayatlamıştır. */
const STALE_STATUSES: readonly number[] = [404, 409, 422];

export interface OfferCatalogPickerHostProps {
  offerId: string;
  revNo: number;
  /** Alt metin bağlamı: "TKL-2026-0014 Rev.2". */
  contextLabel: string;
  groups: OfferRevisionRead["groups"];
  onClose: () => void;
  /** Başarıda, seçici kapanmadan ÖNCE: eklenen kalem sayısı. */
  onAdded: (count: number) => void;
}

/** Teklif grubunu seçicinin yapısal grup görünümüne çevirir (`code` = poz no; teklifte çakışma kuralı yok). */
function toPickerGroups(groups: OfferRevisionRead["groups"]): PickerGroup[] {
  return groups.map((group) => ({
    id: group.id,
    name: group.name,
    sort_order: group.sort_order,
    items: group.items.map((item) => ({
      code: item.poz_no,
      catalog_item_id: item.catalog_item_id,
      sort_order: item.sort_order,
    })),
  }));
}

/**
 * TKL-F3.6 · "+ Katalogdan Ekle" → F2 çoklu seçicisi (teklif hedefi) + toplu ekleme (plan §3.1).
 * Gönderim akışı sözleşme host'uyla ORTAK (`useCatalogPickerSubmit`): yeni grup ise önce grup POST, sonra TEK bulk
 * (hep-ya-hiç); bulk düşerse açılan grup seçili kalır. Açılışta katalog sorgusu tazelenir — "Kataloğa yeni kalem
 * ekle" bağlantısıyla başka çalışma sekmesinde eklenen kalem seçicide görünür (ÜS-F3-19).
 */
export function OfferCatalogPickerHost({ offerId, revNo, contextLabel, groups, onClose, onAdded }: OfferCatalogPickerHostProps) {
  const queryClient = useQueryClient();
  const createGroup = useCreateOfferGroup(offerId, revNo);
  const bulkCreate = useCreateOfferItemsBulk(offerId, revNo);
  const pickerGroups = useMemo(() => toPickerGroups(groups), [groups]);

  useEffect(() => {
    void queryClient.invalidateQueries({ queryKey: [CATALOG_ITEMS_QUERY_KEY] });
  }, [queryClient]);

  function refreshStaleViews(error: unknown) {
    if (!(error instanceof BackendError) || !STALE_STATUSES.includes(error.status)) return;
    void queryClient.invalidateQueries({ queryKey: offerRevisionKey(offerId, revNo), exact: true });
    void queryClient.invalidateQueries({ queryKey: offerDetailKey(offerId), exact: true });
    void queryClient.invalidateQueries({ queryKey: [CATALOG_ITEMS_QUERY_KEY] });
  }

  const { isSubmitting, submitError, createdGroup, submit } = useCatalogPickerSubmit<OfferItemsBulkBody>({
    createGroup: (group) => createGroup.mutateAsync(group),
    bulkCreate: (body) => bulkCreate.mutateAsync(body),
    onAdded,
    onClose,
    onFailure: refreshStaleViews,
  });

  return (
    <CatalogPickerModal<OfferItemsBulkBody>
      target={OFFER_PICKER_TARGET}
      projectName={contextLabel}
      groups={pickerGroups}
      onSubmit={(submission) => void submit(submission)}
      onClose={onClose}
      isSubmitting={isSubmitting}
      submitError={submitError}
      createdGroup={createdGroup}
      onManualAdd={() =>
        workspaceTabsStore.dispatch(openTab, { url: routes.planning.workItemCatalog(), background: true })
      }
    />
  );
}
