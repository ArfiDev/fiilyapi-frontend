import { MODEL_YEAR_MAX, MODEL_YEAR_MIN } from "./constants";
import type { EquipmentFormValues } from "./form-state";

/**
 * İstemci doğrulaması — sunucununkini taklit eder, YERİNE GEÇMEZ.
 *
 * Zorunluluk listesi İCAT EDİLMEMİŞTİR: M2'deki `*` işaretlerinin birebir
 * karşılığıdır — Sahiplik Tipi (51) · Ekipman Adı (84) · Kategori (85) ·
 * Alış Bedeli (98) · Atandığı Proje (118).
 *
 * 🔴 **K8 — `Alış Bedeli` KOŞULLU zorunludur** (MK-1 K2): `ownership ===
 * "owned"` iken zorunlu, `rented` iken serbest (kiralık makinenin alış bedeli
 * yoktur). Sunucu bunu 422 ile uygular; istemci de uygular — sunucu hatası
 * TEK savunma bırakılmaz, kullanıcı formu göndermeden önce uyarılır.
 *
 * `Sahiplik Tipi` radyo grubudur ve her zaman doludur (mockup'ta "Kendi
 * Malımız" seçilidir) → ayrı bir denetim gerekmez.
 */
export const MESSAGES = {
  nameRequired: "Ekipman adı zorunludur.",
  categoryRequired: "Kategori seçiniz.",
  purchaseAmountRequired: "Kendi malımız ekipmanda alış bedeli zorunludur.",
  siteRequired: "Atandığı proje seçiniz (depodaysa “Depoda (Atanmadı)” seçin).",
  modelYearRange: `Model yılı ${MODEL_YEAR_MIN} ile ${MODEL_YEAR_MAX} arasında olmalıdır.`,
} as const;

export type EquipmentFormErrors = Partial<Record<keyof EquipmentFormValues, string>>;

export function hasEquipmentFormErrors(errors: EquipmentFormErrors): boolean {
  return Object.keys(errors).length > 0;
}

/**
 * K8 — "Alış Bedeli" bu formda ZORUNLU mu? Mockup'ın `*` işareti de bu
 * fonksiyondan beslenir: yıldız `owned`da görünür, `rented`da DÜŞER (görünen
 * zorunluluk ile uygulanan zorunluluk ayrışmaz).
 */
export function isPurchaseAmountRequired(values: EquipmentFormValues): boolean {
  return values.ownership === "owned";
}

export interface EquipmentValidationContext {
  /**
   * Şantiye seçicisi GERÇEKTEN seçenek sunuyor mu. Sunmuyorsa (liste boş ya da
   * yüklenemedi) "Atandığı Proje" zorunlu TUTULMAZ — doldurulamayan bir alanı
   * zorunlu saymak formu KİLİTLERDİ; gerekçe seçicinin altında GÖRÜNÜR yazar.
   * ("Depoda (Atanmadı)" her koşulda seçilebilir olduğu için bu yalnız
   * kullanıcıyı gereksiz yere durdurmamak içindir.)
   */
  hasSiteOptions: boolean;
  /** IZN-F4d.2 — alış bedeli maskeli (gizli kategori + sunucu `null`) → "zorunlu" kuralı uygulanamaz (alan gönderilmez). */
  isPurchaseAmountMasked?: boolean;
}

export function validateEquipmentForm(
  values: EquipmentFormValues,
  context: EquipmentValidationContext,
): EquipmentFormErrors {
  const errors: EquipmentFormErrors = {};

  if (values.name.trim() === "") errors.name = MESSAGES.nameRequired;
  if (values.category === "") errors.category = MESSAGES.categoryRequired;

  // K8 — koşullu zorunluluk.
  if (
    !context.isPurchaseAmountMasked &&
    isPurchaseAmountRequired(values) &&
    values.purchaseAmount.trim() === ""
  ) {
    errors.purchaseAmount = MESSAGES.purchaseAmountRequired;
  }

  if (context.hasSiteOptions && values.siteId === "") {
    errors.siteId = MESSAGES.siteRequired;
  }

  // Sözleşme aralığı — boş geçerli (alan nullable), dolu ise 1900..2200.
  const modelYear = values.modelYear.trim();
  if (modelYear !== "") {
    const parsed = Number(modelYear);
    if (!Number.isFinite(parsed) || parsed < MODEL_YEAR_MIN || parsed > MODEL_YEAR_MAX) {
      errors.modelYear = MESSAGES.modelYearRange;
    }
  }

  return errors;
}
