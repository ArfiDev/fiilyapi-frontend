"use client";

import { useParams } from "next/navigation";

import { ConvertScreen } from "@/components/offer-convert/ConvertScreen";

// TKL-F5.3 · `/teklif-hazirlama/{id}/donustur` — Teklif → Proje "Dönüştür" (F5.1'in `notFound()` yer tutucusunun yerini alır).
// `?rev=` YOK (uç her zaman SON revizyonu esas alır, SO-36); adım URL'de taşınmaz (ÜS-F5-1) → `useSearchParams`/Suspense gerekmez.
export default function TeklifDonusturPage() {
  const { offerId } = useParams<{ offerId: string }>();
  return <ConvertScreen offerId={offerId} />;
}
