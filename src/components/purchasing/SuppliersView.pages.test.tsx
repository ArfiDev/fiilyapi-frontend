import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { SuppliersView } from "./SuppliersView";
import { useSuppliers } from "@/lib/api/hooks/useSuppliers";
import { useSession } from "@/components/shell/SessionProvider";
import { meFixture, pageGrant } from "@/lib/auth/page-grants.testkit";
import type { SupplierCard, SupplierListResponse } from "@/lib/api/hooks/useSuppliers";

// IZN-F2.x — tedarikçi ekle/düzenle = stok.tedarikciler Düzenler (VEYA siparişler / teklif karşılaştırma).
vi.mock("@/lib/api/hooks/useSuppliers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useSuppliers")>()),
  useSuppliers: vi.fn(),
}));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
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

function session(me: ReturnType<typeof meFixture>) {
  vi.mocked(useSession).mockReturnValue({ me, isLoading: false } as ReturnType<typeof useSession>);
}

const ADD = "+ Tedarikçi Ekle";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useSuppliers).mockReturnValue(queryStub(list()));
});

describe("SuppliersView · sayfa izni kapısı (IZN-F2.x)", () => {
  it("stok.tedarikciler Düzenler → ekleme düğmesi ve kartı var", () => {
    session(meFixture({ pages: { "stok.tedarikciler": pageGrant("edit") }, permissions: { procurement: "view" } }));
    render(<SuppliersView />);
    expect(screen.getByRole("button", { name: ADD })).toBeInTheDocument();
    expect(screen.getByTestId("ted-add-card")).toBeInTheDocument();
  });

  it("ikiz kapı: stok.siparisler Düzenler → ekleme düğmesi var", () => {
    session(meFixture({ pages: { "stok.tedarikciler": pageGrant("view"), "stok.siparisler": pageGrant("edit") } }));
    render(<SuppliersView />);
    expect(screen.getByRole("button", { name: ADD })).toBeInTheDocument();
  });

  it("yalnız Görür → düğme YOK (modül izni full olsa bile)", () => {
    session(meFixture({ pages: { "stok.tedarikciler": pageGrant("view") }, permissions: { procurement: "full" } }));
    render(<SuppliersView />);
    expect(screen.queryByRole("button", { name: ADD })).toBeNull();
    expect(screen.queryByTestId("ted-add-card")).toBeNull();
  });

  it("Onaylar bayrağı (stok.satinalma_talepleri) tedarikçi yazmasını AÇMAZ", () => {
    session(
      meFixture({
        pages: { "stok.tedarikciler": pageGrant("view"), "stok.satinalma_talepleri": pageGrant("edit", true) },
      }),
    );
    render(<SuppliersView />);
    expect(screen.queryByRole("button", { name: ADD })).toBeNull();
  });

  it("pages boş → eski davranış (procurement full → var, view → yok)", () => {
    session(meFixture({ pages: {}, permissions: { procurement: "full" } }));
    const { unmount } = render(<SuppliersView />);
    expect(screen.getByRole("button", { name: ADD })).toBeInTheDocument();
    unmount();
    session(meFixture({ pages: {}, permissions: { procurement: "view" } }));
    render(<SuppliersView />);
    expect(screen.queryByRole("button", { name: ADD })).toBeNull();
  });
});
