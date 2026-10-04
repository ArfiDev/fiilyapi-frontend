import type {
  SubcontractorContractDetail,
  SubcontractorProgressPaymentLineRead,
} from "@/lib/api/hooks/useSubcontractorProgressPayments";
import type { SubcontractorProgressPaymentLineInput } from "@/lib/api/hooks/useSubcontractorProgressPaymentMutations";

import { trQuantityInputValue } from "@/components/contracts/employer-item-inline";
import { sourceCodeLabel } from "@/components/catalog-shared/source-code";

import { DEFAULT_QUANTITY_SOURCE, type QuantitySource } from "./quantity-source";
import { parsePaymentQuantity } from "./tr-quantity";

// F-TH T3 · hakediş kalem tablosunun SAF (component'sız) mantığı — İşveren
// tarafının `pivot.ts`si ile AYNI amaç, ama satır kaynağı FARKLI: burada
// satır = sözleşme kalemi (`SubcontractorContractDetail.items`), şantiye
// kırılımı YOK (brief §Veri kaynakları).
//
// 🔴 TKL-F7b (T30/T42/T43): taşeron hakedişinde miktar ve katsayı TÜRKÇE okunur (nokta binlik,
// virgül ondalık; belirsiz "1.5" reddedilir) — ayrıştırıcılar işverenle ORTAK `tr-quantity.ts`
// modülündedir. Satır `quantity`si EKRAN METNİDİR ("12,5"); gövdeye yalnız
// `buildSubcontractorLinesSaveBody` nokta-ondalık metin olarak çevirir.

export type SubcontractorContractItem = SubcontractorContractDetail["items"][number];

export interface SubcontractorLineRow {
  itemId: string;
  code: string;
  /** Bakanlık poz no'su (KAT-F2.4 · Q2): kayıtlı satır varsa SATIRIN anlık görüntüsü (null dahil), yoksa kalemin kodu. Gövdeye girmez. */
  sourceCode: string | null;
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
        sourceCode: sourceCodeLabel(existing ?? item),
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
    const parsed = parsePaymentQuantity(row.quantity);
    if (parsed.kind === "error") errors[row.itemId] = parsed.message;
    return {
      contract_item_id: row.itemId,
      quantity: parsed.kind === "ok" ? parsed.value : "0",
      sort_order: row.sortOrder,
    };
  });
  return { body, errors };
}
