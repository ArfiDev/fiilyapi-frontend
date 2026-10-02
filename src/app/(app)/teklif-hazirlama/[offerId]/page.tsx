"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { OfferDetailScreen } from "@/components/offers/OfferDetailScreen";
import { renderOfferItemsSlot } from "@/components/offers/OfferItemsCard";
import { OFFER_REV_PARAM } from "@/lib/navigation-params";

// TKL-F3.5 · `/teklif-hazirlama/{id}?rev=n` — teklif detayı. `?rev=` URL durumudur;
// `useSearchParams` kullanan istemci bileşen Suspense sınırında sarılır (Next 15 kanonu).
// TKL-F3.6 · kalem tablosu `renderItems` yuvasına bağlanır.
function OfferDetailRoute() {
  const { offerId } = useParams<{ offerId: string }>();
  const revParam = useSearchParams().get(OFFER_REV_PARAM);
  return <OfferDetailScreen offerId={offerId} revParam={revParam} renderItems={renderOfferItemsSlot} />;
}

export default function TeklifDetayPage() {
  return (
    <Suspense>
      <OfferDetailRoute />
    </Suspense>
  );
}
