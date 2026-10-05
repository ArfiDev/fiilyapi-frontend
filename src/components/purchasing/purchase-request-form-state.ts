/**
 * F-SA T3 · FST (`projedesign/Form - Satinalma Talebi.dc.html`) formunun DURUM
 * modeli. Yorumlardaki sayılar O DOSYANIN satır numaralarıdır.
 *
 * ⚠️ PENDING YÜZEYLER GÖVDEYE SIZAMAZ (F-ST/F-P8 emsali): "Teklif İstenecek
 * Tedarikçiler" (125-128), "Ödeme Vadesi Tercihi" (134), "e-posta otomatik
 * gönderilsin" (135) ve "Ekler" (140-153) bu arayüzde **HİÇ YOKTUR**. Ekranda
 * devre dışı + görünür gerekçeyle basılırlar ama form durumunda karşılıkları
 * olmadığı için `purchase-request-body.ts`ten geçemezler — `build` bir alanı
 * "unutmaya" güvenmez, alan var olmaz.
 *
 * ⚠️ `requestNo` de YOKTUR: numarayı SUNUCU üretir (`PurchaseRequestCreate`
 * açıklaması: "`request_no` sunucu uretir"). FST 53'teki kutu SALT-OKUNURdur ve
 * değeri ancak kayıttan SONRA (`PurchaseRequestResponse.request_no`) dolar.
 */

import { multiplyDecimalStrings, normalizeDecimalInput } from "@/lib/decimal";
import type { PurchasePriority } from "@/lib/api/hooks/usePurchaseRequests";

export { normalizeDecimalInput };

/**
 * Kalemin İKİ KAPISI (`PurchaseRequestLineCreate` XOR kuralı, FST 104 "Stok
 * kartından seç veya yeni malzeme tanımla"): satır ya bir stok KARTINA
 * bağlıdır ya da KATALOGSUZdur. İkisi birden dolu olan satır sunucuda 422'dir,
 * bu yüzden kaynak istemcide de TEK bir ayrımla tutulur — iki alanı birden
 * doldurabilen bir durum modeli ihlali ÜRETEBİLİRDİ.
 */
export type PurchaseRequestLineSource = "stock" | "free";

export interface PurchaseRequestLineValues {
  /** SALT İSTEMCİ — React liste anahtarı + hata eşlemesi; gövdeye GİRMEZ. */
  key: string;
  source: PurchaseRequestLineSource;
  /** `source === "stock"` iken anlamlı. */
  stockItemId: string;
  /** `source === "free"` iken anlamlı (FST 83 "Malzeme" hücresi). */
  freeTextName: string;
  /** `source === "free"` iken anlamlı (FST 84 "Birim" hücresi). */
  freeTextUnit: string;
  quantity: string;
  unitPrice: string;
  /**
   * IZN-F4d.3 — sunucudaki satır kimliği (kayıttan sonra `attachSavedLines` doldurur). PATCH gövdesinde `id` olarak GERİ
   * gönderilir (id'li = yerinde güncelle, id'siz = yeni, gövdede olmayan = silinir); satır yeniden sıralansa/düzenlense
   * de korunur. POST gövdesine ASLA girmez.
   */
  serverId?: string;
  /**
   * IZN-F4d.3 — bu satırın fiyatı bu rolde GİZLİ (maliyet kategorisi gizli + sunucu fiyatı `null`; ya da kayıttan sonra
   * eklenen yeni satır — gizli rol PATCH'te fiyat yazamaz). Fiyat girişi kilitli, `estimated_unit_price` gövdede YOK;
   * `serverId` sayesinde sunucu mevcut fiyatı korur.
   */
  isPriceMasked?: boolean;
}

export interface PurchaseRequestFormValues {
  projectId: string; // 56
  requestDate: string; // 54
  priority: PurchasePriority; // 55
  siteId: string; // 57
  sectionId: string; // 57
  neededBy: string; // 58
  justification: string; // 62
  quoteDeadline: string; // 133
  lines: PurchaseRequestLineValues[]; // 71-116
}

/** Satır anahtarı — `Math.random` yok, artan sayaç deterministiktir. */
export function purchaseRequestLineKey(seq: number): string {
  return `pr-line-${seq}`;
}

export function createPurchaseRequestLine(seq: number): PurchaseRequestLineValues {
  return {
    key: purchaseRequestLineKey(seq),
    // Varsayılan kapı STOK KARTIdır: mockup'ın iki örnek satırı da katalog
    // kalemidir (83 "Nervürlü Demir Ø12", 92 "PP-R Boru 32mm · MKN-0192").
    source: "stock",
    stockItemId: "",
    freeTextName: "",
    freeTextUnit: "",
    quantity: "",
    unitPrice: "",
  };
}

