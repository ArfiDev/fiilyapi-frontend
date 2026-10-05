import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { InvoicePaymentsPanel } from "./InvoicePaymentsPanel";
import { useInvoicePayments } from "@/lib/api/hooks/useInvoiceDetail";
import { useBankAccounts } from "@/lib/api/hooks/useBankAccounts";
import { useCreateInvoicePayment } from "@/lib/api/hooks/useInvoiceMutations";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";

vi.mock("@/lib/api/hooks/useInvoiceDetail", () => ({ useInvoicePayments: vi.fn() }));
vi.mock("@/lib/api/hooks/useBankAccounts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useBankAccounts")>()),
  useBankAccounts: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useInvoiceMutations", () => ({
  useCreateInvoicePayment: vi.fn(),
}));
vi.mock("@/components/delete-confirm/DeleteRecordDialog", () => ({
  DeleteRecordDialog: ({ kind, recordId, onClose }: { kind: string; recordId: string; onClose: () => void }) => (
    <div data-testid="delete-dialog-stub" data-kind={kind} data-record-id={recordId}>
      <button type="button" onClick={onClose}>
        stub-kapat
      </button>
    </div>
  ),
}));

const createMutate = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useInvoicePayments).mockReturnValue({
    data: { items: [], total: 0, paid_total: "0", remaining: "1000" },
    isError: false,
    error: null,
  } as never);
  vi.mocked(useBankAccounts).mockReturnValue({
    data: { items: [{ id: "acc-1", bank_name: "Ziraat", display_name: "Ana Hesap", iban: null }] },
  } as never);
  vi.mocked(useCreateInvoicePayment).mockReturnValue({
    mutate: createMutate,
    isPending: false,
  } as never);
});

function fillRequired() {
  fireEvent.change(screen.getByTestId("fat-payment-account"), { target: { value: "acc-1" } });
  fireEvent.change(screen.getByTestId("fat-payment-amount"), { target: { value: "500" } });
}

describe("InvoicePaymentsPanel — SEKME-F1.3b kaydedilmemiş değişiklik kaydı", () => {
  it("açıldı/dokunulmadı → false; alanlar dolduruldu → true; başarılı kayıt → false (yalnız tutar sıfırlanır)", () => {
    createMutate.mockImplementation((_body, opts: { onSuccess: () => void }) => opts.onSuccess());
    render(
      <InvoicePaymentsPanel invoiceId="inv-1" isIncoming={false} canWrite canDelete={false} />,
    );
    expect(unsavedRegistry.hasUnsaved()).toBe(false);

    fillRequired();
    expect(unsavedRegistry.hasUnsaved()).toBe(true);

    fireEvent.click(screen.getByTestId("fat-payment-submit"));
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });

  it("kaydedilmiş alanlar (hesap/tarih) sonraki turda YENİDEN kirli SAYILMAZ, yalnız yeni tutar kirletir", () => {
    createMutate.mockImplementation((_body, opts: { onSuccess: () => void }) => opts.onSuccess());
    render(
      <InvoicePaymentsPanel invoiceId="inv-1" isIncoming={false} canWrite canDelete={false} />,
    );
    fillRequired();
    fireEvent.click(screen.getByTestId("fat-payment-submit"));
    expect(unsavedRegistry.hasUnsaved()).toBe(false);

    fireEvent.change(screen.getByTestId("fat-payment-amount"), { target: { value: "200" } });
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
  });
});

// SIL-F2.2 · tahsilat/ödeme silme ARTIK doğrudan DELETE atmaz (sunucu preview_token ister, yoksa 428):
// satır "Sil"i ortak silme penceresini ÖDEME KİMLİĞİYLE açar.
describe("InvoicePaymentsPanel — SIL-F2.2 ortak silme akışı", () => {
  function withPayment() {
    vi.mocked(useInvoicePayments).mockReturnValue({
      data: {
        items: [{ id: "pay-1", paid_on: "2026-03-05", method: "transfer", amount: "500" }],
        total: 1,
        paid_total: "500",
        remaining: "500",
      },
      isError: false,
      error: null,
    } as never);
  }

  it("canDelete iken satır Sil'i ortak pencereyi kind=payment ve ödeme kimliğiyle açar, kapatınca kaybolur", () => {
    withPayment();
    render(<InvoicePaymentsPanel invoiceId="inv-1" isIncoming={false} canWrite canDelete />);
    expect(screen.queryByTestId("delete-dialog-stub")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("fat-payment-delete"));

    const dialog = screen.getByTestId("delete-dialog-stub");
    expect(dialog).toHaveAttribute("data-kind", "payment");
    expect(dialog).toHaveAttribute("data-record-id", "pay-1");
    fireEvent.click(screen.getByRole("button", { name: "stub-kapat" }));
    expect(screen.queryByTestId("delete-dialog-stub")).not.toBeInTheDocument();
  });

  it("canDelete yoksa Sil kapalıdır ve pencere AÇILMAZ", () => {
    withPayment();
    render(<InvoicePaymentsPanel invoiceId="inv-1" isIncoming={false} canWrite canDelete={false} />);

    expect(screen.getByTestId("fat-payment-delete")).toBeDisabled();
    fireEvent.click(screen.getByTestId("fat-payment-delete"));
    expect(screen.queryByTestId("delete-dialog-stub")).not.toBeInTheDocument();
  });
});
