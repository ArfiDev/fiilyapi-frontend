import type {
  PayrollLineResponse,
  PayrollPeriodListRow,
  PayrollPeriodStatus,
  PayrollSectionResponse,
  WorkerSource,
} from "@/lib/api/hooks/usePayroll";
import { compareDecimalStrings, normalizeDecimalInput } from "@/lib/decimal";

import { SOURCE_ORDER } from "./payroll-labels";

/**
 * F-BOR T2 · `/bordro` ekranının SAF türetmeleri. Bileşenler hesap YAPMAZ;
 * hepsi burada, tek başına test edilebilir hâlde durur.
 *
 * 🔴 PARA ALANLARI STRING'DİR (Decimal). Bu dosyada hiçbir para alanı
 * `Number`a çevrilip toplanmaz — toplamlar SUNUCUNUN `summary` alanlarından
 * basılır. Tek istisna yok.
 */

/* ------------------------------------------------------------ ay gezgini */

/**
 * BY:50-54 gezgini KRONOLOJİK adımlar. Sunucunun liste sırası bir sözleşme
 * DEĞİLDİR (uç yalnız `limit`/`offset` alır), bu yüzden sıra burada kurulur:
 * eskiden yeniye. Kopya döndürülür — girdi dizisi MUTASYONA UĞRAMAZ.
 */
export function sortPeriodsChronologically(
  rows: readonly PayrollPeriodListRow[],
): PayrollPeriodListRow[] {
  return [...rows].sort((a, b) => (a.year - b.year) * 12 + (a.month - b.month));
}

/**
 * Varsayılan dönem = EN YENİ dönem (kronolojik sıranın sonu). Sunucu "bugün"ü
 * okumaz ve mockup'ın "Temmuz 2026"sı bir ÖRNEKTİR; istemcinin takvimine
 * bakıp o ayın dönemini aramak, o dönem açılmamışsa boş ekran üretirdi.
 */
export function defaultPeriodId(
  rows: readonly PayrollPeriodListRow[],
): string | undefined {
  const sorted = sortPeriodsChronologically(rows);
  return sorted[sorted.length - 1]?.id;
}

export interface PeriodNavigation {
  /** `‹` hedefi (BY:51) — yoksa `undefined` ⇒ düğme devre dışı. */
  previousId: string | undefined;
  /** `›` hedefi (BY:53). */
  nextId: string | undefined;
  current: PayrollPeriodListRow | undefined;
}

/** Seçili dönemin komşuları — kronolojik dizideki bir önceki/sonraki satır. */
export function periodNavigation(
  rows: readonly PayrollPeriodListRow[],
  currentId: string | undefined,
): PeriodNavigation {
  const sorted = sortPeriodsChronologically(rows);
  const index = sorted.findIndex((row) => row.id === currentId);
  if (index < 0) return { previousId: undefined, nextId: undefined, current: undefined };
  return {
    previousId: sorted[index - 1]?.id,
    nextId: sorted[index + 1]?.id,
    current: sorted[index],
  };
}

/* ---------------------------------------------------- dönem açma formu */

/**
 * `POST /payroll/periods` gövdesinin yıl sınırları — şemadan ÖLÇÜLDÜ
 * (`PayrollPeriodCreate.year`, `ge=2000 le=2100`). Uydurulmadı.
 */
export const MIN_PAYROLL_YEAR = 2000;
export const MAX_PAYROLL_YEAR = 2100;

export interface PeriodSuggestion {
  year: number;
  month: number;
}

/**
 * F-BORDRO T2 · "Dönem Aç" formunun AÇILIŞ değerleri = en yeni dönemin BİR
 * SONRAKİ ayı (Aralık → izleyen yılın Ocak'ı).
 *
 * 🔴 `new Date()` KULLANILMAZ ve bu bilinçlidir: bu ekranın hiçbir yüzeyi
 * istemci takvimini okumaz (F-BOR T7'nin "TARİH BAĞIMSIZ" kadraj kararı).
 * Okusaydı modalın görsel karesi HER AY başka bir değer basar ve baseline
 * kendiliğinden çürürdü. Öneri VERİDEN türer.
 *
 * Hiç dönem yoksa öneri de YOKTUR: ilk kurulumda "doğru" ay bilinemez,
 * uydurulmuş bir yıl basmaktansa alan boş kalır ve kullanıcı kendi ayını
 * yazar.
 */
