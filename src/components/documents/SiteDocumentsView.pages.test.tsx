import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSession } from "@/components/shell/SessionProvider";
import { useDocumentFolders } from "@/lib/api/hooks/useDocumentFolders";
import { useDocuments } from "@/lib/api/hooks/useDocuments";
import { meFixture, pageGrant } from "@/lib/auth/page-grants.testkit";

import { SiteDocumentsView } from "./SiteDocumentsView";

// IZN-F5-ön — Şantiye belge ekranının GÖRÜNTÜLEME kapısı (AccessDenied) belge sayfalarından karar verir
// (mali.belge_arsivi / proje.belgeler / santiye.belgeler VEYA); proje ekibindeyse proje rolünden.
vi.mock("next/navigation", () => ({
  useParams: () => ({ projectId: "p-1", siteId: "s-1" }),
  usePathname: () => "/projeler/p-1/santiyeler/s-1/belgeler",
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("@/lib/api/hooks/useDocumentFolders", () => ({ useDocumentFolders: vi.fn() }));
vi.mock("@/lib/api/hooks/useDocuments", () => ({ useDocuments: vi.fn() }));
vi.mock("@/lib/api/documents-client", () => ({ downloadDocument: vi.fn() }));
vi.mock("@/lib/api/hooks/useDocumentMutations", () => ({
  useUploadDocument: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useCreateDocumentFolder: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));
vi.mock("@/lib/api/hooks/useSites", () => ({
  useSite: vi.fn(() => ({
    data: { id: "s-1", name: "A-Blok Şantiyesi", project: { id: "p-1", name: "Güneşkent Konut" } },
  })),
}));

const DENIED = "Bu alana yetkiniz yok";

function session(me: ReturnType<typeof meFixture>) {
  vi.mocked(useSession).mockReturnValue({ me, isLoading: false } as ReturnType<typeof useSession>);
}

describe("SiteDocumentsView · sayfa izni görüntüleme kapısı (IZN-F5-ön)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useDocuments).mockReturnValue({
      data: { documents: [] },
      isLoading: false,
      isError: false,
      error: null,
    } as unknown as ReturnType<typeof useDocuments>);
    vi.mocked(useDocumentFolders).mockReturnValue({
      data: { folders: [] },
      isLoading: false,
      isError: false,
      error: null,
    } as unknown as ReturnType<typeof useDocumentFolders>);
  });

  it("santiye.belgeler Görür → ekran açılır (modül documents:none olsa da)", () => {
    session(meFixture({ pages: { "santiye.belgeler": pageGrant("view") }, permissions: { documents: "none" } }));
    render(<SiteDocumentsView />);
    expect(screen.queryByText(DENIED)).toBeNull();
  });

  it("belge sayfalarında yalnız none → AccessDenied (modül full olsa da)", () => {
    session(meFixture({ pages: { "santiye.belgeler": pageGrant("none") }, permissions: { documents: "full" } }));
    render(<SiteDocumentsView />);
    expect(screen.getByText(DENIED)).toBeInTheDocument();
  });

  it("pages boş → fail-closed: documents full olsa bile AccessDenied (IZN-F6a)", () => {
    session(meFixture({ pages: {}, permissions: { documents: "full" } }));
    render(<SiteDocumentsView />);
    expect(screen.getByText(DENIED)).toBeInTheDocument();
  });

  it("proje ekibinde: proje rolü belge sayfasını gizlerse ana rol Görür olsa da reddedilir", () => {
    session(
      meFixture({
        pages: { "santiye.belgeler": pageGrant("view") },
        projects: [{ project_id: "p-1", role_key: "viewer" }],
        rolePages: { viewer: { "santiye.belgeler": pageGrant("none") } },
        permissions: { documents: "full" },
      }),
    );
    render(<SiteDocumentsView />);
    expect(screen.getByText(DENIED)).toBeInTheDocument();
  });
});
