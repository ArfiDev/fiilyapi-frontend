"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { AccessDenied } from "@/components/settings/AccessDenied";
import { parseRevParam } from "@/components/offers/OfferDetailScreen";
import { Button, Segmented } from "@/components/ui";
import { useCompany } from "@/lib/api/hooks/useCompany";
import { useOffer, useOfferRevision, type OfferDetailRead } from "@/lib/api/hooks/useOffers";
import { BackendError, isForbidden } from "@/lib/api/unwrap";
import { useDisciplineScope } from "@/lib/auth/useDisciplineScope";
import { CONTRACTS_VIEW } from "@/lib/auth/page-gates";
import { useButtonGate } from "@/lib/auth/usePagePermission";
import { routes } from "@/lib/routes";

import { OfferCustomerPrint } from "./OfferCustomerPrint";
import { OfferInternalPrint } from "./OfferInternalPrint";
import type { PrintKind } from "./print-model";
import { buildCustomerPrintModel } from "./print-model-customer";
import { buildInternalPrintModel } from "./print-model-internal";
import "./offer-print.css";

const NOT_FOUND_STATUS = 404;
const KIND_OPTIONS = [
  { value: "isveren", label: "İşveren" },
  { value: "ic", label: "İç döküm" },
] as const;

/**
 * `?tur=` → yazdırma türü. Eksik/bilinmeyen = `isveren`: yanlış/bozuk bir bağlantı ticari sırrı AÇMAZ
 * (iç döküm yalnız açık `tur=ic` ile gelir).
 */
export function parsePrintKind(raw: string | null): PrintKind {
  return raw === "ic" ? "ic" : "isveren";
}

interface OfferPrintScreenProps {
  offerId: string;
  /** Ham `?rev=` değeri (yok → güncel revizyon). */
  revParam: string | null;
  /** Ham `?tur=` değeri. */
  kindParam: string | null;
}

/**
 * TKL-F3.7 · `/teklif-hazirlama/{id}/yazdir?rev=n&tur=isveren|ic` — teklif PDF yazdırma sayfası
 * (T13: PDF = yazdırma sayfasından türetilir; ÜS-F3-27 ayrı sayfa). ÇEKİRDEK ekran: kapı `contracts:view`.
 */
export function OfferPrintScreen(props: OfferPrintScreenProps) {
  const canViewContracts = useButtonGate({ pages: CONTRACTS_VIEW, need: "view" });
  if (!canViewContracts) return <AccessDenied />;
  return <OfferPrintContent {...props} />;
}

function Notice({ text, backTo }: { text: string; backTo: string }) {
  return (
    <div className="offers-state">
      <p>{text}</p>
      <Link href={backTo} className="btn btn--secondary btn--md">
        Teklife dön
      </Link>
    </div>
  );
}

function OfferPrintContent({ offerId, revParam, kindParam }: OfferPrintScreenProps) {
  const detailQuery = useOffer(offerId);
  if (isForbidden(detailQuery.error)) return <AccessDenied />;
  if (detailQuery.data === undefined) {
    if (!detailQuery.isError) return <p className="offers-state">Teklif yükleniyor</p>;
    const missing = detailQuery.error instanceof BackendError && detailQuery.error.status === NOT_FOUND_STATUS;
    return <Notice text={missing ? "Teklif bulunamadı" : "Teklif yüklenemedi"} backTo={routes.offers.list()} />;
  }
  const detail = detailQuery.data;
  const revNo = parseRevParam(revParam) ?? detail.latest_rev_no;
  if (!detail.revisions.some((revision) => revision.rev_no === revNo)) {
    return <Notice text={`Rev.${revNo} bulunamadı`} backTo={routes.offers.detail({ offerId })} />;
  }
  return <OfferPrintRevision key={`${offerId}:${revNo}`} detail={detail} revNo={revNo} kind={parsePrintKind(kindParam)} />;
}

interface OfferPrintRevisionProps {
  detail: OfferDetailRead;
  revNo: number;
  kind: PrintKind;
}

function OfferPrintRevision({ detail, revNo, kind }: OfferPrintRevisionProps) {
  const router = useRouter();
  const scope = useDisciplineScope();
  const revisionQuery = useOfferRevision(detail.id, revNo);
  const companyQuery = useCompany();
  const backTo = routes.offers.detail({ offerId: detail.id, rev: revNo });

  if (isForbidden(revisionQuery.error) || scope.isRestricted) return <AccessDenied />;
  if (revisionQuery.data === undefined) {
    return revisionQuery.isError ? <Notice text="Revizyon yüklenemedi" backTo={backTo} /> : <p className="offers-state">Revizyon yükleniyor</p>;
  }
  if (companyQuery.isPending) return <p className="offers-state">Şirket bilgisi yükleniyor</p>;

  // Şirket okunamazsa teklif yine basılır (başlıksız); ekranda uyarı çıkar.
  const company = companyQuery.data ?? null;
  const hasTitle = company !== null && company.name !== null && company.name.trim() !== "";
  const revision = revisionQuery.data;

  return (
    <div className="offer-print">
      <div className="offer-print__toolbar">
        <Segmented
          aria-label="Yazdırma türü"
          options={KIND_OPTIONS}
          value={kind}
          onChange={(next) => router.replace(routes.offers.print({ offerId: detail.id, rev: revNo, kind: next }))}
        />
        <span className="offer-print__toolbar-spacer" />
        <Link href={backTo} className="btn btn--secondary btn--md">
          Teklife dön
        </Link>
        <Button onClick={() => window.print()}>Yazdır / PDF</Button>
      </div>
      {!hasTitle && <p className="offer-print__screen-warning">Şirket unvanı girilmemiş — Ayarlar › Şirket</p>}
      <div className="offer-print__document" data-testid="offer-print-document">
        {kind === "ic" ? (
          <OfferInternalPrint model={buildInternalPrintModel({ offer: detail, revision, company })} />
        ) : (
          <OfferCustomerPrint model={buildCustomerPrintModel({ offer: detail, revision, company })} />
        )}
      </div>
    </div>
  );
}
