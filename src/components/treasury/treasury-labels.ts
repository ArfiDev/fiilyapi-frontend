import type { BankAccountType } from "@/lib/api/hooks/useBankAccounts";
import type { UpcomingSourceType } from "@/lib/api/hooks/useUpcomingPayments";
import { formatMonthName } from "@/lib/format";

/**
 * F-HZ T2 · Hazine — saf eşleme/karar katmanı. Bileşenler kendi etiketini ya da
 * eşiğini YAZMAZ; hepsi buradan gelir (tek kaynak).
 * Parantez içi sayılar `projedesign/Ekran 9 - Hazine.dc.html` SATIR
 * numaralarıdır.
 */

/** E9:71 "Ziraat Bank · Vadesiz" · E9:81 "Yapı Kredi · Kasa". */
export const BANK_ACCOUNT_TYPE_LABELS: Record<BankAccountType, string> = {
  checking: "Vadesiz",
  cash: "Kasa",
};

/**
 * E9:70/75/80 üç FARKLI degrade çizer (mavi · teal · mor) ama ilk İKİSİ de
 * `checking`tir (E9:71, E9:76) — yani degrade hesabın TİPİNE bağlı DEĞİLDİR.
 * Tip bazlı bir eşleme kursaydık mockup'ın ikinci kartını yeniden
 * renklendirmiş olurduk. Kural: ızgaradaki SIRAYA göre deterministik döngü
 * (`index % 3`) — F-SA'nın tedarikçi künye gradyanı (dörtlü döngü) ile aynı
 * emsal.
 */
export const TREASURY_CARD_GRADIENT_COUNT = 3;

/** `index % 3` → CSS değişkeni adı (tokens.css'te tanımlı, çıplak hex YOK). */
export function treasuryCardGradientVar(index: number): string {
  const slot = ((index % TREASURY_CARD_GRADIENT_COUNT) + TREASURY_CARD_GRADIENT_COUNT) %
    TREASURY_CARD_GRADIENT_COUNT;
  return `var(--gradient-treasury-card-${slot + 1})`;
}

/** IBAN da açıklama da yoksa (E9:73/78 IBAN · E9:83 "Merkez Kasa") zarif düşüş. */
export const BANK_ACCOUNT_IDENTITY_EMPTY = "IBAN / açıklama girilmemiş";
export const BANK_ACCOUNT_IDENTITY_HINT =
  "Bu hesapta ne IBAN ne de görünen ad kayıtlı — hesap künyesi eksik.";

/**
 * E9:73/78/83 üçüncü satırı: IBAN varsa IBAN, yoksa görünen ad. `display_name`
 * dalı E9:83'ün ta kendisidir ("Merkez Kasa" bir kasa hesabının adıdır, IBAN'ı
 * yoktur). İkisi de yoksa sessizce boş bırakılmaz.
 */
export function bankAccountIdentityLine(
  account: {
    iban: string | null;
    display_name: string | null;
  },
  isIbanHidden = false,
): { text: string; isMissing: boolean } {
  if (account.iban) return { text: account.iban, isMissing: false };
  if (account.display_name) return { text: account.display_name, isMissing: false };
  // 🔴 IZN-F4b.2: `iban` rol için GİZLİyse (banka_kasa) "künye eksik" iddiası YALANdır; düz "—".
  if (isIbanHidden) return { text: "—", isMissing: false };
  return { text: BANK_ACCOUNT_IDENTITY_EMPTY, isMissing: true };
}

/**
 * E9:113 "Hakediş #47" · E9:117 "Bordro" · E9:121 "Fatura". Sunucu bu cümleyi
 * KURMAZ (`UpcomingPaymentItem` şema notu): `document_no` yalnız
 * tanımlayıcıdır, birleştirme istemcide yapılır.
 *
 * `payroll` TB8 ile açılan ÜÇÜNCÜ kaynaktır; "Bordro" etiketi mockup'tan
 * OKUNDU (E9:117 "Bordro – Temmuz"), uydurulmadı.
 */
export const UPCOMING_SOURCE_LABELS: Record<UpcomingSourceType, string> = {
  invoice: "Fatura",
  subcontractor_progress_payment: "Hakediş",
  payroll: "Bordro",
};

/**
 * Kaynağın DIŞ bir karşı tarafı var mı? Bordronun yoktur — ödeme şirketin
 * kendi çalışanlarınadır, E9:117 bilerek ad çizmez. Bu yüzden bordroda
 * `counterparty: null` bir EKSİKLİK DEĞİL TANIMdır.
 *
 * 🔴 Aşağıdaki `UPCOMING_SOURCE_DOCUMENT_NO_KIND` ile BİRLEŞTİRİLMEZ: "dış
 * karşı tarafı yok" ile "`document_no` bir dönem" iki AYRI olgudur. Bugün
 * ikisi de yalnız `payroll`da doğru olsa bile tek bayrağa indirgenirse
 * dördüncü bir kaynak (ör. dış karşı tarafı OLAN ama dönemle numaralanan)
 * eklendiğinde biri diğerinin arkasına saklanırdı.
 */
