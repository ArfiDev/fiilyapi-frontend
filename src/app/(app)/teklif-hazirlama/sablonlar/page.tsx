"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { TemplatesScreen } from "@/components/offer-templates/TemplatesScreen";
import { OFFER_TEMPLATE_PARAM } from "@/lib/navigation-params";

// TKL-F4.5 · `/teklif-hazirlama/sablonlar?sablon={id}` — teklif şablonları. `?sablon=` seçili kart (URL durumu);
// `useSearchParams` kullanan istemci bileşen Suspense sınırında sarılır (Next 15 kanonu).
function TemplatesRoute() {
  const templateParam = useSearchParams().get(OFFER_TEMPLATE_PARAM);
  return <TemplatesScreen templateParam={templateParam} />;
}

export default function TeklifSablonlariPage() {
  return (
    <Suspense>
      <TemplatesRoute />
    </Suspense>
  );
}
