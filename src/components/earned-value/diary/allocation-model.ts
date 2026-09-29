/**
 * PLN-F2.3 · Saat Dağıtımı taslağı — SAF model (React yok).
 *
 * Mockup: `Şantiye - Günlük Kayıt (İlerleme).dc.html` İ:386-491 (ızgara) +
 * İ:605 `setCell` + İ:618-625 (toplamlar). Hesap motoru (kazanılmış, harcanan,
 * PF, dağıtılmamış) BACKEND'dedir; burada yalnız DÜZENLENEN hücrelerin anında
 * önizlemesi (satır "Kalan", kolon toplamı, şerit) yapılır.
 *
 * 🔴 PUT TAM DEĞİŞTİRMEDİR (`useSaveDayAllocation`): gövdede olmayan kod/hücre
 * SİLİNİR. `buildAllocationBody` bu yüzden HER ZAMAN bütün satırların bütün
 * dolu hücrelerini kurar — "yalnız değişenleri gönder" bir veri kaybıdır.
 */
import type {
  EvAllocationCode,
  EvAllocationSave,
  EvDayRow,
  EvDayView,
} from "@/lib/api/models";

import { centiToDecimal, formatHoursInput, parseHoursInput, toCenti, type Centi } from "./hours";

export type RowKind = EvDayRow["kind"];
export type AllocationRule = EvAllocationCode["rule"];

/** Satır anahtarı: `personnel:<uuid>` · `subcontractor:<uuid>`. */
export type RowKey = string;

export interface AllocationDraft {
  /** Izgaranın kolonları — sıra kullanıcının ekleme sırasıdır (backend `sort_order`). */
  readonly codes: readonly EvAllocationCode[];
  /** Satır → kod → kullanıcının yazdığı METİN. Listeden çıkarılan kodun metni korunur. */
  readonly cells: Readonly<Record<RowKey, Readonly<Record<string, string>>>>;
  /** Dağıtılmamış saat gerekçesi (K14, İ:506). */
  readonly reason: string;
}

export function rowKey(kind: RowKind, refId: string): RowKey {
  return `${kind}:${refId}`;
}

export function keyOfRow(row: Pick<EvDayRow, "kind" | "ref_id">): RowKey {
  return rowKey(row.kind, row.ref_id);
}

export function draftFromView(view: EvDayView): AllocationDraft {
  const cells: Record<RowKey, Record<string, string>> = {};
  for (const cell of view.cells) {
    const key = rowKey(cell.kind, cell.ref_id);
    cells[key] = { ...cells[key], [cell.node_id]: formatHoursInput(toCenti(cell.hours)) };
  }
  return {
    codes: view.codes.map((code) => ({ node_id: code.node_id, rule: code.rule })),
    cells,
    reason: view.unallocated_reason ?? "",
  };
}

/** Hücre metni → centi; geçersiz metin 0 sayılır (geçersizlik ayrıca sayılır). */
function cellCenti(draft: AllocationDraft, key: RowKey, nodeId: string): Centi {
  return parseHoursInput(draft.cells[key]?.[nodeId] ?? "") ?? 0;
}

export function buildAllocationBody(
  draft: AllocationDraft,
  rows: readonly EvDayRow[],
): EvAllocationSave {
  const cells: EvAllocationSave["cells"] = [];
  for (const row of rows) {
    for (const code of draft.codes) {
      const hours = cellCenti(draft, keyOfRow(row), code.node_id);
      if (hours <= 0) continue;
      cells.push({
        row: { kind: row.kind, ref_id: row.ref_id },
        node_id: code.node_id,
        hours: centiToDecimal(hours),
      });
    }
  }
  const reason = draft.reason.trim();
  return {
    codes: draft.codes.map((code) => ({ node_id: code.node_id, rule: code.rule })),
    cells,
    unallocated_reason: reason === "" ? null : reason,
  };
}

export function setCell(draft: AllocationDraft, key: RowKey, nodeId: string, text: string): AllocationDraft {
  return { ...draft, cells: { ...draft.cells, [key]: { ...draft.cells[key], [nodeId]: text } } };
}

export function setReason(draft: AllocationDraft, reason: string): AllocationDraft {
  return { ...draft, reason };
}

/** Kod listede yoksa sona ekler, varsa çıkarır (İ:640 `onClick`). Hücre metinleri korunur. */
export function toggleCode(draft: AllocationDraft, nodeId: string, rule: AllocationRule): AllocationDraft {
  const exists = draft.codes.some((code) => code.node_id === nodeId);
  const codes = exists
    ? draft.codes.filter((code) => code.node_id !== nodeId)
    : [...draft.codes, { node_id: nodeId, rule }];
  return { ...draft, codes };
}

