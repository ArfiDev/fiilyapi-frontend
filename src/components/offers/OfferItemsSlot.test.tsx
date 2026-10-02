import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { backendClient } from "@/lib/api/client";
import { D_DUV, D_KAB } from "@/components/work-item-catalog/work-item-fixtures";

import { OFFER_ID, makeDetail } from "./offer-detail-fixtures";
import { BETON, makeRevisionWithItems } from "./offer-item-fixtures";
import { OfferDetailScreen } from "./OfferDetailScreen";
import { renderOfferItemsSlot } from "./OfferItemsCard";

const perm = vi.hoisted(() => ({ contracts: "full" }));
vi.mock("@/lib/api/client", () => ({ backendClient: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), DELETE: vi.fn() } }));
vi.mock("@/lib/auth/useModulePermission", () => ({
  useModulePermission: (moduleKey: string) => ({
    level: moduleKey === "contracts" ? perm.contracts : "admin",
    canView: true,
    canWrite: true,
    canDelete: true,
  }),
}));
vi.mock("@/lib/auth/useDisciplineScope", () => ({ useDisciplineScope: () => ({ isRestricted: false, names: [] }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));

const ok = (data: unknown) => ({ data, error: undefined, response: new Response(null, { status: 200 }) }) as never;

function mockBackend(revision = makeRevisionWithItems()) {
  vi.mocked(backendClient.GET).mockImplementation((async (path: string) => {
    if (path === "/offers/{offer_id}") return ok(makeDetail());
    if (path === "/offers/{offer_id}/revisions/{rev_no}") return ok(revision);
    if (path === "/employers") return ok({ items: [], total: 0 });
    if (path === "/catalog/items") return ok({ items: [BETON] });
    if (path === "/catalog/disciplines") return ok({ items: [D_KAB, D_DUV] });
    throw new Error(`beklenmeyen GET ${path}`);
  }) as never);
}

function renderDetail() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <OfferDetailScreen offerId={OFFER_ID} revParam={null} renderItems={renderOfferItemsSlot} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  perm.contracts = "full";
  mockBackend();
});

describe("F3.5 yuvası ← F3.6 kalem kartı", () => {
  it("taslak son revizyonda kalem kartı basılır ve düzenlenebilir", async () => {
    renderDetail();
    expect(await screen.findByRole("heading", { name: "Teklif kalemleri" })).toBeInTheDocument();
    expect(await screen.findByLabelText("KAB-0001 miktar")).toBeEnabled();
    expect(screen.getByRole("button", { name: "+ Katalogdan Ekle" })).toBeEnabled();
  });

  it("yazma yetkisi yoksa (contracts:view) kart basılır ama TÜM hücreler kapalı", async () => {
    perm.contracts = "view";
    renderDetail();
    expect(await screen.findByLabelText("KAB-0001 miktar")).toBeDisabled();
    expect(screen.getByRole("button", { name: "+ Katalogdan Ekle" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "+ Grup" })).toBeDisabled();
  });

  it("gönderilmiş (düzenlenemez) revizyonda kalemler salt okunur", async () => {
    mockBackend(
      makeRevisionWithItems(undefined, { status: "sent", is_editable: false, is_latest: true }),
    );
    renderDetail();
    expect(await screen.findByLabelText("KAB-0001 miktar")).toBeDisabled();
  });
});
