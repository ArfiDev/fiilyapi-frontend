import type { HiddenCategory, PageLevel } from "@/lib/api/models";

/** Düzey etiketleri — mockup segmenti: Görmez / Görür / Düzenler. */
export const LEVEL_LABELS: Readonly<Record<PageLevel, string>> = {
  none: "Görmez",
  view: "Görür",
  edit: "Düzenler",
};

/** Segment sırası (soldan sağa). */
export const LEVEL_ORDER: readonly PageLevel[] = ["none", "view", "edit"];

/** Grup başlığındaki dağılım sayaçlarının sırası: "5 Düzenler · 3 Görür · 1 Görmez". */
export const DISTRIBUTION_ORDER: readonly PageLevel[] = ["edit", "view", "none"];

export interface HiddenCategoryInfo {
  readonly key: HiddenCategory;
  readonly title: string;
  readonly hint: string;
}

/** Hassas alan kutucukları (mockup sırası: 2 sıra x 3). Sıra gövdedeki `hidden_fields` sırasını da belirler. */
export const HIDDEN_CATEGORIES: readonly HiddenCategoryInfo[] = [
  { key: "sozlesme_fiyat", title: "Sözleşme ve birim fiyatlar", hint: "sözleşme tutarı, kalem birim fiyatları" },
  { key: "maliyet_kar", title: "Maliyet ve kâr", hint: "maliyet, genel gider, kâr, marj" },
  { key: "maas_kisisel", title: "Maaş ve kişisel bilgiler", hint: "maaş, TC, IBAN" },
  { key: "banka_kasa", title: "Banka/kasa bakiyeleri", hint: "hesap bakiyeleri, nakit akışı" },
  { key: "satis_alici", title: "Satış bedeli ve alıcı bilgisi", hint: "satış bedeli, alıcı TCKN, iletişim" },
  { key: "tum_tutarlar", title: "Tüm tutarlar", hint: "her ekrandaki her para alanı" },
];

/** Backend gizli alan maskesini henüz uygulamıyorsa kutucukların altında gösterilen tek satırlık not. */

/**
 * "Yeni" rozeti taşıyan 6 rol (IZN-B2 migration `c5e9a3b7d1f4`). FE sabit listesi:
 * ilk sürümden sonra kaldırılır (üst plan §8d.7).
 */
export const NEW_ROLE_KEYS: ReadonlySet<string> = new Set([
  "planning_engineer",
  "technical_office",
  "warehouse_keeper",
  "viewer",
  "finance_manager",
  "cost_engineer",
]);
