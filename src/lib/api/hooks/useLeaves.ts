import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

/**
 * F-IZN T3 · `/personel/izinler` (İzin Yönetimi) ekranının İKİ okuma ucu.
 * Yorumlardaki sayılar `İK - İzin Yönetimi.dc.html`in SATIR numaralarıdır.
 *
 * Tipler `pnpm gen:api` çıktısından takma ad olarak alınır (`useHrDocuments.ts`
 * deseni) — elle arayüz yazmak YASAK.
 *
 * ⚠️ İki ayrı istek ZORUNLUDUR ve bu bilinçlidir: KPI'lar + bakiye tablosu
 * (46-50 · 122-170) özet ucundan, onay bekleyen talep tablosu (54-113) ise
 * sayfalanabilir liste ucundan gelir. Özet gövdesinde talep SATIRLARI YOKTUR.
 */
export type HrLeavesSummaryResponse = DeepScale<components["schemas"]["HrLeavesSummaryResponse"]>;
export type LeaveBalanceResponse = DeepScale<components["schemas"]["LeaveBalanceResponse"]>;
export type LeaveRequestResponse = DeepScale<components["schemas"]["LeaveRequestResponse"]>;
export type LeaveRequestListResponse = DeepScale<components["schemas"]["LeaveRequestListResponse"]>;
export type LeaveTypeResponse = DeepScale<components["schemas"]["LeaveTypeResponse"]>;

export const HR_LEAVES_SUMMARY_QUERY_KEY = "hr-leaves-summary";
export const LEAVE_REQUESTS_QUERY_KEY = "leave-requests";
export const LEAVE_TYPES_QUERY_KEY = "leave-types";

/**
 * `GET /hr/leaves/summary?year=` — beş KPI (46-50) + bakiye tablosu (122-170).
 *
 * ⚠️ `year` sorgu parametresi 120'deki yıl seçicisine bağlıdır ve sorgu
 * anahtarının PARÇASIDIR: yıl değişince önbellek ayrı bir girdiye düşer,
 * bayat bakiye tablosu ekranda kalmaz.
 *
 * ⚠️ BFF: bu ucun ilk path segmenti "hr"dir ve izin listesinde ZATEN AÇIKtır
 * (F-IZN T2 devri) — ayrı bir kök gerekmez.
 */
export function useHrLeavesSummary(year: number): UseQueryResult<HrLeavesSummaryResponse, Error> {
  return useQuery({
    queryKey: [HR_LEAVES_SUMMARY_QUERY_KEY, year],
    queryFn: async () =>
      unwrap(await backendClient.GET("/hr/leaves/summary", { params: { query: { year } } })),
  });
}

/**
 * `GET /leave-requests?status=pending` — 54-113 "Onay Bekleyen İzin Talepleri".
 *
 * 🔴 K3: bu ekran YALNIZ `pending` listeler. `approved`/`rejected` sekmesi ya da
 * durum süzgeci İCAT EDİLMEZ (mockup'ta yoktur); istek durumu SABİTtir, çağıran
 * onu değiştiremesin diye parametre bile almaz.
 */
/**
 * `GET /leave-types` — F-IZN T4 talep formunun "İzin Tipi" seçeneği
 * (`Form - Izin Talebi.dc.html` 110-119) ve rozet önizlemesi (120-127).
 *
 * Uç YALNIZ AKTİF tipleri döner (backend `list_leave_types` docstring'i:
 * "Talep formunun tip listesi — YALNIZ AKTİF"), bu yüzden istemci ayrıca
 * süzmez. Sıralama `sort_order` alanına göre BURADA yapılır: mockup rozetleri
 * belirli bir sırada çizer ve o sıra sunucunun `sort_order`ıdır.
 *
 * Katalog nadiren değişir ama önbelleği ELLE UZATILMAZ — projedeki hiçbir
 * sorgu kendi `staleTime`ını kurmuyor; tek istisna açmak sessiz bir kural
 * çatallanması olurdu.
 */
export function useLeaveTypes(): UseQueryResult<LeaveTypeResponse[], Error> {
  return useQuery({
    queryKey: [LEAVE_TYPES_QUERY_KEY],
    queryFn: async () => {
      const types = unwrap(await backendClient.GET("/leave-types", {}));
      return [...types].sort((a, b) => a.sort_order - b.sort_order);
    },
  });
}

export function usePendingLeaveRequests(): UseQueryResult<LeaveRequestListResponse, Error> {
  return useQuery({
    queryKey: [LEAVE_REQUESTS_QUERY_KEY, "pending"],
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/leave-requests", { params: { query: { status: "pending" } } }),
      ),
  });
}
