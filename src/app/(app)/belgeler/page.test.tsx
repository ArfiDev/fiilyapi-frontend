import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import BelgelerPage from "./page";
import { useSession } from "@/components/shell/SessionProvider";
import { useDocumentFolders } from "@/lib/api/hooks/useDocumentFolders";
import { useDocuments } from "@/lib/api/hooks/useDocuments";
import { useProjects } from "@/lib/api/hooks/useProjects";
import { meFixture } from "@/lib/auth/page-grants.testkit";

// F-BC T4 · `/belgeler` gerçek rota eklenince [...slug] catch-all bu segment
// için devre dışı kalır — bu test sayfanın ComingSoon YERİNE gerçek E12
// arşivini bastığını doğrular (catch-all'ın kendisi Next.js dosya-tabanlı
// yönlendirmenin garantisidir, ayrıca test edilmez).

vi.mock("next/navigation", () => ({
  usePathname: () => "/belgeler",
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams({ proje: "p-1" }),
}));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("@/lib/api/hooks/useProjects", () => ({ useProjects: vi.fn() }));
vi.mock("@/lib/api/hooks/useDocumentFolders", () => ({ useDocumentFolders: vi.fn() }));
vi.mock("@/lib/api/hooks/useDocuments", () => ({ useDocuments: vi.fn() }));
vi.mock("@/lib/api/documents-client", () => ({ downloadDocument: vi.fn() }));

/** `data` bilinçli olarak `unknown`: React Query'nin 20+ alanlı sonuç
    birleşimini test fikstüründe yeniden üretmek gerekmesin (ŞB testi deseni). */
function queryStub(data: unknown): { data: unknown; isLoading: boolean; isError: boolean; error: unknown } {
  return { data, isLoading: false, isError: false, error: null };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useSession).mockReturnValue({
    me: meFixture(),
    isLoading: false,
  });
  vi.mocked(useProjects).mockReturnValue(
    queryStub({
      items: [{ id: "p-1", code: "PRJ-1", name: "Güneşkent A-Blok" }],
      counts: {},
    }) as ReturnType<typeof useProjects>,
  );
  vi.mocked(useDocumentFolders).mockReturnValue(
    queryStub({ folders: [] }) as ReturnType<typeof useDocumentFolders>,
  );
  vi.mocked(useDocuments).mockReturnValue(
    queryStub({ documents: [] }) as ReturnType<typeof useDocuments>,
  );
});

describe("BelgelerPage rotası", () => {
  it("ComingSoon DEĞİL gerçek belge arşivini basar", () => {
    render(<BelgelerPage />);
    expect(screen.getByRole("navigation", { name: "Belge klasörleri" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Güneşkent A-Blok" })).toBeInTheDocument();
    expect(screen.queryByText("Bu modül yakında eklenecek.")).not.toBeInTheDocument();
  });
});
