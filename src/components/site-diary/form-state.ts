import type { SiteDiaryEntryDetail, Weather } from "@/lib/api/hooks/useSiteDiary";
import type {
  SiteDiaryEntryCreate,
  SiteDiaryEntryUpdate,
  SiteDiaryLineInput,
} from "@/lib/api/hooks/useSiteDiaryMutations";

import {
  buildSiteDiaryLinesSave,
  siteDiaryLineKey,
  type SiteDiaryFullLinesSave,
} from "@/lib/api/hooks/site-diary-save-bodies";

import type { DiaryLeafRow } from "./diary-lines-tree";
import { DIARY_TEMPERATURE_MAX, DIARY_TEMPERATURE_MIN } from "./diary-labels";

import {
  areWorkerCountsDirty,
  buildDiaryWorkerRows,
  buildWorkerCountsBody,
  invalidWorkerCountKeys,
  invalidWorkerHourKeys,
  workerCountsFromEntry,
  workerHoursFromEntry,
  type DiaryAddedFirm,
} from "./worker-counts";

export type { DiaryAddedFirm } from "./worker-counts";

/** "+ Bölüm" ile eklenen, henüz kaydedilmemiş satır (G1 · G4 · G5). */
export interface DiaryAddedLine {
  boqItemId: string;
  /** `null` = Bölümsüz (G4: tam tahsisli kalemde menüden eklenir). */
  sectionId: string | null;
  /**
   * Seçicide görülen planlı miktar (BOQ tahsisi; tahsissiz bölümde `"0"` —
   * G5). Kayıttan sonra backend `planned_quantity` esastır; yalnız önizleme.
   */
  plannedQuantity: string | null;
}

/**
 * "Kayıt Gir" ekranının yerel form durumu (F-SD T2).
 *
 * KAPSAM SINIRI (üst kural, pending sızıntısı yok): burada YALNIZ backend'in
 * `SiteDiaryEntryCreate`/`SiteDiaryEntryUpdate`/`SiteDiaryLinesSave`
 * şemalarında karşılığı olan alanlar vardır. GK274-318'in fotoğraf kartı ve
 * GK321-348'in planlama bloğu ekranda BASILIR ama bu tipe GİRMEZ — dolayısıyla
 * kaydedilen gövdeye de giremezler.
 *
 * T3 EKLEMESİ — `workerCounts`: sağ paneldeki "Bugünkü İşçi Dağılımı"
 * (GK414-439) MOCKUP'TA GİRİLEBİLİR bir alandır ve backend `PATCH
 * /diary/{entry_id}` gövdesinde `worker_counts[]`i KABUL EDER
 * (`SiteDiaryEntryUpdate`, DEĞİŞTİRME semantiği) — bu yüzden sızıntı değil,
 * mockup'ın istediği gerçek alandır. Fotoğraf ve planlama alanları HÂLÂ
 * YOKTUR: onların backend karşılığı yok, gövdeye giremezler.
 */
