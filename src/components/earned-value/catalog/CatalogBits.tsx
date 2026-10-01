import { cx } from "@/lib/cx";

import { diffBand, formatDiffPercent } from "./catalog-model";

// TKL-F1.3 · ContractorBadge / DisciplineSwatch / CONTRACTOR_* çekirdeğe taşındı
// (`components/catalog-shared/CatalogBits.tsx`); KAT oradan ithal eder.

interface DiffBadgeProps {
  ratio: string | null;
}

/** KAT:170 / :446-451 — fark rozeti; renk GÖSTERİLEN değerin bandından. */
export function DiffBadge({ ratio }: DiffBadgeProps) {
  return (
    <span className={cx("ev-cat-diff", `ev-cat-diff--${diffBand(ratio)}`)}>{formatDiffPercent(ratio)}</span>
  );
}
