import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { BoqTable } from "./BoqTable";
import type { BoqGroup, BoqTotals } from "@/lib/api/hooks/useBoq";

/**
 * F-ILRUI — GENEL TOPLAM yüzde hücresi (Ekran 13 · 177 `%75`).
 *
 * 🔴 ÖLÇÜLMÜŞ OLGU (backend `ffb055e`): `grand_progress_pct` BAĞLIDIR
 * (`boq/service.py:215`, ILR-1; kaynağı şantiye günlüğü). Hücre bugüne kadar
 * `available`a hiç bakmıyordu, dolayısıyla bağlı yüzdeyi de "—" basıyordu.
 */
const GROUPS: BoqGroup[] = [
  {
    id: "g-1",
    name: "Betonarme İşleri",
    sort_order: 10,
    group_total: "12399900.00",
    items: [],
  },
];

function totalsWith(overrides: Partial<BoqTotals> = {}): BoqTotals {
  return {
    contract_total: { available: false, value: null, pending_module: "contracts" },
    realized_total: { available: false, value: null, pending_module: "progress_payments" },
    remaining_total: { available: false, value: null, pending_module: "progress_payments" },
    revision_total: { available: false, value: null, pending_module: "contracts" },
    grand_total: "12399900.00",
    grand_progress_pct: { available: false, value: null, pending_module: "progress_payments" },
    ...overrides,
  };
}

describe("BoqTable · GENEL TOPLAM yüzdesi", () => {
  it("dolu zarfta mockup'ın yüzdesini basar", () => {
    render(<BoqTable groups={GROUPS} totals={totalsWith({ grand_progress_pct: { available: true, value: "75" } })} />);
    const pct = screen.getByTestId("boq-total-pct");
    expect(pct).toHaveTextContent("%75");
    expect(pct).not.toHaveClass("boq-table__pct--pending");
    expect(pct).not.toHaveAttribute("title");
    expect(within(pct).queryByText(/henüz bağlanmadı/)).not.toBeInTheDocument();
  });

  it("`0` gerçek bir cevaptır — yer tutucu sanılmaz", () => {
    render(<BoqTable groups={GROUPS} totals={totalsWith({ grand_progress_pct: { available: true, value: "0" } })} />);
    const pct = screen.getByTestId("boq-total-pct");
    expect(pct).toHaveTextContent("%0");
    expect(pct).not.toHaveClass("boq-table__pct--pending");
  });

  it("KARŞIT KANIT — boş zarfta — + `--pending` + title basar", () => {
    render(<BoqTable groups={GROUPS} totals={totalsWith()} />);
    const pct = screen.getByTestId("boq-total-pct");
    expect(pct).toHaveTextContent("—");
    expect(pct).toHaveClass("boq-table__pct--pending");
    expect(pct).toHaveAttribute("title", "Hakediş verisi bu yüzeye henüz bağlanmadı");
  });

  // 🔴 MUTASYON DENETİMİ BULGUSU — ölçüt BAYRAKTIR, `value`nun doluluğu değil.
  it("available:false ama value DOLU → yine — basar, sahte yüzde basılmaz", () => {
    render(
      <BoqTable
        groups={GROUPS}
        totals={totalsWith({
          grand_progress_pct: { available: false, value: "75", pending_module: "progress_payments" },
        })}
      />,
    );
    const pct = screen.getByTestId("boq-total-pct");
    expect(pct).toHaveTextContent("—");
    expect(pct).toHaveClass("boq-table__pct--pending");
    expect(pct).not.toHaveTextContent("%75");
  });

  it("ÜÇÜNCÜ HÂL: available:false + pending_module null → gizli ipucu (kilit), modül gerekçesi YOK", () => {
    render(
      <BoqTable
        groups={GROUPS}
        totals={totalsWith({ grand_progress_pct: { available: false, value: null, pending_module: null } })}
      />,
    );
    const pct = screen.getByTestId("boq-total-pct");
    expect(pct).toHaveTextContent("—");
    expect(pct).toHaveClass("boq-table__pct--pending");
    expect(pct).toHaveAttribute("title", "Bu bilgi rolünüz için gizli");
    expect(within(pct).queryByText("İlgili modülle birlikte gelir")).not.toBeInTheDocument();
  });
});
