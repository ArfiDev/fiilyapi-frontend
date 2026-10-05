import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { SiteTotalsStrip } from "./SiteTotalsStrip";
import type { SiteListResponse } from "@/lib/api/hooks/useSites";

/**
 * F-ILRUI — `available` dallanması (K-ZARF).
 *
 * 🔴 ÖLÇÜLMÜŞ OLGU (backend `ffb055e`): `active_worker_count` BAĞLIDIR
 * (`sites/service/presenters.py:457` `_worker_count(...)` gerçek sayı döner);
 * diğer üçü hâlâ yer tutucudur (455/456/458). Şerit bugüne kadar `available`a
 * HİÇ bakmıyordu, dolayısıyla bağlı sayacı da "—" basıyordu.
 *
 * K-IKIZ1: her "dolu zarf değeri basar" iddiasının karşısında "boş zarf — basar"
 * iddiası durur; dört alan da HER İKİ yönde ölçülür.
 */
type Totals = SiteListResponse["totals"];

const EMPTY: Totals = {
  total_progress_payment: { available: false, value: null, pending_module: "progress_payments" },
  subcontractor_count: { available: false, count: null, pending_module: "subcontracts" },
  active_worker_count: { available: false, count: null, pending_module: "timesheet" },
  average_margin: { available: false, value: null, pending_module: "project_costs" },
};

const FULL: Totals = {
  total_progress_payment: { available: true, value: "17800000" },
  // 🔴 Dolu `CountPlaceholder` `pending_module` TAŞIR — bilinçli emsal.
  subcontractor_count: { available: true, count: 18, pending_module: "subcontracts" },
  active_worker_count: { available: true, count: 48, pending_module: "timesheet" },
  average_margin: { available: true, value: "14.5" },
};

function valueOf(label: string): HTMLElement {
  const card = screen.getByText(label).closest(".site-totals__card");
  const value = card?.querySelector(".site-totals__value");
  if (!(value instanceof HTMLElement)) throw new Error(`${label} değeri bulunamadı`);
  return value;
}

describe("SiteTotalsStrip · dolu zarf (mockup 178-191)", () => {
  it("Toplam Hakediş dolu zarfta mockup biçimiyle basar", () => {
    render(<SiteTotalsStrip totals={FULL} />);
    expect(valueOf("Toplam Hakediş")).toHaveTextContent("₺ 17,8M");
  });

  it("Toplam Taşeron dolu zarfta `firma` sonekiyle basar", () => {
    render(<SiteTotalsStrip totals={FULL} />);
    expect(valueOf("Toplam Taşeron")).toHaveTextContent("18 firma");
  });

  it("Aktif İşçi dolu zarfta gerçek sayıyı basar", () => {
    render(<SiteTotalsStrip totals={FULL} />);
    expect(valueOf("Aktif İşçi")).toHaveTextContent("48");
  });

  it("Ortalama Marj dolu zarfta yüzde basar", () => {
    render(<SiteTotalsStrip totals={FULL} />);
    expect(valueOf("Ortalama Marj")).toHaveTextContent("%14,5");
  });

  it("dolu zarfta `--pending` soluk sınıfı KONMAZ ve title VERİLMEZ", () => {
    render(<SiteTotalsStrip totals={FULL} />);
    for (const label of ["Toplam Hakediş", "Toplam Taşeron", "Aktif İşçi", "Ortalama Marj"]) {
      const value = valueOf(label);
      expect(value).not.toHaveClass("site-totals__value--pending");
      expect(value).not.toHaveAttribute("title");
    }
  });

  it("`count: 0` dolu bir cevaptır — yer tutucu sanılmaz", () => {
    render(
      <SiteTotalsStrip
        totals={{ ...FULL, active_worker_count: { available: true, count: 0, pending_module: "timesheet" } }}
      />,
    );
    const value = valueOf("Aktif İşçi");
    expect(value).toHaveTextContent("0");
    expect(value).not.toHaveClass("site-totals__value--pending");
    expect(value).not.toHaveAttribute("title");
  });
});

describe("SiteTotalsStrip · karşıt kanıt (boş zarf)", () => {
  it("boş zarfta dördü de — basar, `--pending` alır ve title taşır", () => {
    render(<SiteTotalsStrip totals={EMPTY} />);
    expect(screen.getAllByText("—")).toHaveLength(4);
    for (const label of ["Toplam Hakediş", "Toplam Taşeron", "Aktif İşçi", "Ortalama Marj"]) {
      const value = valueOf(label);
      expect(value).toHaveClass("site-totals__value--pending");
      expect(value).toHaveAttribute("title");
    }
  });

  it("ÜÇÜNCÜ HÂL: available:false + pending_module null → — + gizli ipucu (modül gerekçesi YOK)", () => {
    render(
      <SiteTotalsStrip
        totals={{ ...EMPTY, average_margin: { available: false, value: null, pending_module: null } }}
      />,
    );
    const value = valueOf("Ortalama Marj");
    expect(value).toHaveTextContent("—");
    expect(value).toHaveClass("site-totals__value--pending");
    expect(value).toHaveAttribute("title", "Bu bilgi rolünüz için gizli");
    // Yalan cümle EKRANDA HİÇBİR YERDE olmamalı.
    expect(screen.queryByTitle("İlgili modülle birlikte gelir")).not.toBeInTheDocument();
  });

  // 🔴 MUTASYON DENETİMİ BULGUSU: `available` kontrolünü silen mutant hayatta
  // kalmıştı — boş fikstürlerin hepsi `value/count: null` taşıdığı için ayrım
  // ölçülmüyordu. Ölçüt BAYRAKTIR, alanın doluluğu değil.
  it("available:false ama alan DOLU → dördü de yine — basar", () => {
    render(
      <SiteTotalsStrip
        totals={{
          total_progress_payment: { available: false, value: "17800000", pending_module: "progress_payments" },
          subcontractor_count: { available: false, count: 18, pending_module: "subcontracts" },
          active_worker_count: { available: false, count: 48, pending_module: "timesheet" },
          average_margin: { available: false, value: "14.5", pending_module: "project_costs" },
        }}
      />,
    );
    expect(screen.getAllByText("—")).toHaveLength(4);
    expect(screen.queryByText(/17,8M/)).not.toBeInTheDocument();
    expect(screen.queryByText("48")).not.toBeInTheDocument();
  });

  it("dolu sayaç ile boş metrik AYNI şeritte ayrışır (karışık hâl)", () => {
    render(<SiteTotalsStrip totals={{ ...EMPTY, active_worker_count: { available: true, count: 48, pending_module: "timesheet" } }} />);
    expect(valueOf("Aktif İşçi")).toHaveTextContent("48");
    expect(valueOf("Aktif İşçi")).not.toHaveAttribute("title");
    expect(valueOf("Toplam Hakediş")).toHaveTextContent("—");
    expect(screen.getAllByText("—")).toHaveLength(3);
  });
});