export const UPCOMING_SOURCE_HAS_COUNTERPARTY: Record<UpcomingSourceType, boolean> = {
  invoice: true,
  subcontractor_progress_payment: true,
  payroll: false,
};

/**
 * `document_no` bir EVRAK numarası mı yoksa bir DÖNEM mi? Bordroda sunucu
 * `f"{yil:04d}-{ay:02d}"` üretir (backend `upcoming.py:_payroll_rows`) — bu
 * bir numara değildir, `#` ön eki BASILMAZ ve ay adına çevrilir.
 */
export const UPCOMING_SOURCE_DOCUMENT_NO_KIND: Record<
  UpcomingSourceType,
  "document" | "period"
> = {
  invoice: "document",
  subcontractor_progress_payment: "document",
  payroll: "period",
};

/** E9:113 ayracı EN-DASH'tir (`–`), tire değil. */
export const UPCOMING_SEPARATOR = "–";

export const UPCOMING_COUNTERPARTY_EMPTY = "Karşı taraf belirtilmemiş";
export const UPCOMING_COUNTERPARTY_HINT =
  "Kaynak evrakta karşı taraf adı boş — taslak taşeron sözleşmesinde bu alan boş bırakılabilir.";

/**
 * Dönem `document_no`su BOŞ geldiğinde basılan açık ifade.
 *
 * 🔴 ÖLÇÜLDÜ (F-HZ2 final review): `document_no` şemada `minLength` TAŞIMAZ —
 * `openapi.json`da `UpcomingPaymentItem.document_no` yalnız
 * `{"type": "string"}`tir, yani boş dize SÖZLEŞMEYE GÖRE YASALDIR. Ham boş
 * dizeye düşülseydi başlık `"Bordro – "` olurdu: SARKAN AYRAÇ. Bu, "baştaki
 * ayraç basılmaz" kuralının kuyruktaki aynı kusurudur ve kullanıcıya "eksik
 * veri" değil "bozuk arayüz" gibi görünür.
 *
 * Bu dosyanın kanonu eksik değeri AÇIK TÜRKÇE İFADEYLE basar
 * (`UPCOMING_COUNTERPARTY_EMPTY` · `BANK_ACCOUNT_IDENTITY_EMPTY`); aynı desen
 * burada da uygulanır. 🔴 Kapsam DARDIR: bozuk ama DOLU girdi (`"abc"`,
 * `"2026-13"`) HAM basılmaya devam eder — orada kullanıcıya gösterilecek
 * gerçek bir değer vardır ve onu bu ifadeyle örtmek veriyi GİZLERDİ.
 */
export const UPCOMING_PERIOD_EMPTY = "Dönem belirtilmemiş";

/**
 * `counterparty === null` HER kaynakta eksiklik DEĞİLDİR. Panel bu kararı
 * kendi kurmaz — sayım da tooltip de buradan geçer, yoksa kusursuz bir bordro
 * kaydı için yanlış alarm ("taslak taşeron sözleşmesinde…") basılırdı.
 */
export function isUpcomingCounterpartyMissing(item: {
  counterparty: string | null;
  source_type: UpcomingSourceType;
}): boolean {
  return UPCOMING_SOURCE_HAS_COUNTERPARTY[item.source_type] && item.counterparty === null;
}

/** Sunucunun dönem biçimi: `f"{yil:04d}-{ay:02d}"` (backend `upcoming.py`). */
const PERIOD_DOCUMENT_NO = /^\d{4}-(\d{2})$/;

/**
 * Dönem `document_no`sundan ay adı. Ay adları `@/lib/format`in `TR_MONTHS` TEK
 * kaynağından gelir (`formatMonthName`, `CashFlowPanel`in de kullandığı
 * yardımcı) — bu dosyaya KOPYALANMAZ. `formatPeriod` KULLANILMAZ: "Temmuz
 * 2026" yazar, E9:117 ise yılsız "Temmuz" çizer.
 *
 * Beklenen biçime uymayan girdi (biçim bozuk ya da ay 1..12 dışında) ZARİF
 * DÜŞER: ham `document_no` basılır. Girdi BOŞ ise basılacak ham değer de
 * yoktur → `UPCOMING_PERIOD_EMPTY` (sarkan ayraç gerekçesi orada). Sessiz
 * atlama yoktur ve çıktı asla "undefined"/"NaN"/"null" içermez.
 */
