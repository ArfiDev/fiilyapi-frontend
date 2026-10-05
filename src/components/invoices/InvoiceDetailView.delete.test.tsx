import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { useSession } from "@/components/shell/SessionProvider";
import { useInvoiceDetail, useInvoiceRentalMatch } from "@/lib/api/hooks/useInvoiceDetail";
import type { MeResponse } from "@/lib/auth/types";
import { InvoiceDetailView } from "./InvoiceDetailView";

// SIL-F2.2 · fatura detayındaki "Sil" düğmesi: YALNIZ Sistem Yöneticisi (fail-closed).
// Ekranın geri kalanı bu dosyanın konusu DEĞİL — ağır çocuklar kuru taklitle değişir.
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/lib/api/hooks/useInvoiceDetail", () => ({
  useInvoiceDetail: vi.fn(),
  useInvoiceRentalMatch: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useCompany", () => ({ useCompany: () => ({ data: undefined }) }));
vi.mock("@/lib/api/hooks/useInvoiceMutations", () => ({
  useInvoiceAction: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("./InvoiceLinesTable", () => ({ InvoiceLinesTable: () => null }));
vi.mock("./InvoicePaymentsPanel", () => ({ InvoicePaymentsPanel: () => null }));
vi.mock("./RentalMatchCard", () => ({ RentalMatchCard: () => null }));
vi.mock("./InvoiceSourceChip", () => ({ InvoiceSourceChip: () => null }));

const BASE_ME = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  email: "ayse@ornek.com",
  full_name: "Ayşe Yılmaz",
  role_key: "procurement",
  status: "active",
} as unknown as MeResponse;

function invoice(direction: "incoming" | "outgoing") {
  return {
    id: "inv-1",
    direction,
    invoice_no: "FAT-2026-0001",
    status: "draft",
    document_type: "e_invoice",
    party_name: "Karşı Taraf A.Ş.",
    party_tax_number: null,
    party_tax_office: null,
    party_address: null,
    issue_date: "2026-03-05",
    due_date: null,
    payment_method: null,
    total: "1000.00",
    equipment_rental_invoice_id: null,
    lines: [],
  };
}

function setup(isSystemAdmin: boolean | undefined, direction: "incoming" | "outgoing" = "outgoing") {
  const me = { ...BASE_ME, ...(isSystemAdmin === undefined ? {} : { is_system_admin: isSystemAdmin }) } as MeResponse;
  vi.mocked(useSession).mockReturnValue({ me, isLoading: false });
  vi.mocked(useInvoiceDetail).mockReturnValue({ data: invoice(direction), isLoading: false, isError: false, error: null } as never);
  vi.mocked(useInvoiceRentalMatch).mockReturnValue({ data: undefined, isLoading: false, isError: false, error: null } as never);
  render(<InvoiceDetailView invoiceId="inv-1" />);
}

beforeEach(() => vi.clearAllMocks());

describe("InvoiceDetailView — Sil düğmesi (SIL-F2.2)", () => {
  it.each(["outgoing", "incoming"] as const)("is_system_admin=true iken (%s fatura) Sil düğmesi görünür", (direction) => {
    setup(true, direction);
    expect(screen.getByRole("button", { name: "Sil" })).toBeInTheDocument();
  });

  it.each([false, undefined])("is_system_admin=%s iken Sil düğmesi YOKTUR", (flag) => {
    setup(flag);
    expect(screen.queryByRole("button", { name: "Sil" })).not.toBeInTheDocument();
  });

  it("oturum bilinmezken (me=null) Sil düğmesi YOKTUR (fail-closed)", () => {
    vi.mocked(useSession).mockReturnValue({ me: null, isLoading: true });
    vi.mocked(useInvoiceDetail).mockReturnValue({ data: invoice("outgoing"), isLoading: false, isError: false, error: null } as never);
    vi.mocked(useInvoiceRentalMatch).mockReturnValue({ data: undefined, isLoading: false, isError: false, error: null } as never);
    render(<InvoiceDetailView invoiceId="inv-1" />);
    expect(screen.queryByRole("button", { name: "Sil" })).not.toBeInTheDocument();
  });
});
