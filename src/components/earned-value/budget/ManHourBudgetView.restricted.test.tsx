import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";

import { useSite } from "@/lib/api/hooks/useSites";

import { ManHourBudgetView } from "./ManHourBudgetView";
import { budgetView } from "./budget-fixtures";
import { defaultState, mockPermission, renderWithQuery, wireBackend } from "./budget-screen-harness";

// DSC-F1.3 · kısıtlı kullanıcıda kalem sayısı 0 → ortak bildirim (yanıltıcı
// "Önce İş Kalemleri'ni girin" CTA'sı YOK); atamasızda bugünkü boş hâl aynen.
const scope = vi.hoisted(() => ({ value: { isRestricted: false, names: [] as string[] } }));
vi.mock("@/lib/auth/useDisciplineScope", () => ({ useDisciplineScope: () => scope.value }));

vi.mock("@/lib/api/client", () => ({
  backendClient: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() },
}));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("@/lib/api/hooks/useSites", () => ({ useSite: vi.fn() }));
vi.mock("next/navigation", () => ({
  useParams: () => ({ projectId: "gunes", siteId: "a-blok" }),
  usePathname: () => "/projeler/gunes/santiyeler/a-blok/adam-saat-butcesi",
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

function setupEmptyBoq() {
  wireBackend({
    ...defaultState(),
    view: budgetView({ totals: { ...budgetView().totals, item_count: 0 } }),
  });
  mockPermission("approve");
  vi.mocked(useSite).mockReturnValue({
    data: { id: "99999999-0000-0000-0000-000000000001", project: { id: "p-1" }, status: "active" },
  } as never);
  return renderWithQuery(<ManHourBudgetView />);
}

beforeEach(() => {
  vi.clearAllMocks();
  scope.value = { isRestricted: false, names: [] };
});

describe("ManHourBudgetView — kısıtlı boş BOQ (DSC-F1.3)", () => {
  it("kısıtlı + kalem yok → ortak bildirim, eski başlık/CTA yok", async () => {
    scope.value = { isRestricted: true, names: ["Mekanik"] };
    setupEmptyBoq();
    expect(await screen.findByText("Disiplininize ait kayıt yok.")).toBeInTheDocument();
    expect(screen.queryByText("Bu şantiyede henüz iş kalemi yok")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Önce İş Kalemleri'ni girin →" })).not.toBeInTheDocument();
  });

  it("atamasız + kalem yok → bugünkü boş hâl + CTA aynen", async () => {
    setupEmptyBoq();
    expect(await screen.findByText("Bu şantiyede henüz iş kalemi yok")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Önce İş Kalemleri'ni girin →" })).toBeInTheDocument();
    expect(screen.queryByText("Disiplininize ait kayıt yok.")).not.toBeInTheDocument();
  });
});