export interface DiaryFormState {
  /** ISO `YYYY-MM-DD` (GK184). */
  entryDate: string;
  /** Bölüm seçimi; `""` = "Bölüm seçilmedi" (alan nullable, GK198). */
  sectionId: string;
  /** `""` = seçilmedi (alan nullable, GK188). */
  weather: Weather | "";
  /**
   * PLN-F2.1 hava genişlemesi: min/max °C ve rüzgâr m/s — serbest metin;
   * sayıya çevrilemezse gövdeye `null` gider. Bugünkü tek "Sıcaklık" kutusu
   * (GK194) `tempMaxC`yi yazar; min + rüzgâr kutuları F2.2'de basılır.
   */
  tempMinC: string;
  tempMaxC: string;
  windMs: string;
  /** GK271. */
  workDone: string;
  /** E7 143 — `chief_note`. */
  chiefNote: string;
  /** GK444-446 (E7 180-191). */
  safetyMeetingHeld: boolean;
  ppeChecked: boolean;
  hasIncident: boolean;
  /** GK447 (E7 195). */
  incidentNote: string;
  /**
   * Satır anahtarı (`siteDiaryLineKey(kalem, bölüm)`; Bölümsüz = `"<kalem>|"`)
   * → "Bugün" hücresinin HAM metni (GK228 · İ:228). PLN-F2.2: bölümlü
   * satırlar da kendi hücresini yazar (G1).
   */
  quantities: Record<string, string>;
  /** Satır anahtarı → aşım gerekçesi (`overrun_reason`, İ:235-240 · B2-8). */
  overrunReasons: Record<string, string>;
  /** "+ Bölüm" ile eklenen, henüz kaydedilmemiş satırlar. */
  addedLines: readonly DiaryAddedLine[];
  /** AÇIKÇA kaldırılan KAYITLI satırların anahtarları (G6) — yalnız bunlar düşer. */
  removedLines: readonly string[];
  /** `workerCountKey(trade, source)` → işçi sayısı hücresinin HAM metni
   * (GK420/424/428/432). */
  workerCounts: Record<string, string>;
  /** Firma satırı anahtarı → saat hücresinin HAM metni (İ:356-357). */
  workerHours: Record<string, string>;
  /** Eklenen taşeron firma satırları (G10). */
  addedFirms: readonly DiaryAddedFirm[];
  /** AÇIKÇA kaldırılan işçi satırlarının anahtarları (G10). */
  removedWorkers: readonly string[];
}

/** Boş form — yeni gün için (tarih varsayılanı ÇAĞIRANDAN gelir). */
export function emptyDiaryForm(entryDate: string): DiaryFormState {
  return {
    entryDate,
    sectionId: "",
    weather: "",
    tempMinC: "",
    tempMaxC: "",
    windMs: "",
    workDone: "",
    chiefNote: "",
    safetyMeetingHeld: false,
    ppeChecked: false,
    hasIncident: false,
    incidentNote: "",
    quantities: {},
    overrunReasons: {},
    addedLines: [],
    removedLines: [],
    workerCounts: {},
    workerHours: {},
    addedFirms: [],
    removedWorkers: [],
  };
}

/**
 * Sunucudaki kayıttan form durumu. Miktar hücreleri satırların KENDİ
 * değerinden doldurulur; `0` miktarlı satır BOŞ gösterilir (mockup'ta sıfır
 * yazan hücre yok, GK228-249) — kullanıcı "0" ile "girilmedi"yi ayırt
 * edemeyeceği için boş hücre daha dürüsttür.
 */
export function diaryFormFromEntry(entry: SiteDiaryEntryDetail): DiaryFormState {
  const quantities: Record<string, string> = {};
  const overrunReasons: Record<string, string> = {};
  for (const line of entry.lines) {
    if (line.boq_item_id === null) continue;
    const key = siteDiaryLineKey(line.boq_item_id, line.section_id);
    quantities[key] = Number(line.quantity) === 0 ? "" : line.quantity;
    if (line.overrun_reason) overrunReasons[key] = line.overrun_reason;
  }
  return {
    entryDate: entry.entry_date,
    sectionId: entry.section_id ?? "",
    weather: entry.weather ?? "",
    tempMinC: entry.temp_min_c ?? "",
    // Eski kayıtlar da `temp_max_c` taşır: backend göçü (b877270195d8) eski sıcaklık
    // alanını min/max'a kopyaladı (CLEAN-B1: eski alan API'den kalktı).
    tempMaxC: entry.temp_max_c ?? "",
    windMs: entry.wind_ms ?? "",
    workDone: entry.work_done ?? "",
    chiefNote: entry.chief_note ?? "",
    safetyMeetingHeld: entry.safety_meeting_held,
    ppeChecked: entry.ppe_checked,
    hasIncident: entry.has_incident,
    incidentNote: entry.incident_note ?? "",
    quantities,
    overrunReasons,
    addedLines: [],
    removedLines: [],
    workerCounts: workerCountsFromEntry(entry.worker_counts),
    workerHours: workerHoursFromEntry(entry.worker_counts),
    addedFirms: [],
    removedWorkers: [],
  };
}

