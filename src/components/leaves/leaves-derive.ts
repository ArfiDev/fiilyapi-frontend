import { formatDateDots, formatDays, formatPercent } from "@/lib/format";
import { toDecimalString } from "@/lib/decimal";
import { asPercent } from "@/lib/api/scale";
import type { LeaveBalanceResponse, LeaveRequestResponse } from "@/lib/api/hooks/useLeaves";

import {
  BLOCK_REASON_DATE_ORDER,
  BLOCK_REASON_DOCUMENT_REQUIRED,
  BLOCK_REASON_MISSING_FIELDS,
  BLOCK_REASON_OVERRUN,
  CARRYOVER_RISK_LABEL,
  NO_ENTITLEMENT_HINT,
  NO_ENTITLEMENT_LABEL,
  NOT_DEDUCTED_LABEL,
  PENDING_TABLE_TITLE,
  UNKNOWN_VALUE,
  UNIT_DAYS,
} from "./leaves-labels";

/**
 * F-IZN T3 · İZ ekranının SAF türetmeleri (React YOK, DOM YOK).
 * Yorumlardaki sayılar `İK - İzin Yönetimi.dc.html`in SATIR numaralarıdır.
 *
 * Ekranın bütün "karar"ları burada yaşar ki ikiz test dosyası onları
 * bileşen kurmadan, ayrıştırıcı kurulumlarla ölçebilsin.
 */

/**
 * 🔴 BOR-GUN (2026-08-30): `formatDays` bu dosyada DOĞDU ama artık burada
 * YAŞAMAZ — bordronun Gün sütunu da aynı biçime muhtaç kalınca yardımcı
 * `@/lib/format`a taşındı (gerekçe orada yazılı). Buradaki re-export
 * KORUNUR: bu ekranın altı çağıran noktası onu `./leaves-derive`ten alır ve
 * gün sayısı gösterimi, tarih gösterimi gibi, TEK kaynaktan gelir.
 */
export { formatDateDots, formatDays };

/* ── K4 · istemci tarafı JOIN ───────────────────────────────────────────── */

/**
 * 🔴 K4: `LeaveRequestResponse`ta "Kalan Hak" (66/77) YOKTUR. Sütunun tek
 * kaynağı özet ucunun `balances[]` dizisidir ve eşleşme `personnel_id`
 * üzerinden İSTEMCİDE kurulur (satır başına ikinci istek atılmaz).
 */
export function buildBalanceIndex(
  balances: readonly LeaveBalanceResponse[] | undefined,
): ReadonlyMap<string, LeaveBalanceResponse> {
  return new Map((balances ?? []).map((balance) => [balance.personnel_id, balance]));
}

/** "Kalan Hak" hücresinin görünümünü belirleyen üç ayrı anlam. */
export type RemainingTone = "ok" | "unknown" | "exceeded" | "not-deducted";

export interface RemainingCell {
  label: string;
  tone: RemainingTone;
}

/**
 * 66/77/87/97 — talep satırının "Kalan Hak" hücresi.
 *
 * ÜÇ ayrı hâl, üç ayrı metin (birbirinin yerine geçmezler):
 *  1. 🔴 K9 — `deducts_from_annual === false`: yıllık bakiye bu satır için
 *     ANLAMSIZDIR (mockup 87 "Rapor" der ama o sözcük yalnız hastalık iznine
 *     özgüdür; "Ücretsiz İzin"e basılsa yalan olurdu) → "Düşmez".
 *  2. 🔴 K4 — eşleşen bakiye YOK ya da `remaining === null`: hak
 *     HESAPLANAMAZ → "—". `0` BASILMAZ (0 "hakkı bitti" der).
 *  3. Sayı var: "N gün"; `days` kalanı aşıyorsa hücre uyarı tonuna geçer (97).
 */
