import { cx } from "@/lib/cx";

import "./catalog-shared.css";

/**
 * TKL-F1.3 · İki katalog ekranının (Birim Oran Kataloğu = KAT, İş Kalemi Kataloğu)
 * ORTAK saf görsel parçaları. Çekirdek bölge: `components/earned-value/**` ithal
 * edilmez (§2.7); KAT bu dosyadan ithal eder (yön EV → çekirdek). Sınıf adları
 * (`ev-cat-own`, `ev-cat-swatch`) KAT görselini DEĞİŞTİRMEMEK için korundu.
 */
export type ContractorType = "own" | "subcon";

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
