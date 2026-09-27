import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import { STOCK_ITEMS_QUERY_KEY, type StockItemResponse } from "./useStockItems";
import { STOCK_SUMMARY_QUERY_KEY } from "./useStockSummary";
import { SECTION_STOCK_QUERY_KEY } from "./useSectionStock";
import { SITE_STOCK_QUERY_KEY } from "./useSiteStock";
import { WAREHOUSES_QUERY_KEY, type WarehouseResponse } from "./useWarehouses";
import type { DeepScale } from "@/lib/api/scale";

// F-ST T1 · Stok & Depo YAZMA yüzeyi — bu dilimde ÜÇ mutasyon vardır:
// stok hareketi (SG formu), malzeme kartı ekleme (E3 "+ Malzeme Ekle"),
// depo ekleme (E3 "+ Depo Ekle").
//
// ⚠️ KALICI KARAR (spec §1/§5): kart güncelleme (`PATCH /stock/items/{id}`),
// depo yeniden adlandırma/silme (`PATCH`/`DELETE /warehouses/{id}`) ve hareket
// LİSTESİ ekranı için hook YAZILMAZ — mockup'ta bu yüzeyler yoktur ("Stok
// Hareketi" butonu devre-dışı+gerekçeli basılır). Uçlar backend'de durur ve
// BFF kökleri tanımlıdır; eksik olan BİLEREK eksiktir. Buraya bir silme/
// güncelleme hook'u eklemek = review bulgusu.
//
// Hata basımı ST §4b kanonuna göredir (404 varlık / 422 kural, Türkçe görünür
// mesaj) — tek kaynak `src/lib/api/stock-error.ts` → `stockErrorMessage`.
// Hatalar YUTULMAZ: `BackendError` çağırana aynen iletilir.
// ⚠️ ÜRETİLMİŞ TİP TUZAĞI (F-ST T1'de fiilen ısırdı): openapi şemasında
// VARSAYILANI olan alanlar (`StockEntryLineCreate.quality` = "ok",
// `StockItemCreate.is_active` = true) `openapi-typescript` çıktısında
// ZORUNLU görünür. Yani gövdeyi kurarken bu iki alan AÇIKÇA verilmelidir —
// "varsayılanı var, göndermesem de olur" varsayımı `tsc` hatasıdır.
export type StockEntryCreate = DeepScale<components["schemas"]["StockEntryCreate"]>;
export type StockEntryLineCreate = DeepScale<components["schemas"]["StockEntryLineCreate"]>;
export type StockEntryResponse = DeepScale<components["schemas"]["StockEntryResponse"]>;
export type StockEntryType = components["schemas"]["StockEntryType"];
export type StockQuality = components["schemas"]["StockQuality"];
export type StockItemCreate = DeepScale<components["schemas"]["StockItemCreate"]>;
export type WarehouseCreate = DeepScale<components["schemas"]["WarehouseCreate"]>;

/**
 * Bir hareket yazıldığında BAKİYE ve DURUM taşıyan HER şey bayatlar: E3 özeti,
 * künye listesi ve şantiye stok tablosu. Üçü birlikte geçersiz kılınır —
 * biri unutulursa ekran eski bakiyeyi basmaya devam eder.
 *
 * 🔴 STOK-BOLUM — DÖRDÜNCÜ anahtar eklendi. Satır artık `section_id`/
 * `boq_item_id` taşıyabildiği için bir hareket BÖLÜM kırılımını da bayatlatır;
 * `section-stock` geçersiz kılınmazsa `A1 › Malzeme` sekmesi az önce yazılan
 * sarfı GÖSTERMEZ ve kullanıcı kaydın düştüğünü sanardı.
 */
function invalidateStockDerived(queryClient: ReturnType<typeof useQueryClient>): void {
  queryClient.invalidateQueries({ queryKey: [STOCK_SUMMARY_QUERY_KEY] });
  queryClient.invalidateQueries({ queryKey: [STOCK_ITEMS_QUERY_KEY] });
  queryClient.invalidateQueries({ queryKey: [SITE_STOCK_QUERY_KEY] });
  queryClient.invalidateQueries({ queryKey: [SECTION_STOCK_QUERY_KEY] });
}

/**
 * Stok hareketi (`POST /stock/entries`) — başlık + satırlar TEK gövdede,
 * atomik yazılır. `transfer` tipinde `source_warehouse_id` ZORUNLUDUR ve
 * sunucu ÇİFT BACAK yazar (kaynak depodan aynı miktar düşer); istemci ikinci
 * bir çağrı YAPMAZ.
 */
export function useCreateStockEntry(): UseMutationResult<
  StockEntryResponse,
  Error,
  StockEntryCreate
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body) => unwrap(await backendClient.POST("/stock/entries", { body })),
    onSuccess: () => invalidateStockDerived(queryClient),
  });
}

/**
 * Malzeme kartı ekleme (`POST /stock/items`, E3 67 · spec §5 S1 türetilmiş
 * diyalog). `unit` SERBEST METİNDİR, `category` KAPALI kümedir (enum).
 */
export function useCreateStockItem(): UseMutationResult<StockItemResponse, Error, StockItemCreate> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body) => unwrap(await backendClient.POST("/stock/items", { body })),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [STOCK_ITEMS_QUERY_KEY] });
      // Yeni kart bakiyesiz de olsa katalog TABLOSUNDA görünür (özet ucu tüm
      // kartları listeler), o yüzden özet de tazelenir.
      queryClient.invalidateQueries({ queryKey: [STOCK_SUMMARY_QUERY_KEY] });
    },
  });
}

/**
 * Depo ekleme (`POST /warehouses`, spec §5 S3 türetilmiş diyalog).
 * `site_id` GEÇİLMEZSE / `null` ise MERKEZ DEPO oluşur — bu bir kaza değil,
 * sözleşmenin kendisidir (backend spec §7 S2b).
 */
export function useCreateWarehouse(): UseMutationResult<WarehouseResponse, Error, WarehouseCreate> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body) => unwrap(await backendClient.POST("/warehouses", { body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [WAREHOUSES_QUERY_KEY] }),
  });
}
