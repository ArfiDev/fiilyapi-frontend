import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { backendClient } from "@/lib/api/client";

import { OFFER_SENT, makeOffer, makeResponse, makeSummary } from "./offer-fixtures";
import { OffersScreen } from "./OffersScreen";

// TKL-F5.5 · Kazanıldı kartındaki "N dönüştürülmedi" düğmesi `GET /offers?conversion=won_not_converted` ister.

const perm = vi.hoisted(() => ({ levels: { contracts: "full", projects: "admin" } as Record<string, string | undefined> }));

vi.mock("@/lib/api/client", () => ({ backendClient: { GET: vi.fn(), POST: vi.fn(), DELETE: vi.fn() } }));
vi.mock("@/lib/auth/useModulePermission", () => ({
  useModulePermission: (moduleKey: string) => {
    const level = perm.levels[moduleKey];
    return { level, canView: level !== "none", canWrite: true, canDelete: true };
  },
}));
vi.mock("@/lib/auth/useDisciplineScope", () => ({ useDisciplineScope: () => ({ isRestricted: false, names: [] }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

function ok(data: unknown) {
  return { data, error: undefined, response: new Response(null, { status: 200 }) } as never;
}

const PENDING = makeOffer({ id: "offer-08", offer_no: "TKL-2026-0008", status: "won", conversion_state: "won_not_converted" });

function listQueries(): Array<Record<string, unknown>> {
  return vi
    .mocked(backendClient.GET)
    .mock.calls.filter((call) => String(call[0]) === "/offers")
    .map((call) => (call[1] as { params: { query: Record<string, unknown> } }).params.query);
}

beforeEach(() => {
  vi.clearAllMocks();
  perm.levels = { contracts: "full", projects: "admin" };
  vi.mocked(backendClient.GET).mockImplementation((async (path: string, init?: { params?: { query?: { conversion?: string } } }) => {
    if (path === "/offers") {
      const items = init?.params?.query?.conversion === "won_not_converted" ? [PENDING] : [OFFER_SENT, PENDING];
      return ok(makeResponse(items, { summary: makeSummary({ won_not_converted_count: 1 }) }));
    }
    if (path === "/employers") return ok({ items: [], total: 0 });
    if (path === "/catalog/items") return ok({ items: [] });
    if (path === "/offers/templates") return ok({ items: [], total: 0 });
    throw new Error(`beklenmeyen GET ${path}`);
  }) as never);
});

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <OffersScreen />
    </QueryClientProvider>,
  );
}

describe("'N dönüştürülmedi' kart süzgeci", () => {
  it("tıklama → istek conversion=won_not_converted taşır; tekrar tıklama süzgeci kaldırır", async () => {
    const user = userEvent.setup();
    renderScreen();
    expect(listQueries().at(-1)).not.toHaveProperty("conversion");
    await user.click(await screen.findByRole("button", { name: "1 dönüştürülmedi" }));
    await waitFor(() => expect(listQueries().at(-1)).toMatchObject({ conversion: "won_not_converted" }));
    expect(await screen.findByRole("button", { name: "1 dönüştürülmedi" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "1 dönüştürülmedi" }));
    await waitFor(() => expect(listQueries().at(-1)).not.toHaveProperty("conversion"));
  });

  it("'Filtreleri temizle' dönüştürme süzgecini de kaldırır", async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(await screen.findByRole("button", { name: "1 dönüştürülmedi" }));
    await waitFor(() => expect(listQueries().at(-1)).toMatchObject({ conversion: "won_not_converted" }));
    await user.click(await screen.findByRole("button", { name: "Filtreleri temizle" }));
    await waitFor(() => expect(listQueries().at(-1)).not.toHaveProperty("conversion"));
  });

  it("'Dönüştür →' satır bağlantısı yalnız projects:admin kullanıcıya görünür", async () => {
    renderScreen();
    expect(await screen.findByRole("link", { name: "Dönüştür →" })).toHaveAttribute("href", "/teklif-hazirlama/offer-08/donustur");
  });

  it("projects:full → satırda uyarı var, bağlantı yok", async () => {
    perm.levels.projects = "full";
    renderScreen();
    expect(await screen.findByText("Kazanıldı · dönüştürülmedi")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Dönüştür →" })).not.toBeInTheDocument();
  });
});
