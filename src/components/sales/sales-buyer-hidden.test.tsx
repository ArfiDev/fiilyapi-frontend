import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSession } from "@/components/shell/SessionProvider";
import type { UpcomingCollection } from "@/lib/api/hooks/useSalesSummary";
import { meFixture } from "@/lib/auth/page-grants.testkit";

import { SalesTable } from "./SalesTable";
import { UpcomingCollectionsCard } from "./UpcomingCollectionsCard";
import type { SaleRow } from "./sales-labels";

vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));

const PROJECT = "22222222-2222-2222-2222-222222222222";

function sale(name: string | null): SaleRow {
  return {
    id: "sl-1",
    status: "deed_transferred",
    unit_label: "A · Daire 12",
    customer_name: name,
    customer_national_id: null,
    customer_tax_number: null,
    sale_price: "1120000.00",
    paid_amount: "1120000.00",
    remaining_amount: "0.00",
    payment_plan_type: "cash",
    installment_total: 0,
    installment_paid_count: 0,
    overdue_installment_count: 0,
    reservation_deposit: null,
    reservation_due_date: null,
  } as SaleRow;
}

function renderTable(name: string | null, projectId?: string) {
  return render(
    <SalesTable rows={[sale(name)]} serverTotals={undefined} statusFilter={undefined} onStatusFilterChange={vi.fn()} isLoading={false} isError={false} projectId={projectId} />,
  );
}

function session(me: ReturnType<typeof meFixture>) {
  vi.mocked(useSession).mockReturnValue({ me, isLoading: false } as ReturnType<typeof useSession>);
}

describe("IZN-F4.2 · satış alıcı adı (satis_alici)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("ad null + kategori gizli (ana rol) → '—' + kilit ipucu", () => {
    session(meFixture({ hiddenFields: ["satis_alici"] }));
    renderTable(null);
    expect(screen.getByTestId("hidden-mark")).toBeInTheDocument();
    expect(document.querySelector(".satis-table__customer")?.textContent).toContain("—");
  });

  it("ad null + kategori gizli DEĞİL → '—' ama kilit YOK (veri yok)", () => {
    session(meFixture({ hiddenFields: ["maliyet_kar"] }));
    renderTable(null);
    expect(screen.queryByTestId("hidden-mark")).not.toBeInTheDocument();
    expect(document.querySelector(".satis-table__customer")?.textContent).toBe("—");
  });

  it("proje bağlamı: ana rolde açık, ekip rolünde gizli → kilit var", () => {
    session(
      meFixture({
        hiddenFields: [],
        projects: [{ project_id: PROJECT, role_key: "site_chief" }],
        rolePages: { site_chief: {} },
        roleHiddenFields: { site_chief: ["satis_alici"] },
      }),
    );
    renderTable(null, PROJECT);
    expect(screen.getByTestId("hidden-mark")).toBeInTheDocument();
  });

  it("ad DOLUysa olduğu gibi gösterilir (FE kendi gizleme kararı vermez), kilit yok", () => {
    session(meFixture({ hiddenFields: ["satis_alici"] }));
    renderTable("Mehmet Aydın");
    expect(screen.getByText("Mehmet Aydın")).toBeInTheDocument();
    expect(screen.queryByTestId("hidden-mark")).not.toBeInTheDocument();
  });

  it("yaklaşan tahsilat satırı: null ad → '—' + kilit", () => {
    session(meFixture({ hiddenFields: ["satis_alici"] }));
    const item = {
      installment_id: "i1",
      unit_label: "A · Daire 19",
      customer_name: null,
      label: "Taksit 6",
      due_date: "2026-10-10",
      days_overdue: 0,
      is_overdue: false,
      amount: "1000.00",
      late_fee: null,
    } as unknown as UpcomingCollection;
    render(<UpcomingCollectionsCard items={[item]} isLoading={false} isError={false} />);
    const row = screen.getByTestId("satis-yaklasan-i1");
    expect(row.textContent).toContain("A · Daire 19 — —");
    expect(screen.getByTestId("hidden-mark")).toBeInTheDocument();
  });
});
