import type {
  SubcontractorContractDetail,
  SubcontractorProgressPaymentLineRead,
} from "@/lib/api/hooks/useSubcontractorProgressPayments";
import type { SubcontractorProgressPaymentLineInput } from "@/lib/api/hooks/useSubcontractorProgressPaymentMutations";

import { parseEmployerQuantity } from "@/components/contract-item-form/validate";
import { trQuantityInputValue } from "@/components/contracts/employer-item-inline";
import { formatQuantity } from "@/lib/format";
import { REF_PRICE_AMBIGUOUS_DOT, decimalDigitCounts, parseQuantityInput } from "@/lib/tr-decimal";

import { DEFAULT_QUANTITY_SOURCE, type QuantitySource } from "./quantity-source";

// F-TH T3 · hakediş kalem tablosunun SAF (component'sız) mantığı — İşveren
// tarafının `pivot.ts`si ile AYNI amaç, ama satır kaynağı FARKLI: burada
// satır = sözleşme kalemi (`SubcontractorContractDetail.items`), şantiye
// kırılımı YOK (brief §Veri kaynakları).
//
// 🔴 TKL-F7b (T30/T42/T43): taşeron hakedişinde miktar ve katsayı TÜRKÇE okunur (nokta binlik,
// virgül ondalık; belirsiz "1.5" reddedilir) — ayrıştırma `lib/tr-decimal.ts` TEK kaynağından.
// Satır `quantity`si EKRAN METNİDİR ("12,5"); gövdeye yalnız `buildSubcontractorLinesSaveBody`
// nokta-ondalık metin olarak çevirir. İşverenin `sanitizeQuantityInput`ü (nokta ondalık) BU YOLDA
// KULLANILMAZ ve değiştirilmez.

export type SubcontractorContractItem = SubcontractorContractDetail["items"][number];

export interface SubcontractorLineRow {
  itemId: string;
  code: string;
  description: string;
  unit: string;
  /** `null` = grupsuz kalem — mockup'ta grup başlığı basılmaz. */
  groupName: string | null;
  sortOrder: number;
  /**
   * Sözleşme B.F. (salt-okunur) — kayıtlı satır varsa onun `contract_unit_price`'ı
   * (LineRead şemasında ZORUNLU string), yoksa sözleşme kaleminin `unit_price`'ı.
   * `SubcontractorContractItemResponse.unit_price` NULLABLE'dır (`anyOf:
   * [string, null]`) — fix round 1 (kontrolcü bulgusu, Important): eksik fiyat
   * ASLA sessizce `"0"`a düşürülmez, `null` OLARAK taşınır. Sessiz `"0"`
   * gerçek sıfır fiyatla eksik fiyatı ayırt edilemez hale getirirdi
   * (kullanıcı "₺ 0" görüp bunun GERÇEK bir sıfır olduğunu sanırdı).
   * `null` ⇒ ekranda zarif düşüş (pending) gösterilir, `formatAmount` HİÇ
   * çağrılmaz.
   */
  contractUnitPrice: string | null;
  /** TEK düzenlenebilir alan (brief §Kalem tablosu). */
  quantity: string;
  quantitySource: QuantitySource;
  /** Kayıtlı satırın türev tutarı — hiç kaydedilmemişse `null` ("—" basılır, İKİNCİ bir çarpma icat edilmez). */
  lineTotal: string | null;
}

/**
 * Sözleşme kalemleri + (varsa) hakedişin kayıtlı satırları → ekran satırları.
 * Her sözleşme kalemi TAM OLARAK bir satır üretir (brief: kalemler
 * sözleşmeden otomatik yüklenir); kayıtlı satır yoksa miktar `"0"` ile
 * başlar (pivot.ts'teki "0 meşrudur" kararıyla AYNI — boş bırakmak yerine
 * geçerli bir varsayılan).
 */
export function buildSubcontractorLineRows(
  items: readonly SubcontractorContractItem[],
  existingLines: readonly SubcontractorProgressPaymentLineRead[] = [],
): SubcontractorLineRow[] {
  const lineByItemId = new Map<string, SubcontractorProgressPaymentLineRead>();
  for (const line of existingLines) {
    if (!line.contract_item_id) continue;
    lineByItemId.set(line.contract_item_id, line);
  }

  return [...items]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((item) => {
      const existing = lineByItemId.get(item.id);
      return {
        itemId: item.id,
        code: item.code,
        description: item.description,
        unit: item.unit,
        groupName: item.group?.name ?? null,
        sortOrder: item.sort_order,
        contractUnitPrice: existing ? existing.contract_unit_price : item.unit_price,
        quantity: existing ? trQuantityInputValue(existing.quantity) : "0",
        quantitySource: existing ? existing.quantity_source : DEFAULT_QUANTITY_SOURCE,
        lineTotal: existing ? existing.line_total : null,
      };
    });
}

/** Yazarken süzgeç: rakam, nokta ve EN FAZLA bir virgül kalır (Türkçe giriş bozulmaz). */
export function sanitizeTrDecimalInput(raw: string): string {
  const kept = raw.replace(/[^0-9.,]/g, "");
  const firstComma = kept.indexOf(",");
  if (firstComma === -1) return kept;
  return kept.slice(0, firstComma + 1) + kept.slice(firstComma + 1).replace(/,/g, "");
}

