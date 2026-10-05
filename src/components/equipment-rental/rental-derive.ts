import { isZeroDecimalString, sumDecimalStrings } from "@/lib/decimal";

import type { BadgeVariant } from "@/components/ui/badge/Badge";
import type {
  RentalInvoiceLineResponse,
  RentalInvoiceTotals,
  RentalSiteDistributionEntry,
  VarianceStatus,
} from "@/lib/api/hooks/useEquipmentRentalInvoices";
import {
  RENTAL_COLUMNS,
  RENTAL_LINE_KIND_BADGE_VARIANT,
  RENTAL_LINE_KIND_LABEL,
  RENTAL_OWNED_RATE_LABEL,
  RENTAL_UNASSIGNED_SITE_LABEL,
  RENTAL_VARIANCE_DIFF_SUFFIX,
  RENTAL_VARIANCE_MATCH_LABEL,
  RENTAL_VARIANCE_TOTAL_UNKNOWN_LABEL,
  RENTAL_VARIANCE_UNKNOWN_LABEL,
  VARIANCE_BADGE_VARIANT,
  type RentalColumnKey,
} from "./rental-labels";

/**
 * F-KIRA T-A · M5'in İSTEMCİDE TÜRETİLEN parçaları.
 *
 * 🔴 K9 — BU DOSYADA KDV ARİTMETİĞİ YOKTUR VE OLAMAZ. Ekran
 * `totals.vat_amount` / `totals.payable_total` alanlarını OLDUĞU GİBİ basar;
 * yeniden hesaplasaydı sunucunun `quantize_money` yuvarlamasıyla kuruş
 * ayrışır ve ekrandaki üç satır kendi içinde tutmazdı
 * (`rental.py:236-260` gerekçesi). Yasak YAPISALDIR: `@/lib/decimal`ten yalnız
 * toplama/sıfır-kontrolü ithal edilir, çarpma/bölme yardımcısı ithal EDİLMEZ
 * ve float aritmetiği (`Number` / `Math`) hiç kullanılmaz — üçü birden
 * `rental-derive.test.ts`teki metin taramasıyla çakılıdır.
 */

/* ==========================================================================
 * K6 — TFOOT VARYANS ROZETİ
 * ======================================================================= */

/**
 * Toplam saat farkı + tek rozet durumu (mockup tfoot M5:162).
 *
 * 🔴 GEREKÇE — NEDEN SAAT, TUTAR DEĞİL: M5:162'deki rozet "6 saat fark" der ve
 * o satırdaki TUTAR farkı 122.496 − 102.080 = 20.416'dır. Bu sayı tam olarak
 * 102.080'in yüzde yirmisidir, yani KDV'ye eşittir (tesadüf); 6 saatlik fark
 * ise 6 × 280 = 1.680 ederdi. Yani mockup'ın tfoot rozeti tutar farkını DEĞİL
 * SAAT farkını anlatır. Satır düzeyindeki rozetler de saattir (M5:126'nın
 * "6 saat fark"ı satır 2'nin 158 − 152'sidir).
 *
 * 🔴 GEREKÇE — NEDEN YALNIZ `rented`: backend `variance_status`u HER satır için
 * koşulsuz hesaplar (`rental.py:270-291`) ve `invoiced_hours` yoksa `unknown`
 * damgalar (`rental.py:224-231`). `owned`/`breakdown` satırlarında fatura saati
 * HİÇ girilmez — M5:140-151'de o hücre çizilmemiştir bile — dolayısıyla onlar
 * her zaman `unknown`dur. Bütün satırlar sayılsaydı mockup'ın KENDİ verisi
 * (iki kiralık + bir arıza + bir kendi) tfoot'ta `unknown` üretir ve M5:162'nin
 * amber rozetiyle ÇELİŞİRDİ.
 *
 * `null` fark toplama GİRMEZ ama SAYILIR (fail-closed): sessizce atlanan satır
 * kullanıcıya eksik bir doğrulamayı tam gösterirdi.
 */
