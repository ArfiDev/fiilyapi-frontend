import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { SiteDiarySummaryView } from "./SiteDiarySummaryView";
import { useProgressPayments, useProgressPaymentSummary } from "@/lib/api/hooks/useProgressPayments";
import { useSite } from "@/lib/api/hooks/useSites";
import { useSiteDiarySummary } from "@/lib/api/hooks/useSiteDiary";
import { useSiteSubcontractorPayments } from "@/lib/api/hooks/useSiteSubcontractorPayments";
import { useSession } from "@/components/shell/SessionProvider";
import { meFixture, pageGrant } from "@/lib/auth/page-grants.testkit";

// IZN-F5-ön — Günlük özet görüntüleme kapısı = günlük kayıt sayfaları Görür (VEYA); grant yoksa `site_diary` izni.
vi.mock("@/lib/api/hooks/useProgressPayments", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useProgressPayments")>()),
  useProgressPayments: vi.fn(),
  useProgressPaymentSummary: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useSites", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useSites")>()),
  useSite: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useSiteDiary", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useSiteDiary")>()),
  useSiteDiarySummary: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useSiteSubcontractorPayments", () => ({ useSiteSubcontractorPayments: vi.fn() }));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("next/navigation", () => ({
  useParams: () => ({ projectId: "p-1", siteId: "s-1" }),
  usePathname: () => "/projeler/p-1/santiyeler/s-1/gunluk-kayit/ozet",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

function session(me: ReturnType<typeof meFixture>) {
  vi.mocked(useSession).mockReturnValue({ me, isLoading: false } as ReturnType<typeof useSession>);
}

function loading() {
  return { data: undefined, isLoading: true, isError: false, error: null } as never;
}

const DENIED = "Bu alana yetkiniz yok";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useSite).mockReturnValue(loading());
  vi.mocked(useSiteDiarySummary).mockReturnValue(loading());
  vi.mocked(useProgressPayments).mockReturnValue(loading());
  vi.mocked(useProgressPaymentSummary).mockReturnValue(loading());
  vi.mocked(useSiteSubcontractorPayments).mockReturnValue(loading());
});

describe("SiteDiarySummaryView · sayfa izni görüntüleme kapısı (IZN-F5-ön)", () => {
  it("santiye.gunluk_ozet Görür → açılır (site_diary none olsa bile)", () => {
    session(meFixture({ pages: { "santiye.gunluk_ozet": pageGrant("view") }, permissions: { site_diary: "none" } }));
    render(<SiteDiarySummaryView />);
    expect(screen.queryByText(DENIED)).toBeNull();
  });

  it("günlük kayıt sayfalarında yalnız none → AccessDenied (site_diary full olsa bile)", () => {
    session(meFixture({ pages: { "santiye.gunluk_ozet": pageGrant("none") }, permissions: { site_diary: "full" } }));
    render(<SiteDiarySummaryView />);
    expect(screen.getByText(DENIED)).toBeInTheDocument();
  });

  it("pages boş → fail-closed: modül izni view olsa bile reddedilir (IZN-F6a)", () => {
    session(meFixture({ pages: {}, permissions: { site_diary: "none" } }));
    const { unmount } = render(<SiteDiarySummaryView />);
    expect(screen.getByText(DENIED)).toBeInTheDocument();
    unmount();
    session(meFixture({ pages: {}, permissions: { site_diary: "view" } }));
    render(<SiteDiarySummaryView />);
    expect(screen.getByText(DENIED)).toBeInTheDocument();
  });
});

describe("SiteDiarySummaryView · Hakediş Oluştur bağlantısı = işveren hakedişi ailesi (IZN-F5b)", () => {
  const CTA = "Hakediş Oluştur →";
  const isLink = () => screen.getByText(CTA).closest("a") !== null;

  it("mali.hakedis_isveren Düzenler → gerçek bağlantı; taşeron hakediş Düzenler → devre dışı", () => {
    // IZN-F5c · model devredeyken ekranı açan günlük Görür hücresi de gerekir (hücresiz = kapalı).
    session(meFixture({ pages: { "mali.hakedis_isveren": pageGrant("edit"), "santiye.gunluk_ozet": pageGrant("view") } }));
    const { unmount } = render(<SiteDiarySummaryView />);
    expect(isLink()).toBe(true);
    unmount();

    session(
      meFixture({
        pages: { "mali.hakedis_taseron": pageGrant("edit"), "santiye.gunluk_ozet": pageGrant("view") },
        permissions: { progress_payments: "view" },
      }),
    );
    render(<SiteDiarySummaryView />);
    expect(isLink()).toBe(false);
  });
});
