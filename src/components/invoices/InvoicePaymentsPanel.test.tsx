import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { InvoicePaymentsPanel } from "./InvoicePaymentsPanel";
import { useInvoicePayments } from "@/lib/api/hooks/useInvoiceDetail";
import { useBankAccounts } from "@/lib/api/hooks/useBankAccounts";
import {
  useCreateInvoicePayment,
  useDeleteInvoicePayment,
} from "@/lib/api/hooks/useInvoiceMutations";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";

vi.mock("@/lib/api/hooks/useInvoiceDetail", () => ({ useInvoicePayments: vi.fn() }));
vi.mock("@/lib/api/hooks/useBankAccounts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useBankAccounts")>()),
  useBankAccounts: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useInvoiceMutations", () => ({
  useCreateInvoicePayment: vi.fn(),
  useDeleteInvoicePayment: vi.fn(),
}));

const createMutate = vi.fn();
const deleteMutate = vi.fn();

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
  vi.mocked(useDeleteInvoicePayment).mockReturnValue({
    mutate: deleteMutate,
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
