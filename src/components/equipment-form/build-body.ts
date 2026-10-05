import type {
  EquipmentCreateRequest,
  EquipmentUpdateRequest,
} from "@/lib/api/hooks/useEquipmentMutations";

import type { EquipmentCategory } from "./constants";
import { SITE_UNASSIGNED_VALUE, type EquipmentFormValues } from "./form-state";
import type { MaskableEquipmentMoneyField, OmittableEquipmentField } from "./omit-fields";

/**
 * `MK-1 K7` — `monthly_capacity_hours` sunucu varsayılanı. Gövde şeması bu
 * alanı ZORUNLU sayar (`EquipmentCreate`), mockup ise ÇİZMİYOR; sunucunun
 * kendi varsayılanı aynen tekrarlanır ve düzenleme kipinde HİÇ gönderilmez
 * (mevcut değer korunur). Kullanıcıya sorulmadığı için uydurma değildir —
 * sunucudaki kararın aynısıdır.
 */
export const DEFAULT_MONTHLY_CAPACITY_HOURS = 200;

/** Boş/boşluk dizesi `null`a düşer — sunucuya "" yazmak veri değil gürültüdür. */
function textOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** Boş dize `null`; aksi hâlde tamsayı. Geçersiz metin `null`a düşmez, 422 alır. */
function intOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

/**
 * `site_id` — HEM "Seçiniz..." (boş dize) HEM "Depoda (Atanmadı)" `null`
 * üretir (M2:118 ikisini de çiziyor, MK-1 K4: depo AÇILMAZ, `site_id IS NULL`
 * demektir).
 */
function siteIdOrNull(value: string): string | null {
  if (value === "" || value === SITE_UNASSIGNED_VALUE) return null;
  return value;
}

/**
 * Kategorisi seçilmiş form değerleri — `EquipmentCreate.category` ZORUNLUDUR.
 * Doğrulama geçmişse bu daraltma her zaman başarılıdır; tip kapısı olarak
 * durur (personel formunun `submittableValues` deseni).
 */
export type SubmittableEquipmentFormValues = EquipmentFormValues & {
  category: EquipmentCategory;
};

export function submittableEquipmentValues(
  values: EquipmentFormValues,
): SubmittableEquipmentFormValues | null {
  if (values.category === "") return null;
  return { ...values, category: values.category };
}

/**
 * İki gövdenin ORTAK parçası: K5 kapısına GİRMEYEN alanlar.
 *
 * BİLİNÇLİ OLARAK GÖNDERİLMEYENLER (form durumunda karşılıkları bile yok):
 *   • ekipman fotoğrafı (M2:77-81) · belge kutuları (M2:131-160) → MK-2
 *   • `status_note` / `status_expected_date` → mockup'ta çizili değil
 *   • `monthly_capacity_hours` → mockup'ta çizili değil (oluşturmada şema
 *     zorunlu tuttuğu için sunucu varsayılanı basılır, PATCH'te HİÇ gitmez)
 *   • `is_active` → M2'de karşılığı yok; oluşturmada `true`, PATCH'te gitmez
 */
function commonFields(values: SubmittableEquipmentFormValues) {
  return {
    name: values.name.trim(),
    category: values.category,
    brand: textOrNull(values.brand),
    model: textOrNull(values.model),
    serial_no: textOrNull(values.serialNo),
    plate_no: textOrNull(values.plateNo),
    model_year: intOrNull(values.modelYear),
    ownership: values.ownership,
    purchase_amount: textOrNull(values.purchaseAmount),
    purchase_date: textOrNull(values.purchaseDate),
    // MK-1 K3 — satıcı ve kiralama firması TEK FK'dir.
    supplier_id: textOrNull(values.supplierId),
    market_value: textOrNull(values.marketValue),
    rate_amount: textOrNull(values.rateAmount),
    site_id: siteIdOrNull(values.siteId),
    operator_id: textOrNull(values.operatorId),
    status: values.status,
    norm_consumption: textOrNull(values.normConsumption),
    is_company_asset: values.isCompanyAsset,
  };
}

/**
 * `POST /equipment` gövdesi.
 *
 * K5 kapısı BURADA UYGULANMAZ: oluşturma kipinde ezilecek bir sunucu değeri
 * YOKTUR, ekranda görünen seçim neyse o gider (boş seçeneği olmayan
 * seçicilerde görünenle kaydedilen ayrışmaz).
 */
export function buildEquipmentCreateBody(
  values: SubmittableEquipmentFormValues,
): EquipmentCreateRequest {
  return {
    ...commonFields(values),
    depreciation_years: intOrNull(values.depreciationYears),
    financing: values.financing,
    rate_period: values.ratePeriod,
    fuel_type: values.fuelType,
    norm_unit: values.normUnit,
    maintenance_period: values.maintenancePeriod,
    monthly_capacity_hours: DEFAULT_MONTHLY_CAPACITY_HOURS,
    is_active: true,
  };
}

/**
 * `PATCH /equipment/{id}` gövdesi — 🔴 **K5 KAPISI BURADADIR.**
 *
 * `omitFields` TİP-KİLİTLİDİR (`OmittableEquipmentField`): serbest bir
 * `string[]` yanlış yazılmış alan adını sessizce yutar, bu imza yutmaz.
 * Atlanan anahtar gövdeye HİÇ basılmaz — `null` GÖNDERİLMEZ, çünkü `null` da
 * sunucudaki değeri EZERDİ; `EquipmentUpdate` hiçbir alanı `required`
 * saymaz, anahtar yoksa sunucu mevcut değeri `model_fields_set` sayesinde
 * KORUR.
 */
export function buildEquipmentUpdateBody(
  values: SubmittableEquipmentFormValues,
  options: {
    omitFields?: readonly OmittableEquipmentField[];
    /** IZN-F4d.2 — maskeli para alanları gövdeye HİÇ konmaz (dolu → 403; `null` da gönderilmez). */
    maskedMoneyFields?: readonly MaskableEquipmentMoneyField[];
  } = {},
): EquipmentUpdateRequest {
  const omitted = options.omitFields ?? [];
  const isOmitted = (field: OmittableEquipmentField) => omitted.includes(field);
  const masked = options.maskedMoneyFields ?? [];
  const common = commonFields(values);
  const unmaskedCommon = Object.fromEntries(
    Object.entries(common).filter(([key]) => !masked.some((field) => field === key)),
  ) as typeof common;

  return {
    ...unmaskedCommon,
    ...(isOmitted("depreciation_years")
      ? {}
      : { depreciation_years: intOrNull(values.depreciationYears) }),
    ...(isOmitted("financing") ? {} : { financing: values.financing }),
    ...(isOmitted("rate_period") ? {} : { rate_period: values.ratePeriod }),
    ...(isOmitted("fuel_type") ? {} : { fuel_type: values.fuelType }),
    ...(isOmitted("norm_unit") ? {} : { norm_unit: values.normUnit }),
    ...(isOmitted("maintenance_period")
      ? {}
      : { maintenance_period: values.maintenancePeriod }),
  };
}
