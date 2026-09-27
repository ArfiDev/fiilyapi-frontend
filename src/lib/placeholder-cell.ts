import { pendingModuleLabel, type PendingModuleKey } from "@/lib/pending-modules";

/**
 * K-ZARF — yer tutucu zarfın ÜÇ hâlini tek yerden okur (F-ILRUI).
 *
 * 🔴 OKUMA YALNIZ `available` BAYRAĞINDAN YAPILIR, `pending_module`un
 * VARLIĞINDAN DEĞİL. Dört ekran yüzeyi (şantiye KPI şeridi, BOQ KPI şeridi,
 * BOQ GENEL TOPLAM yüzdesi, bölüm BÖLÜM TOPLAM yüzdesi) bu ayrımı hiç yapmıyor
 * ve koşulsuz "—" basıyordu; backend alanı doldursa bile ekran asla göstermezdi.
 *
 * Üç hâl (backend `app/modules/projects/schemas.py` docstring'i):
 *   1. `available:true` + değer dolu → gerçek değer; soluk sınıf YOK, ipucu YOK.
 *   2. `available:false` + `pending_module` dolu → "—" + soluk sınıf + ipucu.
 *   3. `available:false` + `pending_module:null` → **rolün izni yok**
 *      (`restricted()`); "—" + soluk sınıf ama **ipucu VERİLMEZ**.
 *
 * 3. hâlde `pendingModuleLabel(null)` "İlgili modülle birlikte gelir" döndürür
 * ve bu cümle O HÂLDE YALANDIR — modül vardır, izin yoktur. `pendingModuleLabel`
 * DEĞİŞTİRİLMEZ (yüzlerce doğru çağrısı var); dallanma çağrı yerindedir, yani
 * burada.
 *
 * 🔴 İKİ ZARF TİPİ AYRIDIR:
 *   · `MetricPlaceholder` → alan `value`, dolu zarf `pending_module` TAŞIMAZ.
 *   · `CountPlaceholder`  → alan `count`, dolu zarf `pending_module` TAŞIR
 *     (backend'in bilinçli emsali: `_worker_count` `available=True` +
 *     `pending_module="timesheet"` döner). Bu yüzden dolu/boş ayrımını
 *     `pending_module`dan yapmak sayaçlarda KESİNLİKLE yanlıştır.
 */
export interface MetricEnvelope<V extends string | number = string | number> {
  available: boolean;
  value?: V | null;
  pending_module?: PendingModuleKey;
}

export interface CountEnvelope {
  available: boolean;
  count?: number | null;
  pending_module?: PendingModuleKey;
}

export interface PlaceholderCell {
  /** Dolu zarfın biçimlenmiş metni; zarf boşsa `null` — ekran "—" basar. */
  text: string | null;
  /** YALNIZ 2. hâlde dolu. 3. hâlde ve zarf hiç yokken `undefined`. */
  hint?: string;
}

/** 2. ve 3. hâl: metin yok; ipucu yalnız gerekçe BİLİNİYORSA verilir. */
function pendingCell(pendingModule: PendingModuleKey): PlaceholderCell {
  return pendingModule ? { text: null, hint: pendingModuleLabel(pendingModule) } : { text: null };
}

/**
 * `MetricPlaceholder` okuması. Zarf `undefined` olabilir: KPI şeritleri yük
 * gelmeden de basılır ve o anda ipucu metni UYDURULMAZ.
 */
export function metricCell<V extends string | number>(
  metric: MetricEnvelope<V> | undefined,
  format: (value: V) => string,
): PlaceholderCell {
  const value = metric?.value;
  // `!= null` DEĞİL, açık iki karşılaştırma: `0` ve `"0"` GERÇEK cevaplardır ve
  // falsy kontrolü (`value ? ... : "—"`) onları yer tutucu sanardı.
  if (metric?.available === true && value !== null && value !== undefined) {
    return { text: format(value) };
  }
  return pendingCell(metric?.pending_module);
}

/** `CountPlaceholder` okuması — dolu zarfın `pending_module` taşıması NORMALDİR. */
export function countCell(
  counter: CountEnvelope | undefined,
  format: (value: number) => string,
): PlaceholderCell {
  const count = counter?.count;
  if (counter?.available === true && count !== null && count !== undefined) {
    return { text: format(count) };
  }
  return pendingCell(counter?.pending_module);
}
