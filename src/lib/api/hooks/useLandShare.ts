import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { BackendError, unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";

import type { UnitListResponse } from "./useProjectUnits";
import { invalidateUnitDerived } from "./useUnitMutations";
import type { DeepScale } from "@/lib/api/scale";

/**
 * F-UNIT2 T2c · PG ("Kat Karşılığı Paylaşım Girişi") ekranının ÜÇ ucu —
 * iki okuma, bir yazma.
 *
 * ⚠️ BFF İZİN LİSTESİ: ÜÇ UÇ DA `projects` segmentiyle başlar ve o kök
 * `ALLOWED_ROOTS`ta ZATEN tanımlıdır (`src/app/api/backend/[...path]/route.ts`).
 * 🔴 YENİ KÖK EKLENMEZ — ne `units`, ne `land-share`, ne `shareholders`.
 * Çağıranı olmayan kök BEKÇİSİZDİR (F-MT2 kanonu) ve buradaki uçların
 * hiçbirinin ihtiyacı yoktur. Hissedar seçenekleri bile ayrı bir uçtan değil,
 * özetin `shareholders` alanından gelir.
 *
 * 🔴 YAZMA UCU **PATCH**TİR — POST/PUT DEĞİL
 * (`PATCH /projects/{project_id}/units/allocation`). Yanlış metot 405 üretir
 * ve üretilmiş tipler yolu tanısa bile metodu doğrulamaz.
 */
export type LandShareSummaryResponse = DeepScale<components["schemas"]["LandShareSummaryResponse"]>;
export type LandShareContract = DeepScale<components["schemas"]["LandShareContract"]>;
export type LandShareCountBalance = components["schemas"]["LandShareCountBalance"];
export type LandShareValueBalance = DeepScale<components["schemas"]["LandShareValueBalance"]>;
export type LandShareShareholderRow = DeepScale<components["schemas"]["LandShareShareholderRow"]>;
export type LandShareUnitListResponse = components["schemas"]["LandShareUnitListResponse"];
export type UnitOwnerSideFilter = components["schemas"]["UnitOwnerSideFilter"];
export type UnitAllocationRequest = components["schemas"]["UnitAllocationRequest"];

export const LAND_SHARE_SUMMARY_QUERY_KEY = "land-share-summary";
export const LAND_SHARE_UNITS_QUERY_KEY = "land-share-units";

/**
 * Sunucunun KENDİ varsayılanı (`projects/router.py`: `limit: _LIMIT = 50`,
 * sınır `1..200`). İstemci kendi sayfa boyutunu UYDURMAZ: iki yerde yaşayan
 * bir sayı ayrışır ve sayfa çubuğu sunucunun döndürdüğü `limit`ten BAŞKA bir
 * sayfa sayısı hesaplardı.
 */
export const LAND_SHARE_UNITS_PAGE_SIZE = 50;

/**
 * 🔴 KAT KARŞILIĞI OLMAYAN PROJE **404** ALIR, BOŞ ÖZET DEĞİL — ve bu ayrım
 * ekranda görünür olmak zorundadır. `LandShareSummaryResponse` açıklaması
 * gerekçeyi kendi yazıyor: *"Kat karsiligi OLMAYAN proje (kayit yok) burada 404
 * alir, BOS OZET DEGIL: bos ozet ekrana '%0/%0 paylasim' bastirir ve kullanici
 * veriyi kaybettigini sanardi."*
 *
 * Bu yüzden 404 bir HATA gibi değil, AÇIKLAYICI BOŞ HÂL gibi basılır; ayırt
 * etmek için `status` okunur. (`land-share/units` ucu da AYNI 404'ü verir —
 * ikisi de `_land_share_project` üzerinden geçer.)
 */
export function isLandShareMissing(error: unknown): boolean {
  return error instanceof BackendError && error.status === 404;
}

/**
 * PG 61/65-81 · 96-99 — sözleşme kartı, denge kartları ve hissedar seçenekleri.
 * `GET /projects/{project_id}/land-share/summary`.
 *
 * 🔴 `LandShareValueBalance`ın DÖRT alanı (`our_actual_pct`,
 * `owner_actual_pct`, `deviation_pct`, `is_within_tolerance`) `null`
 * OLABİLİR ve bu "HESAPLANAMAZ"dır, "sıfır" DEĞİL. Ekran bunları `%0` ya da
 * yeşil "denge uygun" diye basamaz — `tolerance_pct` bu hâlde BİLE döner,
 * çünkü frontend eşiği kopyalamak zorunda kalmasın diye konmuştur.
 */
export function useLandShareSummary(
  projectId: string,
): UseQueryResult<LandShareSummaryResponse, Error> {
  return useQuery({
    enabled: projectId.length > 0,
    queryKey: [LAND_SHARE_SUMMARY_QUERY_KEY, projectId],
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/projects/{project_id}/land-share/summary", {
          params: { path: { project_id: projectId } },
        }),
      ),
  });
}

/** PG 62/112-115 — tablo süzgeçleri. Üçü de sunucu tarafındadır. */
export interface LandShareUnitsFilter {
  /**
   * PG 112-115. `UnitOwnerSideFilter` ÜÇ üyelidir (`contractor` ·
   * `landowner` · `unassigned`); dördüncü düğme ("Tümü") bu alanı HİÇ
   * göndermemektir — `UnitOwnerSide` kullanılamaz çünkü atanmamış satırları
   * (`NULL`) seçmenin karşılığı onda YOKTUR.
   */
  ownerSide?: UnitOwnerSideFilter;
  /** PG 62 blok süzgeci. */
  blockId?: string;
  /** Serbest arama (mockup'ta kutusu yok; uç destekler). */
  q?: string;
  limit?: number;
  offset?: number;
}

