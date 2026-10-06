import type { AccountingPeriodListItem } from "@/lib/api/hooks/useAccountingPeriods";
import { formatDateDots, formatPeriod } from "@/lib/format";

/**
 * F-DKAP T2 · Dönem Kapanışı ekranının SAF katmanı: on iki aylık ızgarayı
 * kurar, satır durumunu türetir, özet şeridini sayar.
 *
 * Kanonik mockup: `Muhasebe - Dönem Kapanışı.dc.html` (DK). Yorumlardaki
 * sayılar O dosyanın SATIR numaralarıdır. Bu modülde AĞ ve DOM yoktur.
 *
 * 🔴 K2 — "ENGELLİ" durumu backend'den GELMEZ (`can_close` gibi bir karar
 * alanı yoktur, bilinçli): `draft_count > 0` OLGUSUNDAN burada türetilir.
 * Karar mantığı TEK bir yerdedir (`derivePeriodRowStatus`) — üç yerde `if`
 * yazmak YASAK, ekran ve testler bu fonksiyonu çağırır.
 *
 * 🔴 K3 — "KAYIT YOK" ayları backend HİÇ döndürmez (dönem kaydı proaktif
 * açılmaz). 12 ay − gelen kayıtlar = "kayıt yok"; bu ayların `id`si YOKTUR ve
 * eylemsizdir.
 */

export type PeriodRowStatus =
  | "closed"
  | "closable"
  | "blocked"
  | "blocked_sequence"
  | "no_record";

export interface PeriodRow {
  readonly year: number;
  readonly month: number;
  readonly status: PeriodRowStatus;
  /** Kaydı olan aylarda backend satırı; "kayıt yok" ayında `undefined`. */
  readonly item: AccountingPeriodListItem | undefined;
}

/**
 * SIRA-B — takvim olarak bir önceki dönem. Backend `periods_service.
 * previous_period` K1'in AYNASIdır: Ocak'ın öncesi ÖNCEKİ YILIN Aralığıdır,
 * aritmetik yıl sınırında KOPMAZ (liste tek yıl süzer, o satır sayfada HİÇ
 * olmaz — bu yüzden olgu backend'den `previous_period_open` olarak gelir).
 */
export function previousPeriod(year: number, month: number): readonly [number, number] {
  return month === 1 ? [year - 1, 12] : [year, month - 1];
}

/** Taslak engelinin başlığı — MEVCUT metin, harfi harfine (K3.1: TEK kopya). */
export function draftBlockedTitle(count: number): string {
  return `Dönem kapatılamıyor — ${count} taslak fiş var`;
}

/**
 * K3.3 — sıra engelinin başlığı SEBEBİ SÖYLER: hangi ayın kapatılması
 * gerektiği YAZILIR. Ay adı `formatPeriod`ten gelir; elle Türkçe ay dizisi
 * YAZILMAZ (tek kaynak `lib/format`in `TR_MONTHS`i).
 */
export function sequenceBlockedTitle(year: number, month: number): string {
  const [prevYear, prevMonth] = previousPeriod(year, month);
  return `Dönem kapatılamıyor — önce ${formatPeriod(prevYear, prevMonth)} kapatılmalı`;
}

/** Sıra engelinin açıklaması — kuralın KENDİSİNİ anlatır, tek kopya. */
export const SEQUENCE_BLOCKED_DETAIL =
  "Kapanış eskiden yeniye yürür; takvim olarak önceki dönem açıkken bu dönem kapatılamaz.";

/**
 * 🔴 K3.1 TEK KARAR NOKTASI — engelli bir satırın GEREKÇE METNİ. Düğmenin
 * `title`ı, satır altındaki bant ve testler AYNI bu fonksiyondan beslenir;
 * `draft_count`/`previous_period_open` bu dosyanın DIŞINDA okunmaz.
 */
export function periodBlockReason(row: PeriodRow): string | undefined {
  if (row.status === "blocked") return draftBlockedTitle(row.item?.draft_count ?? 0);
  if (row.status === "blocked_sequence") return sequenceBlockedTitle(row.year, row.month);
  return undefined;
}