/** Kaydı anahtar olmadan kopyalar (girdiyi DEĞİŞTİRMEZ). */
function withoutKey(record: Record<string, string>, key: string): Record<string, string> {
  return Object.fromEntries(Object.entries(record).filter(([entryKey]) => entryKey !== key));
}

function lineKeyOf(line: { boqItemId: string; sectionId: string | null }): string {
  return siteDiaryLineKey(line.boqItemId, line.sectionId);
}

/**
 * "+ Bölüm" (M1): satırları forma ekler. Aynı anahtar zaten ekliyse tekrar
 * eklenmez; daha önce KALDIRILMIŞ kayıtlı satır yeniden eklenirse kaldırma
 * geri alınır (yoksa `removed` onu gövdeden düşürürdü).
 */
export function addDiaryLines(form: DiaryFormState, lines: readonly DiaryAddedLine[]): DiaryFormState {
  const removedBack = new Set(lines.map(lineKeyOf));
  const known = new Set(form.addedLines.map(lineKeyOf));
  const fresh = lines.filter((line) => {
    const key = lineKeyOf(line);
    return !known.has(key) && !form.removedLines.includes(key);
  });
  return {
    ...form,
    addedLines: [...form.addedLines, ...fresh],
    removedLines: form.removedLines.filter((key) => !removedBack.has(key)),
  };
}

/**
 * Satır kaldırma (M2 · G6). Eklenmiş-kaydedilmemiş satır iz bırakmadan
 * düşer; KAYITLI satır `removedLines`e girer. 🔴 G3: kayıtlı Bölümsüz
 * iskelet satırı kaldırılamaz — işlem yok sayılır (form AYNEN döner).
 */
export function removeDiaryLine(form: DiaryFormState, key: string): DiaryFormState {
  const isAdded = form.addedLines.some((line) => lineKeyOf(line) === key);
  if (!isAdded && key.endsWith("|")) return form;
  return {
    ...form,
    quantities: withoutKey(form.quantities, key),
    overrunReasons: withoutKey(form.overrunReasons, key),
    addedLines: form.addedLines.filter((line) => lineKeyOf(line) !== key),
    removedLines: isAdded || form.removedLines.includes(key) ? form.removedLines : [...form.removedLines, key],
  };
}

/** Taşeron firma satırı ekler (G10). Kaldırılmış firma geri eklenirse kaldırma geri alınır. */
export function addDiaryFirm(form: DiaryFormState, firm: DiaryAddedFirm): DiaryFormState {
  const key = `firm|${firm.subcontractorId}`;
  if (form.removedWorkers.includes(key)) {
    return { ...form, removedWorkers: form.removedWorkers.filter((item) => item !== key) };
  }
  if (form.addedFirms.some((item) => item.subcontractorId === firm.subcontractorId)) return form;
  return { ...form, addedFirms: [...form.addedFirms, firm] };
}

/** İşçi satırını kaldırır (G10) — eklenmiş firma iz bırakmaz, kayıtlı satır `removedWorkers`e girer. */
export function removeDiaryWorker(form: DiaryFormState, key: string): DiaryFormState {
  const addedFirms = form.addedFirms.filter((firm) => `firm|${firm.subcontractorId}` !== key);
  const wasAdded = addedFirms.length !== form.addedFirms.length;
  return {
    ...form,
    workerCounts: withoutKey(form.workerCounts, key),
    workerHours: withoutKey(form.workerHours, key),
    addedFirms,
    removedWorkers:
      wasAdded || form.removedWorkers.includes(key) ? form.removedWorkers : [...form.removedWorkers, key],
  };
}

/** Boş/boşluk metni `null`a çevirir — backend nullable alanlarının sözleşmesi. */
function textOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Miktar hücresinin sayıya çevrimi. Türkçe klavyede ondalık ayracı virgüldür
 * (`2,4`) — nokta ile aynı sayıya çevrilir. Çevrilemeyen metin `null` döner;
 * çağıran bunu "bu satır gövdeye girmesin" diye kullanır, sessizce `0`
 * yazmaz (sessiz veri kaybı olurdu).
 */