export function nextPeriodSuggestion(
  rows: readonly PayrollPeriodListRow[],
): PeriodSuggestion | undefined {
  const sorted = sortPeriodsChronologically(rows);
  const newest = sorted[sorted.length - 1];
  if (newest === undefined) return undefined;
  return newest.month === 12
    ? { year: newest.year + 1, month: 1 }
    : { year: newest.year, month: newest.month + 1 };
}

/**
 * "Dönem Aç" formunun kapısı — pasif düğmenin GÖRÜNÜR gerekçesi.
 *
 * 🔴 Sunucu bu kuralların HEPSİNİ kendi de uygular (422 · 409); buradaki
 * doğrulama onu İKAME ETMEZ, yalnız ÖNCELER. Kullanıcı "zaten açılmış" bir ayı
 * göndermeden önce öğrenir; yine de gönderilirse 409 metni ekrana basılır
 * (yarış: başka bir kullanıcı aynı ayı bu arada açmış olabilir).
 */
export function periodFormBlockReason(input: {
  year: number | null;
  month: number | null;
  rows: readonly PayrollPeriodListRow[];
}): string | undefined {
  if (input.year === null) return "Yıl girin.";
  if (input.year < MIN_PAYROLL_YEAR || input.year > MAX_PAYROLL_YEAR) {
    return `Yıl ${MIN_PAYROLL_YEAR}-${MAX_PAYROLL_YEAR} aralığında olmalı.`;
  }
  if (input.month === null) return "Ay seçin.";
  if (input.rows.some((row) => row.year === input.year && row.month === input.month)) {
    return "Bu ay için bordro dönemi zaten açılmış.";
  }
  return undefined;
}

/**
 * F-BORDRO T3 · `Hesapla` düğmesinin kapısı — 🔴 durum kümesi KODDAN ÖLÇÜLDÜ
 * (`payroll/service.py:73` `LOCKED_PERIOD_STATUSES = {approved, paid}`),
 * tahmin edilmedi. `draft` ve `pending_approval` hesaplanabilir; ötekiler
 * **409** döner.
 *
 * Uçsuz/kapalı düğme SİLİNMEZ, devre dışı basılır ve gerekçe GÖRÜNÜR (K11).
 */
export function computeDisabledReason(
  status: PayrollPeriodStatus,
  canWrite: boolean,
): string | undefined {
  if (!canWrite) return "Bordro yazma izniniz yok.";
  if (status === "paid") {
    return "Dönem ödendi; ödenmiş bir bordro yeniden hesaplanamaz.";
  }
  if (status === "approved") {
    return "Dönem onaylandı; yeniden hesaplamak için önce onayın geri alınması gerekir.";
  }
  return undefined;
}

/* -------------------------------------------------------------- bölümler */

/**
 * BY:124/172/240/268 — bölümler MOCKUP SIRASINDA çizilir; sunucunun dizi
 * sırasına güvenilmez.
 *
 * 🔴 ENUM TAMLIĞI: `SOURCE_ORDER` dışında bir `personnel_source` gelirse
 * (enum büyüdü ve bu dosya güncellenmedi) bölüm DÜŞÜRÜLMEZ, sıranın sonuna
 * eklenir. Sessiz kayıp, yanlış sıradan çok daha kötüdür.
 */
export function orderedSections(
  sections: readonly PayrollSectionResponse[],
): PayrollSectionResponse[] {
  const rank = (source: WorkerSource): number => {
    const index = SOURCE_ORDER.indexOf(source);
    return index < 0 ? SOURCE_ORDER.length : index;
  };
  return [...sections].sort((a, b) => rank(a.personnel_source) - rank(b.personnel_source));
}

