import type { VatDeductionRow, VatReturnResponse } from "@/lib/api/hooks/useVatReturn";
import { isZeroDecimalString, sumDecimalStrings } from "@/lib/decimal";
import { formatAmount, formatDateDots, formatDateLong, formatDecimal } from "@/lib/format";

/**
 * F-MU2 · KDV Beyannamesi ekranının SAF katmanı. Kanonik mockup `Muhasebe -
 * KDV Beyanı.dc.html` (KDV); yorumlardaki sayılar O dosyanın SATIR
 * numaralarıdır. Bu modülde AĞ ve DOM yoktur; testi `vat-return.test.ts`te.
 */

/** KDV:86 — oran hücresi `%20` yazar (sondaki sıfırlar atılır). */
const RATE_FRACTION_DIGITS = 2;

/** KDV:92 — istisna satırının oran hücresi (`0` DEĞİL: oran YOKTUR). */
export const NO_RATE = "—";

/** KDV:91 — istisna satırının adı. */
export const EXEMPT_LABEL = "İstisna İşlemler";

export interface VatTaxableTableRow {
  readonly key: string;
  /** KDV:78 `İşlem` sütunu. */
  readonly label: string;
  /** KDV:79 `KDV %`; istisna satırında `NO_RATE`. */
  readonly rate: string;
  /** `null` = rol için gizli (IZN-F4b.2). */
  readonly base: string | null;
  readonly vat: string | null;
  /** KDV:91-95 — italik/gri çizilen satır. */
  readonly isExempt: boolean;
}

export function vatRateLabel(rate: string): string {
  return `%${formatDecimal(rate, RATE_FRACTION_DIGITS)}`;
}

/**
 * KDV:83-95 — `Tablo 1`in gövde satırları.
 *
 * 🔴 `İşlem` SÜTUNUNUN SUNUCUDA KARŞILIĞI YOKTUR: `VatTaxableRow` üç alanlıdır
 * (`rate`/`base`/`vat`). Mockup'ın `"Yurt İçi Teslimler"` metni (KDV:85) bir
 * SINIFLANDIRMADIR ve UYDURULMAZ — o ayrım veri modelinde hiç yok. Sütun yine
 * de KALIR (mockup birebir) ve içeriği oranın KENDİSİNDEN türer:
 * `%20 oranlı teslimler`. Böylece satırın ne olduğu söylenir ama var olmayan
 * bir sınıflandırma İDDİA EDİLMEZ. Boşluk açık borçtur.
 *
 * 🔴 İSTİSNA SATIRI `taxable_rows` İÇİNDE DEĞİLDİR: `rate = 0` satırları
 * listeye girmez (şema notu `VatTaxableRow`), yerleri `exempt_base` SKALER
 * alanıdır. Satır bu yüzden ELLE kurulur ve tablonun SONUNA, toplam
 * satırından ÖNCE konur (KDV:90-95).
 */
export function buildVatTaxableRows(
  response: Pick<VatReturnResponse, "taxable_rows" | "exempt_base">,
): readonly VatTaxableTableRow[] {
  const rated = response.taxable_rows.map((row) => ({
    key: `rate-${row.rate}`,
    label: `${vatRateLabel(row.rate)} oranlı teslimler`,
    rate: vatRateLabel(row.rate),
    base: row.base,
    vat: row.vat,
    isExempt: false,
  }));
  return [
    ...rated,
    {
      key: "exempt",
      label: EXEMPT_LABEL,
      rate: NO_RATE,
      base: response.exempt_base,
      // İstisnanın vergisi TANIM GEREĞİ sıfırdır — sunucudan gelen bir alan
      // değildir, bu yüzden sabit yazılır (KDV:94 de `0` çizer).
      // 🔴 IZN-F4b.2: matrah gizliyse (null) satırın tamamı maskelidir; yanında sahte "0" basılmaz.
      vat: response.exempt_base === null ? null : "0",
      isExempt: true,
    },
  ];
}

/**
 * KDV:99 — `Toplam Hesaplanan`ın MATRAH hücresi. 🔴 Sunucu bu toplamı
 * VERMİYOR (`VatReturnResponse` yalnız `calculated_vat`i taşır) → istemcide
 * `sumDecimalStrings` ile toplanır. **`Number()` YASAK** (IEEE-754 kalıntısı
 * ekrana kaçar ve toplam sütunuyla TUTMAZ).
 *
 * 🔴 İSTİSNA MATRAHI TOPLAMA DÂHİLDİR: toplam satırı GÖRÜNEN sütunun
 * altındadır; istisna satırı da o sütundadır. Dışarıda bıraksaydık kullanıcı
 * sütunu topladığında başka bir sayı bulurdu — ekran yalan söylerdi. (K15'in
 * kardeşi: bir toplam, SATIRLARIYLA uzlaşmak zorundadır.) Mockup'ın kendi
 * örneğinde `exempt_base = 0` olduğu için iki okuma da 4.120.000 verir, yani
 * mockup bu soruyu AYIRT ETMEZ; ayırt eden ilke budur.
 */
