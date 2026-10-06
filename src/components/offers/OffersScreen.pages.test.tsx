import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { useSession } from "@/components/shell/SessionProvider";
import { backendClient } from "@/lib/api/client";
import { meFixture, pageGrant } from "@/lib/auth/page-grants.testkit";

import { OFFER_SENT, makeResponse } from "./offer-fixtures";
import { OffersScreen } from "./OffersScreen";

// IZN-F5-ön — teklif listesi görüntüleme kapısı = sözleşme/teklif sayfaları Görür (VEYA); yazma = Düzenler.
const perm = vi.hoisted(() => ({ level: "full" as string | undefined }));

vi.mock("@/lib/api/client", () => ({
  backendClient: { GET: vi.fn(), POST: vi.fn(), DELETE: vi.fn() },
}));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("@/lib/auth/useModulePermission", () => ({
  useModulePermission: () => ({ level: perm.level, canView: perm.level !== "none", canWrite: true, canDelete: true }),
}));
vi.mock("@/lib/auth/useDisciplineScope", () => ({ useDisciplineScope: () => ({ isRestricted: false, names: [] }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

function ok(data: unknown) {
  return { data, error: undefined, response: new Response(null, { status: 200 }) } as never;
}

function session(me: ReturnType<typeof meFixture>) {
  vi.mocked(useSession).mockReturnValue({ me, isLoading: false } as ReturnType<typeof useSession>);
}

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <OffersScreen />
    </QueryClientProvider>,
  );
}

const NEW_OFFER = "+ Yeni Teklif";

beforeEach(() => {
  vi.clearAllMocks();
  perm.level = "full";
  vi.mocked(backendClient.GET).mockImplementation((async (path: string) => {
    if (path === "/offers") return ok(makeResponse([OFFER_SENT]));
    if (path === "/employers") return ok({ items: [], total: 0 });
    if (path === "/catalog/items") return ok({ items: [] });
    if (path === "/offers/templates") return ok({ items: [], total: 0 });
    throw new Error(`beklenmeyen GET ${path}`);
  }) as never);
});

describe("OffersScreen · sayfa izni kapıları (IZN-F5-ön)", () => {
  it("teklif sayfası Görür → liste açılır (modül none olsa bile), yazma yok", async () => {
    perm.level = "none";
    session(meFixture({ pages: { "teklif.teklif_hazirlama": pageGrant("view") } }));
    renderScreen();
    await screen.findByText("TKL-2026-0013");
    expect(screen.queryByRole("link", { name: NEW_OFFER })).toBeNull();
    expect(screen.getByText(/^Salt okunur/)).toBeInTheDocument();
  });

  it("sözleşme/teklif sayfalarında yalnız none → AccessDenied (modül full olsa bile), uç çağrılmaz", async () => {
    session(meFixture({ pages: { "teklif.teklif_hazirlama": pageGrant("none") } }));
    renderScreen();
    expect(await screen.findByText("Bu alana yetkiniz yok")).toBeInTheDocument();
    expect(vi.mocked(backendClient.GET)).not.toHaveBeenCalled();
  });

  it("Düzenler → yeni teklif bağlantısı var (modül view olsa bile)", async () => {
    perm.level = "view";
    session(meFixture({ pages: { "teklif.teklif_hazirlama": pageGrant("edit") } }));
    renderScreen();
    await screen.findByText("TKL-2026-0013");
    expect(screen.getByRole("link", { name: NEW_OFFER })).toBeInTheDocument();
    expect(screen.queryByText(/^Salt okunur|^Görüntüleyici/)).toBeNull();
  });

  // IZN-F5b · madde 7 — OFFERS_EDIT yalnız teklif.teklif_hazirlama; kardeş sayfa (şablonlar) yazdırmaz.
  it("yalnız teklif.sablonlar Düzenler → liste açılır ama yeni teklif bağlantısı YOK", async () => {
    perm.level = "view";
    session(meFixture({ pages: { "teklif.sablonlar": pageGrant("edit") } }));
    renderScreen();
    await screen.findByText("TKL-2026-0013");
    expect(screen.queryByRole("link", { name: NEW_OFFER })).toBeNull();
  });

  // IZN-F6a · modül-izni düşüşü KALKTI: grant yoksa kapı KAPALI (fail-closed).
  it("pages boş → AccessDenied (modül none de full de karar vermez)", async () => {
    perm.level = "none";
    session(meFixture({ pages: {} }));
    const { unmount } = renderScreen();
    expect(await screen.findByText("Bu alana yetkiniz yok")).toBeInTheDocument();
    unmount();
    perm.level = "full";
    renderScreen();
    expect(await screen.findByText("Bu alana yetkiniz yok")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: NEW_OFFER })).toBeNull();
  });
});