export function deriveRemainingCell(
  request: Pick<LeaveRequestResponse, "personnel_id" | "days" | "deducts_from_annual">,
  balances: ReadonlyMap<string, LeaveBalanceResponse>,
): RemainingCell {
  if (!request.deducts_from_annual) return { label: NOT_DEDUCTED_LABEL, tone: "not-deducted" };

  const remaining = balances.get(request.personnel_id)?.remaining;
  if (remaining === undefined || remaining === null) {
    return { label: UNKNOWN_VALUE, tone: "unknown" };
  }

  // KAYIT 149: `remaining` şemada `string | null`dır — `format.ts::maskeli`
  // yalnız `null`/`undefined`i yakalar, boş dizeyi ya da sayıya çevrilemeyen
  // bir dizeyi YAKALAMAZ. Bozuk sunucu verisinde ("" ya da "abc") bu satır
  // `Number("")=0` → "0 gün" SESSİZCE basardı (`leaves-labels.ts`in "0
  // BASILMAZ" kuralını çiğner) ya da `Number("abc")=NaN` → karşılaştırma
  // HER ZAMAN `false` döner, hak aşımı GİZLENİRDİ. İkisi de burada "bilinmiyor"
  // sayılır — `maskeli()` genişletilmedi: bu tip-güvensizliği yalnız BU
  // ekranın özel sözleşmesidir (`string | null`), yaymak `format.ts`teki 20+
  // başka çağıranı etkilerdi.
  const remainingNumber = remaining === "" ? NaN : Number(remaining);
  if (!Number.isFinite(remainingNumber)) {
    return { label: UNKNOWN_VALUE, tone: "unknown" };
  }

  const label = `${formatDays(remaining)} ${UNIT_DAYS}`;
  return { label, tone: request.days > remainingNumber ? "exceeded" : "ok" };
}

/**
 * 99 — onay düğmesi hak aşımında PASİFtir.
 *
 * 🔴 Red HER ZAMAN AKTİFtir; şema bunu açıkça yazar ("hak aşımı ya da çakışma
 * yüzünden onaylanamayan talep REDDEDİLEBİLİR") — bu yüzden bu fonksiyonun
 * red için bir ikizi YOKTUR, olsaydı yanlış bir kapı doğardı.
 *
 * Bilinmeyen kalan (K4) onayı ENGELLEMEZ: eşik NULL'sa aşım İDDİA EDİLEMEZ,
 * karar sunucunun (409) işidir.
 */
export function isApprovalBlocked(
  request: Pick<LeaveRequestResponse, "personnel_id" | "days" | "deducts_from_annual">,
  balances: ReadonlyMap<string, LeaveBalanceResponse>,
): boolean {
  return deriveRemainingCell(request, balances).tone === "exceeded";
}

/** 98 — hak aşan satırın açıklama hücresine eklenen fazlalık ("4 gün fazla"). */
export function overrunDays(
  request: Pick<LeaveRequestResponse, "personnel_id" | "days" | "deducts_from_annual">,
  balances: ReadonlyMap<string, LeaveBalanceResponse>,
): number | null {
  if (!isApprovalBlocked(request, balances)) return null;
  const remaining = Number(balances.get(request.personnel_id)?.remaining);
  return request.days - remaining;
}

/* ── K5 · tablo başlığı ─────────────────────────────────────────────────── */

/**
 * 🔴 K5: 56'daki sayı SATIR SAYISI DEĞİLDİR — mockup "(6)" der ve 4 satır
 * çizer, çünkü liste SAYFALIDIR.
 *
 * `total` seçildi (`pending_requests` değil): `total` tabloyu dolduran ucun
 * KENDİ sayacıdır ve tabloyla AYNI süzgeci (`status=pending`) paylaşır. KPI'ın
 * `pending_requests`i AYRI bir uçtan gelir; iki uç arasındaki yarışta başlık
 * ile tablo çelişebilirdi.
 */
export function pendingTableHeading(total: number | undefined): string {
  return total === undefined ? PENDING_TABLE_TITLE : `${PENDING_TABLE_TITLE} (${total})`;
}

/* ── Bakiye tablosu türevleri (122-171) ─────────────────────────────────── */

