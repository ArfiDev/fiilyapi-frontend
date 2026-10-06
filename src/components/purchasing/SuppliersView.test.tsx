import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { SuppliersView } from "./SuppliersView";
import { useSuppliers } from "@/lib/api/hooks/useSuppliers";
import { useSession } from "@/components/shell/SessionProvider";
import { BackendError } from "@/lib/api/unwrap";
import type { SupplierCard, SupplierListResponse } from "@/lib/api/hooks/useSuppliers";
import { ALL_PAGE_KEYS, meFixture, pagesFor } from "@/lib/auth/page-grants.testkit";

vi.mock("@/lib/api/hooks/useSuppliers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useSuppliers")>()),
  useSuppliers: vi.fn(),
}));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
// Diyalog bu dosyada yalnız AÇILIŞIYLA sınanır — ağ katmanı susturulur.
vi.mock("@/lib/api/hooks/useSupplierMutations", () => ({
  useCreateSupplier: () => ({ mutate: vi.fn(), isPending: false }),
}));

function supplier(overrides: Partial<SupplierCard> = {}): SupplierCard {
  return {
    id: "sup-1",
    name: "Demirsan A.Ş.",
    category: "Demir-Çelik",
    tax_no: "1234567890",
    phone: "0212 555 00 01",
    payment_terms: "days_30",
    is_active: true,
    created_at: "2026-01-04T09:00:00Z",
    orders_total_this_year: "2400000.00",
    orders_count_this_year: 17,
    ...overrides,
  };
}

function list(overrides: Partial<SupplierListResponse> = {}): SupplierListResponse {
  return { items: [supplier()], total: 1, limit: 200, offset: 0, ...overrides };
}

function queryStub(
  data: unknown,
  extra: Partial<{ isLoading: boolean; isError: boolean; error: unknown }> = {},
) {
  return {
    data,
    isLoading: extra.isLoading ?? false,
    isError: extra.isError ?? false,
    error: extra.error ?? null,
  } as unknown as ReturnType<typeof useSuppliers>;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useSession).mockReturnValue({
    me: meFixture(),
    isLoading: false,
  } as ReturnType<typeof useSession>);
  vi.mocked(useSuppliers).mockReturnValue(queryStub(list()));
});

describe("SuppliersView — TED başlık, şerit ve yetki", () => {
  it("mockup başlığını ve breadcrumb'ını basar (33-35)", () => {
    render(<SuppliersView />);
    expect(screen.getByRole("heading", { name: "Tedarikçiler" })).toBeInTheDocument();
    expect(screen.getByText("Stok & Satınalma")).toBeInTheDocument();
  });

  it("ortak sekme şeridinde YALNIZ 'Tedarikçiler' aktiftir", () => {
    render(<SuppliersView />);
    const current = screen
      .getAllByRole("link")
      .filter((link) => link.getAttribute("aria-current") === "page");
    expect(current).toHaveLength(1);
    expect(current[0].textContent).toBe("Tedarikçiler");
  });

  it("yazma yetkisi yoksa ne düğme ne ekleme kartı basılır", () => {
    vi.mocked(useSession).mockReturnValue({
      me: meFixture({ pages: pagesFor(ALL_PAGE_KEYS, "view") }),
      isLoading: false,
    } as ReturnType<typeof useSession>);
    render(<SuppliersView />);
    expect(screen.queryByRole("button", { name: "+ Tedarikçi Ekle" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("ted-add-card")).not.toBeInTheDocument();
  });

  it("403 yanıtında erişim reddedilir", () => {
    vi.mocked(useSuppliers).mockReturnValue(
      queryStub(undefined, { isError: true, error: new BackendError(403, {}) }),
    );
    render(<SuppliersView />);
    expect(screen.queryByRole("heading", { name: "Tedarikçiler" })).not.toBeInTheDocument();
  });

  it("liste kırpıldığında sınır göstergesi basar", () => {
    vi.mocked(useSuppliers).mockReturnValue(queryStub(list({ total: 420 })));
    render(<SuppliersView />);
    expect(screen.getByTestId("ted-truncation-notice").textContent).toContain("toplam 420");
  });
});

describe("SuppliersView — kart ızgarası (TED 41-122)", () => {
  it("künye alanlarını sunucudan basar", () => {
    render(<SuppliersView />);
    expect(screen.getByText("Demirsan A.Ş.")).toBeInTheDocument();
    expect(screen.getByText("Demir-Çelik")).toBeInTheDocument();
    expect(screen.getByText("1234567890")).toBeInTheDocument();
    expect(screen.getByText("0212 555 00 01")).toBeInTheDocument();
    expect(screen.getByText("30 gün")).toBeInTheDocument();
    expect(screen.getByText("Aktif")).toBeInTheDocument();
  });

  it("'Bu Yıl Toplam Sipariş' SUNUCU türevidir; istemci toplamaz (53)", () => {
    render(<SuppliersView />);
    expect(screen.getByTestId("ted-total-sup-1").textContent).toBe("₺ 2,4M");
  });

  // Şema açıklaması: siparişsiz tedarikçide değer `null` DEĞİL SIFIRDIR.
  it("hiç sipariş yoksa sıfırı 'veri yok' gibi göstermez", () => {
    vi.mocked(useSuppliers).mockReturnValue(
      queryStub(
        list({
          items: [supplier({ orders_total_this_year: "0.00", orders_count_this_year: 0 })],
        }),
      ),
    );
    render(<SuppliersView />);
    expect(screen.getByTestId("ted-total-sup-1").textContent).toBe("₺ 0");
    expect(screen.getByText("Bu yıl hiç sipariş verilmedi")).toBeInTheDocument();
  });

  // TED 55-58: alan SİLİNMEZ, yıldız İCAT EDİLMEZ.
  it("PUAN satırı '—' + görünür gerekçeyle basılır", () => {
    render(<SuppliersView />);
    expect(screen.getByText("Tedarikçi değerlendirme özelliği henüz yok")).toBeInTheDocument();
    expect(screen.getByTitle("Tedarikçi değerlendirme özelliği henüz yok")).toBeInTheDocument();
  });

  it("pasif tedarikçinin rozeti düşer (mockup'ta çizilmedi, kart silinmez)", () => {
    vi.mocked(useSuppliers).mockReturnValue(
      queryStub(list({ items: [supplier({ is_active: false })] })),
    );
    render(<SuppliersView />);
    expect(screen.getByText("Pasif")).toBeInTheDocument();
  });

  it("boş listede mockup'ın örnek kartlarını BASMAZ", () => {
    vi.mocked(useSuppliers).mockReturnValue(queryStub(list({ items: [], total: 0 })));
    render(<SuppliersView />);
    expect(screen.queryByText("Demirsan A.Ş.")).not.toBeInTheDocument();
    expect(screen.getByTestId("ted-empty")).toBeInTheDocument();
  });
});

describe("SuppliersView — '+ Tedarikçi Ekle' diyaloğu (spec K5)", () => {
  it("başlık düğmesi diyaloğu açar", () => {
    render(<SuppliersView />);
    fireEvent.click(screen.getByRole("button", { name: "+ Tedarikçi Ekle" }));
    expect(screen.getByText("Yeni Tedarikçi")).toBeInTheDocument();
  });

  it("kesikli ekleme kartı AYNI diyaloğu açar (125-128)", () => {
    render(<SuppliersView />);
    fireEvent.click(screen.getByTestId("ted-add-card"));
    expect(screen.getByText("Yeni Tedarikçi")).toBeInTheDocument();
  });
});
