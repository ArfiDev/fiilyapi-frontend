import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, within } from "@testing-library/react";

import { backendClient } from "@/lib/api/client";
import { useSession } from "@/components/shell/SessionProvider";
import { useSite } from "@/lib/api/hooks/useSites";
import { meFixture, pageGrant } from "@/lib/auth/page-grants.testkit";

import { ManHourBudgetView } from "./ManHourBudgetView";
import { ACTIVE_REV_1, budgetView } from "./budget-fixtures";
import { defaultState, renderWithQuery, wireBackend } from "./budget-screen-harness";

// IZN-F2.x · Adam-Saat Bütçesi düğme kapıları sayfa izninden gelir:
// Baseline Dondur = bütçe sayfası ONAYLAR · Taslağı sil = YALNIZ sistem yöneticisi · yazma = bütçe Düzenler.

vi.mock("@/lib/api/client", () => ({
  backendClient: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() },
}));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("@/lib/api/hooks/useSites", () => ({ useSite: vi.fn() }));
vi.mock("next/navigation", () => ({
  useParams: () => ({ projectId: "gunes", siteId: "a-blok" }),
  usePathname: () => "/projeler/gunes/santiyeler/a-blok/adam-saat-butcesi",
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams("adim=4"),
}));

const SITE_ID = "99999999-0000-0000-0000-000000000001";

function setupWith(me: ReturnType<typeof meFixture>) {
  wireBackend({ ...defaultState(), view: budgetView({ freeze_blockers: [] }) });
  vi.mocked(useSession).mockReturnValue({ me, isLoading: false } as ReturnType<typeof useSession>);
  vi.mocked(useSite).mockReturnValue({ data: { id: SITE_ID, project: { id: "p-1" }, status: "active" } } as never);
  return renderWithQuery(<ManHourBudgetView />);
}

const FREEZE = "Baseline'ı Dondur";
const DELETE_DRAFT = "Taslağı sil";

beforeEach(() => vi.clearAllMocks());

describe("Adım 4 · sayfa izni kapıları (IZN-F2.x)", () => {
  it("bütçe sayfası Onaylar → Dondur görünür; Taslağı sil SA olmadığı için GÖRÜNMEZ", async () => {
    setupWith(meFixture({ pages: { "planlama.adam_saat_butcesi": pageGrant("edit", true) } }));
    expect(await screen.findByRole("button", { name: FREEZE })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: DELETE_DRAFT })).toBeNull();
  });

  it("santiye.adam_saat_butcesi Onaylar (ikiz) → Dondur görünür", async () => {
    setupWith(meFixture({ pages: { "santiye.adam_saat_butcesi": pageGrant("edit", true) } }));
    expect(await screen.findByRole("button", { name: FREEZE })).toBeInTheDocument();
  });

  it("bütçe sayfası Düzenler (Onaylar YOK) → Dondur ve Taslağı sil GÖRÜNMEZ", async () => {
    setupWith(meFixture({ pages: { "planlama.adam_saat_butcesi": pageGrant("edit") } }));
    await screen.findByText("Adım 4 · Baseline'ı dondur");
    expect(screen.queryByRole("button", { name: FREEZE })).toBeNull();
    expect(screen.queryByRole("button", { name: DELETE_DRAFT })).toBeNull();
  });

  it("sistem yöneticisi: Dondur ve Taslağı sil görünür", async () => {
    setupWith(meFixture({ pages: { "planlama.adam_saat_butcesi": pageGrant("none") }, isSystemAdmin: true }));
    expect(await screen.findByRole("button", { name: FREEZE })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: DELETE_DRAFT })).toBeInTheDocument();
  });

  it("pages boş (eski oturum, earned_value approve) → fail-closed: Dondur ve Taslağı sil YOK (IZN-F6a)", async () => {
    setupWith(meFixture({ pages: {} }));
    await screen.findByText("Adım 4 · Baseline'ı dondur");
    expect(screen.queryByRole("button", { name: FREEZE })).toBeNull();
    expect(screen.queryByRole("button", { name: DELETE_DRAFT })).toBeNull();
  });

  it("DELETE yalnız SA'da çağrılabilir: grant'lı Onaylar kullanıcıda silme düğmesi yok → çağrı yok", async () => {
    setupWith(meFixture({ pages: { "planlama.adam_saat_butcesi": pageGrant("edit", true) } }));
    await screen.findByRole("button", { name: FREEZE });
    expect(backendClient.DELETE).not.toHaveBeenCalled();
  });
});

// IZN-F5b madde 9 · bütçe yazma (Taslak aç) = YALNIZ adam-saat bütçesi sayfaları Düzenler;
// ayarlar.planlama (planlama ayarları ucu) artık bütçe yazma kapısını AÇMAZ.
describe("Adım 4 · bütçe yazma kapısı EV_BUDGET_EDIT (IZN-F5b)", () => {
  function setupActive(me: ReturnType<typeof meFixture>) {
    wireBackend({ ...defaultState(), view: budgetView({ revision: ACTIVE_REV_1, editable: false }), revisions: [ACTIVE_REV_1] });
    vi.mocked(useSession).mockReturnValue({ me, isLoading: false } as ReturnType<typeof useSession>);
    vi.mocked(useSite).mockReturnValue({ data: { id: SITE_ID, project: { id: "p-1" }, status: "active" } } as never);
    return renderWithQuery(<ManHourBudgetView />);
  }
  const OPEN_DRAFT = { name: "Taslak aç (Rev 2)" };

  it("planlama.adam_saat_butcesi Düzenler → Taslak aç görünür", async () => {
    setupActive(meFixture({ pages: { "planlama.adam_saat_butcesi": pageGrant("edit") } }));
    const blockers = await screen.findByRole("region", { name: "Dondurma engelleri" });
    expect(within(blockers).getByRole("button", OPEN_DRAFT)).toBeInTheDocument();
  });

  it("yalnız ayarlar.planlama Düzenler → Taslak aç GÖRÜNMEZ", async () => {
    setupActive(meFixture({ pages: { "ayarlar.planlama": pageGrant("edit") } }));
    const blockers = await screen.findByRole("region", { name: "Dondurma engelleri" });
    expect(within(blockers).queryByRole("button", OPEN_DRAFT)).toBeNull();
  });
});
