import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

// F-SD T1 · "Günlükten Doldur" (spec §4) — hakediş formlarinin ONERI uclari.
// SD Seçenek B'nin UI ayagi: uc yalnizca ONERIR, kalicilastirmaz; kullanici
// duzeltebilir ve kayit normal `PUT …/lines` ile yapilir.
export type EmployerDiarySuggestion = DeepScale<components["schemas"]["EmployerDiarySuggestion"]>;
export type SubcontractorDiarySuggestion = DeepScale<components["schemas"]["SubcontractorDiarySuggestion"]>;

export const EMPLOYER_DIARY_SUGGESTION_QUERY_KEY = "employer-diary-suggestion";
export const SUBCONTRACTOR_DIARY_SUGGESTION_QUERY_KEY = "subcontractor-diary-suggestion";

/**
 * Iki oneri ucunun ORTAK parametreleri. `enabled` BILEREK vardir: oneri
 * ekran acilisinda DEGIL, kullanici "Günlükten Doldur"a bastiginda cekilir —
 * form her acildiginda bir istek atmak hem gereksiz hem de kullanicinin
 * elle girdigi satirlarin uzerine gelme riskini dogurur.
 */
export interface DiarySuggestionOptions {
  year?: number;
  month?: number;
  enabled?: boolean;
}

function periodQuery(options: DiarySuggestionOptions): Record<string, number> {
  return {
    ...(options.year !== undefined ? { year: options.year } : {}),
    ...(options.month !== undefined ? { month: options.month } : {}),
  };
}

/**
 * İşveren hakediş formunun onerisi
 * (`GET /projects/{project_id}/progress-payments/diary-suggestion`).
 * Satir kimligi (kalem, santiye) ciftidir; `coefficient` BILEREK `null`
 * gelir — katsayi bir GUNLUK verisi degildir, hakedişin `default_coefficient`i
 * uygulanir. `skipped_unbridged_count`/`reason` kullaniciya gosterilir.
 */
export function useEmployerDiarySuggestion(
  projectId: string,
  options: DiarySuggestionOptions = {},
): UseQueryResult<EmployerDiarySuggestion, Error> {
  return useQuery({
    enabled: projectId.length > 0 && options.enabled !== false,
    queryKey: [
      EMPLOYER_DIARY_SUGGESTION_QUERY_KEY,
      projectId,
      options.year ?? null,
      options.month ?? null,
    ],
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/projects/{project_id}/progress-payments/diary-suggestion", {
          params: { path: { project_id: projectId }, query: periodQuery(options) },
        }),
      ),
  });
}

/**
 * Taşeron hakediş formunun onerisi
 * (`GET /subcontractor-contracts/{contract_id}/progress-payments/diary-suggestion`).
 * Yanittaki `site_id` sozlesmenin santiyesidir; `null` ise (proje geneli
 * sozlesme) oneri kapsam DISIDIR ve `reason` bunu acikca soyler — ekran bu
 * durumu sessizce bos liste gibi gostermez.
 */
export function useSubcontractorDiarySuggestion(
  contractId: string,
  options: DiarySuggestionOptions = {},
): UseQueryResult<SubcontractorDiarySuggestion, Error> {
  return useQuery({
    enabled: contractId.length > 0 && options.enabled !== false,
    queryKey: [
      SUBCONTRACTOR_DIARY_SUGGESTION_QUERY_KEY,
      contractId,
      options.year ?? null,
      options.month ?? null,
    ],
    queryFn: async () =>
      unwrap(
        await backendClient.GET(
          "/subcontractor-contracts/{contract_id}/progress-payments/diary-suggestion",
          {
            params: { path: { contract_id: contractId }, query: periodQuery(options) },
          },
        ),
      ),
  });
}
