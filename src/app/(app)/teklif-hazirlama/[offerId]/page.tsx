"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { OfferDetailScreen } from "@/components/offers/OfferDetailScreen";
import { OFFER_REV_PARAM } from "@/lib/navigation-params";

// TKL-F3.5 · `/teklif-hazirlama/{id}?rev=n` — teklif detayı. `?rev=` URL durumudur;
// `useSearchParams` kullanan istemci bileşen Suspense sınırında sarılır (Next 15 kanonu).
function OfferDetailRoute() {
  const { offerId } = useParams<{ offerId: string }>();
  const revParam = useSearchParams().get(OFFER_REV_PARAM);
  return <OfferDetailScreen offerId={offerId} revParam={revParam} />;
}

export default function TeklifDetayPage() {
  return (
    <Suspense>
      <OfferDetailRoute />
    </Suspense>
  );
}
