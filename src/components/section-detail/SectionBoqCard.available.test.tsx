import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { SectionBoqCard } from "./SectionBoqCard";
import type { BoqGroup, BoqTotals } from "@/lib/api/hooks/useBoq";

/**
 * F-ILRUI — BÖLÜM TOPLAM yüzde hücresi (`Bölüm Detay.dc.html:200-205`).
 * `BoqTable`taki kusurun ikinci kopyasıydı; ikisi de aynı zarf kuralına uyar.
 */
const GROUPS: BoqGroup[] = [
  { id: "g-1", name: "Betonarme İşleri", sort_order: 10, group_total: "3520000.00", items: [] },
];

function totalsWith(overrides: Partial<BoqTotals> = {}): BoqTotals {
  return {
    contract_total: { available: false, value: null, pending_module: "contracts" },
    realized_total: { available: false, value: null, pending_module: "progress_payments" },
    remaining_total: { available: false, value: null, pending_module: "progress_payments" },
    revision_total: { available: false, value: null, pending_module: "contracts" },
    grand_total: "3520000.00",
    grand_progress_pct: { available: false, value: null, pending_module: "progress_payments" },
    ...overrides,
  };
}

function renderCard(totals: BoqTotals) {
  render(<SectionBoqCard groups={GROUPS} totals={totals} sectionName="A Blok" />);
  return screen.getByTestId("section-boq-total-pct");
}

describe("SectionBoqCard · BÖLÜM TOPLAM yüzdesi", () => {
  it("dolu zarfta yüzdeyi basar, `--pending` ve title DÜŞER", () => {
    const pct = renderCard(totalsWith({ grand_progress_pct: { available: true, value: "62.5" } }));
    expect(pct).toHaveTextContent("%62,5");
    expect(pct).not.toHaveClass("boq-table__pct--pending");
    expect(pct).not.toHaveAttribute("title");
  });

  it("`0` gerçek bir cevaptır", () => {
    const pct = renderCard(totalsWith({ grand_progress_pct: { available: true, value: "0" } }));
    expect(pct).toHaveTextContent("%0");
    expect(pct).not.toHaveClass("boq-table__pct--pending");
  });

  it("KARŞIT KANIT — boş zarfta — + `--pending` + title basar", () => {
    const pct = renderCard(totalsWith());
    expect(pct).toHaveTextContent("—");
    expect(pct).toHaveClass("boq-table__pct--pending");
    expect(pct).toHaveAttribute("title", "Hakediş verisi bu yüzeye henüz bağlanmadı");
  });

  // 🔴 MUTASYON DENETİMİ BULGUSU — ölçüt BAYRAKTIR, `value`nun doluluğu değil.
  it("available:false ama value DOLU → yine — basar, sahte yüzde basılmaz", () => {
    const pct = renderCard(
      totalsWith({
        grand_progress_pct: { available: false, value: "62.5", pending_module: "progress_payments" },
      }),
    );
    expect(pct).toHaveTextContent("—");
    expect(pct).toHaveClass("boq-table__pct--pending");
    expect(pct).not.toHaveTextContent("%62,5");
  });

  it("ÜÇÜNCÜ HÂL: available:false + pending_module null → gizli ipucu (kilit), modül gerekçesi YOK", () => {
    const pct = renderCard(
      totalsWith({ grand_progress_pct: { available: false, value: null, pending_module: null } }),
    );
    expect(pct).toHaveTextContent("—");
    expect(pct).toHaveClass("boq-table__pct--pending");
    expect(pct).toHaveAttribute("title", "Bu bilgi rolünüz için gizli");
    expect(within(pct).queryByText("İlgili modülle birlikte gelir")).not.toBeInTheDocument();
  });
});
