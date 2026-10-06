import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { SectionDistributionView } from "./SectionDistributionView";
import { useSectionDistribution, useSaveSectionDistribution } from "@/lib/api/hooks/useSectionDistribution";
import { useSession } from "@/components/shell/SessionProvider";
import { meFixture, pageGrant } from "@/lib/auth/page-grants.testkit";

import { SECTION_DISTRIBUTION_FIXTURE } from "./section-distribution.fixture";

// IZN-F2.x — bölüm dağılımı kaydet = santiye.is_kalemleri / santiye.bolum_dagilimi Düzenler (VEYA).
vi.mock("@/lib/api/hooks/useSectionDistribution", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useSectionDistribution")>()),
  useSectionDistribution: vi.fn(),
  useSaveSectionDistribution: vi.fn(),
}));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));

function session(me: ReturnType<typeof meFixture>) {
  vi.mocked(useSession).mockReturnValue({ me, isLoading: false } as ReturnType<typeof useSession>);
}

function renderView() {
  vi.mocked(useSectionDistribution).mockReturnValue({
    data: SECTION_DISTRIBUTION_FIXTURE,
    isError: false,
    isLoading: false,
    error: null,
  } as never);
  vi.mocked(useSaveSectionDistribution).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
  return render(<SectionDistributionView siteId="site-a-blok" boqHref="/projeler/p-1/santiyeler/s-1/is-kalemleri" />);
}

function firstShareInputs(): HTMLInputElement[] {
  return screen.getAllByLabelText(/ payı$/) as HTMLInputElement[];
}

beforeEach(() => vi.clearAllMocks());

describe("SectionDistributionView · sayfa izni kapısı (IZN-F2.x)", () => {
  it("santiye.bolum_dagilimi Düzenler → hücreler yazılabilir", () => {
    session(meFixture({ pages: { "santiye.bolum_dagilimi": pageGrant("edit") } }));
    renderView();
    expect(firstShareInputs().some((input) => !input.disabled)).toBe(true);
  });

  it("ikiz kapı: santiye.is_kalemleri Düzenler → yazılabilir", () => {
    session(meFixture({ pages: { "santiye.bolum_dagilimi": pageGrant("view"), "santiye.is_kalemleri": pageGrant("edit") } }));
    renderView();
    expect(firstShareInputs().some((input) => !input.disabled)).toBe(true);
  });

  it("yalnız Görür → tüm hücreler kilitli ve Kaydet pasif", () => {
    session(meFixture({ pages: { "santiye.bolum_dagilimi": pageGrant("view") } }));
    renderView();
    expect(firstShareInputs().every((input) => input.disabled)).toBe(true);
    expect(screen.getByTestId("bdg-save")).toBeDisabled();
  });

  it("bolum.is_kalemleri Düzenler yazma kapısını AÇMAZ (backend EDIT kümesinde değil)", () => {
    session(meFixture({ pages: { "santiye.bolum_dagilimi": pageGrant("view"), "bolum.is_kalemleri": pageGrant("edit") } }));
    renderView();
    expect(firstShareInputs().every((input) => input.disabled)).toBe(true);
  });

  it("pages boş → fail-closed: boq full olsa bile yazamaz (IZN-F6a)", () => {
    session(meFixture({ pages: {} }));
    renderView();
    expect(firstShareInputs().every((input) => input.disabled)).toBe(true);
  });
});
