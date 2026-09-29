import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { BETON, KAB, mockGets, renderScreen } from "./catalog-test-utils";

// DSC-F1.3 · kısıtlı kullanıcıda boş katalog → ortak bildirim ("Katalog boş" değil).
const scope = vi.hoisted(() => ({ value: { isRestricted: false, names: [] as string[] } }));
vi.mock("@/lib/auth/useDisciplineScope", () => ({ useDisciplineScope: () => scope.value }));

vi.mock("@/lib/api/client", () => ({
  backendClient: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), DELETE: vi.fn() },
}));
vi.mock("@/lib/auth/useModulePermission", () => ({
  useModulePermission: () => ({ level: "full", canView: true, canWrite: true, canDelete: true }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  scope.value = { isRestricted: false, names: [] };
  mockGets({ disciplines: [KAB], catalog: [] });
});

describe("UnitRateCatalogScreen — kısıtlı boş katalog (DSC-F1.3)", () => {
  it("kısıtlı + boş katalog → ortak bildirim, boş durum CTA'sı yok", async () => {
    scope.value = { isRestricted: true, names: ["Kaba İnşaat"] };
    renderScreen();
    expect(await screen.findByText("Disiplininize ait kayıt yok.")).toBeInTheDocument();
    expect(screen.queryByText("Katalog boş")).not.toBeInTheDocument();
    // Yalnız araç çubuğundaki düğme kalır; boş durumun ikizi (CTA) basılmaz.
    expect(screen.getAllByRole("button", { name: "+ Yeni iş tipi" })).toHaveLength(1);
  });

  it("atamasız + boş katalog → bugünkü 'Katalog boş' + ekleme girişi aynen", async () => {
    renderScreen();
    expect(await screen.findByText("Katalog boş")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "+ Yeni iş tipi" })).toHaveLength(2);
    expect(screen.queryByText("Disiplininize ait kayıt yok.")).not.toBeInTheDocument();
  });

  it("kısıtlı + katalog dolu ama arama sonucu boş → 'Filtreye uyan iş tipi yok.' (bildirim değil)", async () => {
    scope.value = { isRestricted: true, names: ["Kaba İnşaat"] };
    mockGets({ disciplines: [KAB], catalog: [BETON] });
    const user = userEvent.setup();
    renderScreen();
    await screen.findByRole("button", { name: "Beton döküm" });
    await user.type(screen.getByPlaceholderText("İş tipi ara"), "zzz");
    expect(screen.getByText("Filtreye uyan iş tipi yok.")).toBeInTheDocument();
    expect(screen.queryByText("Disiplininize ait kayıt yok.")).not.toBeInTheDocument();
  });
});