/**
 * Boş form. Tarih ÇAĞIRANDAN gelir (gizli `new Date()` yok — site-diary
 * `isoDate` deseni). İlk satır AÇIK gelir: mockup'ta tablo boş değildir.
 *
 * ⚠️ Mockup'ın örnek İÇERİĞİ (Nervürlü Demir, 15 Ton, 21500 …) BASILMAZ —
 * uydurma veri tohumlamak bulgudur (F-ST `StockEntryLinesCard` kararı 3).
 */
export function emptyPurchaseRequestFormValues(today: string): PurchaseRequestFormValues {
  return {
    projectId: "",
    requestDate: today,
    // 55 — mockup "Acil"i seçili çizer ama bu ÖRNEK VERİDİR; boş formun
    // öngörülebilir başlangıcı `normal`dir (şema varsayılanı da odur).
    priority: "normal",
    siteId: "",
    sectionId: "",
    neededBy: "",
    justification: "",
    quoteDeadline: "",
    lines: [createPurchaseRequestLine(0)],
  };
}

export function addPurchaseRequestLine(
  values: PurchaseRequestFormValues,
  seq: number,
): PurchaseRequestFormValues {
  return { ...values, lines: [...values.lines, createPurchaseRequestLine(seq)] };
}

export function removePurchaseRequestLine(
  values: PurchaseRequestFormValues,
  key: string,
): PurchaseRequestFormValues {
  return { ...values, lines: values.lines.filter((line) => line.key !== key) };
}

export function updatePurchaseRequestLine(
  values: PurchaseRequestFormValues,
  key: string,
  patch: Partial<Omit<PurchaseRequestLineValues, "key">>,
): PurchaseRequestFormValues {
  return {
    ...values,
    lines: values.lines.map((line) => (line.key === key ? { ...line, ...patch } : line)),
  };
}

/**
 * Proje DEĞİŞİNCE şantiye ve bölüm seçimi DÜŞER: eski şantiye yeni projeye ait
 * değildir ve gövdeye giderse sunucu 404 verir (ST §4b kanonu: gövde içi varlık
 * referansı 404'tür). Aynısı şantiye→bölüm için de geçerlidir.
 */
export function selectPurchaseRequestProject(
  values: PurchaseRequestFormValues,
  projectId: string,
): PurchaseRequestFormValues {
  if (values.projectId === projectId) return values;
  return { ...values, projectId, siteId: "", sectionId: "" };
}

export function selectPurchaseRequestSite(
  values: PurchaseRequestFormValues,
  siteId: string,
): PurchaseRequestFormValues {
  if (values.siteId === siteId) return values;
  return { ...values, siteId, sectionId: "" };
}

/**
 * Satır tutarı (FST 88/97 "Tahmini Tutar") — **TÜREVDİR**, gövdeye girmez
 * (`PurchaseRequestLineCreate` açıklaması: "Mevcut Stok ve Tahmini Tutar
 * BURADA YOKTUR"). Sunucu aynı türevi `line_total` olarak döndürür ve
 * **fiyat yoksa `null`dur** — istemci de burada `null` döner, sessizce 0
 * SAYMAZ.
 */
export function purchaseRequestLineTotal(line: PurchaseRequestLineValues): string | null {
  const quantity = normalizeDecimalInput(line.quantity);
  const unitPrice = normalizeDecimalInput(line.unitPrice);
  if (quantity === null || unitPrice === null) return null;
  return multiplyDecimalStrings(quantity, unitPrice);
}

/** Kalemin tahmini birim FİYATI girilmiş mi (sunucudaki `estimated_unit_price is None` ikizi). */
export function isPurchaseRequestLinePriced(line: PurchaseRequestLineValues): boolean {
  return normalizeDecimalInput(line.unitPrice) !== null;
}

/** Kayıt yanıtındaki satırdan formun ihtiyacı olan kısım. */
export interface SavedRequestLine {
  id: string;
  sort_order: number;
  estimated_unit_price: string | null;
}

/**
 * IZN-F4d.3 — kayıttan sonra sunucu satır kimliklerini forma işler. `sentKeys`, gövdeye giren satırların form anahtarları
 * (gövde sırasıyla); sunucu `sort_order`u dizinin indeksinden üretir, yani `sentKeys[i]` ↔ `sort_order i`. Eşleşmeyen satıra
 * dokunulmaz. Maliyet gizli ve sunucu fiyatı `null` ise satır `isPriceMasked` olur.
 */
export function attachSavedLines(
  values: PurchaseRequestFormValues,
  sentKeys: readonly string[],
  saved: readonly SavedRequestLine[],
  isCostHidden: boolean,
): PurchaseRequestFormValues {
  const ordered = [...saved].sort((a, b) => a.sort_order - b.sort_order);
  const byKey = new Map(sentKeys.flatMap((key, index) => (ordered[index] ? [[key, ordered[index]] as const] : [])));
  return {
    ...values,
    lines: values.lines.map((line) => {
      const savedLine = byKey.get(line.key);
      if (!savedLine) return line;
      return {
        ...line,
        serverId: savedLine.id,
        isPriceMasked: isCostHidden && savedLine.estimated_unit_price === null,
      };
    }),
  };
}
