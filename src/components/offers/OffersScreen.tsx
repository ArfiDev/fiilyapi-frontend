"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { AccessDenied } from "@/components/settings/AccessDenied";
import { ConfirmDialog } from "@/components/settings/ConfirmDialog";
import { useEmployers } from "@/lib/api/hooks/useEmployers";
import { useCreateOfferRevision, useDeleteOffer } from "@/lib/api/hooks/useOfferMutations";
import { useOffers, type OfferListResponse } from "@/lib/api/hooks/useOffers";
import { backendErrorMessage } from "@/lib/api/error-message";
import { isForbidden } from "@/lib/api/unwrap";
import { useDisciplineScope } from "@/lib/auth/useDisciplineScope";
import { OFFERS_EDIT, OFFER_CONVERT_APPROVE, CONTRACTS_VIEW } from "@/lib/auth/page-gates";
import { useButtonGate, usePagePermission } from "@/lib/auth/usePagePermission";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { routes } from "@/lib/routes";

import { OffersListView, type OffersBodyState } from "./OffersListView";
import type { OfferConversionFilter, OfferListItem, OfferStatus } from "./offer-types";

const SEARCH_DEBOUNCE_MS = 300;
/** Backend `limit` tavanı (1..200) — liste kırpılırsa Σ basılmaz. */
const OFFERS_LIST_LIMIT = 200;
/** Başarı bildiriminin ekranda kalma süresi (KIK/KAT emsali). */
const TOAST_MS = 2800;

/** F1 ÜS-10 şeridi, teklif için uyarlandı (TKL-F3 §2.3). */
export function readOnlyMessage(
  /** IZN-F6b · sayfa izni: sözleşme/teklif sayfaları Görür. */
  canView: boolean,
  /** IZN-F6b · sayfa izni: yazma kararı (Düzenler). */
  canEdit: boolean,
  isRestricted: boolean,
): string {
  if (!canEdit) {
    return canView
      ? "Görüntüleyici · yalnız okuma"
      : "Salt okunur · teklifleri yalnız Sözleşmeler tam yetkisi değiştirir";
  }
  if (isRestricted) return "Salt okunur · disiplin kısıtlı kullanıcı teklif değiştiremez";
  return "";
}

/**
 * TKL-F3.3 · `/teklif-hazirlama` — Teklifler listesi (kapsayıcı).
 * ÇEKİRDEK ekran (`earned-value` ithal etmez). Kapı: `contracts:none` → AccessDenied;
 * 403 (SO-19 kısıtlı kullanıcı / izin yarışı) da AccessDenied. Para gizleme backend'dedir.
 */
export function OffersScreen() {
  // IZN-F5-ön · görüntüleme kapısı = sözleşme/teklif sayfaları Görür (VEYA); grant yoksa `contracts:none`.
  const canViewOffers = useButtonGate({
    pages: CONTRACTS_VIEW,
    need: "view",
  });
  if (!canViewOffers) return <AccessDenied />;
  return <OffersContent />;
}

function OffersContent() {
  const router = useRouter();
  const scope = useDisciplineScope();
  // IZN-F2.x · teklif yaz = sözleşme/teklif sayfaları Düzenler (VEYA) ∧ disiplin kısıtsız; Dönüştür =
  // teklif.teklif_hazirlama Onaylar ∧ disiplin kısıtsız (sayfa modeli yoksa bugünkü `projects ≥ admin` kuralı;
  // model devredeyken hücresiz = kapalı, IZN-F5c).
  const canEditOffers = useButtonGate({ pages: OFFERS_EDIT, need: "edit" });
  const canWrite = canEditOffers && !scope.isRestricted;
  const convertPermission = usePagePermission(OFFER_CONVERT_APPROVE);
  const canConvert = convertPermission.canApprove && !scope.isRestricted;
  const canViewOffers = usePagePermission(CONTRACTS_VIEW).canView;

  const [status, setStatus] = useState<OfferStatus | null>(null);
  const [conversion, setConversion] = useState<OfferConversionFilter | null>(null);
  const [employerId, setEmployerId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const q = useDebouncedValue(searchText.trim(), SEARCH_DEBOUNCE_MS);

  const list = useOffers({
    ...(status ? { status } : {}),
    ...(conversion ? { conversion } : {}),
    ...(employerId ? { employerId } : {}),
    ...(q ? { q } : {}),
    ...(dateFrom ? { dateFrom } : {}),
    ...(dateTo ? { dateTo } : {}),
    limit: OFFERS_LIST_LIMIT,
  });
  // `useOffers` süzgeç değişiminde eski veriyi TUTMAZ: son hazır liste burada saklanır ki kartlar
  // ve tablo süzgeç yazarken sönmesin (önceki `keepPreviousData` davranışı).
  const [lastReady, setLastReady] = useState<OfferListResponse | null>(null);
  if (list.data && list.data !== lastReady) setLastReady(list.data);
  const employers = useEmployers();
  const createRevision = useCreateOfferRevision();
  const deleteOffer = useDeleteOffer();

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
      : lastReady
        ? { kind: "ready", data: lastReady }
        : { kind: "loading" };

  function handleNewRevision(item: OfferListItem) {
    if (createRevision.isPending) return;
    setActionError(null);
    createRevision.mutate(
      { offerId: item.id },
      {
        onSuccess: (revision) => router.push(routes.offers.detail({ offerId: item.id, rev: revision.rev_no })),
        onError: (error) => setActionError(backendErrorMessage(error, "Yeni revizyon açılamadı.")),
      },
    );
  }

  function confirmDelete() {
    const target = pendingDelete;
    if (target === null) return;
    deleteOffer.mutate(target.id, {
      onSuccess: () => {
        setPendingDelete(null);
        setToast((current) => ({ text: `${target.offer_no} silindi`, id: (current?.id ?? 0) + 1 }));
      },
    });
  }

  function clearFilters() {
    setStatus(null);
    setConversion(null);
    setEmployerId(null);
    setSearchText("");
    setDateFrom("");
    setDateTo("");
  }

  const busyOfferId = (createRevision.isPending ? (createRevision.variables?.offerId ?? null) : null) ?? (deleteOffer.isPending ? (deleteOffer.variables ?? null) : null);

  return (
    <>
      <OffersListView
        body={body}
        status={status}
        employerId={employerId}
        searchText={searchText}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
        onStatusChange={setStatus}
        conversion={conversion}
        onConversionChange={setConversion}
        canConvert={canConvert}
        onEmployerChange={setEmployerId}
        onSearchTextChange={setSearchText}
        onClear={clearFilters}
        employers={employerOptions}
        canWrite={canWrite}
        readOnlyText={canWrite ? "" : readOnlyMessage(canViewOffers, canEditOffers, scope.isRestricted)}
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
