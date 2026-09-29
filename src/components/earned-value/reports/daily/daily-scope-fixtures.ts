import type { EvDailyReport } from "@/lib/api/models";

import { DAILY_REPORT_FIXTURE_APPROVED, DAILY_REPORT_FIXTURE_DRAFT } from "./daily-fixtures";

/**
 * DSC-B3 · kısıtlı kullanıcının backend yanıtı biçimleri (`report_daily.py`, `report_snapshot_scope.py`).
 * Backend overall satırlarının `name`ini null döner.
 */
const withoutNames = (kpis: EvDailyReport["kpis"]): EvDailyReport["kpis"] =>
  kpis.map((row) => (row.kind.startsWith("overall") ? { ...row, name: null } : row));

/** Canlı kısıtlı: overall kendi disiplinleri, footer dolu; harcanan yalnız kendi (200), puantaj/dağıtılmamış şantiye düzeyi. */
export const DAILY_RESTRICTED_LIVE: EvDailyReport = {
  ...DAILY_REPORT_FIXTURE_DRAFT,
  draft_diary_dates: [],
  kpis: withoutNames(DAILY_REPORT_FIXTURE_DRAFT.kpis),
  footer: { ...DAILY_REPORT_FIXTURE_DRAFT.footer!, spent_total_day: "200" },
};

/** Onaylı kısıtlı: kpis yalnız disiplin, trend [], footer null (`restrict_snapshot`). */
export const DAILY_RESTRICTED_APPROVED: EvDailyReport = {
  ...DAILY_REPORT_FIXTURE_APPROVED,
  kpis: DAILY_REPORT_FIXTURE_APPROVED.kpis.filter((row) => row.kind.startsWith("discipline")),
  trend: [],
  footer: null,
};

/** Karma disiplin: `discipline` / `discipline_own` / `discipline_subcon` AYNI node_id'yi paylaşır (backend biçimi). */
export const DAILY_MIXED_DISCIPLINE: EvDailyReport = (() => {
  const base = DAILY_REPORT_FIXTURE_DRAFT.kpis.find((row) => row.kind === "discipline")!;
  const kpis = [
    ...DAILY_REPORT_FIXTURE_DRAFT.kpis,
    { ...base, kind: "discipline_own" as const, contractor_mix: "own" },
    { ...base, kind: "discipline_subcon" as const, contractor_mix: "subcon" },
  ];
  return { ...DAILY_REPORT_FIXTURE_DRAFT, kpis };
})();
