import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { makeCompany, makeGroup, makePrintOffer, makePrintRevision } from "./offer-print-fixtures";
import { OfferInternalPrint } from "./OfferInternalPrint";
import { buildInternalPrintModel } from "./print-model-internal";

function renderPrint() {
  const model = buildInternalPrintModel({ offer: makePrintOffer(), revision: makePrintRevision(), company: makeCompany() });
  return render(<OfferInternalPrint model={model} />);
}

describe("OfferInternalPrint — iç döküm (A4 yatay)", () => {
  it("A4 YATAY; altlık tür etiketi 'İç döküm'", () => {
    const { container } = renderPrint();
    expect(container.querySelector(".ev-print-sheet")).toHaveAttribute("data-orientation", "landscape");
    expect(screen.getByText("TKL-2026-0014 · Rev.2 · İç döküm")).toBeInTheDocument();
  });

  it("11 kolon (maliyet + gider/kâr + a-s dahil)", () => {
    renderPrint();
    expect(screen.getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual([
      "Poz No",
      "Tarif",
      "Birim",
      "Miktar",
      "A-s/birim",
      "Maliyet B.F. (₺)",
      "Maliyet (₺)",
      "Gider %",
      "Kâr %",
      "Teklif B.F. (₺)",
      "Tutar (₺)",
    ]);
  });

  it("toplamlar: maliyet · genel gider · kâr · adam-saat · fiyatsız + imza", () => {
    renderPrint();
    for (const label of ["Maliyet", "Genel gider (%12)", "Kâr (%22,22)", "Toplam adam-saat", "Fiyatsız kalem", "Genel toplam"]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(screen.getByText("Hazırlayan")).toBeInTheDocument();
  });
});

describe("OfferInternalPrint — sütun genişlikleri (TKL-F1.4b)", () => {
  it("Poz No ve Birim sütunları genişletildi, toplam %100'ü aşmaz ve tarif sütunu (genişliksiz) en az %20 kalır", () => {
    const { container } = renderPrint();
    const widths = Array.from(container.querySelectorAll("col")).map((col) => Number.parseFloat((col as HTMLElement).style.width || "0"));
    expect(widths[0]).toBe(10);
    expect(widths[2]).toBe(5);
    expect(100 - widths.reduce((sum, width) => sum + width, 0)).toBeGreaterThanOrEqual(20);
  });

  it("poz no hücresi mono ve tek satır sınıfını taşır", () => {
    const { container } = renderPrint();
    expect(container.querySelector("td.offer-print__poz")).not.toBeNull();
  });
});

describe("KAT-F2.2 · Bakanlık poz no'su (iç döküm)", () => {
  it("kod varsa td.offer-print__poz içinde ALT satır: print sınıfı (nowrap'ı ezer), title YOK; null'da yok", () => {
    const groups = [
      makeGroup("g1", "Kaba İnşaat", 0, [
        { id: "g1-kod", groupId: "g1", poz: "G1.KOD", unitPrice: "128.80", sourceCode: "15.150.1003" },
        { id: "g1-yok", groupId: "g1", poz: "G1.YOK", unitPrice: "128.80" },
      ]),
    ];
    const model = buildInternalPrintModel({ offer: makePrintOffer(), revision: makePrintRevision({ groups }), company: makeCompany() });
    render(<OfferInternalPrint model={model} />);
    const sub = screen.getByTestId("offer-print-source-code");
    expect(sub).toHaveTextContent("15.150.1003");
    expect(sub).toHaveClass("source-code-sub--print");
    expect(sub).not.toHaveAttribute("title");
    expect(sub.closest("td")).toHaveClass("offer-print__poz");
    expect(screen.getAllByTestId("offer-print-source-code")).toHaveLength(1);
  });
});
