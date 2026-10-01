import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { ADD_ITEM_DISABLED_REASON, SectionBoqCard, STATUS_COLUMN_REASON } from "./SectionBoqCard";
import type { BoqGroup, BoqItem, BoqTotals } from "@/lib/api/hooks/useBoq";

/**
 * BOQ-SEC-F T5 — bölüm detayı · İş Kalemleri sekmesi
 * (mockup `Bölüm Detay.dc.html:107-205`).
 */

function placeholder(pendingModule: string) {
  return { available: false, value: null, pending_module: pendingModule };
}

function item(overrides: Partial<BoqItem> = {}): BoqItem {
  return {
    id: "i-1",
    code: "03.001",
    description: "Kat Döşemesi — C25/30",
    unit: "m³",
    // 🔴 Süzgeçli yanıt: `quantity` BU BÖLÜMÜN payıdır (1.200), pozun şantiye
    // kotası (2.000 = 1.700 + 300) DEĞİL. Üç alan da FARKLI — ayrışma noktası.
    quantity: "1200.000",
    allocated_quantity: "1700.000",
    unallocated_quantity: "300.000",
    unit_price: "1850.00",
    amount: "2220000.00",
    sort_order: 0,
    contract_item_id: null,
    progress_pct: placeholder("progress_payments"),
    ...overrides,
  };
}

const TOTALS: BoqTotals = {
  contract_total: placeholder("contracts"),
  realized_total: placeholder("progress_payments"),
  remaining_total: placeholder("contracts"),
  revision_total: placeholder("contracts"),
  grand_total: "3520000.00",
  grand_progress_pct: placeholder("progress_payments"),
};

const GROUPS: BoqGroup[] = [
  {
    id: "g-1",
    name: "Betonarme İşleri",
    sort_order: 10,
    group_total: "2220000.00",
    items: [item()],
  },
  {
    id: "g-2",
    name: "Kalıp İşleri",
    sort_order: 20,
    group_total: "1300000.00",
    items: [
      item({ id: "i-2", code: "03.010", description: "Döşeme Kalıbı", unit: "m²", quantity: "3600.000", unit_price: "185.00", amount: "666000.00" }),
      item({ id: "i-3", code: "03.011", description: "Kolon Kalıbı", unit: "m²", quantity: "1800.000", unit_price: "210.00", amount: "378000.00" }),
    ],
  },
];

function renderCard(groups: BoqGroup[] = GROUPS) {
  render(<SectionBoqCard groups={groups} totals={TOTALS} sectionName="Kat 6–10" />);
}

describe("SectionBoqCard — başlık şeridi (D109-114)", () => {
  it("başlık bölüm adını taşır", () => {
    renderCard();
    expect(screen.getByText("İş Kalemleri — Kat 6–10")).toBeInTheDocument();
  });

  it("kalem sayısı ve toplam basılır", () => {
    renderCard();
    // 3 kalem (1 + 2); toplam backend'in `grand_total`ından biçimlenir.
    expect(screen.getByText(/^3 kalem ·/)).toBeInTheDocument();
  });

  it("boş bölümde sayı SIFIRDIR, uydurulmaz", () => {
    renderCard([]);
    expect(screen.getByText(/^0 kalem ·/)).toBeInTheDocument();
    expect(screen.getByTestId("section-boq-empty")).toBeInTheDocument();
  });
});

describe("SectionBoqCard — K1: poz seçici YOK, düğme devre dışı ve GEREKÇELİ", () => {
  it("'+ Kalem Ekle' SİLİNMEZ ama devre dışıdır", () => {
    renderCard();
    expect(screen.getByRole("button", { name: "+ Kalem Ekle" })).toBeDisabled();
  });

  it("gerekçe EKRANDA basılır (title'da saklanmaz)", () => {
    renderCard();
    expect(screen.getByText(ADD_ITEM_DISABLED_REASON)).toBeInTheDocument();
  });
});

describe("SectionBoqCard — sütunlar (D115-124)", () => {
  it("mockup'ın SEKİZ sütunu sırayla basılır", () => {
    renderCard();
    const headers = screen.getAllByRole("columnheader").slice(0, 8).map((th) => th.textContent);
    expect(headers).toEqual([
      "Poz No",
      "İş Kalemi",
      "Birim",
      "Miktar",
      "B. Fiyat",
      "Tutar",
      "Gerç. %",
      "Durum",
    ]);
  });

  it("Miktar sütunu BÖLÜM PAYINI basar — şantiye kotasını DEĞİL", () => {
    renderCard([GROUPS[0]]);
    // 1.200 = bu bölümün payı. 2.000 (kota) ya da 1.700 (dağıtılan toplam)
    // basan bir uygulama burada kırmızıya döner.
    expect(screen.getAllByTestId("section-boq-quantity")[0]).toHaveTextContent("1.200");
    expect(screen.queryByText("2.000")).not.toBeInTheDocument();
    expect(screen.queryByText("1.700")).not.toBeInTheDocument();
  });

  it("Gerç. % ve Durum sahte veriyle DOLDURULMAZ — ikisi de tire basar", () => {
    renderCard([GROUPS[0]]);
    expect(screen.getAllByTestId("section-boq-pct")[0]).toHaveTextContent("—");
    expect(screen.getAllByTestId("section-boq-status")[0]).toHaveTextContent("—");
  });

  it("Durum sütununun gerekçesi ekran okuyucuya OKUNUR", () => {
    renderCard([GROUPS[0]]);
    expect(
      within(screen.getAllByTestId("section-boq-status")[0]).getByText(STATUS_COLUMN_REASON),
    ).toBeInTheDocument();
  });
});

describe("SectionBoqCard — gruplar ve toplam (D129 / D200-205)", () => {
  it("grup başlıkları HARF önekiyle sayılır", () => {
    renderCard();
    expect(screen.getAllByTestId("section-boq-group").map((el) => el.textContent)).toEqual([
      "A. Betonarme İşleri",
      "B. Kalıp İşleri",
    ]);
  });

  it("tfoot 'BÖLÜM TOPLAM (N kalem)' der ve toplamı BACKEND'den alır", () => {
    renderCard();
    const foot = screen.getByTestId("section-boq-total-row");
    expect(within(foot).getByText("BÖLÜM TOPLAM (3 kalem)")).toBeInTheDocument();
    // Frontend yeniden TOPLAMAZ: satırların toplamı 3.264.000 iken backend
    // 3.520.000 diyor (süzülmüş küme dışında kalan kalemler de sayılabilir).
    // Ekranın görevi sunucunun sayısını basmaktır.
    expect(screen.getByTestId("section-boq-total-amount")).toHaveTextContent("3.520.000");
  });
});
