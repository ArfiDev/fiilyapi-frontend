import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { InvoiceCreateView } from "./InvoiceCreateView";
import { useEmployers } from "@/lib/api/hooks/useEmployers";
import { useProgressPayments } from "@/lib/api/hooks/useProgressPayments";
import { useCreateInvoice, useInvoiceAction } from "@/lib/api/hooks/useInvoiceMutations";
import { useSession } from "@/components/shell/SessionProvider";
import { meFixture } from "@/lib/auth/page-grants.testkit";
import { BackendError } from "@/lib/api/unwrap";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";

// Sayfa izinleri ağ isteği atmaz, kaynağı `useSession`'dır.
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("@/lib/api/hooks/useEmployers", () => ({ useEmployers: vi.fn() }));
vi.mock("@/lib/api/hooks/useProgressPayments", () => ({ useProgressPayments: vi.fn() }));
vi.mock("@/lib/api/hooks/useInvoiceMutations", () => ({
  useCreateInvoice: vi.fn(),
  useInvoiceAction: vi.fn(),
}));

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn() }),
}));

function queryStub(data: unknown) {
  return { data, isLoading: false, isError: false, error: null } as never;
}

const createMutate = vi.fn();
const actionMutate = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useSession).mockReturnValue({
    me: meFixture(), // IZN-F6a · tam sayfa erişimi (mali.fatura Düzenler)
    isLoading: false,
  } as ReturnType<typeof useSession>);
  vi.mocked(useEmployers).mockReturnValue(queryStub({ items: [] }));
  vi.mocked(useProgressPayments).mockReturnValue(queryStub({ items: [] }));
  vi.mocked(useCreateInvoice).mockReturnValue({
    mutate: createMutate,
    mutateAsync: vi.fn(),
    isPending: false,
  } as never);
  vi.mocked(useInvoiceAction).mockReturnValue({
    mutate: actionMutate,
    mutateAsync: vi.fn(),
    isPending: false,
  } as never);
});

describe("InvoiceCreateView — kalemsiz fatura kapısı", () => {
  it("kalem tablosuna dokunulmadan 'Taslak Kaydet'e basılırsa POST ATILMAZ ve hata basılır", () => {
    render(<InvoiceCreateView />);
    // Alıcı adı elle girilir; fatura tarihi zaten bugünle dolu gelir.
    fireEvent.change(screen.getByTestId("fat-party-name"), {
      target: { value: "Beta İnşaat A.Ş." },
    });

    fireEvent.click(screen.getByTestId("fat-save-draft"));

    expect(createMutate).not.toHaveBeenCalled();
    expect(screen.getByTestId("fat-form-error")).toHaveTextContent("En az bir kalem gereklidir.");
  });

  it("kalemsiz formda 'GİB'e Gönder' de POST atmaz", () => {
    render(<InvoiceCreateView />);
    fireEvent.change(screen.getByTestId("fat-party-name"), {
      target: { value: "Beta İnşaat A.Ş." },
    });

    fireEvent.click(screen.getByTestId("fat-save-send"));

    expect(createMutate).not.toHaveBeenCalled();
    expect(actionMutate).not.toHaveBeenCalled();
    expect(screen.getByTestId("fat-form-error")).toHaveTextContent("En az bir kalem gereklidir.");
  });

  it("tek dolu kalem varsa kapı AÇILIR: gövde kalemiyle POST edilir", () => {
    render(<InvoiceCreateView />);
    fireEvent.change(screen.getByTestId("fat-party-name"), {
      target: { value: "Beta İnşaat A.Ş." },
    });
    fireEvent.change(screen.getByLabelText("1. kalem açıklaması"), {
      target: { value: "Kaba inşaat imalatı" },
    });
    fireEvent.change(screen.getByLabelText("1. kalem miktarı"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("1. kalem birim fiyatı"), { target: { value: "1500" } });

    fireEvent.click(screen.getByTestId("fat-save-draft"));

    expect(createMutate).toHaveBeenCalledTimes(1);
    const body = createMutate.mock.calls[0]?.[0] as { lines: unknown[] };
    expect(body.lines).toHaveLength(1);
  });
});

describe("InvoiceCreateView — sunucu 403'ü de AccessDenied'e döner (O5a-131)", () => {
  // InvoicesView.tsx ve InvoiceDetailView.tsx `isForbidden(query.error)`i
  // istemci izin matrisine (permission.canView) EK olarak kontrol eder —
  // sunucu izni geç ANLIK olarak iptal edebilir (rol değişimi, kapsam
  // daraltma). InvoiceCreateView bu deseni employersQuery/progressPaymentsQuery
  // için tekrarlamıyordu; formu (ve gizli veriyi) 403 alan bir kullanıcıya
  // ÇIPLAK gösteriyordu.
  it("employersQuery 403 dönerse form DEĞİL AccessDenied basılır", () => {
    vi.mocked(useEmployers).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new BackendError(403, null),
    } as never);

    render(<InvoiceCreateView />);

    expect(screen.getByText("Bu alana yetkiniz yok")).toBeInTheDocument();
    expect(screen.queryByTestId("fat-party-name")).not.toBeInTheDocument();
  });

  it("progressPaymentsQuery 403 dönerse form DEĞİL AccessDenied basılır", () => {
    vi.mocked(useProgressPayments).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new BackendError(403, null),
    } as never);

    render(<InvoiceCreateView />);

    expect(screen.getByText("Bu alana yetkiniz yok")).toBeInTheDocument();
    expect(screen.queryByTestId("fat-party-name")).not.toBeInTheDocument();
  });

  it("500 gibi 403 OLMAYAN hatada AccessDenied basılmaz (form kendi hata yolunu işletir)", () => {
    vi.mocked(useEmployers).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new BackendError(500, null),
    } as never);

    render(<InvoiceCreateView />);

    expect(screen.queryByText("Bu alana yetkiniz yok")).not.toBeInTheDocument();
  });
});

describe("InvoiceCreateView — SEKME-F1.3b kaydedilmemiş değişiklik kaydı", () => {
  it("açıldı/dokunulmadı → false; alıcı adı değişti → true; başarılı kayıt → false (unmount)", async () => {
    const user = userEvent.setup();
    createMutate.mockImplementation((_body, opts: { onSuccess: (data: { id: string }) => void }) =>
      opts.onSuccess({ id: "inv-1" }),
    );
    const { unmount } = render(<InvoiceCreateView />);
    expect(unsavedRegistry.hasUnsaved()).toBe(false);

    await user.type(screen.getByTestId("fat-party-name"), "ACME");
    expect(unsavedRegistry.hasUnsaved()).toBe(true);

    unmount();
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });
});
