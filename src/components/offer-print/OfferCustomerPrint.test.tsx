import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { makeCompany, makeGroup, makePrintOffer, makePrintRevision } from "./offer-print-fixtures";
import { OfferCustomerPrint } from "./OfferCustomerPrint";
import { buildCustomerPrintModel } from "./print-model-customer";

function renderPrint(revisionOverrides = {}, companyOverrides = {}) {
  const model = buildCustomerPrintModel({
    offer: makePrintOffer(),
    revision: makePrintRevision(revisionOverrides),
    company: makeCompany(companyOverrides),
  });
  return render(<OfferCustomerPrint model={model} />);
}

const sheets = (container: HTMLElement) => Array.from(container.querySelectorAll<HTMLElement>(".ev-print-sheet"));

describe("OfferCustomerPrint — işveren teklifi (A4 dikey)", () => {
  it("A4 DİKEY sayfa; altlık 'TKL-… Rev.n · İşveren teklifi · Sayfa 1 / 1'", () => {
    const { container } = renderPrint();
    expect(sheets(container)).toHaveLength(1);
    expect(sheets(container)[0]).toHaveAttribute("data-orientation", "portrait");
    expect(screen.getByText("TKL-2026-0014 · Rev.2 · İşveren teklifi")).toBeInTheDocument();
    expect(screen.getByText("Sayfa 1 / 1")).toBeInTheDocument();
  });

  it("başlık: logo yok → unvan; iletişim satırları; künye", () => {
    renderPrint();
    expect(screen.getByRole("heading", { level: 2, name: "Fiil Yapı A.Ş." })).toBeInTheDocument();
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("Kadıköy V.D. · VKN 1234567890")).toBeInTheDocument();
    expect(screen.getByText("Kuzey Gayrimenkul A.Ş.")).toBeInTheDocument();
    expect(screen.getByText("Güneşkent Konut Kompleksi")).toBeInTheDocument();
  });

  it("logo varsa <img> basılır", () => {
    renderPrint({}, { has_logo: true });
    expect(screen.getByRole("img", { name: "Fiil Yapı A.Ş." })).toHaveAttribute("src", "/api/backend/company/logo");
  });

  it("6 kolon: Poz No · Tarif · Birim · Miktar · Teklif B.F. · Tutar", () => {
    renderPrint();
    const headers = screen.getAllByRole("columnheader").map((cell) => cell.textContent);
    expect(headers).toEqual(["Poz No", "Tarif", "Birim", "Miktar", "Teklif B.F. (₺)", "Tutar (₺)"]);
  });

  it("fiyatsız kalem: satır var, B.F./Tutar '—' + dipnot; 0 basılmaz", () => {
    renderPrint();
    const row = screen.getByText(/Fiyatı girilmemiş kalem/).closest("tr")!;
    const cells = within(row).getAllByRole("cell").map((cell) => cell.textContent);
    expect(cells.slice(-2)).toEqual(["—", "—"]);
    expect(screen.getByText("* Fiyatı belirlenmemiş 1 kalem toplama dahil değildir.")).toBeInTheDocument();
  });

  it("toplamlar + koşullar + imza kutuları yalnız SON sayfada; tek sayfa ise o sayfada", () => {
    renderPrint();
    expect(screen.getByText("Genel toplam")).toBeInTheDocument();
    expect(screen.getByText("Hazırlayan")).toBeInTheDocument();
    expect(screen.getByText("Selin Aksoy")).toBeInTheDocument();
    expect(screen.getByText("Onaylayan")).toBeInTheDocument();
    expect(screen.getByText("Ödeme koşulları")).toBeInTheDocument();
  });

  it("çok sayfalı: grup bölünmez; toplam/imza yalnız son sayfada; 'Sayfa x / y'", () => {
    const groups = Array.from({ length: 6 }, (_, index) => makeGroup(`g${index}`, `Grup ${index}`, 12));
    const { container } = renderPrint({ groups });
    const all = sheets(container);
    expect(all.length).toBeGreaterThan(1);
    all.forEach((sheet, index) => {
      expect(within(sheet).getByText(`Sayfa ${index + 1} / ${all.length}`)).toBeInTheDocument();
      const hasTotals = within(sheet).queryByText("Genel toplam") !== null;
      const hasSignature = within(sheet).queryByText("Hazırlayan") !== null;
      expect(hasTotals).toBe(index === all.length - 1);
      expect(hasSignature).toBe(index === all.length - 1);
    });
    // Her grup başlığı tam bir kez; her grubun ara toplamı AYNI sayfada.
    for (let index = 0; index < 6; index += 1) {
      const owners = all.filter((sheet) => within(sheet).queryByText(`Grup ${index}`) !== null);
      expect(owners).toHaveLength(1);
      expect(within(owners[0]!).getByText(`Grup ${index} ara toplamı`)).toBeInTheDocument();
    }
  });
});

describe("KAT-F2.2 · Bakanlık poz no'su (yazdırma kipi)", () => {
  const coded = { id: "g1-kod", groupId: "g1", poz: "G1.KOD", unitPrice: "128.80", sourceCode: "35.140.3195-D" };
  const plain = { id: "g1-yok", groupId: "g1", poz: "G1.YOK", unitPrice: "128.80" };
  const withCodes = () => ({ groups: [makeGroup("g1", "Kaba İnşaat", 0, [coded, plain])] });

  it("kod varsa poz no hücresinde ALT satır: print sınıfı, title YOK; null'da hiçbir şey basılmaz", () => {
    renderPrint(withCodes());
    const sub = screen.getByTestId("offer-print-source-code");
    expect(sub).toHaveTextContent("35.140.3195-D");
    expect(sub).toHaveClass("source-code-sub--print");
    expect(sub).not.toHaveAttribute("title");
    const row = sub.closest("tr")!;
    expect(within(row).getAllByRole("cell")[0]).toHaveTextContent("G1.KOD35.140.3195-D");
    expect(screen.getAllByTestId("offer-print-source-code")).toHaveLength(1);
  });
});
