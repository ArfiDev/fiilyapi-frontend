import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { BoqTable } from "./BoqTable";
import type { BoqTotals } from "@/lib/api/hooks/useBoq";

// DSC-F1.3 · kısıtlı (disiplini atanmış) kullanıcıda boş liste bildirimi.
const scope = vi.hoisted(() => ({ value: { isRestricted: false, names: [] as string[] } }));
vi.mock("@/lib/auth/useDisciplineScope", () => ({ useDisciplineScope: () => scope.value }));

const TOTALS = {
  grand_total: "0.00",
  grand_progress_pct: { available: false, value: null, pending_module: "progress_payments" },
} as unknown as BoqTotals;

describe("BoqTable — kısıtlı boş durum (DSC-F1.3)", () => {
  beforeEach(() => {
    scope.value = { isRestricted: false, names: [] };
  });

  it("kısıtlı + boş liste → ortak bildirim, eski metin yok", () => {
    scope.value = { isRestricted: true, names: ["Civil Works"] };
    render(<BoqTable groups={[]} totals={TOTALS} />);
    expect(screen.getByText("Disiplininize ait kayıt yok.")).toBeInTheDocument();
    expect(screen.queryByText("Bu şantiyede henüz iş kalemi tanımlanmadı.")).not.toBeInTheDocument();
  });

  it("atamasız + boş liste → bugünkü metin aynen", () => {
    render(<BoqTable groups={[]} totals={TOTALS} />);
    expect(screen.getByText("Bu şantiyede henüz iş kalemi tanımlanmadı.")).toBeInTheDocument();
    expect(screen.queryByText("Disiplininize ait kayıt yok.")).not.toBeInTheDocument();
  });
});
