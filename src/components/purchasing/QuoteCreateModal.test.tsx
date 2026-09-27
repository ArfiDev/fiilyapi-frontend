import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { QuoteCreateModal } from "./QuoteCreateModal";
import { useCreateQuote } from "@/lib/api/hooks/useQuoteMutations";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";

vi.mock("@/lib/api/hooks/useQuoteMutations", () => ({ useCreateQuote: vi.fn() }));
vi.mock("@/lib/api/hooks/useSuppliers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useSuppliers")>()),
  useSuppliers: () => ({
    data: { items: [{ id: "sup-1", name: "Demirsan A.Ş." }] },
    isLoading: false,
    isError: false,
    error: null,
  }),
}));

const mutateMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useCreateQuote).mockReturnValue({
    mutate: mutateMock,
    isPending: false,
  } as unknown as ReturnType<typeof useCreateQuote>);
});

function fillRequired() {
  fireEvent.change(screen.getByLabelText("Tedarikçi"), { target: { value: "sup-1" } });
  fireEvent.change(screen.getByLabelText("Birim Fiyat"), { target: { value: "21500" } });
  fireEvent.change(screen.getByLabelText("Teslimat"), { target: { value: "3 iş günü" } });
}

describe("QuoteCreateModal — şemadan türeyen minimal diyalog (spec K5)", () => {
  it("YALNIZ kartın alanlarını sorar; uydurma alan yoktur", () => {
    render(<QuoteCreateModal requestId="pr-1" onClose={vi.fn()} />);
    for (const label of ["Tedarikçi", "Birim Fiyat", "Teslimat", "Garanti", "Ödeme"]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    // Toplam SUNUCUDA hesaplanır — gövdede yoktur, formda da sorulmaz.
    expect(screen.queryByLabelText("Toplam")).not.toBeInTheDocument();
  });

  it("zorunlu alanlar boşken ağa çıkmaz", () => {
    render(<QuoteCreateModal requestId="pr-1" onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(mutateMock).not.toHaveBeenCalled();
    expect(screen.getByText("Tedarikçi seçilmelidir.")).toBeInTheDocument();
  });

  it("nakliye DAHİL iken gövdeye shipping_cost KOYMAZ (422 kapısı)", () => {
    render(<QuoteCreateModal requestId="pr-1" onClose={vi.fn()} />);
    fillRequired();
    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(mutateMock).toHaveBeenCalledWith(
      {
        supplier_id: "sup-1",
        unit_price: "21500",
        delivery_time: "3 iş günü",
        payment_terms: "days_30",
        shipping_included: true,
      },
      expect.anything(),
    );
  });

  it("nakliye HARİÇ iken tutar sorulur ve gövdeye eklenir", () => {
    render(<QuoteCreateModal requestId="pr-1" onClose={vi.fn()} />);
    fillRequired();
    fireEvent.click(screen.getByLabelText("Nakliye dahil"));
    fireEvent.change(screen.getByLabelText("Nakliye Tutarı"), { target: { value: "8000" } });
    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(mutateMock.mock.calls[0][0]).toMatchObject({
      shipping_included: false,
      shipping_cost: "8000",
    });
  });

  it("nakliye hariçken tutar girilmezse ağa çıkmaz", () => {
    render(<QuoteCreateModal requestId="pr-1" onClose={vi.fn()} />);
    fillRequired();
    fireEvent.click(screen.getByLabelText("Nakliye dahil"));
    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(mutateMock).not.toHaveBeenCalled();
    expect(screen.getByText("Nakliye hariçse tutarı girilmelidir.")).toBeInTheDocument();
  });

  it("boş bırakılan garanti gövdeye HİÇ konmaz", () => {
    render(<QuoteCreateModal requestId="pr-1" onClose={vi.fn()} />);
    fillRequired();
    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(mutateMock.mock.calls[0][0]).not.toHaveProperty("warranty_note");
  });

  it("teslim süresi SERBEST METİNDİR — gün sayısına zorlanmaz", () => {
    render(<QuoteCreateModal requestId="pr-1" onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Tedarikçi"), { target: { value: "sup-1" } });
    fireEvent.change(screen.getByLabelText("Birim Fiyat"), { target: { value: "21500" } });
    fireEvent.change(screen.getByLabelText("Teslimat"), { target: { value: "Yarın sabah" } });
    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(mutateMock.mock.calls[0][0].delivery_time).toBe("Yarın sabah");
  });

  it("sunucu hatası diyalogda görünür kalır", () => {
    mutateMock.mockImplementation(
      (_body: unknown, options: { onError: (e: unknown) => void }) => {
        options.onError(new Error("bağlantı yok"));
      },
    );
    render(<QuoteCreateModal requestId="pr-1" onClose={vi.fn()} />);
    fillRequired();
    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(screen.getByText("Teklif kaydedilemedi.")).toBeInTheDocument();
  });

  it("SEKME-F1.3b · açıldı/dokunulmadı → false; alan dolduruldu → true; başarılı kayıt → false (kapanış)", () => {
    mutateMock.mockImplementation(
      (_body: unknown, options: { onSuccess: () => void }) => options.onSuccess(),
    );
    let unmount = () => {};
    const onClose = vi.fn(() => unmount());
    ({ unmount } = render(<QuoteCreateModal requestId="pr-1" onClose={onClose} />));
    expect(unsavedRegistry.hasUnsaved()).toBe(false);

    fillRequired();
    expect(unsavedRegistry.hasUnsaved()).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });
});
