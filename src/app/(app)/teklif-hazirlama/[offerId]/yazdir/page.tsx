"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { OfferPrintScreen } from "@/components/offer-print/OfferPrintScreen";
import { OFFER_PRINT_KIND_PARAM, OFFER_REV_PARAM } from "@/lib/navigation-params";

// TKL-F3.7 · `/teklif-hazirlama/{id}/yazdir?rev=n&tur=isveren|ic` — teklif PDF yazdırma sayfası.
// `?rev=` / `?tur=` URL durumudur; `useSearchParams` Suspense sınırında sarılır (Next 15 kanonu).
function OfferPrintRoute() {
  const { offerId } = useParams<{ offerId: string }>();
  const params = useSearchParams();
  return (
    <OfferPrintScreen
      offerId={offerId}
      revParam={params.get(OFFER_REV_PARAM)}
      kindParam={params.get(OFFER_PRINT_KIND_PARAM)}
    />
  );
}

export default function TeklifYazdirPage() {
  return (
    <Suspense>
      <OfferPrintRoute />
    </Suspense>
  );
}
