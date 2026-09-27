/**
 * PLN-F1.5 · "Disiplin Ekle / Düzenle" formunun saf durumu
 * (Disiplin Yönetimi.dc.html:227-304, mantık :437-461).
 *
 * §3.10 F0-7: kod KULLANIMDAYKEN de düzenlenir (düğüm kimliği `discipline_id`).
 * Kod büyük harfe çevrilir (M6:438 `toUpperCase`) — yerelsiz: "inc" → "INC"
 * (tr-TR "İNC" üretirdi).
 */
import type {
  EvDisciplineCreate,
  EvDisciplineRead,
  EvDisciplineUpdate,
} from "@/lib/api/models";

import { DISCIPLINE_PALETTE } from "./discipline-palette";

export type ContractorType = EvDisciplineRead["default_contractor_type"];

export interface DisciplineFormState {
  code: string;
  name: string;
  color: string | null;
  own: ContractorType;
}

export interface DisciplineFormErrors {
  code?: string;
  name?: string;
  color?: string;
}

/** openapi `DisciplineCreate` sınırları. */
export const DISCIPLINE_CODE_MAX_LENGTH = 20;
export const DISCIPLINE_NAME_MAX_LENGTH = 100;

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

/** 11.+ disiplinde palet başa döner (KAT-F1b · KARARLAR.md 2026-09-27, palet 5→10). */
export function suggestedPaletteColor(existingCount: number): string {
  return DISCIPLINE_PALETTE[existingCount % DISCIPLINE_PALETTE.length];
}

export function newDisciplineForm(existingCount: number): DisciplineFormState {
  return { code: "", name: "", color: suggestedPaletteColor(existingCount), own: "own" };
}

export interface PaletteEntry {
  color: string;
  /** "sıradaki" (yalnız oluşturmada) ya da bu rengi kullanan BAŞKA disiplinin kodu; yoksa boş. */
  label: string;
  isNext: boolean;
}

/**
 * M6:314-320 `renderVals` — palet dairesinin altındaki etiket. Oluşturmada
 * sıradaki önerilen renk "sıradaki" yazar (kullanan disiplin olsa bile
 * öncelik ondadır); düzenlemede yalnız BAŞKA bir disiplinin kullandığı renk
 * etiketlenir (kendi rengini "kendini kullanıyor" diye işaretlemez).
 */
export function paletteEntries(
  palette: readonly string[],
  existing: readonly EvDisciplineRead[],
  editing: EvDisciplineRead | null,
): PaletteEntry[] {
  const nextColor = suggestedPaletteColor(existing.length);
  const usedBy = new Map<string, string>();
  for (const discipline of existing) {
    if (!usedBy.has(discipline.color)) usedBy.set(discipline.color, discipline.code);
  }
  return palette.map((color) => {
    if (editing) {
      const owner = usedBy.get(color);
      return { color, label: owner && owner !== editing.code ? owner : "", isNext: false };
    }
    const isNext = color === nextColor;
    return { color, label: isNext ? "sıradaki" : (usedBy.get(color) ?? ""), isNext };
  });
}

/** M6:351 — colHint oluşturma/düzenlemeye göre ayrılır. */
export function disciplineColHint(existingCount: number, isEdit: boolean): string {
  if (isEdit) return "Panel ve raporlardaki grafiklerde bu renk kullanılır";
  return `Sıradaki palet rengi önceden seçildi (${existingCount + 1}. disiplin) · 11. disiplinde palet başa döner`;
}

export function disciplineFormFromRead(discipline: EvDisciplineRead): DisciplineFormState {
  return {
    code: discipline.code,
    name: discipline.name,
    color: discipline.color,
    own: discipline.default_contractor_type,
  };
}

/** `editingId` = düzenlenen kaydın kimliği (kendisiyle çakışma sayılmaz). */
export function validateDisciplineForm(
  form: DisciplineFormState,
  existing: readonly EvDisciplineRead[],
  editingId: string | null,
): DisciplineFormErrors {
  const code = normalizeCode(form.code);
  const duplicate = existing.find((d) => d.code === code && d.id !== editingId);
  const errors: DisciplineFormErrors = {};
  if (!code) errors.code = "Kod zorunlu";
  else if (duplicate) errors.code = `Bu kod zaten var: ${duplicate.name}`;
  if (!form.name.trim()) errors.name = "Disiplin adı zorunlu";
  if (!form.color) errors.color = "Grafik rengi seçin";
  return errors;
}

/** Yeni disiplin listenin sonuna eklenir (backend `sort_order`, sonra `code` sıralar). */
export function buildDisciplineCreateBody(
  form: DisciplineFormState,
  existing: readonly EvDisciplineRead[],
): EvDisciplineCreate {
  const lastOrder = existing.reduce((max, d) => Math.max(max, d.sort_order), 0);
  return {
    code: normalizeCode(form.code),
    name: form.name.trim(),
    color: form.color ?? DISCIPLINE_PALETTE[0],
    default_contractor_type: form.own,
    sort_order: lastOrder + 1,
  };
}

/** Kısmi güncelleme: yalnız değişen alanlar (açık `null` backend'de 422). */
export function buildDisciplineUpdateBody(
  original: EvDisciplineRead,
  form: DisciplineFormState,
): EvDisciplineUpdate {
  const code = normalizeCode(form.code);
  const name = form.name.trim();
  return {
    ...(code !== original.code ? { code } : {}),
    ...(name !== original.name ? { name } : {}),
    ...(form.color && form.color !== original.color ? { color: form.color } : {}),
    ...(form.own !== original.default_contractor_type ? { default_contractor_type: form.own } : {}),
  };
}
