import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { BoqTotalsStrip } from "./BoqTotalsStrip";
import type { BoqTotals } from "@/lib/api/hooks/useBoq";

/**
 * F-ILRUI — `available` dallanması (K-ZARF).
 *
 * 🔴 ÖLÇÜLMÜŞ OLGU (backend `ffb055e`): bu şeridin DÖRT alanı da HÂLÂ yer
 * tutucudur (`boq/service.py:206-209`), yani bugün basılan "—"ler DOĞRUDUR.
 * Dallanma yine de eklenir: kod bugün BEKÇİSİZDİR — backend yarın alanı
 * doldurduğunda ekran sessizce yalan söylemeye devam ederdi.
 */
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

const FULL: Partial<BoqTotals> = {
  contract_total: { available: true, value: "11200000" },
  realized_total: { available: true, value: "8400000" },
  remaining_total: { available: true, value: "2800000" },
  revision_total: { available: true, value: "340000" },
};

describe("BoqTotalsStrip · dolu zarf (Ekran 13 · 74-87)", () => {
  it("dört kart mockup'ın kompakt para biçimini basar", () => {
    render(<BoqTotalsStrip totals={totalsWith(FULL)} />);
    const values = screen.getAllByTestId("boq-kpi-value").map((el) => el.textContent);
    expect(values).toEqual(["₺ 11,2M", "₺ 8,4M", "₺ 2,8M", "₺ 340B"]);
  });

  it("dolu zarfta `--pending` DÜŞER, mockup'ın vurgulu rengi geri gelir", () => {
    render(<BoqTotalsStrip totals={totalsWith(FULL)} />);
    const [contract, realized, remaining, revision] = screen.getAllByTestId("boq-kpi-value");
    for (const value of [contract, realized, remaining, revision]) {
      expect(value).not.toHaveClass("boq-kpi__value--pending");
      expect(value).not.toHaveAttribute("title");
    }
    expect(realized).toHaveClass("boq-kpi__value--realized");
    expect(remaining).toHaveClass("boq-kpi__value--remaining");
    expect(revision).toHaveClass("boq-kpi__value--revision");
  });

  it("dolu zarfta sr-only gerekçe metni de basılmaz", () => {
    const { container } = render(<BoqTotalsStrip totals={totalsWith(FULL)} />);
    expect(container.querySelectorAll(".boq-kpi .sr-only")).toHaveLength(0);
  });

  it("`0` gerçek bir cevaptır — yer tutucu sanılmaz", () => {
    render(<BoqTotalsStrip totals={totalsWith({ contract_total: { available: true, value: "0" } })} />);
    const value = screen.getAllByTestId("boq-kpi-value")[0];
    expect(value).toHaveTextContent("₺ 0");
    expect(value).not.toHaveClass("boq-kpi__value--pending");
  });
});

describe("BoqTotalsStrip · karşıt kanıt (boş zarf)", () => {
  it("boş zarfta dördü de — + `--pending` + title basar", () => {
    render(<BoqTotalsStrip totals={totalsWith()} />);
    for (const value of screen.getAllByTestId("boq-kpi-value")) {
      expect(value).toHaveTextContent(/^—/);
      expect(value).toHaveClass("boq-kpi__value--pending");
      expect(value).toHaveAttribute("title");
    }
  });

  it("ÜÇÜNCÜ HÂL: available:false + pending_module null → gizli ipucu (kilit), modül gerekçesi YOK", () => {
    render(
      <BoqTotalsStrip
        totals={totalsWith({ contract_total: { available: false, value: null, pending_module: null } })}
      />,
    );
    const value = screen.getAllByTestId("boq-kpi-value")[0];
    expect(value).toHaveTextContent("—");
    expect(value).toHaveClass("boq-kpi__value--pending");
    expect(value).toHaveAttribute("title", "Bu bilgi rolünüz için gizli");
    expect(within(value).queryByText("İlgili modülle birlikte gelir")).not.toBeInTheDocument();
  });

  // 🔴 MUTASYON DENETİMİ BULGUSU — ölçüt BAYRAKTIR, `value`nun doluluğu değil.
  it("available:false ama value DOLU → yine — basar, sahte para basılmaz", () => {
    render(
      <BoqTotalsStrip
        totals={totalsWith({
          contract_total: { available: false, value: "11200000", pending_module: "contracts" },
        })}
      />,
    );
    const value = screen.getAllByTestId("boq-kpi-value")[0];
    expect(value).toHaveTextContent(/^—/);
    expect(value).toHaveClass("boq-kpi__value--pending");
    expect(screen.queryByText(/11,2M/)).not.toBeInTheDocument();
  });

  it("karışık hâl: bir dolu üç boş — ayrışırlar", () => {
    render(<BoqTotalsStrip totals={totalsWith({ realized_total: { available: true, value: "8400000" } })} />);
    const values = screen.getAllByTestId("boq-kpi-value");
    expect(values[1]).toHaveTextContent("₺ 8,4M");
    expect(values[1]).not.toHaveClass("boq-kpi__value--pending");
    expect(values[0]).toHaveClass("boq-kpi__value--pending");
    expect(values[2]).toHaveClass("boq-kpi__value--pending");
    expect(values[3]).toHaveClass("boq-kpi__value--pending");
  });
});