export function parseDiaryQuantity(value: string): number | null {
  const trimmed = value.trim().replace(",", ".");
  if (trimmed === "") return 0;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

/** Sıcaklık / rüzgâr: sayıya çevrilemezse `null` (alanlar opsiyonel). */
function parseWeatherNumber(value: string): number | null {
  const trimmed = value.trim().replace(",", ".");
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Backend aralıkları (`site_diary/schemas.py`): sıcaklık −60..60, rüzgâr 0..80, bir ondalık. */
const WIND_MS_MAX = 80;
const ONE_DECIMAL = /^-?\d+(\.\d)?$/;

function weatherNumberError(value: string, label: string, min: number, max: number): string | null {
  const trimmed = value.trim().replace(",", ".");
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  if (!ONE_DECIMAL.test(trimmed) || parsed < min || parsed > max) {
    return `${label} ${min}–${max} arasında, en çok bir ondalıklı olmalı.`;
  }
  return null;
}

/**
 * PLN-F2.2 · hava kutularının görünür doğrulaması (backend 422'sinden önce).
 * İlk hatanın Türkçe metni; hepsi geçerliyse `null`.
 */
export function diaryWeatherError(form: DiaryFormState): string | null {
  const error =
    weatherNumberError(form.tempMinC, "Min °C", DIARY_TEMPERATURE_MIN, DIARY_TEMPERATURE_MAX) ??
    weatherNumberError(form.tempMaxC, "Max °C", DIARY_TEMPERATURE_MIN, DIARY_TEMPERATURE_MAX) ??
    weatherNumberError(form.windMs, "Rüzgâr m/s", 0, WIND_MS_MAX);
  if (error) return error;
  const min = parseWeatherNumber(form.tempMinC);
  const max = parseWeatherNumber(form.tempMaxC);
  if (min !== null && max !== null && min > max) return "Min °C, Max °C'den büyük olamaz.";
  return null;
}

/**
 * Hava alanları (PLN-B2.1). Eski tek sıcaklık alanı CLEAN-B1'de API'den kalktı —
 * gövdede görünürse backend 422 döner; yalnız min/max/rüzgâr gider.
 */
function weatherFields(form: DiaryFormState) {
  return {
    weather: form.weather === "" ? null : form.weather,
    temp_min_c: parseWeatherNumber(form.tempMinC),
    temp_max_c: parseWeatherNumber(form.tempMaxC),
    wind_ms: parseWeatherNumber(form.windMs),
  };
}

/** "+ Bölüm" satırlarının gövde karşılığı (PUT lines ve POST lines ORTAK). */
function addedLineInputs(form: DiaryFormState): SiteDiaryLineInput[] {
  return form.addedLines.map((line) => {
    const key = lineKeyOf(line);
    return {
      boq_item_id: line.boqItemId,
      section_id: line.sectionId,
      quantity: parseDiaryQuantity(form.quantities[key] ?? "") ?? 0,
      overrun_reason: textOrNull(form.overrunReasons[key] ?? ""),
    };
  });
}

/**
 * Önizleme yaprağı DOKUNULDU mu: geçerli miktar > 0 ya da gerekçe dolu.
 * Geçersiz miktar hücresi (negatif / sayı değil) satırı gövdeye SOKMAZ —
 * sessizce `0` yazılmaz (`validateForm` zaten kullanıcıyı durdurur).
 */
function touchedPreviewInputs(form: DiaryFormState, leaves: readonly DiaryLeafRow[]): SiteDiaryLineInput[] {
  const inputs: SiteDiaryLineInput[] = [];
  for (const leaf of leaves) {
    if (leaf.boqItemId === null) continue;
    const quantity = parseDiaryQuantity(form.quantities[leaf.key] ?? "");
    if (quantity === null) continue;
    const overrunReason = textOrNull(form.overrunReasons[leaf.key] ?? "");
    if (quantity <= 0 && overrunReason === null) continue;
    inputs.push({ boq_item_id: leaf.boqItemId, section_id: leaf.sectionId, quantity, overrun_reason: overrunReason });
  }
  return inputs;
}

/**
 * `POST /sites/{site_id}/diary` gövdesi. Kayıt HER ZAMAN `draft` doğar;
 * `status` ve `worker_counts` YOKTUR (openapi `SiteDiaryEntryCreate`; işçi
 * sayıları POST'a girmez, sunucu yutar).
 *
 * GKS-F1.2a: `lines` (BİRLEŞTİR, silmez — sunucu iskeleti yine kurar) =
 * önizleme yapraklarından DOKUNULANLAR + TÜM `addedLines`; her satırda
 * `section_id` AÇIKÇA yazılır (`null` dahil, `site-diary-save-bodies`
 * normalizasyonu). `previewLeaves` verilmezse ya da hiç satır çıkmazsa
 * `lines` anahtarı HİÇ yazılmaz (eski davranış: yalnız sunucu iskeleti).
 */
export function buildDiaryCreateBody(
  form: DiaryFormState,
  previewLeaves: readonly DiaryLeafRow[] = [],
): SiteDiaryEntryCreate {
  const lines = buildSiteDiaryLinesSave([], {
    added: [...touchedPreviewInputs(form, previewLeaves), ...addedLineInputs(form)],
  }).lines;
  return {
    entry_date: form.entryDate,
    section_id: form.sectionId === "" ? null : form.sectionId,
    ...weatherFields(form),
    work_done: textOrNull(form.workDone),
    chief_note: textOrNull(form.chiefNote),
    safety_meeting_held: form.safetyMeetingHeld,
    ppe_checked: form.ppeChecked,
    has_incident: form.hasIncident,
    incident_note: textOrNull(form.incidentNote),
    ...(lines.length > 0 ? { lines } : {}),
  };
}

/**
 * `PATCH /diary/{entry_id}` gövdesi — başlık alanları + işçi kırılımı (T3).
 *
 * `worker_counts` DEĞİŞTİRME semantiğindedir (openapi açıklaması): gövdeye
 * kaydın TÜM satırları (ekrandakiler + G12a'da gizlenen sayısı 0 eski satırlar)
 * girer; ekranda sıfıra çekilenler SİLİNSİN diye dışarıda bırakılır. Hücrelerden biri geçersizse
 * alan HİÇ gönderilmez (`undefined`) — backend mevcut kırılımı korur, yanlış
 * bir sayı yazılmaz. Çağıran zaten `invalidWorkerCountKeys` ile önce durur.
 */
export function buildDiaryUpdateBody(
  form: DiaryFormState,
  entry: SiteDiaryEntryDetail,
): SiteDiaryEntryUpdate {
  const workerCounts =
    buildWorkerCountsBody(
      entry.worker_counts,
      buildDiaryWorkerRows(entry.worker_counts, form.addedFirms, form.removedWorkers),
      form.workerCounts,
      form.workerHours,
      form.removedWorkers,
    ) ?? undefined;
  return {
    worker_counts: workerCounts,
    entry_date: form.entryDate,
    section_id: form.sectionId === "" ? null : form.sectionId,
    ...weatherFields(form),
    work_done: textOrNull(form.workDone),
    chief_note: textOrNull(form.chiefNote),
    safety_meeting_held: form.safetyMeetingHeld,
    ppe_checked: form.ppeChecked,
    has_incident: form.hasIncident,
    incident_note: textOrNull(form.incidentNote),
  };
}

/**
 * `PUT /diary/{entry_id}/lines` gövdesi — DEĞİŞTİRME semantiği: gövdede
 * geçmeyen satır SİLİNİR. Gövde `buildSiteDiaryLinesSave` ile kaydın TÜM
 * satırlarından kurulur (PLN-F2.1 tam küme): her satırın miktarı + aşım
 * gerekçesi formdan (boşaltılan hücre `0`), "+ Bölüm" satırları `added`,
 * kaldırılanlar `removed` (G6). Geçersiz hücrede satırın SUNUCUDAKİ miktarı
 * korunur.
 *
 * `boq_item_id === null` olan satır (BOQ pozu silinmiş, öksüz satır)
 * GÖNDERİLEMEZ — şema `boq_item_id`i zorunlu tutar; bu satırlar atlanır.
 */
export function buildDiaryLinesBody(
  entry: SiteDiaryEntryDetail,
  form: DiaryFormState,
): SiteDiaryFullLinesSave {
  const changes: Record<string, { quantity: number; overrunReason: string | null }> = {};
  for (const line of entry.lines) {
    if (line.boq_item_id === null) continue;
    const key = siteDiaryLineKey(line.boq_item_id, line.section_id);
    const parsed = parseDiaryQuantity(form.quantities[key] ?? "");
    changes[key] = {
      quantity: parsed ?? Number(line.quantity),
      overrunReason: textOrNull(form.overrunReasons[key] ?? ""),
    };
  }
  return buildSiteDiaryLinesSave(entry.lines, {
    changes,
    added: addedLineInputs(form),
    removed: form.removedLines,
  });
}

/** Geçersiz miktar girilmiş hücrelerin poz kimlikleri (görünür hata için). */
export function invalidQuantityIds(form: DiaryFormState): string[] {
  return Object.entries(form.quantities)
    .filter(([, value]) => parseDiaryQuantity(value) === null)
    .map(([id]) => id);
}

/** Geçersiz işçi sayısı girilmiş hücrelerin anahtarları (görünür hata için). */
export function invalidWorkerCountIds(form: DiaryFormState): string[] {
  return [...new Set([...invalidWorkerCountKeys(form.workerCounts), ...invalidWorkerHourKeys(form.workerHours)])];
}

/**
 * Yerel form sunucudaki kayıttan ayrıştı mı? Türev sütunları (Kümülatif,
 * Hakediş ₺, tfoot) YANITTAN geldiği için, kaydedilmemiş değişiklik varken
 * ekran bunları "güncel" gibi göstermemeli — bu bayrak görünür uyarıyı açar.
 */
export function isDiaryFormDirty(entry: SiteDiaryEntryDetail, form: DiaryFormState): boolean {
  const saved = diaryFormFromEntry(entry);
  if (
    saved.entryDate !== form.entryDate ||
    saved.sectionId !== form.sectionId ||
    saved.weather !== form.weather ||
    saved.workDone !== form.workDone.trim() ||
    saved.chiefNote !== form.chiefNote.trim() ||
    saved.safetyMeetingHeld !== form.safetyMeetingHeld ||
    saved.ppeChecked !== form.ppeChecked ||
    saved.hasIncident !== form.hasIncident ||
    saved.incidentNote !== form.incidentNote.trim()
  ) {
    return true;
  }
  const weatherKeys = ["tempMinC", "tempMaxC", "windMs"] as const;
  if (weatherKeys.some((key) => parseWeatherNumber(saved[key]) !== parseWeatherNumber(form[key]))) {
    return true;
  }
  if (form.addedLines.length > 0 || form.removedLines.length > 0) return true;
  if (form.addedFirms.length > 0 || form.removedWorkers.length > 0) return true;
  const workerRows = buildDiaryWorkerRows(entry.worker_counts, form.addedFirms, form.removedWorkers);
  if (areWorkerCountsDirty(entry.worker_counts, workerRows, form.workerCounts, form.workerHours)) {
    return true;
  }
  const reasonKeys = new Set([...Object.keys(saved.overrunReasons), ...Object.keys(form.overrunReasons)]);
  for (const key of reasonKeys) {
    if (textOrNull(saved.overrunReasons[key] ?? "") !== textOrNull(form.overrunReasons[key] ?? "")) return true;
  }
  const ids = new Set([...Object.keys(saved.quantities), ...Object.keys(form.quantities)]);
  for (const id of ids) {
    if (parseDiaryQuantity(saved.quantities[id] ?? "") !== parseDiaryQuantity(form.quantities[id] ?? "")) {
      return true;
    }
  }
  return false;
}
