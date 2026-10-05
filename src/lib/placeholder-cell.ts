import { HIDDEN_FIELD_HINT } from "@/lib/auth/hidden-fields";
import { pendingModuleLabel, type PendingModuleKey } from "@/lib/pending-modules";
import type { MetricPlaceholder } from "@/lib/api/scale";

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
 *      (`restricted()`); "—" + soluk sınıf + küçük kilit + ipucu "Bu bilgi rolünüz
 *      için gizli" (IZN-F4.2 GECE KARARI; `isHidden`). Zarf hiç yokken (yük gelmedi) ipucu YOK.
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
// TEK KAYNAK: `@/lib/api/scale`teki `MetricPlaceholder<V>` (FAZ 2d, TYPE-F1
// madde 1) — DeepScale'in ürettiği tiplerle birebir aynı şekli paylaşsın diye
// burada YENİDEN TANIMLANMAZ, yeniden ihraç edilir.
export type MetricEnvelope<V extends string | number = string | number> = MetricPlaceholder<V>;

export interface CountEnvelope {
  available: boolean;
  count?: number | null;
  pending_module?: PendingModuleKey;
}

export interface PlaceholderCell {
  /** Dolu zarfın biçimlenmiş metni; zarf boşsa `null` — ekran "—" basar. */
  text: string | null;
  /** 2. hâlde modül gerekçesi; 3. hâlde (IZN-F4.2) "Bu bilgi rolünüz için gizli"; zarf hiç yokken `undefined`. */
  hint?: string;
  /**
   * IZN-F4.2 · GECE KARARI — 3. hâl (`available:false` + `pending_module:null` = rolün izni yok): kart değeri "—" +
   * küçük kilit simgesi (`HiddenMark`) + ipucu. `true` iken `hint` = `HIDDEN_FIELD_HINT`. 2. hâlin "modül
   * bekleniyor" görünümü AYNEN kalır.
   */
  isHidden?: boolean;
}

/**
 * 2. hâl: gerekçe modül ipucu. 3. hâl: zarf VAR, `available:false`, anahtar yok → gizli (kilit). Zarf hiç yoksa
 * (yük gelmeden basılan şerit) ipucu UYDURULMAZ.
 */
function pendingCell(pendingModule: PendingModuleKey, isRestricted: boolean): PlaceholderCell {
  if (pendingModule) return { text: null, hint: pendingModuleLabel(pendingModule) };
  return isRestricted ? { text: null, hint: HIDDEN_FIELD_HINT, isHidden: true } : { text: null };
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
  return pendingCell(metric?.pending_module, metric?.available === false);
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
  return pendingCell(counter?.pending_module, counter?.available === false);
}

/**
 * IZN-F4.2 · 3. hâl tespiti (zarf VAR + `available:false` + modül anahtarı yok = rolün izni yok). Hücre okuyucusu
 * (`metricCell`/`countCell`) yerine zarfı KENDİ yazan yüzeyler (hero/kart/şerit) için: aynı karar, tek yer.
 */
export function isRestrictedEnvelope(envelope: { available: boolean; pending_module?: PendingModuleKey } | undefined | null): boolean {
  return envelope !== undefined && envelope !== null && envelope.available === false && !envelope.pending_module;
}