function upcomingPeriodText(documentNo: string): string {
  if (documentNo.trim() === "") return UPCOMING_PERIOD_EMPTY;
  const match = PERIOD_DOCUMENT_NO.exec(documentNo);
  const rawMonth = match?.[1];
  if (rawMonth === undefined) return documentNo;
  const month = Number(rawMonth);
  if (!Number.isInteger(month) || month < 1 || month > 12) return documentNo;
  return formatMonthName(month);
}

/**
 * Satırın sol üst metni.
 *
 * · `documentNoKind === "period"` (bordro, E9:117 "Bordro – Temmuz"): karşı
 *   taraf yuvası ve `#` HİÇ basılmaz — bordronun dış karşı tarafı yoktur ve
 *   `document_no` bir numara değil DÖNEMdir.
 * · Aksi hâlde (fatura/hakediş) mevcut davranış AYNEN korunur: `document_no`
 *   sunucuda ZORUNLUdur (şema), bu yüzden E9:121'in numarasız "Fatura" yazımı
 *   yerine numara basılır — tanımlayıcıyı gizlemek kullanıcının evrağı
 *   bulmasını engellerdi (MK-1 · K15: mockup kendi içinde tutarsızsa TUTARLI
 *   okuma kazanır).
 */
export function upcomingPaymentTitle(item: {
  counterparty: string | null;
  document_no: string;
  source_type: UpcomingSourceType;
}): string {
  const label = UPCOMING_SOURCE_LABELS[item.source_type];
  if (UPCOMING_SOURCE_DOCUMENT_NO_KIND[item.source_type] === "period") {
    return `${label} ${UPCOMING_SEPARATOR} ${upcomingPeriodText(item.document_no)}`;
  }
  const who = item.counterparty ?? UPCOMING_COUNTERPARTY_EMPTY;
  return `${who} ${UPCOMING_SEPARATOR} ${label} #${item.document_no}`;
}

export type UpcomingTone = "danger" | "warning" | "success";

/** Ton eşikleri — `upcomingPaymentTone`un TEK kaynağı (test bunları okur). */
export const UPCOMING_TONE_DANGER_MAX_DAYS = 2;
export const UPCOMING_TONE_WARNING_MAX_DAYS = 4;

/**
 * 🔴 ONAYLI SAPMA (yönetim kararı). Sunucu `urgency`/`color` VERMEZ (K10) — ton
 * kararı istemcinindir. Mockup'ın kendi kodlaması İÇ TUTARSIZDIR: E9:112 2
 * gün→turuncu, E9:116 3 gün→KIRMIZI, E9:120 7 gün→yeşil; yani daha YAKIN olan
 * satır daha az acil renkte. MK-1 · K15 emsali uygulanır (mockup kendi içinde
 * tutarsızsa TUTARLI okuma kazanır) → ton `days_remaining` ile MONOTONdur.
 *
 * Mockup'ın ÜÇ tonu ve tam renk değerleri BİREBİR korunur (kırmızı
 * #ef4444/#fef2f2 E9:116-119 · turuncu #f59e0b/#fff7ed E9:112-115 · yeşil
 * #22c55e/#f0fdf4 E9:120-123); yalnız hangi satıra hangi tonun düştüğü
 * monotonlaşır — pratikte mockup'ta yalnız 3 günlük satır yer değiştirir.
 *
 * 0 ve NEGATİF (vadesi geçmiş) günler de danger dalındadır: gecikmiş bir
 * ödemenin yaklaşan bir ödemeden daha az acil görünmesi anlamsız olurdu.
 */
export function upcomingPaymentTone(daysRemaining: number): UpcomingTone {
  if (daysRemaining <= UPCOMING_TONE_DANGER_MAX_DAYS) return "danger";
  if (daysRemaining <= UPCOMING_TONE_WARNING_MAX_DAYS) return "warning";
  return "success";
}

/**
 * E9:113 "· 2 gün kaldı". `days_remaining` 0 ya da negatif olabilir (vadesi
 * bugün / geçmiş) — "-2 gün kaldı" cümleyi bozardı, bu yüzden iki ayrı Türkçe
 * dal kullanılır. Sayı SUNUCUDAN gelir, istemcide YENİDEN HESAPLANMAZ:
 * `as_of` olmadan doğrulanamaz ve istemci saatiyle hesap TR gecesi
 * 00:00-03:00'te bir gün sapar.
 */
export function upcomingDaysText(daysRemaining: number): string {
  if (daysRemaining > 0) return `${daysRemaining} gün kaldı`;
  if (daysRemaining === 0) return "Bugün son gün";
  return `${Math.abs(daysRemaining)} gün gecikti`;
}
