import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSession } from "@/components/shell/SessionProvider";
import { useEvSettings, useEvSiteOptions } from "@/lib/api/hooks/useEvSettings";
import { meFixture, pageGrant } from "@/lib/auth/page-grants.testkit";

import { PlanningSettingsScreen } from "./PlanningSettingsScreen";

// IZN-F5-ön — Planlama Ayarları GÖRÜNTÜLEME kapısı earned_value Görür sayfalarından karar verir
// (backend `earned_value:view`).
vi.mock("next/navigation", () => ({
  usePathname: () => "/ayarlar/planlama",
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams("site=s-a"),
}));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("@/lib/api/hooks/useEvSettings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useEvSettings")>()),
  useEvSettings: vi.fn(),
  useEvSiteOptions: vi.fn(),
}));

const DENIED = "Bu alana yetkiniz yok";
const LOADING = "Planlama ayarları yükleniyor";

function session(me: ReturnType<typeof meFixture>) {
  vi.mocked(useSession).mockReturnValue({ me, isLoading: false } as ReturnType<typeof useSession>);
}

describe("PlanningSettingsScreen · sayfa izni görüntüleme kapısı (IZN-F5-ön)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useEvSiteOptions).mockReturnValue({
      options: [{ siteId: "s-a", siteName: "A", projectId: "p-1", projectName: "P", isCompleted: false }],
      groups: [],
      isLoading: false,
      isError: false,
    });
    vi.mocked(useEvSettings).mockReturnValue({
      data: undefined,
      error: null,
      isLoading: true,
      isError: false,
    } as unknown as ReturnType<typeof useEvSettings>);
  });

  it("ayarlar.planlama Görür → ekran açılır", () => {
    session(meFixture({ pages: { "ayarlar.planlama": pageGrant("view") } }));
    render(<PlanningSettingsScreen />);
    expect(screen.queryByText(DENIED)).toBeNull();
    expect(screen.getByText(LOADING)).toBeInTheDocument();
  });

  it("planlama sayfalarında yalnız none → AccessDenied", () => {
    session(meFixture({ pages: { "ayarlar.planlama": pageGrant("none") } }));
    render(<PlanningSettingsScreen />);
    expect(screen.getByText(DENIED)).toBeInTheDocument();
  });

  it("pages boş → fail-closed: reddedilir (IZN-F6a)", () => {
    session(meFixture({ pages: {} }));
    const { unmount } = render(<PlanningSettingsScreen />);
    expect(screen.getByText(DENIED)).toBeInTheDocument();
    unmount();

    session(meFixture({ pages: {} }));
    render(<PlanningSettingsScreen />);
    expect(screen.getByText(DENIED)).toBeInTheDocument();
  });
});