/** `Tümü` dahil sekme sayacı (BY:98-102). Sayı `line_count`tan gelir. */
export function totalLineCount(sections: readonly PayrollSectionResponse[]): number {
  return sections.reduce((sum, section) => sum + section.line_count, 0);
}

/**
 * 🔴 KRIT-BORDRO — dönemde ÖDENECEK bir satır var mı?
 *
 * Sunucunun `payroll/service/core.has_payable_line` bekçisinin AYNASIDIR ve
 * küme ORADAN alınır (`PAYABLE_LINE_STATUSES` = `pending`/`approved`/`paid`);
 * `uncomputed` (S4) ve `excluded` (K2) KASTEN dışarıdadır — ikisi de "ödenecek
 * bir tutar" ifade etmez.
 *
 * 🔴 Sayaç alanlarından (`summary.net_personnel_count`) TÜRETİLMEZ, satırın
 * KENDİ durumundan okunur: o sayaç neti `null` OLMAYAN satırları sayar, yani
 * "ödenebilir" ile "neti hesaplanmış" kavramlarını birbirine bağlar. İkisi
 * ayrışırsa (T1'e göre imkânsız ama sözleşmede yazılı değil) düğme sunucunun
 * kabul edeceği bir dönemi kapatır ya da tersi.
 *
 * 🔴 Bu bir KORKULUKTUR, KAPI DEĞİL. Gerçek kapı sunucudadır (409): istemci
 * denetimi tek başına olsaydı doğrudan uca atılan bir istek dönemi yine ölü
 * bırakırdı.
 */
export function hasPayableLine(sections: readonly PayrollSectionResponse[]): boolean {
  return sections.some((section) =>
    section.lines.some(
      (line) =>
        line.status === "pending" || line.status === "approved" || line.status === "paid",
    ),
  );
}

/** Aktif sekme `null` ise (Tümü) hepsi, değilse yalnız o kaynak. */
export function visibleSections(
  sections: readonly PayrollSectionResponse[],
  activeSource: WorkerSource | null,
): PayrollSectionResponse[] {
  const ordered = orderedSections(sections);
  if (activeSource === null) return ordered;
  return ordered.filter((section) => section.personnel_source === activeSource);
}

/* ---------------------------------------------------------------- satır */

/**
 * BY:142-147 tutar girdilerinin AÇIK/KAPALI kararı — SATIRIN KENDİSİNDEN
 * türer, ekran sabitinden değil.
 *
 * * `excluded` → ödemeye hiç girmez (K2); bölüşüm düzenlemek anlamsızdır.
 * * `paid` → ödendi damgası basılmış; tutar artık bir GEÇMİŞ kaydıdır.
 * * `uncomputed` → net YOKTUR; bölüşülecek bir tutar yoktur.
 */
export function isLineSplitEditable(line: PayrollLineResponse): boolean {
  if (line.status === "excluded") return false;
  if (line.status === "paid") return false;
  if (line.status === "uncomputed") return false;
  return line.net_amount !== null;
}

/**
 * Devre dışı girdinin GÖRÜNÜR gerekçesi — 🔴 satırdan TÜRER: `excluded`
 * satırda sunucunun `excluded_reason` metni varsa O basılır (sabit cümle
 * DEĞİL), yoksa duruma özgü varsayılan.
 */
export function lineSplitDisabledReason(line: PayrollLineResponse): string | undefined {
  if (isLineSplitEditable(line)) return undefined;
  if (line.status === "excluded") {
    return (
      line.excluded_reason ??
      "Taşeron satırı bordrodan ödenmez; ödemesi taşeron hakedişi üzerinden yapılır."
    );
  }
  if (line.status === "paid") return "Satır ödendi; ödeme dağıtımı artık değiştirilemez.";
  if (line.status === "uncomputed") {
    // 🔴 F-BOR T7 · SEBEP UYDURULMAZ. Eskiden "Ücret verisi olmadığı için…"
    // yazıyordu; oysa `uncomputed` İKİ ayrı sebepten doğar (ücret verisi yok
    // ya da tipin o yıla oran seti yok) ve SATIR bunları AYIRT ETTİRMEZ —
    // şemada satır düzeyinde bir sebep alanı yoktur. Metin bu yüzden yalnız
    // SONUCU söyler; sebep, ekranın üstündeki iki ayrı bandın işidir.
    return "Net tutar hesaplanmadığı için bölüşülecek tutar yok.";
  }
  return "Bu satırın net tutarı hesaplanmadı.";
}

