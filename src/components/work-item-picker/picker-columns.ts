import type { PickerEntryMode } from "./picker-rules";

/**
 * PS:86-97 sırası; fiyat kolonu başlığı hedefe göre. `selectOnly` (şablon): Miktar / fiyat / Tutar kolonları YOK —
 * kolon listesi moddan türetilir (tablo başlığı, hücreler ve `colSpan` bunu izler).
 */
export function pickerColumns(entryMode: PickerEntryMode, priceHeader: string): readonly string[] {
  const catalogColumns = ["Poz No", "Tanım", "Birim", "Ref. fiyat", "Son fiyat"];
  return entryMode === "selectOnly" ? catalogColumns : [...catalogColumns, "Miktar", priceHeader, "Tutar"];
}