/**
 * Bir backend satırından + "kayıt var mı" olgusundan durum türetir.
 *
 * 🔴 TEK KARAR NOKTASI — bu fonksiyonun DIŞINDA hiçbir yerde `draft_count`/
 * `previous_period_open`/`status` okunarak ikinci bir "kapatılabilir mi"
 * kararı YAZILMAZ.
 *
 * 🔴 K3.2 — SIRA denetimi TASLAK denetiminden SONRA koşar; bu, backend
 * `close_period` kapı sırasının (2 DURUM → 3 TASLAK → 4 SIRA) AYNASIdır. İki
 * engel birden varken kullanıcı ÖNCE kendi dönemindeki eksiği duyar (daha
 * yakın iş), sonra komşusunun durumunu — ekranın bastığı gerekçe böylece
 * sunucunun GERÇEKTEN döndüreceği 409 sebebiyle AYNI olur.
 */
export function derivePeriodRowStatus(item: AccountingPeriodListItem | undefined): PeriodRowStatus {
  if (item === undefined) return "no_record";
  if (item.status === "closed") return "closed";
  if (item.draft_count > 0) return "blocked";
  if (item.previous_period_open) return "blocked_sequence";
  return "closable";
}

/** DK:57-92 — on iki aylık ızgara, Ocak→Aralık (mockup sırası). */
export function buildPeriodRows(
  year: number,
  items: readonly AccountingPeriodListItem[],
): PeriodRow[] {
  const byMonth = new Map(items.map((item) => [item.month, item]));
  return Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const item = byMonth.get(month);
    return { year, month, status: derivePeriodRowStatus(item), item };
  });
}

export interface PeriodSummary {
  readonly closed: number;
  readonly closable: number;
  readonly blocked: number;
  readonly noRecord: number;
}

/**
 * DK:69 — "6 kapalı · 1 kapatılabilir · 1 engelli · 4 kayıt yok". Dört sayı
 * da satırlardan SAYILIR; hiçbiri sabit yazılmaz (K4).
 *
 * 🔴 SIRA-B — `blocked_sequence` "engelli" SAYACINA eklenir, BEŞİNCİ bir sayaç
 * AÇILMAZ: mockup DK:91 DÖRT sayı basar, beşincisi şeridi bozardı. Kullanıcı
 * için de doğrusu budur — ikisi de "bu ay bugün kapatılamaz" demektir.
 */
export function summarizePeriodRows(rows: readonly PeriodRow[]): PeriodSummary {
  let closed = 0;
  let closable = 0;
  let blocked = 0;
  let noRecord = 0;
  for (const row of rows) {
    if (row.status === "closed") closed += 1;
    else if (row.status === "closable") closable += 1;
    else if (row.status === "blocked" || row.status === "blocked_sequence") blocked += 1;
    else noRecord += 1;
  }
  return { closed, closable, blocked, noRecord };
}

export function periodSummaryText(summary: PeriodSummary): string {
  return `${summary.closed} kapalı · ${summary.closable} kapatılabilir · ${summary.blocked} engelli · ${summary.noRecord} kayıt yok`;
}

export function periodRowLabel(row: PeriodRow): string {
  return formatPeriod(row.year, row.month);
}

/**
 * DK:99/107/117/... — durum rozetinin METNİ. Mockup'ın 🔒 emojisi burada
 * TAŞINMAZ: ekran onu `LockIcon` (`ui/icons`) olarak ayrı basar — çıplak
 * glif yasağının (F-SEM) sembol bekçisi hiçbir yerde delinmez.
 */
export function periodStatusLabel(status: PeriodRowStatus): string {
  if (status === "closed") return "Kapalı";
  if (status === "no_record") return "Kayıt yok";
  // "blocked", "blocked_sequence" ve "closable" backend'de AYNI statüdür
  // (`open`); mockup üçüne de "Açık" yazar — ayrım satır zemininde/eylemde
  // yaşar, rozette DEĞİL.
  return "Açık";
}