/**
 * `null` para alanı `""` olur — `0` DEĞİL. "0 ödenecek" ile "hesaplanamadı"
 * ayrımı şemanın açık kararıdır (S4) ve girdi kutusunda da korunur.
 */
export function amountFieldValue(value: string | null): string {
  return value ?? "";
}

/**
 * Kullanıcının yazdığı metni sunucuya gidecek DEĞERE çevirir.
 *
 * Boş metin `"0"`a düşer: iki alan BİRLİKTE gönderildiği için "boş" bir taraf
 * göndermek şemada `null` demektir ve `null` bölüşümü SİLERDİ; kullanıcının
 * kutuyu boşaltması "bu taraftan ödeme yok" demektir.
 *
 * Ondalık ayracı olarak virgül kabul edilir (tr-TR klavye) ve noktaya
 * çevrilir; sunucu `Decimal` ayrıştırır. ARİTMETİK YAPILMAZ — yalnız biçim
 * dönüşümü.
 */
export function toAmountPayload(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed === "") return "0";
  return trimmed.replace(",", ".");
}

/** Girdiye izin verilen karakterler — negatif tutar bordroda anlamsızdır. */
export const AMOUNT_PATTERN = /^\d*[.,]?\d*$/;

export function isAmountInputValid(raw: string): boolean {
  return AMOUNT_PATTERN.test(raw.trim());
}

/**
 * SEKME-F1.3-FIX O6 · girdi kutusu sunucu DEĞERİNDEN GERÇEKTEN saptı mı?
 *
 * Eski karşılaştırma HAM METİN eşitliğine bakıyordu (`raw !== amountFieldValue(...)`)
 * — sunucu `"26538.00"` gönderdiğinde kullanıcı SAYISAL OLARAK aynı `"26538"`i
 * yazınca satır KALICI "kirli" kalıyordu (biçim farkı, değer farkı değil). Bu,
 * hem üst çubuğun sekme onayını yanlışlıkla tetikliyor HEM DE odak çıkışında
 * gereksiz bir `PATCH` atılmasına yol açıyordu (sunucu zaten aynı değeri
 * döner). `Number()` ile karşılaştırma YASAK (float yuvarlama) — bunun yerine
 * `compareDecimalStrings` (kayıpsız, K18/ROUND_HALF_UP kanonu) kullanılır.
 * Ayrıştırılamayan (yarım/geçersiz) girdi HER ZAMAN "değişti" sayılır — güvenli
 * yön budur (sessiz "temiz" YERİNE gereksiz uyarı).
 */
export function isAmountFieldDirty(raw: string, serverValue: string | null): boolean {
  const serverField = amountFieldValue(serverValue);
  if (raw === serverField) return false;
  if (serverValue === null) return true;
  const normalizedRaw = normalizeDecimalInput(toAmountPayload(raw));
  if (normalizedRaw === null) return true;
  return compareDecimalStrings(normalizedRaw, serverValue) !== 0;
}

/* ----------------------------------------------------- işlem sonuç özeti */

export interface SkipCounter {
  label: string;
  count: number;
}

/**
 * Atlama sayaçlarını kullanıcıya gösterilecek cümleye çevirir (K7).
 * SIFIR olan sayaç YAZILMAZ — gürültü olurdu; ama sıfırdan büyük HER sayaç
 * mutlaka görünür (sessiz atlama yasağı).
 */
export function skipSummary(prefix: string, done: number, skips: readonly SkipCounter[]): string {
  const shown = skips.filter((skip) => skip.count > 0);
  const head = `${prefix}: ${done}`;
  if (shown.length === 0) return `${head}.`;
  const tail = shown.map((skip) => `${skip.count} ${skip.label}`).join(" · ");
  return `${head} · atlanan: ${tail}.`;
}