export function rentalHoursVarianceTotal(lines: readonly RentalInvoiceLineResponse[]): {
  totalHours: string;
  status: VarianceStatus;
} {
  const rented = lines.filter((line) => line.line_kind === "rented");

  // Doğrulanacak kiralık satır yoksa yeşil bir güvence verilmez. `totalHours`
  // dolu kümedeki İKİ HANELİ biçimle (satır 72) AYNI fonksiyondan üretilir —
  // aksi hâlde "0" ile "0.00" aynı ekranda görünebilirdi (KAYIT 97).
  if (rented.length === 0) return { totalHours: sumDecimalStrings([]), status: "unknown" };

  const known = rented.filter((line) => line.hours_variance !== null);
  const totalHours = sumDecimalStrings(known.map((line) => line.hours_variance as string));

  const hasUnknown = rented.some(
    (line) => line.hours_variance === null || line.variance_status === "unknown",
  );
  if (hasUnknown) return { totalHours, status: "unknown" };

  if (rented.every((line) => line.variance_status === "match")) {
    return { totalHours, status: "match" };
  }

  // Farklar birbirini götürüyorsa "eşleşiyor" demek yeşil bir yalan olurdu:
  // hiçbir satır eşleşmiyor, yalnız net toplam sıfır.
  if (isZeroDecimalString(totalHours)) return { totalHours, status: "unknown" };

  return { totalHours, status: totalHours.startsWith("-") ? "under" : "over" };
}

/* ==========================================================================
 * K8 — FAIL-CLOSED SAYAÇLARI SESSİZ KALMAZ
 * ======================================================================= */

/** `rentalUnknownWarning` cümlesinin sabit kuyruğu — tek kaynak. */
export const RENTAL_UNKNOWN_WARNING_SUFFIX = "satırın tutarı hesaplanamadı, toplamlara girmedi";

/**
 * `RentalInvoiceTotals` içindeki ÜÇ fail-closed sayacın görünür karşılığı.
 *
 * 🔴 ÖLÇÜM: görev emri "altı `*_unknown_count`" diyor; şemada ÜÇ tanedir
 * (`our_total_unknown_count`, `owned_total_unknown_count`,
 * `excluded_breakdown_unknown_count` — `RentalInvoiceTotals` on alan taşır).
 * Dördüncü sayaç `RentalSiteDistributionEntry.unknown_count`tur ve kova
 * başınadır; onun kendi yardımcısı vardır.
 *
 * Sayaçlar sıfırdan büyükken sessiz kalınsaydı kullanıcı eksik bir parayı TAM
 * sanırdı (MK-1 `summarize` kanonu).
 */
export function rentalUnknownWarning(totals: RentalInvoiceTotals): string | null {
  // IZN-F4d.2: maskeli (`null`) toplamın "eksik bileşen" sayacı anlamsızdır — gizli toplam için
  // "N satırın tutarı hesaplanamadı" demek yalan olurdu; yalnız GÖRÜNEN toplamların sayaçları sayılır.
  const count =
    (totals.our_total === null ? 0 : totals.our_total_unknown_count) +
    (totals.owned_total === null ? 0 : totals.owned_total_unknown_count) +
    (totals.excluded_breakdown_amount === null ? 0 : totals.excluded_breakdown_unknown_count);
  return count > 0 ? `${count} ${RENTAL_UNKNOWN_WARNING_SUFFIX}` : null;
}

/** Proje dağılımı kartının kova başına uyarısı — TOPLAM uyarısından AYRI metin. */
export const RENTAL_DISTRIBUTION_UNKNOWN_SUFFIX =
  "satırın tutarı hesaplanamadı, dağılıma girmedi";

/** DÖRDÜNCÜ fail-closed sayaç (`RentalSiteDistributionEntry.unknown_count`). */
export function rentalDistributionUnknownWarning(
  entry: RentalSiteDistributionEntry,
): string | null {
  return entry.unknown_count > 0
    ? `${entry.unknown_count} ${RENTAL_DISTRIBUTION_UNKNOWN_SUFFIX}`
    : null;
}

/* ==========================================================================
 * K9 — ÖDENECEK TOPLAM BASILABİLİR Mİ?
 * ======================================================================= */

export const RENTAL_PAYABLE_UNAVAILABLE =
  "Ödenecek toplam hesaplanamadı, fatura tutarı henüz girilmedi";

/**
 * Ekranın "hesaplanamadı" dalı. Taslak hakedişte matrah yoktur → sunucu
 * `vat_amount` ve `payable_total` alanlarını `null` bırakır
 * (`rental.py:236-260`); sıfır basmak "vergisiz fatura" demek olurdu.
 *
 * İKİ alan AYRI AYRI denetlenir (fail-closed): yalnız `payable_total`a bakan
 * bir kontrol, matrahsız ama toplamı dolu gelen tutarsız bir yükü sessizce
 * basardı.
 */
