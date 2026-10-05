/**
 * F-SA T3 · `POST /purchase-requests` ve `PATCH /purchase-requests/{id}`
 * gövdelerinin TEK kurucusu.
 *
 * DÖRT bağlayıcı kural (dördünün de adlı testi `purchase-request-body.test.ts`):
 *
 * 1. **`sort_order` GÖVDEDE YOKTUR** — sunucu onu dizinin İNDEKSİNDEN üretir
 *    (`PurchaseRequestLineResponse` açıklaması). Göndermek veri uydurmaktır.
 * 2. **`request_no` GÖVDEDE YOKTUR** — numarayı sunucu üretir; FST 53 kutusu
 *    salt-okunurdur ve istemci numara UYDURMAZ.
 * 3. **XOR** (`PurchaseRequestLineCreate`): satır ya `stock_item_id` taşır ya
 *    da `free_text_name` + `free_text_unit`. İkisi birden = 422. Kaynak
 *    `line.source`tan okunur; öbür kapının anahtarları gövdeye HİÇ girmez.
 * 4. **PENDING SIZINTISI YASAK**: tedarikçi seçimi / ödeme vadesi / e-posta /
 *    ekler gövdeye HİÇBİR anahtar eklemez. Yapısal güvence
 *    `purchase-request-form-state.ts`tedir (alanlar var olmaz); test gövdenin
 *    anahtar KÜMESİNİ birebir iddia eder (fazladan anahtar = kırmızı).
 *
 * ⚠️ **`lines` PATCH'te TAM DEĞİŞTİRMEDİR** (`PurchaseRequestUpdate`
 * açıklaması: "gelen liste eskisinin YERINE gecer"). Bu yüzden güncelleme
 * gövdesi diziyi HER ZAMAN TAM gönderir — tek satır düzenlenmiş olsa bile.
 * Kısmi dizi göndermek diğer kalemleri SİLERDİ.
 */

import { normalizeDecimalInput } from "@/lib/decimal";
import type {
  PurchaseRequestCreate,
  PurchaseRequestLineCreate,
  PurchaseRequestUpdate,
} from "@/lib/api/hooks/usePurchaseRequestMutations";

import type {
  PurchaseRequestFormValues,
  PurchaseRequestLineValues,
} from "./purchase-request-form-state";

function buildLine(line: PurchaseRequestLineValues, omitPrice = false): PurchaseRequestLineCreate {
  // IZN-F4d.2: maskeli rolde kayıtlı talebin fiyatı `null` döner ve PATCH'te DOLU fiyat 403 (çağrı hiç koşmaz) →
  // fiyat anahtarı gövdeye HİÇ konmaz. POST (ilk kayıt) serbesttir.
  const unitPrice = omitPrice ? null : normalizeDecimalInput(line.unitPrice);
  return {
    ...(line.source === "stock"
      ? { stock_item_id: line.stockItemId }
      : {
          free_text_name: line.freeTextName.trim(),
          free_text_unit: line.freeTextUnit.trim(),
        }),
    // Ondalık STRING gönderilir (şema `number | string`): `Number()`e çevirmek
    // 3 basamaklı miktarlarda hassasiyet kaybı riskidir.
    quantity: normalizeDecimalInput(line.quantity) ?? line.quantity.trim(),
    // Fiyatsız kalem TASLAKTA meşrudur (onaya gönderirken sunucu engeller) —
    // uydurma `0` ile doldurulmaz, anahtar hiç kurulmaz. `0` yazmak eşiği
    // "bilinen ve küçük" gösterirdi; NULL-EŞİK KANONU'nun tam tersi.
    ...(unitPrice !== null ? { estimated_unit_price: unitPrice } : {}),
  };
}

export function buildPurchaseRequestLines(
  lines: readonly PurchaseRequestLineValues[],
): PurchaseRequestLineCreate[] {
  return lines.map((line) => buildLine(line));
}

/**
 * TAMAMEN dokunulmamış satır mı? (`createPurchaseRequestLine`in varsayılan
 * hâli.) Taslak doğrulaması (`purchase-request-validate.ts`) bu satırı
 * ARAMAZ — form HER ZAMAN böyle bir satırla açılır
 * (`emptyPurchaseRequestFormValues`) — bu yüzden gövdeye girerse
 * `stock_item_id: ""` / `quantity: ""` ile sunucudan 422 döner. Yalnız
 * TAM boş satır elenir; kısmen doldurulmuş bir satır (kullanıcının girdiği
 * veri) asla sessizce silinmez.
 */
function isLineEmpty(line: PurchaseRequestLineValues): boolean {
  const identityEmpty =
    line.source === "stock"
      ? line.stockItemId.trim() === ""
      : line.freeTextName.trim() === "" && line.freeTextUnit.trim() === "";
  return identityEmpty && line.quantity.trim() === "" && line.unitPrice.trim() === "";
}

/**
 * "Taslak Kaydet" gövdesi. Boş bırakılan isteğe bağlı alanların anahtarı HİÇ
 * kurulmaz (`null` göndermekle aynı sonucu verir ama gövde gürültüsüz kalır ve
 * anahtar testi okunur olur).
 */
export function buildPurchaseRequestCreateBody(
  values: PurchaseRequestFormValues,
): PurchaseRequestCreate {
  const justification = values.justification.trim();
  return {
    project_id: values.projectId,
    request_date: values.requestDate,
    priority: values.priority,
    ...(values.siteId ? { site_id: values.siteId } : {}),
    ...(values.sectionId ? { section_id: values.sectionId } : {}),
    ...(values.neededBy ? { needed_by: values.neededBy } : {}),
    ...(justification ? { justification } : {}),
    ...(values.quoteDeadline ? { quote_deadline: values.quoteDeadline } : {}),
    lines: buildPurchaseRequestLines(values.lines.filter((line) => !isLineEmpty(line))),
  };
}

/**
 * Kaydedilmiş bir TASLAĞI aynı formdan güncelleme gövdesi.
 *
 * Oluşturma gövdesinin aksine isteğe bağlı alanlar BOŞKEN AÇIKÇA `null`
 * gönderilir: PATCH'te anahtarı atlamak "dokunma" demektir, oysa kullanıcı
 * alanı GERÇEKTEN temizlemiş olabilir. Anahtarı atlamak da fazladan koymak da
 * veri yalanıdır (F-PT2 kararı 5) — burada doğru olan, formun gösterdiği
 * durumu OLDUĞU GİBİ yazmaktır.
 */
export function buildPurchaseRequestUpdateBody(
  values: PurchaseRequestFormValues,
  options: { omitPrices?: boolean } = {},
): PurchaseRequestUpdate {
  const justification = values.justification.trim();
  return {
    project_id: values.projectId,
    request_date: values.requestDate,
    priority: values.priority,
    site_id: values.siteId || null,
    section_id: values.sectionId || null,
    needed_by: values.neededBy || null,
    justification: justification || null,
    quote_deadline: values.quoteDeadline || null,
    // TAM DEĞİŞTİRME — dizi her zaman eksiksiz gider.
    lines: values.lines.map((line) => buildLine(line, options.omitPrices === true)),
  };
}