/** Kodu yoksa ekler (kopyalama/toplu atama için), varsa dokunmaz. */
export function ensureCode(draft: AllocationDraft, nodeId: string, rule: AllocationRule): AllocationDraft {
  if (draft.codes.some((code) => code.node_id === nodeId)) return draft;
  return { ...draft, codes: [...draft.codes, { node_id: nodeId, rule }] };
}

export function setRule(draft: AllocationDraft, nodeId: string, rule: AllocationRule): AllocationDraft {
  return {
    ...draft,
    codes: draft.codes.map((code) => (code.node_id === nodeId ? { ...code, rule } : code)),
  };
}

/** Satırın listedeki kodlara dağıtılmış saati. */
export function rowAllocated(draft: AllocationDraft, row: Pick<EvDayRow, "kind" | "ref_id">): Centi {
  const key = keyOfRow(row);
  return draft.codes.reduce((sum, code) => sum + cellCenti(draft, key, code.node_id), 0);
}

/** İ:680 `rem` — puantaj saati − satırın hücreleri. */
export function rowRemaining(draft: AllocationDraft, row: EvDayRow): Centi {
  return toCenti(row.hours) - rowAllocated(draft, row);
}

/** İ:618 `colSum` — kod başına toplam. */
export function columnTotals(draft: AllocationDraft, rows: readonly EvDayRow[]): Record<string, Centi> {
  const totals: Record<string, Centi> = {};
  for (const code of draft.codes) {
    totals[code.node_id] = rows.reduce((sum, row) => sum + cellCenti(draft, keyOfRow(row), code.node_id), 0);
  }
  return totals;
}

export interface StripValues {
  source: Centi;
  allocated: Centi;
  unallocated: Centi;
  subcontractor: Centi;
}

/**
 * Başka disiplinlerin dağıttığı saat (DSC): kısıtlı kullanıcıda backend `totals.allocated_hours`
 * TÜM disiplinleri içerir, `cells` yalnız görünenleri. Atamasızda (tutarlı veri) 0'dır;
 * tutarsız veride negatif olmaz.
 */
export function hiddenAllocated(view: EvDayView): Centi {
  const visible = view.cells.reduce((sum, cell) => sum + toCenti(cell.hours), 0);
  return Math.max(0, toCenti(view.totals.allocated_hours) - visible);
}

/**
 * 4'lü şerit (İ:393-396). Temiz taslakta değerler BACKEND toplamlarıdır
 * (`totals`); kullanıcı hücre düzenlerken Dağıtılan/Dağıtılmamış anında
 * önizlenir — görünen taslak hücreleri + başka disiplin payı (`hiddenAllocated`),
 * böylece kısıtlı kullanıcıda temiz ve dokunulup geri alınmış taslak AYNI değeri gösterir.
 * Puantaj toplamı ve taşeron her zaman satırlardan (backend).
 */
export function stripValues(view: EvDayView, draft: AllocationDraft, isDirty: boolean): StripValues {
  const source = toCenti(view.totals.source_hours);
  const subcontractor = view.rows
    .filter((row) => row.kind === "subcontractor")
    .reduce((sum, row) => sum + toCenti(row.hours), 0);
  if (!isDirty) {
    return {
      source,
      allocated: toCenti(view.totals.allocated_hours),
      unallocated: toCenti(view.totals.unallocated_hours),
      subcontractor,
    };
  }
  const allocated = view.rows.reduce((sum, row) => sum + rowAllocated(draft, row), 0) + hiddenAllocated(view);
  return { source, allocated, unallocated: source - allocated, subcontractor };
}

export function isDraftDirty(
  draft: AllocationDraft,
  base: AllocationDraft,
  rows: readonly EvDayRow[],
): boolean {
  return JSON.stringify(buildAllocationBody(draft, rows)) !== JSON.stringify(buildAllocationBody(base, rows));
}

/** Listedeki kodlarda geçersiz metin taşıyan hücre sayısı (kayıt kapısı). */
export function invalidCellCount(draft: AllocationDraft): number {
  const codeIds = new Set(draft.codes.map((code) => code.node_id));
  let count = 0;
  for (const byCode of Object.values(draft.cells)) {
    for (const [nodeId, text] of Object.entries(byCode)) {
      if (codeIds.has(nodeId) && parseHoursInput(text) === null) count += 1;
    }
  }
  return count;
}
