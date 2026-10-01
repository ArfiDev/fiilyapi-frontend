import { SECTION_STATUS_LABELS } from "@/lib/section-labels";
import type { SectionStatus } from "@/lib/section-labels";

/** Seçicilerin ilk (boş) seçeneği (site-form deseni). */
export const SELECT_PLACEHOLDER = "Seçiniz...";

/**
 * `SectionCreate`/`SectionUpdate`'in metin alanları için sunucu sözleşmesindeki
 * uzunluk sınırları (`openapi/openapi.json` → `components.schemas.SectionCreate`).
 * YALNIZ UZUNLUKTUR (site-form/constants.ts deseni) — biçim doğrulaması yok.
 */
export const SECTION_FIELD_MAX_LENGTH = {
  name: 150,
  code: 50,
} as const satisfies Record<string, number>;

/**
 * `SectionTypeCreate.name` üst sınırı (`openapi/openapi.json` →
 * `components.schemas.SectionTypeCreate`, `maxLength: 100`). Yalnız uzunluk —
 * benzersizlik/normalize karşılaştırması İSTEMCİDE YOK, tek kaynak backend 409.
 */
export const SECTION_TYPE_NAME_MAX_LENGTH = 100;

/** "+ Yeni tip ekle" seçeneğinin sentinel değeri (BoqItemFormModal `__new__` deseni; UUID ile çakışmaz). */
export const NEW_SECTION_TYPE_OPTION = "__new__";

/** Durum seçenekleri — F71 sırasıyla, `on_hold` DAHİL (`section-labels.ts` tek kaynak). */
export const SECTION_STATUS_OPTIONS: readonly { value: SectionStatus; label: string }[] = (
  Object.keys(SECTION_STATUS_LABELS) as SectionStatus[]
).map((value) => ({ value, label: SECTION_STATUS_LABELS[value] }));
