import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import GunlukKayitPage from "./page";
import { useSession } from "@/components/shell/SessionProvider";
import { useSiteOptions } from "@/lib/api/hooks/useSiteOptions";
import {
  useSiteDiaryEntries,
  useSiteDiaryEntry,
  type SiteDiaryEntryListResponse,
} from "@/lib/api/hooks/useSiteDiary";
import { useSitePlanDaySummary } from "@/lib/api/hooks/useSitePlanDaySummary";
import { useSite } from "@/lib/api/hooks/useSites";
import { useBoq } from "@/lib/api/hooks/useBoq";
import { useProgressPayments } from "@/lib/api/hooks/useProgressPayments";
import { useSiteSubcontractorPayments } from "@/lib/api/hooks/useSiteSubcontractorPayments";
import type { MeResponse } from "@/lib/auth/types";

// F-NAVSAHA · `/gunluk-kayit` GERÇEK rota: [...slug] catch-all bu segment için
// devre dışı kalır. Bu test sayfanın ComingSoon YERİNE gerçek günlük kayıt
// ekranını bastığını doğrular — nav'daki `Saha › Günlük Kayıt` öğesinin
// "yakında" ekranına düşmediğinin sayfa tarafındaki kanıtıdır.

// PLN-F2 · sayfa artık planlama adaptörünü basar (çekirdeği sarar) ve çekirdek
// de yeni sorgular açtı (taşeron listesi, puantaj haftası) → gerçek react-query
// + hiç çözülmeyen sahte istemci: ekran "yükleniyor" hâlinde, uzantısız basılır.
vi.mock("@/lib/api/client", () => {
  const pending = () => new Promise(() => {});
  return { backendClient: { GET: vi.fn(pending), POST: vi.fn(pending), PUT: vi.fn(pending), PATCH: vi.fn(pending), DELETE: vi.fn(pending) } };
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <GunlukKayitPage />
    </QueryClientProvider>,
  );
}

vi.mock("next/navigation", () => ({
  useParams: () => ({}),
  usePathname: () => "/gunluk-kayit",
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("@/lib/api/hooks/useSiteOptions", () => ({ useSiteOptions: vi.fn() }));
vi.mock("@/lib/api/hooks/useSiteDiary", () => ({
  useSiteDiaryEntries: vi.fn(),
  useSiteDiaryEntry: vi.fn(),
}));
// GKS-F1.3 · kayıtsız gün önizlemesi: istenen gün/bölüm için boş, güncel iskelet.
vi.mock("@/lib/api/hooks/useSiteDiarySkeleton", async () => ({
  useSiteDiarySkeleton: (await import("@/components/site-diary/diary-skeleton.testkit")).echoSkeletonQuery,
}));
vi.mock("@/lib/api/hooks/useSiteDiaryMutations", () => ({
  useCreateSiteDiaryEntry: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateSiteDiaryEntry: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateCreatedSiteDiaryEntry: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSaveSiteDiaryLines: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSubmitSiteDiaryEntry: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useReopenSiteDiaryEntry: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/lib/api/hooks/useSitePlanDaySummary", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useSitePlanDaySummary")>()),
  useSitePlanDaySummary: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useSites", () => ({ useSite: vi.fn() }));
vi.mock("@/lib/api/hooks/useBoq", () => ({ useBoq: vi.fn() }));
vi.mock("@/lib/api/hooks/useProgressPayments", () => ({ useProgressPayments: vi.fn() }));
vi.mock("@/lib/api/hooks/useSiteSubcontractorPayments", () => ({
  useSiteSubcontractorPayments: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useSession).mockReturnValue({
    me: {
      id: "11111111-1111-1111-1111-111111111111",
      email: "sef@ornek.com",
      role_key: "site_chief",
      status: "active",
      permissions: { site_diary: "full", progress_payments: "view" },
    } as unknown as MeResponse,
    isLoading: false,
  });
  vi.mocked(useSiteOptions).mockReturnValue({
    options: [{ siteId: "s-1", projectId: "p-1", label: "Güneşkent A-Blok" }],
    isLoading: false,
    isError: false,
  });
  vi.mocked(useSiteDiaryEntries).mockReturnValue({
    data: { items: [], total: 0, limit: 50, offset: 0 } satisfies SiteDiaryEntryListResponse,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  } as never);
  vi.mocked(useSiteDiaryEntry).mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
  } as never);
  vi.mocked(useSite).mockReturnValue({
    data: {
      id: "s-1",
      name: "A-Blok Şantiyesi",
      project: { id: "p-1", name: "Güneşkent" },
      sections: [],
    },
    isLoading: false,
    isError: false,
    error: null,
  } as never);
  vi.mocked(useBoq).mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
  } as never);
  vi.mocked(useProgressPayments).mockReturnValue({
    data: { items: [], total: 0 },
    isLoading: false,
    isError: false,
    error: null,
  } as never);
  vi.mocked(useSiteSubcontractorPayments).mockReturnValue({
    items: [],
    isLoading: false,
    isError: false,
    isPartial: false,
    truncation: { isTruncated: false, shownCount: 0, totalCount: 0 },
  } as never);
  vi.mocked(useSitePlanDaySummary).mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
  } as never);
});

describe("/gunluk-kayit sayfasi", () => {
  it("gercek gunluk kayit ekranini basar (ComingSoon DEGIL)", () => {
    renderPage();
    expect(
      screen.getByRole("heading", { level: 1, name: "Günlük Kayıt & Planlama" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/yakında/i)).not.toBeInTheDocument();
  });

  it("santiye secicisi ekranin parcasidir (kok rotanin kabugu)", () => {
    renderPage();
    expect(screen.getByLabelText("Şantiye")).toBeInTheDocument();
  });
});
