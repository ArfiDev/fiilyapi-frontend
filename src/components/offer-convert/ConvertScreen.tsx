"use client";

import { AccessDenied } from "@/components/settings/AccessDenied";
import { Button } from "@/components/ui";
import { useCatalogDisciplines, useCatalogItems } from "@/lib/api/hooks/useCatalogItems";
import { useConvertOffer } from "@/lib/api/hooks/useOfferMutations";
import { useOffer, useOfferRevision, type OfferDetailRead } from "@/lib/api/hooks/useOffers";
import { BackendError, isForbidden } from "@/lib/api/unwrap";
import { useDisciplineScope } from "@/lib/auth/useDisciplineScope";
import { OFFER_CONVERT_APPROVE } from "@/lib/auth/page-gates";
import { useButtonGate } from "@/lib/auth/usePagePermission";
import { routeKeyOf, routes } from "@/lib/routes";

import { ConvertBoard } from "./ConvertBoard";
import { ConvertStateCard } from "./ConvertStateCard";
import "./offer-convert.css";

/** SO-42 · IZN-F6b: dönüştürme = teklif.teklif_hazirlama Onaylar + disiplin kısıtsız (backend `convert_router` aynı sayfa kapısı). */
const NOT_FOUND_STATUS = 404;
/** Backend `convert_service.NOT_WON` — AYNEN. */
const NOT_WON_TEXT = "Yalnız son revizyonu kazanılmış (won) olan teklif projeye dönüştürülebilir";

interface ConvertScreenProps {
  offerId: string;
}

/** TKL-F5.3 · `/teklif-hazirlama/{id}/donustur` — Teklif → Proje "Dönüştür" (kapsayıcı). ÇEKİRDEK ekran. */
export function ConvertScreen({ offerId }: ConvertScreenProps) {
  const scope = useDisciplineScope();
  // IZN-F2.x · Dönüştür = teklif.teklif_hazirlama Onaylar ∧ disiplin kısıtsız (grant yoksa KAPALI — IZN-F6a).
  const canConvert = useButtonGate({
    pages: OFFER_CONVERT_APPROVE,
    need: "approve",
  });
  const isAllowed = canConvert && !scope.isRestricted;
  if (!isAllowed) return <AccessDenied />;
  return <ConvertGate offerId={offerId} />;
}

function ConvertGate({ offerId }: ConvertScreenProps) {
  const detailQuery = useOffer(offerId);
  // Mutasyon KAPIDA yaşar: başarıdan sonra detay "converted" olup yeniden okunsa da başarı bandı ekranda KALIR.
  const convert = useConvertOffer(offerId);
  if (isForbidden(detailQuery.error)) return <AccessDenied />;
  if (detailQuery.data === undefined) return <DetailPending error={detailQuery.error} isError={detailQuery.isError} onRetry={() => void detailQuery.refetch()} />;
  const detail = detailQuery.data;
  // Uçuşta da kapı AÇIK kalır: `useConvertOffer.onSuccess` önbellek tazelemesini BEKLER, mutasyon o arada `isPending`dir;
  // detay "converted" okununca board sökülürse yerel 3 adımlık durum gider ve başarı sonrası ekran Adım 1'e sıfırlanır (F5.6 e2e).
  const isOwnConversion = convert.isSuccess || convert.isPending;
  if (!isOwnConversion && detail.conversion_state === "converted") return <ConvertedCard detail={detail} />;
  if (!isOwnConversion && detail.status !== "won") {
    return <ConvertStateCard links={[{ href: routes.offers.detail({ offerId }), label: "Teklife dön" }]}>{NOT_WON_TEXT}</ConvertStateCard>;
  }
  return <ConvertLoader detail={detail} convert={convert} />;
}

interface DetailPendingProps {
  error: Error | null;
  isError: boolean;
  onRetry: () => void;
}

function DetailPending({ error, isError, onRetry }: DetailPendingProps) {
  if (!isError) return <p className="offers-state">Teklif yükleniyor</p>;
  if (error instanceof BackendError && error.status === NOT_FOUND_STATUS) {
    return <ConvertStateCard title="Teklif bulunamadı" links={[{ href: routes.offers.list(), label: "Tekliflere dön" }]} />;
  }
  return <LoadError text="Teklif yüklenemedi" onRetry={onRetry} />;
}

function LoadError({ text, onRetry }: { text: string; onRetry: () => void }) {
  return (
    <div className="offers-state">
      <p>{text}</p>
      <Button variant="secondary" size="sm" onClick={onRetry}>
        Tekrar dene
      </Button>
    </div>
  );
}

/** "Teklif zaten dönüştürüldü" bilgi kartı: proje künyesi okumada var (BD-1) → "Projeyi aç →" (`slug ?? id`). */
function ConvertedCard({ detail }: { detail: OfferDetailRead }) {
  const project = detail.project;
  const projectKey = project === null ? detail.project_id : routeKeyOf(project);
  return (
    <ConvertStateCard
      title="Teklif zaten dönüştürüldü"
      links={projectKey === null ? [] : [{ href: routes.projects.detail({ projectId: projectKey }), label: "Projeyi aç →", primary: true }]}
    >
      {project === null ? undefined : `${project.code} · ${project.name}`}
    </ConvertStateCard>
  );
}

interface ConvertLoaderProps {
  detail: OfferDetailRead;
  convert: ReturnType<typeof useConvertOffer>;
}

/** Revizyon (SON) + katalog okumaları; ikisi de hazır olunca form kurulur (yerel durum bir kez başlar). */
function ConvertLoader({ detail, convert }: ConvertLoaderProps) {
  const revisionQuery = useOfferRevision(detail.id, detail.latest_rev_no);
  const catalogQuery = useCatalogItems();
  const disciplinesQuery = useCatalogDisciplines();
  if (isForbidden(revisionQuery.error) || isForbidden(catalogQuery.error)) return <AccessDenied />;
  if (revisionQuery.data === undefined || catalogQuery.data === undefined) {
    // Hata dalı YALNIZ veri yokken: veri varken başarısız yeniden okuma (TanStack v5'te isError=true) tahtayı SÖKMEZ.
    const isFailed = (revisionQuery.data === undefined && revisionQuery.isError) || (catalogQuery.data === undefined && catalogQuery.isError);
    if (!isFailed) return <p className="offers-state">Revizyon yükleniyor</p>;
    return <LoadError text="Teklif kalemleri yüklenemedi" onRetry={() => void Promise.all([revisionQuery.refetch(), catalogQuery.refetch()])} />;
  }
  return (
    <ConvertBoard
      key={`${detail.id}:${revisionQuery.data.rev_no}`}
      detail={detail}
      revision={revisionQuery.data}
      catalogItems={catalogQuery.data}
      disciplines={disciplinesQuery.data ?? []}
      convert={convert}
    />
  );
}
