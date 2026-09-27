import { cx } from "@/lib/cx";
import type { EvCatalogItemRead } from "@/lib/api/models";

import { diffBand, formatDiffPercent } from "./catalog-model";

type ContractorType = EvCatalogItemRead["default_contractor_type"];

export const CONTRACTOR_LABEL: Record<ContractorType, string> = { own: "Kendi", subcon: "Taşeron" };

export const CONTRACTOR_OPTIONS: ReadonlyArray<{ value: ContractorType; label: string }> = [
  { value: "own", label: CONTRACTOR_LABEL.own },
  { value: "subcon", label: CONTRACTOR_LABEL.subcon },
];

interface ContractorBadgeProps {
  type: ContractorType;
}

/** KAT:164 / :492 — Kendi (mavi) · Taşeron (gri) rozeti. */
export function ContractorBadge({ type }: ContractorBadgeProps) {
  return <span className={cx("ev-cat-own", `ev-cat-own--${type}`)}>{CONTRACTOR_LABEL[type]}</span>;
}

interface DisciplineSwatchProps {
  /** Backend `color` alanı — VERİ, CSS'e gömülmez. */
  color: string;
}

/** Bütçe:312 — 10px disiplin renk karesi. */
export function DisciplineSwatch({ color }: DisciplineSwatchProps) {
  return (
    <span
      className="ev-cat-swatch"
      data-testid="discipline-swatch"
      aria-hidden="true"
      style={{ backgroundColor: color }}
    />
  );
}

interface DiffBadgeProps {
  ratio: string | null;
}

/** KAT:170 / :446-451 — fark rozeti; renk GÖSTERİLEN değerin bandından. */
export function DiffBadge({ ratio }: DiffBadgeProps) {
  return (
    <span className={cx("ev-cat-diff", `ev-cat-diff--${diffBand(ratio)}`)}>{formatDiffPercent(ratio)}</span>
  );
}
