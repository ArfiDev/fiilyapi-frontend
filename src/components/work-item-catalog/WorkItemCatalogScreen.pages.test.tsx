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

  // IZN-F5b · madde 7 — WORK_ITEM_CATALOG_EDIT yalnız teklif.is_kalemi_katalogu; kardeş sayfa yazdırmaz.
  it("yalnız teklif.sablonlar Düzenler → liste açılır ama '+ Kalem Ekle' YOK", async () => {
    perm.level = "view";
    session(meFixture({ pages: { "teklif.sablonlar": pageGrant("edit") } }));
    renderScreen();
    await screen.findByText("Beton döküm");
    expect(screen.queryByRole("button", ADD)).toBeNull();
  });

  // IZN-F6a · modül-izni düşüşü KALKTI: grant yoksa kapı KAPALI (fail-closed).
  it("pages boş → AccessDenied (modül none de full de karar vermez)", async () => {
    perm.level = "none";
    session(meFixture({ pages: {} }));
    const { unmount } = renderScreen();
    expect(await screen.findByText(DENIED)).toBeInTheDocument();
    unmount();
    perm.level = "full";
    renderScreen();
    expect(await screen.findByText(DENIED)).toBeInTheDocument();
    expect(screen.queryByRole("button", ADD)).toBeNull();
  });
});