/**
 * 135 "2 yıl 1 ay" · 162 "5 ay" — `hire_date` NULL ise ikisi de NULL gelir ve
 * kıdem BİLİNMEZ ("—"). Yıl 0 ise yalnız ay, ay 0 ise yalnız yıl yazılır.
 */
export function seniorityText(years: number | null, months: number | null): string {
  if (years === null && months === null) return UNKNOWN_VALUE;
  const y = years ?? 0;
  const m = months ?? 0;
  // İşe yeni giren personel: kıdem BİLİNİYOR ve sıfırdır — "—" (bilinmiyor)
  // ile karışmasın diye açıkça "0 ay" yazılır.
  if (y === 0 && m === 0) return "0 ay";
  const parts: string[] = [];
  if (y > 0) parts.push(`${y} yıl`);
  if (m > 0) parts.push(`${m} ay`);
  return parts.join(" ");
}

/** 126/136/163 — "Yıllık Hak"; NULL hak HESAPLANAMAZ demektir → "—". */
export function entitlementText(annualEntitlement: number | null): string {
  return annualEntitlement === null ? UNKNOWN_VALUE : formatDays(annualEntitlement);
}

/**
 * 137/146/155/164 — "Devreden".
 *
 * Alan şemada NULL OLAMAZ (string decimal), ama mockup 164'te "—" yazar: hakkı
 * hesaplanamayan personelin devir hesabı da YOKTUR. Ayrım hakka bağlanır
 * (`annual_entitlement === null`), sayının kendisine değil — 146 "0" basar ve
 * o 0 GERÇEKtir (devir yok), 164'ün "—"si ise BİLİNMİYORdur.
 */
export function carriedOverText(balance: LeaveBalanceResponse): string {
  if (balance.annual_entitlement === null) return UNKNOWN_VALUE;
  return formatDays(balance.carried_over);
}

/**
 * 129/139/166 — "Kalan".
 *
 * 🔴 NULL → "Hak yok" (166). `0` BASILMAZ: 0 "hakkını bitirdi" demektir ve
 * kıdemi 1 yılı doldurmamış personel için YALAN olurdu. Sıfır GERÇEKTEN
 * sıfırsa "0" basılır — iki hâl ayrı metin verir.
 */
export function remainingBalanceText(remaining: string | null): string {
  return remaining === null ? NO_ENTITLEMENT_LABEL : formatDays(remaining);
}

/**
 * 151/155/158 — devreden günün yıl sonunda yanma riski.
 *
 * 🔴 Sunucu SATIR BAŞINA bayrak VERMEZ (`carryover_risk_personnel` yalnız
 * KPI sayacıdır). Eşik icat etmemek için risk, elde olan tek dürüst sinyale
 * bağlandı: devreden gün varsa o günler yıl sonunda yanabilir. Açık borç:
 * sunucunun saydığı eşik satır düzeyinde açılırsa bu türetme onunla değişir.
 */
export function hasCarryoverRisk(balance: LeaveBalanceResponse): boolean {
  return Number(balance.carried_over) > 0;
}

export interface UsageCell {
  /** İlerleme çubuğunun genişliği (%) — hesaplanamıyorsa `null`. */
  pct: number | null;
  text: string;
}

/**
 * 130/140/158/167 — "Kullanım" sütunu.
 *
 * `usage_pct` NULL ise çubuk HİÇ çizilmez ve 167'nin cümlesi yazılır. Risk
 * satırında yüzde yerine 158'in uyarısı basılır (mockup aynı hücrede yüzdeyi
 * gizler), çubuk kalır.
 */