export function vatTaxableBaseTotal(rows: readonly VatTaxableTableRow[]): string | null {
  return sumDecimalStrings(rows.map((row) => row.base));
}

/** KDV:128 — `Toplam İndirim`in MATRAH hücresi; aynı gerekçe. */
export function vatDeductionBaseTotal(deductions: readonly VatDeductionRow[]): string | null {
  return sumDecimalStrings(deductions.map((row) => row.base));
}

/** `unknown` (IZN-F4b.2): ödenecek/devreden tutarlar gizli — hangi dal olduğu BİLİNMEZ. */
export type VatOutcomeKind = "payable" | "carried" | "unknown";

export interface VatOutcome {
  readonly kind: VatOutcomeKind;
  /** KDV:67 · :141 — kartın ve sonuç şeridinin tutarı. */
  readonly amount: string | null;
  /** KDV:66 — üçüncü kartın başlığı (BÜYÜK harf mockup'ın CSS'inden gelir). */
  readonly cardTitle: string;
  /** KDV:68 — kartın alt notu. */
  readonly cardNote: string;
  /** KDV:138 — sonuç şeridinin başlığı, aritmetiği PARANTEZ içinde. */
  readonly resultTitle: string;
  /**
   * KDV:139 — sonuç şeridinin tarih satırı. 🔴 Devreden dalda `null`dur:
   * ödenecek tutar yokken "son ödeme tarihi" OLGUSAL OLARAK YANLIŞTIR. Metin
   * uydurmak yerine satırı ATLAMAK seçildi.
   */
  readonly resultDate: string | null;
}

/**
 * 🔴 K1 · DEVREDEN KDV — MOCKUP BOŞLUĞU, ONAYLI SAPMA.
 *
 * Sunucu `payable` VE `carried_forward` döner; ikisi aynı anda `> 0` OLAMAZ
 * (`fark = calculated_vat − deductible_vat`, `payable = max(fark, 0)`,
 * `carried_forward = max(−fark, 0)` — şema notu). Mockup YALNIZ "Ödenecek"
 * dalını çizer (KDV:65-69, :134-143); devreden dalı çizilmemiştir.
 *
 * **Neden ton DEĞİŞİR:** turuncu, BU mockup'ın kendi sözlüğünde "devlete borç"
 * demektir (KDV:57 kırmızı = hesaplanan/borç, KDV:62 yeşil = indirilecek/
 * alacak). Devreden KDV devletten ALACAKTIR — turuncu basmak parayı TERS
 * gösterirdi. Bu yüzden yeşile döner.
 *
 * **VARSAYILAN YOL (MU-2 dersi):** dallanma `carried_forward > 0` üzerinedir,
 * `payable > 0` üzerine DEĞİL. Fark tam sıfırken ikisi de `0`dır; o hâlde
 * mockup'ın çizdiği dal (ödenecek, `₺ 0`) basılır ve `due_date` YİNE gerçektir
 * (şema notu: vade fatura verisine değil TAKVİME bağlıdır). Sıfır dalının
 * kendi testi vardır — varsayılan yol bekçisiz kalmaz.
 */
export function vatOutcome(response: VatReturnResponse): VatOutcome {
  const paid = formatAmount(response.calculated_vat);
  const deducted = formatAmount(response.deductible_vat);
  // 🔴 IZN-F4b.2: devreden/ödenecek gizliyse dal KARARI verilemez (null'ı 0 sayıp "Ödenecek ₺0"
  // basmak kullanıcıya sahte "borç yok" derdi). Nötr "sonuç" kartı + tutar `—`.
  const carried = response.carried_forward;
  const isCarriedUnknown = carried === null && (response.payable === null || isZeroDecimalString(response.payable));
  if (isCarriedUnknown) {
    return {
      kind: "unknown",
      amount: null,
      cardTitle: "KDV Sonucu",
      cardNote: "Sonuç hesaplanamıyor",
      resultTitle: "KDV Sonucu",
      resultDate: null,
    };
  }
  if (carried !== null && !isZeroDecimalString(carried)) {
    return {
      kind: "carried",
      amount: carried,
      cardTitle: "Devreden KDV",
      cardNote: "Gelecek döneme devreder",
      // Fark TERS yöndedir; parantez de tersine yazılır (B − A).
      resultTitle: `Devreden KDV (${deducted} – ${paid})`,
      resultDate: null,
    };
  }
  return {
    kind: "payable",
    amount: response.payable,
    cardTitle: "Ödenecek KDV",
    cardNote: `Vade: ${formatDateDots(response.due_date)}`, // KDV:68 — noktalı
    resultTitle: `Ödenecek KDV (${paid} – ${deducted})`, // KDV:138
    // KDV:139 — UZUN Türkçe biçim. Mockup aynı tarihi İKİ türlü basar
    // (kartta `28.07.2026`, şeritte `28 Temmuz 2026`); ikisi de uygulanır,
    // tek biçime İNDİRGENMEZ.
    resultDate: `Son ödeme tarihi: ${formatDateLong(response.due_date)}`,
  };
}
