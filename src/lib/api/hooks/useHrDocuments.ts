import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

/**
 * F-İK T2 · `GET /hr/documents/summary` — İK belge takibinin TEK özet ucu
 * (`useStockSummary.ts`/`usePersonnel.ts` deseni: tipler `pnpm gen:api`
 * çıktısından takma ad olarak alınır, elle arayüz yazmak yasak).
 *
 * ⚠️ BFF: bu ucun ilk path segmenti "personnel" DEĞİL "hr"dir; izin listesinde
 * ayrı bir kök olarak durur (`src/app/api/backend/[...path]/route.ts`).
 *
 * ⚠️ Sayılar BELGE sayısıdır (`missing` hariç — o personel sayısıdır). Personel
 * ekranı bu sayılardan "N personel" cümlesi TÜRETMEZ (şef kararı).
 */
export type HrDocumentsSummaryResponse = DeepScale<components["schemas"]["HrDocumentsSummaryResponse"]>;
export type HrDocumentTypeBreakdown = DeepScale<components["schemas"]["HrDocumentTypeBreakdown"]>;
/** F-İK T5 · BT'nin iki listesinin satır tipleri (79-133 · 137-153). */
export type HrExpiredDocument = DeepScale<components["schemas"]["HrExpiredDocument"]>;
export type HrExpiringDocument = DeepScale<components["schemas"]["HrExpiringDocument"]>;

export const HR_DOCUMENTS_SUMMARY_QUERY_KEY = "hr-documents-summary";

export function useHrDocumentsSummary(): UseQueryResult<HrDocumentsSummaryResponse, Error> {
  return useQuery({
    queryKey: [HR_DOCUMENTS_SUMMARY_QUERY_KEY],
    queryFn: async () => unwrap(await backendClient.GET("/hr/documents/summary", {})),
  });
}

/**
 * F-İK T5 · `GET /personnel/{personnel_id}/documents` — Personel Detay'daki
 * "Belgeler" kartının (PD 130-141) GERÇEK kaynağı.
 *
 * ⚠️ BFF: özet ucunun aksine bu ucun kökü "personnel"dir (izin listesinde
 * zaten AÇIK) — "hr" kökü düşse bile bu kart çalışır.
 *
 * ⚠️ Uç SAYFALAMASIZDIR: `PersonnelDocumentResponse[]` düz dizi döner (zarf
 * yok) — kırpılma korkuluğu (`buildListTruncation`) UYGULANMAZ, `total` yok.
 *
 * ⚠️ Bu dilimde belge yüzeyleri SALT-OKUNURdur: `POST/PATCH/DELETE` uçları
 * backend'de VARDIR ama belge ekleme FORMUNUN mockup'ı yoktur (WORKFLOW §3)
 * — mutasyon hook'u bilerek YAZILMAMIŞTIR.
 */
export type PersonnelDocumentResponse = DeepScale<components["schemas"]["PersonnelDocumentResponse"]>;

export const PERSONNEL_DOCUMENTS_QUERY_KEY = "personnel-documents";

export function usePersonnelDocuments(
  personnelId: string,
): UseQueryResult<PersonnelDocumentResponse[], Error> {
  return useQuery({
    // `usePersonnelDetail` deseni: id çözülmeden ağa çıkılmaz.
    enabled: personnelId.length > 0,
    queryKey: [PERSONNEL_DOCUMENTS_QUERY_KEY, personnelId],
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/personnel/{personnel_id}/documents", {
          params: { path: { personnel_id: personnelId } },
        }),
      ),
  });
}