export type TrFieldParse = { kind: "ok"; value: string } | { kind: "error"; message: string };

/**
 * Satır miktarı: boş → "0" (0 bu formda MEŞRU), aksi halde T30 + `Numeric(14,3)` sınırları
 * (en çok 3 ondalık, 11 basamak). Sıfır değeri kabul edilir ("0,000" → "0"); işveren sözleşme
 * kalemi kuralından (sıfırdan büyük) tek farkı budur.
 */
export function parseSubcontractorQuantity(raw: string): TrFieldParse {
  const text = raw.trim();
  if (text === "") return { kind: "ok", value: "0" };
  const parsed = parseQuantityInput(text);
  if (parsed.kind === "ok" && !/[1-9]/.test(parsed.value)) return { kind: "ok", value: "0" };
  const result = parseEmployerQuantity(text);
  return result.kind === "error"
    ? { kind: "error", message: result.problem.message }
    : { kind: "ok", value: result.value };
}

export const COEFFICIENT_TOO_BIG = "Katsayı çok büyük, ondalık için virgül kullanın";
export const COEFFICIENT_NOT_POSITIVE = "Katsayı sıfırdan büyük olmalıdır";
/** Backend `default_coefficient` `Numeric(8,3)`; mesaj miktarla aynı metin. */
export const COEFFICIENT_FRACTION_LIMIT = "En fazla 3 ondalık";
const COEFFICIENT_MAX_FRACTION = 3;
/** Dn/D0 katsayısı için kullanıcı onaylı üst sınır (T43): 10 dahil geçerli. */
const COEFFICIENT_MAX = 10;

/**
 * Fiyat farkı katsayısı: boş → "1" (mevcut davranış); T30 okuması (kesir tamamlanmaz); ayrıştırılmış
 * değer 10'dan büyükse ("1.052" binlik tuzağı → 1052) reddedilir.
 */
export function parseSubcontractorCoefficient(raw: string): TrFieldParse {
  const text = raw.trim();
  if (text === "") return { kind: "ok", value: "1" };
  const isNegative = text.startsWith("-");
  const parsed = parseQuantityInput(isNegative ? text.slice(1) : text);
  if (parsed.kind === "ambiguous") return { kind: "error", message: REF_PRICE_AMBIGUOUS_DOT };
  if (parsed.kind === "invalid") return { kind: "error", message: "Katsayı sayı olmalıdır." };
  if (isNegative || !/[1-9]/.test(parsed.value)) return { kind: "error", message: COEFFICIENT_NOT_POSITIVE };
  const [whole = "0", fraction = ""] = parsed.value.split(".");
  if (decimalDigitCounts(parsed.value).fraction > COEFFICIENT_MAX_FRACTION) {
    return { kind: "error", message: COEFFICIENT_FRACTION_LIMIT };
  }
  const isOverMax =
    whole.length > 2 ||
    Number(whole) > COEFFICIENT_MAX ||
    (Number(whole) === COEFFICIENT_MAX && /[1-9]/.test(fraction));
  if (isOverMax) return { kind: "error", message: COEFFICIENT_TOO_BIG };
  return { kind: "ok", value: parsed.value };
}

/** Ekran metnini ("1.234,5") salt-okunur gösterim için biçimler; okunamazsa ham metni basar. */
export function formatTrQuantityText(raw: string): string {
  const parsed = parseSubcontractorQuantity(raw);
  return parsed.kind === "ok" ? formatQuantity(parsed.value) : raw;
}

export interface SubcontractorLinesSave {
  body: SubcontractorProgressPaymentLineInput[];
  /** Hatalı satırlar: kalem id → görünür mesaj. Boş değilse istek GİTMEZ. */
  errors: Record<string, string>;
}

/**
 * ⚠️ `PUT …/lines` gövdesi — DEĞİŞTİRME (replace) semantiği (brief §PUT
 * lines): gövdede GEÇMEYEN satır sunucuda SİLİNİR. Bu yüzden ekrandaki TÜM
 * satırlar (miktarı "0" olanlar DAHİL) tek gövdede gönderilir — yalnız
 * DEĞİŞENLER değil. `coefficient` BİLEREK gönderilmez (`undefined`): şema
 * açıklaması "gönderilmezse yeni satır hakedişin varsayılan katsayısını
 * alır, mevcut satırın katsayısı KORUNUR" der — bu formda satır bazlı
 * katsayı girişi YOK (brief §Üst form, katsayı yalnız başlık seviyesinde).
 * Miktar ekran metninden T30 kuralıyla okunur; okunamayan satır `errors`a düşer.
 */
export function buildSubcontractorLinesSaveBody(rows: readonly SubcontractorLineRow[]): SubcontractorLinesSave {
  const errors: Record<string, string> = {};
  const body = rows.map((row) => {
    const parsed = parseSubcontractorQuantity(row.quantity);
    if (parsed.kind === "error") errors[row.itemId] = parsed.message;
    return {
      contract_item_id: row.itemId,
      quantity: parsed.kind === "ok" ? parsed.value : "0",
      sort_order: row.sortOrder,
    };
  });
  return { body, errors };
}
