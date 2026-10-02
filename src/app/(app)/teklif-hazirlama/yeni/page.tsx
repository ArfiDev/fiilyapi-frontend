import { OfferCreateScreen } from "@/components/offers/OfferCreateScreen";
import { OFFER_TEMPLATE_PARAM } from "@/lib/navigation-params";

interface YeniTeklifPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

// TKL-F3.4 · `/teklif-hazirlama/yeni` — yeni teklif künyesi. TKL-F4.7: `?sablon={id}` ("Bu şablonla teklif başlat →")
// formu "Şablondan" açık ve o şablon önseçili getirir; çoklu/boş değer yok sayılır.
export default async function YeniTeklifPage({ searchParams }: YeniTeklifPageProps) {
  const raw = (await searchParams)[OFFER_TEMPLATE_PARAM];
  const templateId = typeof raw === "string" && raw !== "" ? raw : undefined;
  return <OfferCreateScreen initialTemplateId={templateId} />;
}
