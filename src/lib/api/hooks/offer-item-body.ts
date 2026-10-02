import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

// TKL-F3.2 · Teklife kalem ekleme gövde kurucusu (tekil + toplu aynı yol).
//
// 🔴 `cost_unit_price` ÜÇ hâli BİLİNÇLİ ayrıdır (backend `OfferItemCreate`, `model_fields_set`):
//   · `suggest` — alan gövdede YOK → sunucu maliyeti SON FİYAT → REFERANS → BOŞ sırasıyla önerir
//     (SO-6 / T38). Seçicide kullanıcı maliyet hücresine DOKUNMADIYSA budur.
//   · `empty`   — açık `null` → maliyet BOŞ kalır (öneri ezilir; fiyatsız kalem, T31).
//     Kullanıcı önerilen değeri bilerek SİLDİYSE budur.
//   · `value`   — kullanıcının girdiği metin (T30 kuralıyla ayrıştırılmış, kayıpsız dize).
// Öneriyi istemcide hesaplayıp `value` olarak göndermek YANLIŞTIR: kural tek yerde (sunucu)
// yaşar, istemci yalnız gösterir; iki yerde yaşayan kural bir gün ayrışır.

export type OfferItemCreateBody = DeepScale<components["schemas"]["OfferItemCreate"]>;

export type OfferCostInput =
  | { readonly kind: "suggest" }
  | { readonly kind: "empty" }
  | { readonly kind: "value"; readonly value: string };

export interface OfferItemDraft {
  readonly catalogItemId: string;
  readonly groupId: string;
  /** Kayıpsız miktar metni (sayıya çevrilmez). */
  readonly quantity: string;
  readonly cost: OfferCostInput;
  readonly overheadPct?: string;
  readonly profitPct?: string;
  readonly offerUnitPrice?: string;
  /** Verilmezse sunucu katalogdan kopyalar. */
  readonly unitMhr?: string;
  /** Verilmezse sunucu grupta sıradakini verir (`0` geçerli bir değerdir). */
  readonly sortOrder?: number;
}

export function buildOfferItemCreateBody(draft: OfferItemDraft): OfferItemCreateBody {
  return {
    catalog_item_id: draft.catalogItemId,
    group_id: draft.groupId,
    quantity: draft.quantity,
    ...(draft.cost.kind === "empty" ? { cost_unit_price: null } : {}),
    ...(draft.cost.kind === "value" ? { cost_unit_price: draft.cost.value } : {}),
    ...(draft.overheadPct !== undefined ? { overhead_pct: draft.overheadPct } : {}),
    ...(draft.profitPct !== undefined ? { profit_pct: draft.profitPct } : {}),
    ...(draft.offerUnitPrice !== undefined ? { offer_unit_price: draft.offerUnitPrice } : {}),
    ...(draft.unitMhr !== undefined ? { unit_mhr: draft.unitMhr } : {}),
    ...(draft.sortOrder !== undefined ? { sort_order: draft.sortOrder } : {}),
  };
}
