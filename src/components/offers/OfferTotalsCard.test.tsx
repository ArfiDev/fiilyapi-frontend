import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { makeRevision } from "./offer-detail-fixtures";
import { OfferTotalsCard } from "./OfferTotalsCard";

const TOTALS = makeRevision({ rev_no: 2 }).totals;

describe("OfferTotalsCard", () => {
  it("iç görünüm: maliyet · GG (%12) · kâr (%15) · net · KDV %20 · genel toplam · adam-saat; sunucu değerleri KAYIPSIZ, mockup tl() kuruşlu (TD:422-429)", () => {
    render(<OfferTotalsCard totals={TOTALS} vatPct="20.00" />);
    const text = document.body.textContent ?? "";
    expect(text).toContain("Maliyet₺50.000.000,00");
    expect(text).toContain("Genel gider%12₺6.000.000,00");
    expect(text).toContain("Kâr%15₺8.400.000,00");
    expect(text).toContain("Teklif tutarı (KDV hariç)₺73.982.140,00");
    expect(text).toContain("KDV%20₺14.796.428,00");
    expect(text).toContain("Genel toplam₺88.778.568,00");
    expect(text).toContain("Toplam adam-saat12.840 a-s");
  });

  it("GG yüzdesi = genel gider / maliyet (istemci yalnız gösterim; 1 hane HALF_UP)", () => {
    const totals = { ...TOTALS, internal: { ...TOTALS.internal, cost: "300.00", overhead: "36.50" } };
    render(<OfferTotalsCard totals={totals} vatPct="20.00" />);
    expect(document.body.textContent).toContain("Genel gider%12,2");
  });

  it("toplam adam-saat TD nf(T.as): kuruşsuz, yarım sıfırdan uzağa (dize tabanlı)", () => {
    render(<OfferTotalsCard totals={{ ...TOTALS, internal: { ...TOTALS.internal, man_hours: "12839.5000" } }} vatPct="20.00" />);
    expect(document.body.textContent).toContain("Toplam adam-saat12.840 a-s");
  });

  it("fiyatsız kalem uyarısı yalnız sayı > 0 iken", () => {
    const { rerender } = render(<OfferTotalsCard totals={TOTALS} vatPct="20.00" />);
    expect(screen.getByText("Fiyatı girilmemiş 2 kalem toplamlara dahil değil")).toBeInTheDocument();
    rerender(<OfferTotalsCard totals={{ ...TOTALS, unpriced_count: 0 }} vatPct="20.00" />);
    expect(screen.queryByText(/Fiyatı girilmemiş/)).not.toBeInTheDocument();
  });

  it("limited rol: para maskeli (null) → '—'; adam-saat görünür kalır", () => {
    const masked = {
      unpriced_count: 0,
      unquantified_count: 0,
      customer: { net: null, vat: null, gross: null },
      internal: { cost: null, overhead: null, profit: null, profit_pct: "15.00", man_hours: "12840" },
    };
    render(<OfferTotalsCard totals={masked} vatPct="20.00" />);
    expect(document.body.textContent).toContain("Maliyet—");
    expect(document.body.textContent).toContain("Genel toplam—");
    expect(document.body.textContent).toContain("12.840 a-s");
  });
});
