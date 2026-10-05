import { PERSONNEL_FIELD_MAX_LENGTH } from "./constants";
import type { PersonnelFormValues } from "./form-state";

/**
 * İstemci doğrulaması — sunucununkini taklit eder, YERİNE GEÇMEZ (spec K4).
 *
 * ⚠️ İKİ YOL, İKİ ÖLÇÜ:
 *   • TASLAK ("Taslak Kaydet") → sunucunun gerçekten zorunlu tuttuğu İKİ alan
 *     denetlenir: `full_name` + `source`. Gerisi eksik kalabilir; taslağın
 *     amacı zaten budur.
 *   • YAYIN ("Personeli Kaydet" / "Yayına Al") → mockup'ta `*` taşıyan alanlar
 *     denetlenir. Bu liste İCAT EDİLMEMİŞTİR: PE 63-114 arasındaki yıldızların
 *     birebir karşılığıdır.
 *
 * ⚠️ İstemci TCKN **checksum HESAPLAMAZ** (spec K3): yalnız boşluk denetlenir,
 * geçerlilik sunucudadır ve reddi `submit-errors.ts` ayrıştırır.
 */
export const MESSAGES = {
  firstNameRequired: "Ad zorunludur.",
  lastNameRequired: "Soyad zorunludur.",
  sourceRequired: "Çalışan tipi seçiniz.",
  tradeRequired: "Meslek / görev seçiniz.",
  fullNameTooLong: `Ad ve soyad birlikte en fazla ${PERSONNEL_FIELD_MAX_LENGTH.full_name} karakter olabilir.`,
  tcNoRequired: "TC kimlik no zorunludur.",
  birthDateRequired: "Doğum tarihi zorunludur.",
  phoneRequired: "Cep telefonu zorunludur.",
  addressRequired: "Adres zorunludur.",
  emergencyContactNameRequired: "Acil durum kişisi zorunludur.",
  emergencyContactPhoneRequired: "Acil durum telefonu zorunludur.",
  hireDateRequired: "İşe giriş tarihi zorunludur.",
  assignedProjectRequired: "Atandığı proje seçiniz.",
  wageTypeRequired: "Ücret tipi seçiniz.",
  wageAmountRequired: "Ücret tutarı zorunludur.",
} as const;

export type PersonnelFormErrors = Partial<Record<keyof PersonnelFormValues, string>>;

/** Gönderim yolu — hangi ölçünün uygulanacağını belirler. */
export type PersonnelSubmitIntent = "draft" | "publish";

export interface PersonnelValidationContext {
  intent: PersonnelSubmitIntent;
  /**
   * Proje seçicisi GERÇEKTEN seçenek sunuyor mu. Sunmuyorsa (liste boş ya da
   * yüklenemedi) "Atandığı Proje" zorunlu TUTULMAZ — doldurulamayan bir alanı
   * zorunlu saymak formu kilitlerdi; gerekçe seçicinin altında GÖRÜNÜR yazar.
   */
  hasProjectOptions: boolean;
  /**
   * IZN-F4c.2 — maskeli (salt okunur "—") form alanları: kullanıcı DOLDURAMAZ, bu yüzden zorunlu
   * sayılmaz (zorunluluğu sunucu uygular). Aksi hâlde maskeli rol taslağı yayına alamazdı.
   */
  maskedFields?: ReadonlySet<keyof PersonnelFormValues>;
}

export function hasPersonnelFormErrors(errors: PersonnelFormErrors): boolean {
  return Object.keys(errors).length > 0;
}

export function validatePersonnelForm(
  values: PersonnelFormValues,
  context: PersonnelValidationContext,
): PersonnelFormErrors {
  const errors: PersonnelFormErrors = {};

  const firstName = values.firstName.trim();
  const lastName = values.lastName.trim();

  // Her iki yolda da: sunucu `full_name` + `source` olmadan kayıt AÇMAZ.
  if (!firstName) errors.firstName = MESSAGES.firstNameRequired;
  if (!values.source) errors.source = MESSAGES.sourceRequired;

  // Birleşik dize sunucu sınırına vurursa alan bazlı `maxLength` yetmez
  // (ikisi ayrı ayrı sınırın yarısı kadar olabilir + araya boşluk girer).
  if (firstName && lastName) {
    const fullNameLength = `${firstName} ${lastName}`.length;
    if (fullNameLength > PERSONNEL_FIELD_MAX_LENGTH.full_name) {
      errors.lastName = MESSAGES.fullNameTooLong;
    }
  }

  if (context.intent === "draft") return errors;

  // ── YAYIN yolu: mockup'ın `*` taşıyan alanları (PE 63-114) ──────────────
  if (!lastName) errors.lastName ??= MESSAGES.lastNameRequired;
  if (!values.trade.trim()) errors.trade = MESSAGES.tradeRequired;
  const isMasked = (field: keyof PersonnelFormValues) => context.maskedFields?.has(field) === true;
  if (!isMasked("tcNo") && !values.tcNo.trim()) errors.tcNo = MESSAGES.tcNoRequired;
  if (!isMasked("birthDate") && !values.birthDate) errors.birthDate = MESSAGES.birthDateRequired;
  if (!isMasked("phone") && !values.phone.trim()) errors.phone = MESSAGES.phoneRequired;
  if (!isMasked("address") && !values.address.trim()) errors.address = MESSAGES.addressRequired;
  if (!values.emergencyContactName.trim()) {
    errors.emergencyContactName = MESSAGES.emergencyContactNameRequired;
  }
  if (!isMasked("emergencyContactPhone") && !values.emergencyContactPhone.trim()) {
    errors.emergencyContactPhone = MESSAGES.emergencyContactPhoneRequired;
  }
  if (!values.hireDate) errors.hireDate = MESSAGES.hireDateRequired;
  if (context.hasProjectOptions && !values.assignedProjectId) {
    errors.assignedProjectId = MESSAGES.assignedProjectRequired;
  }
  if (!values.wageType) errors.wageType = MESSAGES.wageTypeRequired;
  if (!isMasked("wageAmount") && !values.wageAmount.trim()) errors.wageAmount = MESSAGES.wageAmountRequired;

  return errors;
}
