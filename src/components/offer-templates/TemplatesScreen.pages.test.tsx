import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { useSession } from "@/components/shell/SessionProvider";
import { backendClient } from "@/lib/api/client";
import { meFixture, pageGrant } from "@/lib/auth/page-grants.testkit";

import { createFakeBackend } from "./template-fake-backend.testkit";
import { TemplatesScreen } from "./TemplatesScreen";

// IZN-F5b · madde 7 — OFFER_TEMPLATES_EDIT = yalnız teklif.sablonlar. Kardeş sayfa (teklif_hazirlama) şablon yazdırmaz.
vi.mock("@/lib/api/client", () => ({
  backendClient: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() },
}));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("@/lib/auth/useDisciplineScope", () => ({ useDisciplineScope: () => ({ isRestricted: false, names: [] }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));

const NEW_TEMPLATE = { name: "+ Yeni Şablon" } as const;

function session(me: ReturnType<typeof meFixture>) {
  vi.mocked(useSession).mockReturnValue({ me, isLoading: false } as ReturnType<typeof useSession>);
}

function renderScreen() {
  const fake = createFakeBackend({
    templates: [
      {
        id: "tpl-a",
        name: "Konut · kaba inşaat",
        description: null,
        overhead_pct: "12.00",
        profit_pct: "15.00",
        is_default: true,
        usage_count: 1,
        groups: [{ name: "Betonarme", items: ["cat-1"] }],
      },
    ],
    catalog: [{ id: "cat-1", poz_no: "03.001", name: "Kat döşemesi betonu", uom: "m³", last_price: null, ref_price: null, standard_unit_mhr: "1" }],
    disciplines: [],
  });
  for (const method of ["GET", "POST", "PATCH", "PUT", "DELETE"] as const) {
    vi.mocked(backendClient[method]).mockImplementation(((path: string, init: never) =>
      Promise.resolve(fake.handle(method, path, init))) as never);
  }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TemplatesScreen templateParam={null} />
    </QueryClientProvider>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe("TemplatesScreen · şablon yazma kapısı (IZN-F5b)", () => {
  it("teklif.sablonlar Düzenler → '+ Yeni Şablon' var", async () => {
    session(meFixture({ pages: { "teklif.sablonlar": pageGrant("edit") } }));
    renderScreen();
    await screen.findByRole("region", { name: "Şablon listesi" });
    expect(screen.getByRole("button", NEW_TEMPLATE)).toBeInTheDocument();
  });

  it("yalnız teklif.teklif_hazirlama Düzenler → liste açılır ama '+ Yeni Şablon' YOK", async () => {
    session(meFixture({ pages: { "teklif.teklif_hazirlama": pageGrant("edit") } }));
    renderScreen();
    await screen.findByRole("region", { name: "Şablon listesi" });
    expect(screen.queryByRole("button", NEW_TEMPLATE)).toBeNull();
  });
});
