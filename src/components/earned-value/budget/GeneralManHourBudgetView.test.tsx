import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { backendClient } from "@/lib/api/client";
import { useEvSiteOptions } from "@/lib/api/hooks/useEvSettings";

import { GeneralManHourBudgetView } from "./GeneralManHourBudgetView";
import { defaultState, mockPermission, renderWithQuery, wireBackend } from "./budget-screen-harness";

// PLN-F1.6 · kök ikiz `/planlama/adam-saat-butcesi?site=` (GeneralSiteDiaryView deseni).

vi.mock("@/lib/api/client", () => ({
  backendClient: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() },
}));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("@/lib/api/hooks/useEvSettings", () => ({ useEvSiteOptions: vi.fn() }));

const replace = vi.fn();
let searchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useParams: () => ({}),
  usePathname: () => "/planlama/adam-saat-butcesi",
  useRouter: () => ({ replace }),
  useSearchParams: () => searchParams,
}));

const OPTIONS = [
  { siteId: "s-1", siteName: "A-Blok", projectId: "p-1", projectName: "Güneşkent", isCompleted: false },
  { siteId: "s-2", siteName: "Fabrika", projectId: "p-2", projectName: "Çelik OSB", isCompleted: true },
];

function setup(query: string, options = OPTIONS, loading = false) {
  searchParams = new URLSearchParams(query);
  wireBackend(defaultState());
  mockPermission("draft");
  vi.mocked(useEvSiteOptions).mockReturnValue({ options, groups: [], isLoading: loading, isError: false });
  return { user: userEvent.setup(), ...renderWithQuery(<GeneralManHourBudgetView />) };
}

beforeEach(() => vi.clearAllMocks());

describe("GeneralManHourBudgetView", () => {
  it("`?site=` yokken ilk şantiyeye hizalanır ve o şantiyenin bütçesi istenir", async () => {
    setup("");
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/planlama/adam-saat-butcesi?site=s-1", { scroll: false }));
    await waitFor(() =>
      expect(backendClient.GET).toHaveBeenCalledWith("/sites/{site_id}/earned-value/budget", {
        params: { path: { site_id: "s-1" } },
      }),
    );
  });

  it("şantiye değişince revizyon/adım anahtarları düşer", async () => {
    const { user } = setup("site=s-1&rev=r-9&adim=3");
    await screen.findByText("Taslak — Rev 2");
    await user.selectOptions(screen.getByRole("combobox", { name: "Şantiye" }), "s-2");
    expect(replace).toHaveBeenLastCalledWith("/planlama/adam-saat-butcesi?site=s-2", { scroll: false });
  });

  it("şantiye yoksa gerekçe yazılır, iskelet basılmaz", () => {
    setup("", []);
    expect(screen.getByText("Bütçesi hazırlanabilecek şantiye bulunmuyor.")).toBeInTheDocument();
    expect(screen.queryByText("Bütçe yükleniyor")).not.toBeInTheDocument();
  });

  it("bağlantılar seçili şantiyenin proje rotasından kurulur", async () => {
    setup("site=s-2");
    expect(await screen.findByRole("link", { name: "İş Kalemleri (BOQ)" })).toHaveAttribute(
      "href",
      "/projeler/p-2/santiyeler/s-2/is-kalemleri",
    );
  });
});

describe("GeneralManHourBudgetView — şantiye durumu seçenekten (PLN-F1.6.2)", () => {
  it("seçenek etiketi proje + şantiye; tamamlanmış şantiye salt okunur açılır", async () => {
    setup("site=s-2");
    expect(await screen.findByRole("option", { name: "Çelik OSB Fabrika · tamamlandı" })).toBeInTheDocument();
    expect(await screen.findByText("Tamamlanmış şantiye · bütçe salt okunur.")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /birim oran/ })).not.toBeInTheDocument();
  });

  it("aktif şantiye düzenlenebilir", async () => {
    setup("site=s-1");
    expect(await screen.findByRole("textbox", { name: "Beton döküm · Temel birim oran" })).toBeEnabled();
    expect(screen.queryByText("Tamamlanmış şantiye · bütçe salt okunur.")).not.toBeInTheDocument();
  });
});

describe("GeneralManHourBudgetView — açılış varsayılanı (CEO d, AYP ile tutarlı)", () => {
  const COMPLETED_FIRST = [
    { siteId: "s-9", siteName: "Eski Blok", projectId: "p-9", projectName: "Kapanan", isCompleted: true },
    ...OPTIONS,
  ];

  it("`?site=` yokken ilk DEVAM EDEN şantiye seçilir (tamamlanmış atlanır)", async () => {
    setup("", COMPLETED_FIRST);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/planlama/adam-saat-butcesi?site=s-1", { scroll: false }));
  });

  it("hepsi tamamlanmışsa ilk seçeneğe düşer", async () => {
    setup("", [COMPLETED_FIRST[0], { ...OPTIONS[1] }]);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/planlama/adam-saat-butcesi?site=s-9", { scroll: false }));
  });

  it("tamamlanmış şantiye `?site=` ile açıkça seçilebilir kalır", async () => {
    setup("site=s-9", COMPLETED_FIRST);
    expect(await screen.findByText("Tamamlanmış şantiye · bütçe salt okunur.")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
