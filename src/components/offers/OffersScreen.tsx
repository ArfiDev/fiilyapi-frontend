"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { AccessDenied } from "@/components/settings/AccessDenied";
import { ConfirmDialog } from "@/components/settings/ConfirmDialog";
import { useCatalogItems } from "@/lib/api/hooks/useCatalogItems";
import { useEmployers } from "@/lib/api/hooks/useEmployers";
import { backendErrorMessage } from "@/lib/api/error-message";
import { isForbidden } from "@/lib/api/unwrap";
import { hasAtLeast, type AccessLevel } from "@/lib/auth/permissions";
import { useDisciplineScope } from "@/lib/auth/useDisciplineScope";
import { useModulePermission } from "@/lib/auth/useModulePermission";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { routes } from "@/lib/routes";

import { OffersListView, type OffersBodyState } from "./OffersListView";
import type { OfferListItem, OfferStatus } from "./offer-types";
// 🔴 F3.2: bu üçü `lib/api/hooks/useOffers.ts` + `useOfferMutations.ts` ithaline çevrilir.
import { useCreateOfferRevisionFromList, useDeleteOfferFromList, useOffersList } from "./useOffersList";

/** T25: teklif YAZMA = `contracts:full` + disiplin kısıtsız; okuma `contracts:view`. */
const WRITE_LEVEL = "full";
const SEARCH_DEBOUNCE_MS = 300;
/** Başarı bildiriminin ekranda kalma süresi (KIK/KAT emsali). */
const TOAST_MS = 2800;

/** F1 ÜS-10 şeridi, teklif için uyarlandı (TKL-F3 §2.3). */
function readOnlyMessage(level: AccessLevel | undefined, isRestricted: boolean): string {
  if (level === "view") return "Görüntüleyici · yalnız okuma";
  if (!hasAtLeast(level, WRITE_LEVEL)) return "Salt okunur · teklifleri yalnız Sözleşmeler tam yetkisi değiştirir";
  if (isRestricted) return "Salt okunur · disiplin kısıtlı kullanıcı teklif değiştiremez";
  return "";
}

/**
 * TKL-F3.3 · `/teklif-hazirlama` — Teklifler listesi (kapsayıcı).
 * ÇEKİRDEK ekran (`earned-value` ithal etmez). Kapı: `contracts:none` → AccessDenied;
 * 403 (SO-19 kısıtlı kullanıcı / izin yarışı) da AccessDenied. Para gizleme backend'dedir.
 */
export function OffersScreen() {
  const { level } = useModulePermission("contracts");
  if (level === "none") return <AccessDenied />;
  return <OffersContent level={level} />;
}

function OffersContent({ level }: { level: AccessLevel | undefined }) {
  const router = useRouter();
  const scope = useDisciplineScope();
  const canWrite = hasAtLeast(level, WRITE_LEVEL) && !scope.isRestricted;

  const [status, setStatus] = useState<OfferStatus | null>(null);
  const [employerId, setEmployerId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");
  const q = useDebouncedValue(searchText.trim(), SEARCH_DEBOUNCE_MS);

  const list = useOffersList({ status, employerId, q });
  const employers = useEmployers();
  const catalog = useCatalogItems();
  const createRevision = useCreateOfferRevisionFromList();
  const deleteOffer = useDeleteOfferFromList();

  const [toast, setToast] = useState<{ text: string; id: number } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<OfferListItem | null>(null);

  useEffect(() => {
    if (toast === null) return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  const employerOptions = useMemo(
    () => (employers.data?.items ?? []).map((employer) => ({ id: employer.id, name: employer.name })),
    [employers.data],
  );

  if (isForbidden(list.error)) return <AccessDenied />;

  const body: OffersBodyState = list.data
    ? { kind: "ready", data: list.data }
    : list.isError
      ? { kind: "error", isRetrying: list.isFetching, onRetry: () => void list.refetch() }
      : { kind: "loading" };

  function handleNewRevision(item: OfferListItem) {
    setActionError(null);
    createRevision.mutate(
      { offerId: item.id },
      {
        onSuccess: ({ latestRevNo }) => router.push(routes.offers.detail({ offerId: item.id, rev: latestRevNo })),
        onError: (error) => setActionError(backendErrorMessage(error, "Yeni revizyon açılamadı.")),
      },
    );
  }

  function confirmDelete() {
    const target = pendingDelete;
    if (target === null) return;
    deleteOffer.mutate(
      { offerId: target.id },
      {
        onSuccess: () => {
          setPendingDelete(null);
          setToast((current) => ({ text: `${target.offer_no} silindi`, id: (current?.id ?? 0) + 1 }));
        },
      },
    );
  }

  function clearFilters() {
    setStatus(null);
    setEmployerId(null);
    setSearchText("");
  }

  const busyOfferId = createRevision.isPending
    ? (createRevision.variables?.offerId ?? null)
    : deleteOffer.isPending
      ? (deleteOffer.variables?.offerId ?? null)
      : null;

  return (
    <>
      <OffersListView
        body={body}
        status={status}
        employerId={employerId}
        searchText={searchText}
        onStatusChange={setStatus}
        onEmployerChange={setEmployerId}
        onSearchTextChange={setSearchText}
        onClear={clearFilters}
        employers={employerOptions}
        catalogCount={catalog.data ? catalog.data.length : null}
        canWrite={canWrite}
        readOnlyText={canWrite ? "" : readOnlyMessage(level, scope.isRestricted)}
        now={new Date()}
        busyOfferId={busyOfferId}
        onNewRevision={handleNewRevision}
        onDelete={(item) => {
          deleteOffer.reset();
          setPendingDelete(item);
        }}
        toast={toast?.text ?? null}
        actionError={actionError}
      />
      {pendingDelete && (
        <ConfirmDialog
          title="Taslağı sil"
          message={`${pendingDelete.offer_no} silinsin mi? Bu numara tekrar kullanılmaz.`}
          confirmLabel="Sil"
          danger
          isPending={deleteOffer.isPending}
          errorText={deleteOffer.isError ? backendErrorMessage(deleteOffer.error, "Teklif silinemedi.") : null}
          onConfirm={confirmDelete}
          onClose={() => setPendingDelete(null)}
        />
      )}
    </>
  );
}