export function usageCell(balance: LeaveBalanceResponse): UsageCell {
  if (balance.usage_pct === null) return { pct: null, text: NO_ENTITLEMENT_HINT };
  const pct = Math.min(Math.max(balance.usage_pct, 0), 100);
  if (hasCarryoverRisk(balance)) return { pct, text: CARRYOVER_RISK_LABEL };
  // 🔴 KAYIT NO 147 — metin çubukla AYNI kırpılmış `pct`i kullanır. `usage_pct`
  // 100'ü aşarsa (ör. 140) çubuk %100 dolu görünürken metin eskiden HAM
  // değeri ("%140 kullanıldı") basardı — çubuk ile metin çelişirdi.
  // KAÇIŞ: LeaveBalanceResponse.usage_pct BU şemada gerçekten number
  // (diğer şemalardaki aynı adın aksine) — formatPercent sınırında Decimal
  // kanonuyla stringe çevriliyor, `pct` çubuk genişliği için number kalır.
  return { pct, text: `${formatPercent(asPercent(toDecimalString(pct) ?? "0"))} kullanıldı` };
}

/* ═══ F-IZN T4 · form türetmeleri ═══════════════════════════════════════════
 * Yorumlardaki sayılar `Form - Izin Talebi.dc.html` (T) ve
 * `Form - Izin Reddi.dc.html` (R) SATIR numaralarıdır.
 */

const MS_PER_DAY = 86_400_000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * `YYYY-MM-DD` → UTC damgası; ayrıştırılamayan ya da TAŞAN tarih `null`.
 *
 * UTC seçildi: yerel saatte `new Date("2026-03-29")` DST geçişinde bir gün
 * kayabilir ve gün sayısı 12 yerine 11 çıkardı. `2026-02-31` gibi taşan girdi
 * sessizce 3 Mart'a KAYDIRILMAZ — `null` döner (tarayıcı `type=date` bunu
 * üretmez ama form durumu dizedir ve doğrudan da doldurulabilir).
 */
function parseIsoDateUtc(iso: string): number | null {
  const match = ISO_DATE.exec(iso);
  if (match === null) return null;
  const [, year, month, day] = match;
  const time = Date.UTC(Number(year), Number(month) - 1, Number(day));
  const parsed = new Date(time);
  if (parsed.getUTCMonth() !== Number(month) - 1 || parsed.getUTCDate() !== Number(day)) {
    return null;
  }
  return time;
}

/**
 * T 141-145 · "Gün" alanı — 🔴 KARAR 1: TÜRETİLİR, kullanıcı yazamaz.
 *
 * Formül sunucunun `calculate_leave_days`inin BİREBİR ikizidir: takvim günü,
 * başlangıç ve bitiş DAHİL (`(end-start).days + 1`). Ekranda yalnız ÖNİZLEMEdir
 * — gövdede `days` GÖNDERİLMEZ (`extra="forbid"` → 422); sayı yine sunucudan
 * gelir ve iki taraf ayrışırsa doğru olan sunucudur.
 *
 * Tarih eksik/geçersizse ya da bitiş başlangıçtan ÖNCEyse `null`: ters aralıkta
 * negatif ya da 0 gün BASILMAZ (sunucu da 422 verir), ekran bunu kendi hatasıyla
 * söyler.
 */
export function previewLeaveDays(startDate: string, endDate: string): number | null {
  const start = parseIsoDateUtc(startDate);
  const end = parseIsoDateUtc(endDate);
  if (start === null || end === null || end < start) return null;
  return (end - start) / MS_PER_DAY + 1;
}

/** `YYYY-MM-DD` + N gün → `YYYY-MM-DD`; geçersiz girdi `null`. */
export function addDays(startDate: string, days: number): string | null {
  const start = parseIsoDateUtc(startDate);
  if (start === null) return null;
  return new Date(start + days * MS_PER_DAY).toISOString().slice(0, 10);
}

export interface LeaveOverrun {
  requestedDays: number;
  remainingDays: number;
  overrunDays: number;
  /** T 155 · "Bitiş tarihini X yaparsanız..." — hesaplanamıyorsa `null`. */
  suggestedEndDate: string | null;
}

export interface LeaveOverrunInput {
  /** `previewLeaveDays` çıktısı. */
  days: number | null;
  /** Seçili personelin bakiyesindeki `remaining` (string decimal ya da NULL). */
  remaining: string | null | undefined;
  /** Seçili izin tipinin `deducts_from_annual` bayrağı. */
  deductsFromAnnual: boolean;
  startDate: string;
}