export function rentalPayableUnavailable(totals: RentalInvoiceTotals, isMasked = false): string | null {
  // IZN-F4d.2: kategori gizliyken `null` = maske ("fatura tutarı girilmedi" DEĞİL) — gerekçe basılmaz, kilit basılır.
  if (isMasked) return null;
  if (totals.invoice_amount === null || totals.payable_total === null) {
    return RENTAL_PAYABLE_UNAVAILABLE;
  }
  return null;
}

/* ==========================================================================
 * K3 — YIRTIK TABLO DOKUZ HÜCREYE TAMAMLANIR
 * ======================================================================= */

/** `PATCH /equipment/rental-invoice-lines/{id}` gövdesinin İKİ alanı. */
export type RentalEditableField = "rate_amount" | "invoiced_hours";

export type RentalCellContent =
  /** Veri yok — `RENTAL_EMPTY_CELL` basılır, uydurma sıfır BASILMAZ. */
  | { readonly kind: "empty" }
  | { readonly kind: "identity"; readonly title: string; readonly subtitle: string | null }
  | { readonly kind: "text"; readonly value: string }
  | { readonly kind: "badge"; readonly label: string; readonly variant: BadgeVariant }
  /** `excluded` = ödenecek toplama girmeyen tutar (M5:139 üstü çizili). */
  | { readonly kind: "amount"; readonly value: string; readonly excluded: boolean }
  | {
      readonly kind: "editable";
      readonly field: RentalEditableField;
      readonly value: string | null;
      /** Satır kendi bedelini taşımıyorsa ekipmandan miras alınan bedel. */
      readonly placeholder: string | null;
    };

export interface RentalCell {
  readonly column: RentalColumnKey;
  readonly content: RentalCellContent;
}

/** Şantiyesiz satır/kova "Atanmamış"tır; uydurma proje adı basılmaz. */
export function rentalSiteLabel(siteName: string | null): string {
  return siteName ?? RENTAL_UNASSIGNED_SITE_LABEL;
}

