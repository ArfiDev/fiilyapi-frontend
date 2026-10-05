import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";

import { backendClient } from "@/lib/api/client";
import { useSession } from "@/components/shell/SessionProvider";
import { meFixture, pageGrant } from "@/lib/auth/page-grants.testkit";

import { BETON, D_DUV, D_KAB } from "./work-item-fixtures";
import { getCalls, mockGets, renderScreen } from "./work-item-test-utils";

// IZN-F5-ön — Katalog görüntüleme kapısı = sözleşme/teklif sayfaları Görür (VEYA); yazma = Düzenler.
// Grant yoksa `contracts` izni (bugünkü karar).
const perm = vi.hoisted(() => ({ level: "full" as string | undefined }));

vi.mock("@/lib/api/client", () => ({
  backendClient: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn() },
}));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("@/lib/auth/useModulePermission", () => ({
  useModulePermission: () => ({ level: perm.level, canView: perm.level !== "none", canWrite: true, canDelete: true }),
}));
vi.mock("@/lib/auth/useDisciplineScope", () => ({ useDisciplineScope: () => ({ isRestricted: false, names: [] }) }));

function session(me: ReturnType<typeof meFixture>) {
  vi.mocked(useSession).mockReturnValue({ me, isLoading: false } as ReturnType<typeof useSession>);
}

const DENIED = "Bu alana yetkiniz yok";
const ADD = { name: "+ Kalem Ekle" } as const;

beforeEach(() => {
  vi.clearAllMocks();
  perm.level = "full";
  mockGets({ disciplines: [D_KAB, D_DUV], items: [BETON] });
});

describe("WorkItemCatalogScreen · sayfa izni kapıları (IZN-F5-ön)", () => {
  it("teklif.is_kalemi_katalogu Görür → liste açılır (contracts none olsa bile), yazma yok", async () => {
    perm.level = "none";
    session(meFixture({ pages: { "teklif.is_kalemi_katalogu": pageGrant("view") } }));
    renderScreen();
    await screen.findByText("Beton döküm");
    expect(screen.queryByRole("button", ADD)).toBeNull();
    expect(screen.getByText(/^Salt okunur/)).toBeInTheDocument();
  });

  it("sözleşme/teklif sayfalarında yalnız none → AccessDenied, katalog ucu çağrılmaz", async () => {
    session(meFixture({ pages: { "teklif.is_kalemi_katalogu": pageGrant("none") } }));
    renderScreen();
    expect(await screen.findByText(DENIED)).toBeInTheDocument();
    expect(getCalls()).toEqual([]);
    expect(vi.mocked(backendClient.GET)).not.toHaveBeenCalled();
  });

  it("Düzenler → '+ Kalem Ekle' var (contracts view olsa bile)", async () => {
    perm.level = "view";
    session(meFixture({ pages: { "teklif.is_kalemi_katalogu": pageGrant("edit") } }));
    renderScreen();
    await screen.findByText("Beton döküm");
    expect(screen.getByRole("button", ADD)).toBeInTheDocument();
  });

  it("pages boş → eski davranış (contracts none → AccessDenied, full → yazma var)", async () => {
    perm.level = "none";
    session(meFixture({ pages: {} }));
    const { unmount } = renderScreen();
    expect(await screen.findByText(DENIED)).toBeInTheDocument();
    unmount();
    perm.level = "full";
    renderScreen();
    await screen.findByText("Beton döküm");
    expect(screen.getByRole("button", ADD)).toBeInTheDocument();
  });
});
