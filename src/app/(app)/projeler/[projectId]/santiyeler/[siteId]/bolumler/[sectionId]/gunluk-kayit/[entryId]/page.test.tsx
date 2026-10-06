import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import SiteDiaryDetailPage from "./page";
import { useSiteDiaryEntry } from "@/lib/api/hooks/useSiteDiary";
import { useSection } from "@/lib/api/hooks/useSection";
import { useSite } from "@/lib/api/hooks/useSites";
import { useSession } from "@/components/shell/SessionProvider";
import { meFixture } from "@/lib/auth/page-grants.testkit";

// Sayfa yalnız orkestrasyon bileşenini bağlar — davranış
// `SiteDiaryDetailView.test.tsx`te; bu dosya "rota bileşene bağlanıyor mu" duman testi.
// DET-1.3: rota planlama adaptörünü (§2.7) basar; adaptörün gün sorgusu bağlam
// gelmeden KAPALIDIR ama `useQuery` bir istemci ister.
vi.mock("@/lib/api/hooks/useSiteDiary", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useSiteDiary")>()),
  useSiteDiaryEntry: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useSection", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useSection")>()),
  useSection: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useSites", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useSites")>()),
  useSite: vi.fn(),
}));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("next/navigation", () => ({
  useParams: () => ({ projectId: "p", siteId: "s", sectionId: "b", entryId: "e-1" }),
}));

describe("SiteDiaryDetailPage — duman testi", () => {
  it("yükleniyor iskeletini basar", () => {
    const pending = { data: undefined, isLoading: true, isError: false, error: null };
    // IZN-F6a · oturum tam erişimli: duman testi rotanın ekrana bağlandığını sınar; yükleniyor durumu SORGUDAN gelir.
    vi.mocked(useSession).mockReturnValue({ me: meFixture(), isLoading: false } as never);
    vi.mocked(useSite).mockReturnValue(pending as never);
    vi.mocked(useSection).mockReturnValue(pending as never);
    vi.mocked(useSiteDiaryEntry).mockReturnValue(pending as never);

    render(
      <QueryClientProvider client={new QueryClient()}>
        <SiteDiaryDetailPage />
      </QueryClientProvider>,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Günlük kayıt yükleniyor");
    expect(useSiteDiaryEntry).toHaveBeenCalledWith("e-1", { sectionId: undefined, enabled: false });
    // Planlama adaptörü sarılı: kayıt gelmeden planlama yuvası basılmaz.
    expect(screen.queryByRole("region", { name: "Saat Dağıtımı · özet" })).not.toBeInTheDocument();
  });
});