/**
 * Satır zemini + rozet için GÖRSEL sınıf eki.
 *
 * 🔴 K3.5 ÖLÇÜLDÜ — mockup'ta "sıra/önceki/kronolojik" geçen SIFIR satır var:
 * sıra engeli için ayrı bir renk ÇİZİLİ DEĞİLDİR. Bu yüzden taslak engelinin
 * görsel dili (kırmızı bant/zemin) AYNEN kullanılır ve YENİ CSS YAZILMAZ.
 */
export function periodStatusVariant(
  status: PeriodRowStatus,
): "closed" | "closable" | "blocked" | "no_record" {
  return status === "blocked_sequence" ? "blocked" : status;
}

/** DK:66 — "Geri Aç" düğmesinin sabit gerekçesi (K1: yalnız `admin`). */
export const REOPEN_DISABLED_REASON = "Geri açma yetkisi yalnızca Sistem Yöneticisinde";

/** DK:236/246 — "kayıt yok" ayında kapatma düğmesinin gerekçesi. */
export const NO_RECORD_CLOSE_REASON = "Kaydı olmayan dönem zaten açıktır, kapatmaya gerek yok";

/** DK:44 — yazma yetkisi yoksa (K1: `full` altı). */
export const WRITE_DISABLED_REASON = "Dönem kapatmak için Dönem Kapanışı sayfasında Düzenler yetkisi gerekir.";

/**
 * "Dönemi Kapat" düğmesinin durumu — `undefined` ⇒ aktif, string ⇒ devre-dışı
 * gerekçesi (K6: silinmez, devre-dışı + görünür gerekçe).
 */
export function closeButtonDisabledReason(
  row: PeriodRow,
  canClose: boolean,
): string | undefined {
  if (row.status === "no_record") return NO_RECORD_CLOSE_REASON;
  // 🔴 İkinci bir `if` zinciri YOK: engel gerekçesi TEK yerde (K3.1) üretilir,
  // düğme onu OLDUĞU GİBİ taşır — bant ile tooltip asla ayrışamaz.
  const blockReason = periodBlockReason(row);
  if (blockReason !== undefined) return blockReason;
  if (row.status === "closed") return undefined; // düğme zaten basılmaz
  if (!canClose) return WRITE_DISABLED_REASON;
  return undefined;
}

/**
 * "Geri Aç" düğmesinin durumu — yalnız kapalı satırlarda anlamlıdır.
 * `canReopen` `admin` eşiğinin (K1) kapı sonucudur, çağıran türetmez.
 */
export function reopenButtonDisabledReason(canReopen: boolean): string | undefined {
  return canReopen ? undefined : REOPEN_DISABLED_REASON;
}

/**
 * K5 — `closed_by_name` NULL olabilir (kapatılmamış dönem · silinmiş
 * kullanıcı). `"Bilinmiyor"` gibi bir metin UYDURULMAZ; tire basılır (mockup
 * DK:98/107 kapalı olmayan satırlarda zaten `—` kullanıyor — aynı kural).
 */
export function periodClosedByText(item: AccountingPeriodListItem | undefined): string {
  return item?.closed_by_name ?? "—";
}

/**
 * `closed_at` bir `date-time`dir (`2026-02-05T10:23:00Z` biçiminde); yalnız
 * TARİH kısmı basılır (mockup DK:99 `05.02.2026`, saat çizilmiyor).
 * `formatDateDots` `YYYY-MM-DD` bekler — `slice(0, 10)` ile budanır
 * (`payroll-sgk-derive.ts`teki aynı desenin kanonu).
 */
export function periodClosedAtText(item: AccountingPeriodListItem | undefined): string {
  if (item?.closed_at === null || item?.closed_at === undefined) return "—";
  return formatDateDots(item.closed_at.slice(0, 10));
}

/** DK:63 — "Fiş" sütunu: kaydı olmayan ayda `0` YAZILIR, `—` DEĞİL (mockup). */
export function periodEntryCountText(item: AccountingPeriodListItem | undefined): string {
  return String(item?.entry_count ?? 0);
}
