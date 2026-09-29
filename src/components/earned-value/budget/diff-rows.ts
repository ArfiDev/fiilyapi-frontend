import { EMPTY_CELL, formatQuantity } from "@/lib/format";
import { formatUnitRate } from "@/lib/earned-value";
import type { EvRevisionDiffOut } from "@/lib/api/models";

import { formatMhr, formatSignedMhr } from "./budget-format";

/**
 * PLN-F1.6 · Revizyon farkı paneli (Adam-Saat Bütçesi.dc.html:154-175, 576-589) — SAF.
 *
 * Backend "neden"i KOD olarak döner (B1-14); metni burada üretilir. Renk dili
 * K22'dir: a-s ARTIŞI kırmızı, azalış yeşil (mockup'taki ters renk örnek
 * veriydi — BÜT:586). Sarı vurgu tabloda YENİ değerin hücresindedir.
 */

type LeafDiff = EvRevisionDiffOut["leaves"][number];
export type DiffTone = "increase" | "decrease" | "neutral";

export interface DiffRow {
  leafId: string;
  name: string;
  note: string;
  oldQty: string;
  newQty: string;
  qtyChanged: boolean;
  oldRate: string;
  newRate: string;
  rateChanged: boolean;
  rateMissing: boolean;
  delta: string;
  tone: DiffTone;
}

export interface DiffSummary {
  title: string;
  count: number;
  before: string;
  after: string;
  delta: string;
  tone: DiffTone;
  againstNumber: number;
}

export interface LeafDiffMark {
  qtyChanged: boolean;
  rateChanged: boolean;
  /** Üstü çizili eski değer (BÜT:629-630 `qOld`/`rOld`). */
  oldQtyShort: string;
  oldRateShort: string;
}

const REASON_NOTE: Record<LeafDiff["reason"], string> = {
  new: "Yeni satır · BOQ bölüm tahsisi eklendi",
  removed: "Satır kaldırıldı · BOQ bölüm tahsisi silindi",
  // DSC-B3 S8: yalnız kısıtlı kullanıcıda; hedef disiplin bilerek gösterilmez (opak).
  moved_out: "Başka disipline taşındı / kapsam dışı",
  qty_changed: "BOQ miktar revizyonu",
  rate_changed: "Oran değişti",
  qty_and_rate_changed: "BOQ miktar revizyonu · oran değişti",
};

const QTY_REASONS = new Set<LeafDiff["reason"]>(["new", "removed", "moved_out", "qty_changed", "qty_and_rate_changed"]);
const RATE_REASONS = new Set<LeafDiff["reason"]>(["new", "removed", "moved_out", "rate_changed", "qty_and_rate_changed"]);

/** Yaprağın yeni ağaçta karşılığı yok (oran/miktar null döner) — "Oran yok" uyarısı bunlara basılmaz. */
const GONE_REASONS = new Set<LeafDiff["reason"]>(["removed", "moved_out"]);

function toneOf(delta: string | null): DiffTone {
  if (delta === null) return "neutral";
  const value = Number(delta);
  if (value > 0) return "increase";
  return value < 0 ? "decrease" : "neutral";
}

function qtyText(qty: string | null, uom: string): string {
  return qty === null ? EMPTY_CELL : `${formatQuantity(qty)} ${uom}`;
}

function rateText(rate: string | null): string {
  return rate === null ? EMPTY_CELL : formatUnitRate(rate);
}

export function diffRows(diff: EvRevisionDiffOut): DiffRow[] {
  return diff.leaves.map((leaf) => {
    const rateMissing = leaf.unit_mhr === null && !GONE_REASONS.has(leaf.reason);
    return {
      leafId: leaf.leaf_id,
      name: `${leaf.item_description} · ${leaf.section_name ?? "Bölümsüz"}`,
      note: REASON_NOTE[leaf.reason],
      oldQty: qtyText(leaf.prev_qty, leaf.uom),
      newQty: qtyText(leaf.qty, leaf.uom),
      qtyChanged: QTY_REASONS.has(leaf.reason),
      oldRate: rateText(leaf.prev_unit_mhr),
      newRate: rateMissing ? "Oran yok" : rateText(leaf.unit_mhr),
      rateChanged: RATE_REASONS.has(leaf.reason),
      rateMissing,
      delta: rateMissing ? EMPTY_CELL : formatSignedMhr(leaf.delta_mhr),
      tone: rateMissing ? "neutral" : toneOf(leaf.delta_mhr),
    };
  });
}

export function diffSummary(diff: EvRevisionDiffOut): DiffSummary | null {
  if (diff.against === null) return null;
  return {
    title: `Revizyon farkı · Rev ${diff.against.number} → Rev ${diff.revision.number}`,
    count: diff.leaves.length,
    before: formatMhr(diff.direct_before_mhr),
    after: formatMhr(diff.direct_after_mhr),
    delta: formatSignedMhr(diff.direct_delta_mhr),
    tone: toneOf(diff.direct_delta_mhr),
    againstNumber: diff.against.number,
  };
}

export function diffByLeaf(diff: EvRevisionDiffOut): Map<string, LeafDiffMark> {
  return new Map(
    diff.leaves.map((leaf) => [
      leaf.leaf_id,
      {
        qtyChanged: QTY_REASONS.has(leaf.reason),
        rateChanged: RATE_REASONS.has(leaf.reason),
        oldQtyShort: leaf.prev_qty === null ? "yeni" : formatQuantity(leaf.prev_qty),
        oldRateShort: rateText(leaf.prev_unit_mhr),
      },
    ]),
  );
}
