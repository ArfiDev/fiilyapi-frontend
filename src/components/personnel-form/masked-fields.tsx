import { Field, Input } from "@/components/ui";
import { HiddenMark } from "@/components/ui/hidden-mark/HiddenMark";
import type { HiddenCategory } from "@/lib/api/models";
import type { PersonnelDetailResponse } from "@/lib/api/hooks/usePersonnelDetail";
import { PAYROLL_HIDDEN_CATEGORIES, PERSONNEL_PII_HIDDEN_CATEGORIES } from "@/lib/auth/finance-hidden";

import type { OmittablePersonnelField } from "./build-body";
import type { PersonnelFormValues } from "./form-state";

/**
 * IZN-F4c.2 — `maas_kisisel` gizliyken sunucu şu dokuz personel alanını `null` döner ve PUT/PATCH'te DOLU
 * gönderilmesini reddeder (403; `IZN-B4c-SOZLESME.md` §2). Form bu alanları salt okunur "—" + kilit çizer ve
 * PATCH gövdesinden ÇIKARIR. Bu liste bir GİZLEME KARARI VERMEZ: maske kararı backend'indir; burada yalnız
 * "form alanı ↔ API alanı ↔ kategori" eşlemesi tutulur.
 */
export interface MaskableFieldSpec {
  formKey: keyof PersonnelFormValues;
  apiField: OmittablePersonnelField;
  categories: readonly HiddenCategory[];
}

export const MASKABLE_PERSONNEL_FIELDS: readonly MaskableFieldSpec[] = [
  { formKey: "tcNo", apiField: "tc_no", categories: PERSONNEL_PII_HIDDEN_CATEGORIES },
  { formKey: "birthDate", apiField: "birth_date", categories: PERSONNEL_PII_HIDDEN_CATEGORIES },
  { formKey: "phone", apiField: "phone", categories: PERSONNEL_PII_HIDDEN_CATEGORIES },
  { formKey: "email", apiField: "email", categories: PERSONNEL_PII_HIDDEN_CATEGORIES },
  { formKey: "address", apiField: "address", categories: PERSONNEL_PII_HIDDEN_CATEGORIES },
  {
    formKey: "emergencyContactPhone",
    apiField: "emergency_contact_phone",
    categories: PERSONNEL_PII_HIDDEN_CATEGORIES,
  },
  { formKey: "iban", apiField: "iban", categories: PERSONNEL_PII_HIDDEN_CATEGORIES },
  { formKey: "sgkNo", apiField: "sgk_no", categories: PERSONNEL_PII_HIDDEN_CATEGORIES },
  { formKey: "wageAmount", apiField: "wage_amount", categories: PAYROLL_HIDDEN_CATEGORIES },
];

/**
 * Düzenleme kipinde MASKELİ alanlar: kategori gizli (`isCategoryHidden`) VE sunucudan gelen değer `null`.
 * (Kategori gizli ama değer dolu ise — proje bağlamı farkı — alan normal düzenlenir.)
 * `detail` yoksa (oluşturma kipi / yük gelmedi) hiçbir alan maskeli değildir: POST serbesttir.
 */
export function maskedPersonnelFields(
  detail: PersonnelDetailResponse | undefined,
  isHidden: (categories: readonly HiddenCategory[]) => boolean,
): readonly MaskableFieldSpec[] {
  if (!detail) return [];
  return MASKABLE_PERSONNEL_FIELDS.filter(
    (spec) => isHidden(spec.categories) && detail[spec.apiField] === null,
  );
}

/** Alan maskeliyse salt okunur "—" + kilit çizer. */
export function MaskedField({ label, className }: { label: string; className?: string }) {
  return (
    <Field label={label} className={className} hint={<HiddenMark withText />}>
      {(control) => <Input {...control} readOnly disabled value="—" />}
    </Field>
  );
}
