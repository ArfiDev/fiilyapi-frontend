import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";

import { useSession } from "@/components/shell/SessionProvider";
import { meFixture, pageGrant } from "@/lib/auth/page-grants.testkit";

import { BETON, DEMIR, KAB, mockGets, renderScreen } from "./catalog-test-utils";

// IZN-F5b madde 10 · Birim Oran Kataloğu yazma (POST/PATCH /earned-value/catalog) = YALNIZ
// planlama.birim_oran_katalogu Düzenler (UNIT_RATE_CATALOG_EDIT); disiplin yönetimi sayfası AÇMAZ.
vi.mock("@/lib/api/client", () => ({
  backendClient: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), DELETE: vi.fn() },
}));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
// Modül izni bilerek view: grant'sız (geri uyum) karar KAPALI olsun.

function session(me: ReturnType<typeof meFixture>) {
  vi.mocked(useSession).mockReturnValue({ me, isLoading: false } as ReturnType<typeof useSession>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGets({ disciplines: [KAB], catalog: [BETON, DEMIR] });
});

describe("UnitRateCatalogScreen · yazma kapısı UNIT_RATE_CATALOG_EDIT (IZN-F5b)", () => {
  it("planlama.birim_oran_katalogu Düzenler → '+ Yeni iş tipi' var", async () => {
    session(meFixture({ pages: { "planlama.birim_oran_katalogu": pageGrant("edit") } }));
    renderScreen();
    expect(await screen.findByRole("button", { name: "+ Yeni iş tipi" })).toBeInTheDocument();
  });

  it("yalnız planlama.disiplin_yonetimi Düzenler → '+ Yeni iş tipi' YOK (liste yine görünür)", async () => {
    session(meFixture({ pages: { "planlama.disiplin_yonetimi": pageGrant("edit") } }));
    renderScreen();
    await screen.findByRole("button", { name: "Beton döküm" });
    expect(screen.queryByRole("button", { name: "+ Yeni iş tipi" })).not.toBeInTheDocument();
  });

  it("'Disiplinleri yönet' modalı AYRI uca yazar: yalnız birim oran kataloğu Düzenler → etiket 'Disiplinler' (salt okunur)", async () => {
    session(meFixture({ pages: { "planlama.birim_oran_katalogu": pageGrant("edit") } }));
    renderScreen();
    expect(await screen.findByRole("button", { name: "+ Yeni iş tipi" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Disiplinler" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Disiplinleri yönet" })).not.toBeInTheDocument();
  });

  it("planlama.disiplin_yonetimi Düzenler → 'Disiplinleri yönet' etiketi", async () => {
    session(meFixture({ pages: { "planlama.disiplin_yonetimi": pageGrant("edit") } }));
    renderScreen();
    expect(await screen.findByRole("button", { name: "Disiplinleri yönet" })).toBeInTheDocument();
  });

  it("Görür var Düzenler yok → 'Görüntüleyici · yalnız okuma' şeridi", async () => {
    session(meFixture({ pages: { "planlama.birim_oran_katalogu": pageGrant("view") } }));
    renderScreen();
    await screen.findByRole("button", { name: "Beton döküm" });
    expect(screen.getByRole("note")).toHaveTextContent("Görüntüleyici · yalnız okuma");
  });

  it("Görür de yok (hücre none) → genel 'Salt okunur' şeridi", async () => {
    session(meFixture({ pages: { "planlama.birim_oran_katalogu": pageGrant("none") } }));
    renderScreen();
    await screen.findByRole("button", { name: "Beton döküm" });
    expect(screen.getByRole("note")).toHaveTextContent("Salt okunur · Birim Oran Kataloğu sayfasında Düzenler yetkisi gerekir");
  });
});
