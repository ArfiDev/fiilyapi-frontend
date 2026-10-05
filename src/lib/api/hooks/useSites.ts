import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";
import { SITE_QUERY_KEY } from "./project-scope-query-keys";

// Task 5 — Proje Detay › Şantiyeler listesi (spec §4.3). Tip adı "SiteCard" bilesen
// adiyla catisir, bu yuzden "SiteListItem" olarak takma ad verildi.
export type SiteListResponse = DeepScale<components["schemas"]["SiteListResponse"]>;
export type SiteListItem = DeepScale<components["schemas"]["SiteCard"]>;
// Task 8 — Şantiye Detay tekil kaynağı (spec §5). Bileşen adıyla çakışmasın
// diye "SiteDetail" (SiteCard deseniyle aynı) takma adı verildi.
export type SiteDetail = DeepScale<components["schemas"]["SiteDetailResponse"]>;

export const SITES_QUERY_KEY = "sites";
export { SITE_QUERY_KEY };

/**
 * Sorgu seçenekleri AYRI dışa verilir: E5 puantajının şantiye seçicisi aynı
 * anahtarları `useQueries` ile paralel çeker (`useRolePermissions` deseni) —
 * önbellek `useSites` ile PAYLAŞILIR, ikinci bir istek doğmaz.
 */
export function sitesQueryOptions(projectId: string) {
  return {
    // `projectId` boşsa ağa ÇIKILMAZ — `useSite`/`useContractDistribution` ile
    // aynı boş-id kapısı. Bu kapı uzun süre EKSİKTİ ve gizli kaldı: o güne dek
    // her çağıran proje kapsamlı bir rotadaydı, yani id HEP doluydu. F-P5'in
    // FSO formu (`/sozlesmeler/taseron/yeni`) proje SEÇİLMEDEN açılan ilk
    // çağıran olunca boş id ile `/projects//sites` kuruldu, fetch onu
    // `/projects/sites`e normalize etti ve backend 422 döndü — CANLI SMOKE'ta
    // konsol hatası olarak yakalandı (jsdom testleri hook'u mock'ladığı için
    // GÖRMEZ; e2e mock'u da bu bozuk yolu tanımaz).
    enabled: projectId.length > 0,
    queryKey: [SITES_QUERY_KEY, projectId],
    queryFn: async (): Promise<SiteListResponse> =>
      unwrap(
        await backendClient.GET("/projects/{project_id}/sites", {
          params: { path: { project_id: projectId } },
        }),
      ),
  };
}

export function useSites(projectId: string): UseQueryResult<SiteListResponse, Error> {
  return useQuery(sitesQueryOptions(projectId));
}

// Şantiye Detay hero + sekmeler + bölüm listesi için tekil şantiye (spec §5).
// `siteId` boşsa sorgu çalışmaz: drill kabuğu (proje layout'u) şantiye
// seviyesinde olmadığında bu hook'u boş id ile çağırır (hook'lar koşullu
// çağrılamaz), ağa çıkmamalıdır.
/**
 * URL-3 · şantiye anahtarının KAPSAMI.
 *
 * 🔴 `GET /sites/{site_id}` DÜZ bir uçtur (yolda proje yoktur) ama
 * `sites.slug` PROJE İÇİNDE tekildir, KÜRESEL değil. İki farklı projenin
 * şantiyesi aynı slug'ı taşıyabilir; backend belirsizlikte **fail-closed 404**
 * döner, rastgele seçmez. Kapsam bu yüzden `?project=` ile gönderilir.
 *
 * Bizim rotamız (`/projeler/<p>/santiyeler/<s>`) İÇ İÇE olduğu için kapsam
 * HER ZAMAN elimizdedir — göndermemek için bir sebep yok, göndermemek ise
 * ileride ikinci bir "A-Blok Şantiyesi" açıldığı gün ekranı 404'e düşürürdü.
 *
 * `siteId` bir UUID ise kapsam ZARARSIZDIR: kimlik eşleşmesi kapsamdan
 * bağımsız çözülür (eski linkler kapsam olmadan da yaşar).
 */
export interface SiteScope {
  /** Kapsam anahtarı — slug VEYA UUID. Verilmezse çözüm tek adaya bağlıdır. */
  project?: string;
}

export function useSite(siteId: string, scope: SiteScope = {}): UseQueryResult<SiteDetail, Error> {
  const project = scope.project ?? "";
  return useQuery({
    enabled: siteId.length > 0,
    // Kapsam anahtarın ANLAMINI değiştirebilir (aynı slug iki projede), bu
    // yüzden önbellek anahtarının PARÇASIDIR — yoksa iki proje aynı slug'la
    // birbirinin şantiyesini önbellekten okurdu.
    queryKey: [SITE_QUERY_KEY, siteId, project],
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/sites/{site_id}", {
          params: {
            path: { site_id: siteId },
            ...(project.length > 0 ? { query: { project } } : {}),
          },
        }),
      ),
  });
}