/**
 * PG 118-238 tablosu — `GET /projects/{project_id}/land-share/units`.
 *
 * 🔴 SAYFALIDIR ve `total` SÜZGEÇLENMİŞ kümenin boyutudur (sayfalamadan
 * ÖNCE): sayfa çubuğu ondan çıkar, `items.length`ten DEĞİL. Mockup'ın 42
 * ünitesi bugünün sayısıdır; 400 ünitelik bir projede sayfasız bir tablo
 * sessizce kırpardı.
 */
export function useLandShareUnits(
  projectId: string,
  filter: LandShareUnitsFilter = {},
): UseQueryResult<LandShareUnitListResponse, Error> {
  const limit = filter.limit ?? LAND_SHARE_UNITS_PAGE_SIZE;
  const offset = filter.offset ?? 0;
  return useQuery({
    enabled: projectId.length > 0,
    queryKey: [
      LAND_SHARE_UNITS_QUERY_KEY,
      projectId,
      filter.ownerSide ?? null,
      filter.blockId ?? null,
      filter.q ?? null,
      limit,
      offset,
    ],
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/projects/{project_id}/land-share/units", {
          params: {
            query: {
              // Anahtar YOKSA hiç kurulmaz: `owner_side: undefined` göndermek
              // "Tümü" düğmesini üç enum üyesinden ayırt edilemez kılardı.
              ...(filter.ownerSide !== undefined ? { owner_side: filter.ownerSide } : {}),
              ...(filter.blockId ? { block_id: filter.blockId } : {}),
              ...(filter.q ? { q: filter.q } : {}),
              limit,
              offset,
            },
            path: { project_id: projectId },
          },
        }),
      ),
  });
}

/**
 * Paylaşım yazıldıktan sonra bayatlayan İKİ okuma — ama AYNI ŞEKİLDE DEĞİL:
 *
 * · **Özet YENİDEN ÇEKİLİR.** Denge kartlarının sayıları (`balance`,
 *   `shareholders`, `unassigned`) `PATCH` yanıtında YOKTUR; çekilmezse ekran
 *   yeni atamayı gösterirken eski dengeyi basar.
 * · **Ünite listesi YALNIZ BAYAT İŞARETLENİR** (`refetchType: "none"`).
 *   🔴 `PATCH` yanıtı *"guncel tam listedir"* ve ekran tabloyu ONDAN yeniden
 *   çizer (`saved-rows.ts`); aktif sorguyu yeniden çektirmek, elimizde cevabı
 *   varken atılan İKİNCİ BİR GET olurdu. İşaretleme yine de yapılır: kullanıcı
 *   süzgeç/sayfa değiştirdiğinde ya da ekrana geri döndüğünde liste sunucudan
 *   tazelenir.
 */
export function invalidateLandShare(queryClient: ReturnType<typeof useQueryClient>): void {
  queryClient.invalidateQueries({ queryKey: [LAND_SHARE_SUMMARY_QUERY_KEY] });
  queryClient.invalidateQueries({
    queryKey: [LAND_SHARE_UNITS_QUERY_KEY],
    refetchType: "none",
  });
}

export interface UpdateAllocationVariables {
  projectId: string;
  body: UnitAllocationRequest;
}

/**
 * PG 276 "Paylaşımı Kaydet" —
 * **`PATCH /projects/{project_id}/units/allocation`** (🔴 POST/PUT DEĞİL).
 *
 * 🔴 **ATOMİKTİR.** Uç açıklaması kendi yazıyor: *"tek satir bile reddedilirse
 * hicbiri yazilmaz. Listedeki bir unite BASKA projeye aitse 404 doner (IDOR-8)
 * ve bu projenin hicbir satiri degismez."* Hata çağırana AYNEN iletilir ve
 * ekran bunu "bir kısmı kaydedildi" diye BASMAZ — kısmi yazma diye bir hâl
 * yoktur. `build-body.ts`in "yalnız değişen satırlar" kuralı da bu yüzden
 * vardır: gövde büyüdükçe TÜM kaydın yıkılma yüzeyi büyür.
 *
 * 🔴 **YANIT GÜNCEL TAM LİSTEDİR** (*"Yanit guncel tam listedir — ekran
 * tabloyu yeniden cizer"*). Kaydettikten sonra İKİNCİ bir GET ATILMAZ; ekran
 * tabloyu yanıttan tazeler.
 *
 * Yine de önbellek geçersiz kılınır — ama BU EKRAN İÇİN DEĞİL: 42 ünitenin
 * sahiplik ataması değişince kat karşılığı özeti (`land-share/*`) ve `units`
 * modülünün üç türevi (blok kartları, ünite ızgarası, satış KPI'ı) BAŞKA
 * ekranlarda bayattır. `invalidateUnitDerived` KOPYALANMAZ, `useUnitMutations`
 * ten içe aktarılır (tek küme, dördüncü türev eklendiğinde ayrışmasın).
 */
export function useUpdateAllocation(): UseMutationResult<
  UnitListResponse,
  Error,
  UpdateAllocationVariables
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, body }) =>
      unwrap(
        await backendClient.PATCH("/projects/{project_id}/units/allocation", {
          params: { path: { project_id: projectId } },
          body,
        }),
      ),
    onSuccess: () => {
      invalidateLandShare(queryClient);
      invalidateUnitDerived(queryClient);
    },
  });
}