/** Ekipman hücresinin alt satırı (M5: "Liebherr · Plaka: 06 TC 4800"). */
export function rentalEquipmentSubtitle(
  line: Pick<RentalInvoiceLineResponse, "equipment_brand" | "equipment_plate_no">,
): string | null {
  const parts: string[] = [];
  if (line.equipment_brand) parts.push(line.equipment_brand);
  if (line.equipment_plate_no) parts.push(`Plaka: ${line.equipment_plate_no}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** "-6.50" → "6.5" · "10.00" → "10". Float'a çevirmeden, dize üzerinde. */
function absTrimmedDecimal(value: string): string {
  const unsigned = value.startsWith("-") ? value.slice(1) : value;
  if (!unsigned.includes(".")) return unsigned;
  return unsigned.replace(/0+$/, "").replace(/\.$/, "");
}

/**
 * Satır varyans rozetinin METNİ. Mockup M5:112/126 metinlerinin SÖZCÜK hâli:
 * semboller `ui/icons` inline SVG'sinden gelir, dizeye yazılmaz.
 *
 * Fark `null` ise rozet ne derse desin bilinmezlik dalı seçilir (fail-closed).
 */
export function rentalVarianceLabel(
  line: Pick<RentalInvoiceLineResponse, "variance_status" | "hours_variance">,
): string {
  if (line.hours_variance === null || line.variance_status === "unknown") {
    return RENTAL_VARIANCE_UNKNOWN_LABEL;
  }
  if (line.variance_status === "match") return RENTAL_VARIANCE_MATCH_LABEL;
  return `${absTrimmedDecimal(line.hours_variance)} ${RENTAL_VARIANCE_DIFF_SUFFIX}`;
}

/**
 * tfoot varyans rozetinin METNİ (M5:162).
 *
 * 🔴 DRY: satır rozetiyle AYNI biçimlendirmeyi kullanır. Tablo bileşeni kendi
 * `${sayı} saat fark` cümlesini kurmaz — iki yerde yaşayan bir metin, biri
 * güncellendiğinde öbürü sessizce ayrışırdı (satır "6 saat fark" derken
 * tfoot "6,00 saat fark" diyebilirdi).
 */
export function rentalVarianceTotalLabel(total: {
  totalHours: string;
  status: VarianceStatus;
}): string {
  if (total.status === "unknown") return RENTAL_VARIANCE_TOTAL_UNKNOWN_LABEL;
  if (total.status === "match") return RENTAL_VARIANCE_MATCH_LABEL;
  return `${absTrimmedDecimal(total.totalHours)} ${RENTAL_VARIANCE_DIFF_SUFFIX}`;
}

/** Türe göre DEĞİŞEN beş hücre. `switch` exhaustive, `default` YOK. */
function variableContents(
  line: RentalInvoiceLineResponse,
): Record<
  "workedHours" | "rateAmount" | "ourAmount" | "invoicedHours" | "variance",
  RentalCellContent
> {
  switch (line.line_kind) {
    case "rented":
      return {
        workedHours: { kind: "text", value: line.worked_hours },
        rateAmount: {
          kind: "editable",
          field: "rate_amount",
          value: line.rate_amount,
          placeholder: line.effective_rate_amount,
        },
        ourAmount:
          line.our_amount === null
            ? { kind: "empty" }
            : { kind: "amount", value: line.our_amount, excluded: false },
        invoicedHours: {
          kind: "editable",
          field: "invoiced_hours",
          value: line.invoiced_hours,
          placeholder: null,
        },
        variance: {
          kind: "badge",
          label: rentalVarianceLabel(line),
          variant: VARIANCE_BADGE_VARIANT[line.variance_status],
        },
      };
    case "owned":
      // M5:140-151: kendi malının bedeli kira değil AMORTİSMANdır ve fatura
      // saati/fark hücreleri mockup'ta hiç çizilmemiştir.
      return {
        workedHours: { kind: "text", value: line.worked_hours },
        rateAmount: { kind: "text", value: RENTAL_OWNED_RATE_LABEL },
        ourAmount:
          line.our_amount === null
            ? { kind: "empty" }
            : { kind: "amount", value: line.our_amount, excluded: false },
        invoicedHours: { kind: "empty" },
        variance: { kind: "empty" },
      };
    case "breakdown":
      // M5:128-139: çalışma sütunu boştur (arıza saati AYRI sütundadır) ve
      // tutar üstü çizili "hariç tutulan"dır.
      return {
        workedHours: { kind: "empty" },
        rateAmount:
          line.effective_rate_amount === null
            ? { kind: "empty" }
            : { kind: "text", value: line.effective_rate_amount },
        ourAmount:
          line.breakdown_amount === null
            ? { kind: "empty" }
            : { kind: "amount", value: line.breakdown_amount, excluded: true },
        invoicedHours: { kind: "empty" },
        variance: { kind: "empty" },
      };
  }
}

/**
 * Bir satırın TAM DOKUZ hücresi.
 *
 * 🔴 K3 — mockup `thead` dokuz kolondur (M5:88-96) ama `tbody`nin 3. ve 4.
 * satırları yalnız YEDİ hücre taşır ve `tfoot`un dört satırının dördü de
 * SEKİZ kolonluk `colspan` kullanır. Kanon: `thead` KAZANIR. Uzunluk
 * `RENTAL_COLUMNS` ile yapısal olarak sabittir; eksik veri
 * `RENTAL_EMPTY_CELL` ile basılır (M5:135'in kendi işareti).
 */
export function rentalRowCells(line: RentalInvoiceLineResponse): RentalCell[] {
  const variable = variableContents(line);
  const byColumn: Record<RentalColumnKey, RentalCellContent> = {
    equipment: {
      kind: "identity",
      title: line.equipment_name,
      subtitle: rentalEquipmentSubtitle(line),
    },
    site: { kind: "text", value: rentalSiteLabel(line.site_name) },
    lineKind: {
      kind: "badge",
      label: RENTAL_LINE_KIND_LABEL[line.line_kind],
      variant: RENTAL_LINE_KIND_BADGE_VARIANT[line.line_kind],
    },
    workedHours: variable.workedHours,
    breakdownHours: { kind: "text", value: line.breakdown_hours },
    rateAmount: variable.rateAmount,
    ourAmount: variable.ourAmount,
    invoicedHours: variable.invoicedHours,
    variance: variable.variance,
  };

  return RENTAL_COLUMNS.map((column) => ({ column, content: byColumn[column] }));
}