/**
 * T 149-158 · 🔴 KARAR 4 — hak aşımı bandı.
 *
 * ÜÇ koşulun HEPSİ gerekir, hiçbiri varsayılmaz:
 *  1. gün sayısı hesaplanabiliyor,
 *  2. tip yıllık haktan DÜŞÜYOR (`deducts_from_annual`) — şema bunu açıkça
 *     söyler; ücretsiz izinde "hakkı aşıyor" demek YALAN olurdu,
 *  3. kalan hak BİLİNİYOR (`remaining !== null`).
 *
 * 🔴 Üçüncüsü fail-closed'ın GÖRÜNTÜ hâlidir: bilinmeyen kalan ne "aşıldı" ne
 * "aşılmadı" diye basılır — hiçbir şey basılmaz. (Onayı ise sunucu 409 ile
 * kapatır; iddiayı ekran ÜRETMEZ.)
 *
 * Önerilen bitiş tarihi kalan 1 günden azsa `null`dur: 0 gün için "bitişi
 * başlangıçtan bir gün önceye alın" demek anlamsız bir aralık önerirdi.
 */
export function leaveOverrun(input: LeaveOverrunInput): LeaveOverrun | null {
  const { days, remaining, deductsFromAnnual, startDate } = input;
  if (days === null || !deductsFromAnnual) return null;
  if (remaining === null || remaining === undefined) return null;

  const remainingDays = Number(remaining);
  if (!Number.isFinite(remainingDays) || days <= remainingDays) return null;

  const usableDays = Math.floor(remainingDays);
  return {
    requestedDays: days,
    remainingDays,
    overrunDays: days - remainingDays,
    suggestedEndDate: usableDays >= 1 ? addDays(startDate, usableDays - 1) : null,
  };
}

/**
 * R 104-107/123-128 · red gerekçesi kapısı.
 *
 * 🔴 `trim()` ŞARTTIR: sunucu kuralı `strip()` sonrası boşluktur, `reason !== ""`
 * ile kurulan bir kapıyı TEK BOŞLUK karakteri geçer ve kullanıcı düğmeye basıp
 * 422 yer. Ekranın kapısı sunucununkiyle AYNI normalizasyonu kullanır.
 */
export function isRejectReasonReady(reason: string): boolean {
  return reason.trim().length > 0;
}

export interface LeaveRequestFormState {
  personnelId: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  /** Seçili tipin `requires_document` bayrağı (T 161-174 · KARAR 3). */
  requiresDocument: boolean;
  /** Belge eklendi mi (arşive yüklenmiş künye ya da seçilmiş dosya). */
  hasDocument: boolean;
  /** `leaveOverrun` bir aşım buldu mu (T 187 · onay düğmesi PASİF). */
  isOverrun: boolean;
}

/**
 * T 184-188 · "Onaya Gönder" düğmesinin kapısı — engel varsa GÖRÜNÜR gerekçe,
 * yoksa `null`.
 *
 * Metin döndürür, boolean değil: pasif düğmenin gerekçesi ekranda okunmalıdır
 * (mockup 185 de footer'a yazar). "Neden basamıyorum" sorusunu `title`da
 * saklamak T3'te de reddedilmişti.
 */
export function leaveRequestBlockReason(state: LeaveRequestFormState): string | null {
  if (!state.personnelId || !state.leaveTypeId || !state.startDate || !state.endDate) {
    return BLOCK_REASON_MISSING_FIELDS;
  }
  // 🔴 Ters tarihi sunucuya BIRAKMAZ (T 132-146): 422 yerine ekran söyler.
  if (previewLeaveDays(state.startDate, state.endDate) === null) return BLOCK_REASON_DATE_ORDER;
  if (state.isOverrun) return BLOCK_REASON_OVERRUN;
  // 🔴 KARAR 3: belge YALNIZ `requires_document` tiplerde zorunludur.
  if (state.requiresDocument && !state.hasDocument) return BLOCK_REASON_DOCUMENT_REQUIRED;
  return null;
}
