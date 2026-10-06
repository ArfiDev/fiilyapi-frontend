import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ArchiveDocumentsView } from "./ArchiveDocumentsView";
import { useSession } from "@/components/shell/SessionProvider";
import { useDocumentFolders } from "@/lib/api/hooks/useDocumentFolders";
import { useDocuments } from "@/lib/api/hooks/useDocuments";
import { useProjects } from "@/lib/api/hooks/useProjects";
import { downloadDocument } from "@/lib/api/documents-client";
import { BackendError } from "@/lib/api/unwrap";
import type { MeResponse } from "@/lib/auth/types";
import { ALL_PAGE_KEYS, fullAccessPages, pagesFor } from "@/lib/auth/page-grants.testkit";

// F-BC T4 · E12 genel arşiv ekranı (`/belgeler`).
//
// ⚠️ Bu dosyanın EN ÖNEMLİ testi kapsam kuralıdır: E12 isteklerinde `site_id`
// GEÇİLMEZ (yalnız proje düzeyi kayıtlar). jsdom katmanında hook argümanından,
// e2e'de telden (`page.on("request")`) kanıtlanır.

const replace = vi.fn();
let searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  usePathname: () => "/belgeler",
  useRouter: () => ({ replace }),
  useSearchParams: () => searchParams,
}));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("@/lib/api/hooks/useProjects", () => ({ useProjects: vi.fn() }));
vi.mock("@/lib/api/hooks/useDocumentFolders", () => ({ useDocumentFolders: vi.fn() }));
vi.mock("@/lib/api/hooks/useDocuments", () => ({ useDocuments: vi.fn() }));
vi.mock("@/lib/api/documents-client", () => ({ downloadDocument: vi.fn() }));
vi.mock("@/lib/api/hooks/useDocumentMutations", () => ({
  useUploadDocument: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useCreateDocumentFolder: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

const BASE_ME = {
  id: "11111111-1111-1111-1111-111111111111",
  email: "patron@ornek.com",
  full_name: "Ahmet Yılmaz",
  role_key: "boss",
  status: "active",
} as unknown as MeResponse;

/** IZN-F6a · eski modül düzeyi → sayfa izni (full = tam erişim, view = her sayfada Görür, none = her sayfada Yok). */
function levelPages(level: string) {
  if (level === "full") return fullAccessPages();
  return pagesFor(ALL_PAGE_KEYS, level === "view" ? "view" : "none");
}

function mockSession(level: string) {
  vi.mocked(useSession).mockReturnValue({
    me: { ...BASE_ME, pages: levelPages(level) } as MeResponse,
    isLoading: false,
  });
}

const PROJECTS = [
  { id: "p-1", code: "PRJ-1", name: "Güneşkent A-Blok" },
  { id: "p-2", code: "PRJ-2", name: "Çelik OSB Fabrika" },
];

const FOLDERS = [
  { id: "df-1", project_id: "p-1", site_id: null, parent_id: null, name: "Sözleşmeler", created_at: "2025-03-02T08:00:00Z" },
  { id: "df-2", project_id: "p-1", site_id: null, parent_id: null, name: "Hakedişler", created_at: "2025-03-02T08:01:00Z" },
];

const DOCUMENTS = [
  {
    id: "doc-1",
    folder_id: "df-2",
    project_id: "p-1",
    site_id: null,
    filename: "Hakediş_47_Güneşkent.pdf",
    mime_type: "application/pdf",
    size_bytes: 1258291,
    description: null,
    uploaded_by_name: "Ahmet Yılmaz",
    created_at: "2026-07-17T06:20:00Z",
  },
  {
    id: "doc-2",
    folder_id: "df-2",
    project_id: "p-1",
    site_id: null,
    filename: "Hakediş_46_Hesap.xlsx",
    mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    size_bytes: 865280,
    description: "Ek hesap tablosu",
    uploaded_by_name: "Ayşe Demir",
    created_at: "2026-07-01T06:20:00Z",
  },
];

type QueryStub = { data?: unknown; isLoading?: boolean; isError?: boolean; error?: unknown };

function mockQueries(
  documents: QueryStub = { data: { documents: DOCUMENTS } },
  folders: QueryStub = { data: { folders: FOLDERS } },
  projects: QueryStub = { data: { items: PROJECTS, counts: {} } },
) {
  const base = { isLoading: false, isError: false, error: null };
  vi.mocked(useDocuments).mockReturnValue({ ...base, ...documents } as ReturnType<typeof useDocuments>);
  vi.mocked(useDocumentFolders).mockReturnValue({
    ...base,
    ...folders,
  } as ReturnType<typeof useDocumentFolders>);
  vi.mocked(useProjects).mockReturnValue({ ...base, ...projects } as ReturnType<typeof useProjects>);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-07-17T13:00:00Z"));
  searchParams = new URLSearchParams({ proje: "p-1", folder: "df-2" });
  mockSession("full");
  mockQueries();
});

afterEach(() => {
  vi.useRealTimers();
});

// ⚠️ KAPSAM KURALI (spec §2) — bu dilimin en kritik kuralı.
describe("ArchiveDocumentsView · kapsam: site_id GEÇİLMEZ", () => {
  it("belge isteği yalnız proje/klasör/arama süzgeci taşır (site_id ANAHTARI YOK)", () => {
    searchParams = new URLSearchParams({ proje: "p-1", folder: "df-2", q: "hakediş" });
    render(<ArchiveDocumentsView />);
    expect(useDocuments).toHaveBeenCalledWith("p-1", { folderId: "df-2", q: "hakediş" });
    const filter = vi.mocked(useDocuments).mock.calls[0][1] ?? {};
    expect(Object.keys(filter)).not.toContain("siteId");
  });

  it("klasör isteğine şantiye argümanı verilmez (proje düzeyi = site_id IS NULL)", () => {
    render(<ArchiveDocumentsView />);
    expect(useDocumentFolders).toHaveBeenCalledWith("p-1");
    expect(vi.mocked(useDocumentFolders).mock.calls[0][1]).toBeUndefined();
  });
});

describe("ArchiveDocumentsView · klasör paneli (E12 68-112)", () => {
  it("kökler görünür PROJELERDİR; seçilen projenin klasörleri girintili basılır (S4)", () => {
    render(<ArchiveDocumentsView />);
    const panel = screen.getByRole("navigation", { name: "Belge klasörleri" });
    expect(within(panel).getByText("Klasörler")).toBeInTheDocument();
    for (const project of PROJECTS) {
      expect(within(panel).getByRole("link", { name: new RegExp(project.name) })).toBeInTheDocument();
    }
    expect(within(panel).getByRole("link", { name: /Hakedişler/ })).toBeInTheDocument();
    expect(within(panel).getByRole("link", { name: /Sözleşmeler/ })).toBeInTheDocument();
  });

  it("seçili olmayan projenin klasörleri basılmaz (tek proje açılır)", () => {
    mockQueries(undefined, { data: { folders: [] } });
    searchParams = new URLSearchParams({ proje: "p-2" });
    render(<ArchiveDocumentsView />);
    const panel = screen.getByRole("navigation", { name: "Belge klasörleri" });
    expect(within(panel).queryByRole("link", { name: /Hakedişler/ })).not.toBeInTheDocument();
  });

  it("proje bağlantısı ?proje= yazar ve klasör süzgecini DÜŞÜRÜR", () => {
    render(<ArchiveDocumentsView />);
    const panel = screen.getByRole("navigation", { name: "Belge klasörleri" });
    expect(within(panel).getByRole("link", { name: /Çelik OSB Fabrika/ })).toHaveAttribute(
      "href",
      "/belgeler?proje=p-2",
    );
  });

  it("klasör bağlantısı proje seçimini KORUR", () => {
    render(<ArchiveDocumentsView />);
    const panel = screen.getByRole("navigation", { name: "Belge klasörleri" });
    expect(within(panel).getByRole("link", { name: /Sözleşmeler/ })).toHaveAttribute(
      "href",
      "/belgeler?proje=p-1&folder=df-1",
    );
  });

  it("klasör sayı rozeti BASILMAZ (mockup'ta yok)", () => {
    render(<ArchiveDocumentsView />);
    const panel = screen.getByRole("navigation", { name: "Belge klasörleri" });
    expect(within(panel).queryByText(String(DOCUMENTS.length))).not.toBeInTheDocument();
  });
});

describe("ArchiveDocumentsView · içerik başlığı (E12 115-124)", () => {
  it("breadcrumb '<Proje> / <Klasör>', başlık klasör adıdır", () => {
    render(<ArchiveDocumentsView />);
    expect(screen.getByText("Güneşkent A-Blok / Hakedişler")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Hakedişler" })).toBeInTheDocument();
  });

  it("klasör seçili değilken başlık proje adıdır", () => {
    searchParams = new URLSearchParams({ proje: "p-1" });
    render(<ArchiveDocumentsView />);
    expect(screen.getByRole("heading", { level: 1, name: "Güneşkent A-Blok" })).toBeInTheDocument();
  });

  it("arama kutusu ?q= yazar", async () => {
    const user = userEvent.setup();
    render(<ArchiveDocumentsView />);
    await user.type(screen.getByRole("searchbox", { name: "Belge ara" }), "z");
    expect(replace).toHaveBeenCalledWith("/belgeler?proje=p-1&folder=df-2&q=z", { scroll: false });
  });
});

describe("ArchiveDocumentsView · kart ızgarası ve indirme (E12 128-162)", () => {
  // ⚠️ E12'de aynı ad İKİ kez butondur (kart + "Son Eklenenler" satırı, satır
  // tıklaması da indirir); ızgara DOM'da önce geldiği için ilk eşleşme karttır.
  it("kart tıklaması belgeyi İNDİRİR (spec §6 S1)", async () => {
    const user = userEvent.setup();
    render(<ArchiveDocumentsView />);
    await user.click(screen.getAllByRole("button", { name: /Hakediş_47_Güneşkent\.pdf/ })[0]);
    expect(downloadDocument).toHaveBeenCalledWith("doc-1", "Hakediş_47_Güneşkent.pdf");
  });

  it("indirme hatası sessizce yutulmaz", async () => {
    const user = userEvent.setup();
    vi.mocked(downloadDocument).mockRejectedValueOnce(
      new BackendError(404, { detail: "Belge bulunamadı." }),
    );
    render(<ArchiveDocumentsView />);
    await user.click(screen.getAllByRole("button", { name: /Hakediş_47_Güneşkent\.pdf/ })[0]);
    expect(await screen.findByText("Belge bulunamadı.")).toBeInTheDocument();
  });
});

describe("ArchiveDocumentsView · Son Eklenenler (E12 166-184)", () => {
  it("liste basılır ama 'İndir' düğmesi YOKTUR (ŞB'den farkı)", () => {
    render(<ArchiveDocumentsView />);
    const recent = screen.getByRole("list", { name: "Son eklenen belgeler" });
    expect(within(recent).getAllByRole("listitem")).toHaveLength(2);
    expect(within(recent).queryByRole("button", { name: "İndir" })).not.toBeInTheDocument();
  });

  it("satır tıklaması indirir", async () => {
    const user = userEvent.setup();
    render(<ArchiveDocumentsView />);
    const recent = screen.getByRole("list", { name: "Son eklenen belgeler" });
    await user.click(within(recent).getAllByRole("button")[0]);
    expect(downloadDocument).toHaveBeenCalledWith("doc-1", "Hakediş_47_Güneşkent.pdf");
  });
});

describe("ArchiveDocumentsView · boş durumlar", () => {
  it("proje seçilmemişken belge isteği HİÇ kurulmaz, yönlendirme metni basılır", () => {
    searchParams = new URLSearchParams();
    render(<ArchiveDocumentsView />);
    expect(useDocuments).toHaveBeenCalledWith("", { folderId: undefined, q: undefined });
    expect(screen.getByText("Belgeleri görmek için soldaki panelden bir proje seçin.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Belge Arşivi" })).toBeInTheDocument();
  });

  it("klasörsüz projede panel boş-durum metni basar", () => {
    mockQueries(undefined, { data: { folders: [] } });
    render(<ArchiveDocumentsView />);
    expect(screen.getByText("Bu projede henüz klasör yok.")).toBeInTheDocument();
  });

  it("belgesiz klasörde ızgara boş-durum metni basar (uydurma satır YOK)", () => {
    mockQueries({ data: { documents: [] } });
    render(<ArchiveDocumentsView />);
    expect(screen.getByText("Bu klasörde henüz belge yok.")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Son eklenen belgeler" })).not.toBeInTheDocument();
  });

  it("aramayla eşleşme yoksa arama boş-durumu basar", () => {
    searchParams = new URLSearchParams({ proje: "p-1", q: "yok" });
    mockQueries({ data: { documents: [] } });
    render(<ArchiveDocumentsView />);
    expect(screen.getByText("Aramanızla eşleşen belge bulunamadı.")).toBeInTheDocument();
  });

  it("görüntülenebilir proje yoksa panel bunu söyler", () => {
    mockQueries(undefined, undefined, { data: { items: [], counts: {} } });
    searchParams = new URLSearchParams();
    render(<ArchiveDocumentsView />);
    expect(screen.getByText("Görüntüleyebileceğiniz proje yok.")).toBeInTheDocument();
  });
});

describe("ArchiveDocumentsView · izin kapıları", () => {
  it("documents:none AccessDenied görür", () => {
    mockSession("none");
    render(<ArchiveDocumentsView />);
    expect(screen.getByText("Bu alana yetkiniz yok")).toBeInTheDocument();
  });

  it("403 yanıtı AccessDenied'a düşer", () => {
    mockQueries({ isError: true, error: new BackendError(403, { detail: "yasak" }) });
    render(<ArchiveDocumentsView />);
    expect(screen.getByText("Bu alana yetkiniz yok")).toBeInTheDocument();
  });

  it("documents:view kullanıcısında yazma tetikleyicileri HİÇ basılmaz", () => {
    mockSession("view");
    render(<ArchiveDocumentsView />);
    expect(screen.queryByRole("button", { name: "↑ Yükle" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "+ Yeni Klasör" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Dosya Yükle" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Yeni klasör" })).not.toBeInTheDocument();
  });

  it("documents:full kullanıcısında üç yazma tetikleyicisi de vardır", () => {
    render(<ArchiveDocumentsView />);
    expect(screen.getByRole("button", { name: "↑ Yükle" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Yeni Klasör" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dosya Yükle" })).toBeInTheDocument();
  });

  /**
   * 🔴 Kayıt 72 — `DocumentFolderPanel`e geçen `canWrite` yalnız yazma
   * iznine bakıyordu, diğer ÜÇ yazma tetikleyicisinin ("↑ Yükle" · "+ Yeni
   * Klasör" · panel diyaloğunun kendisi) hepsi `selectedProjectId`e de
   * bağlıyken panelin '+' düğmesi (aria-label "Yeni klasör") unutulmuştu —
   * proje seçilmeden de tıklanabilir görünüyordu.
   */
  it("proje SEÇİLMEDEN documents:full olsa bile panelin '+' düğmesi basılmaz", () => {
    searchParams = new URLSearchParams();
    render(<ArchiveDocumentsView />);
    expect(screen.queryByRole("button", { name: "Yeni klasör" })).not.toBeInTheDocument();
  });

  // F-BLG T3/G3 — İKİ yükleme girişi de KALIR (yönetim kararı), şartı
  // kullanıcının ayırt edebilmesidir. Ayrım ETİKETTEDİR, `title`da değil.
  it("iki yükleme girişi ekranda AYIRT EDİLEBİLİR etiketlerle durur", () => {
    render(<ArchiveDocumentsView />);

    const scoped = screen.getByRole("button", { name: "↑ Yükle" });
    const standalone = screen.getByTestId("e12-belge-ekle");

    expect(scoped).toBeInTheDocument();
    expect(standalone).toHaveTextContent("+ Belge Ekle (proje seçerek)");
    expect(standalone).not.toHaveAttribute("title");
    expect(standalone).not.toBe(scoped);
  });

  it("proje seçilmemişken yükleme tetikleyicisi basılmaz (project_id zorunlu)", () => {
    searchParams = new URLSearchParams();
    render(<ArchiveDocumentsView />);
    expect(screen.queryByRole("button", { name: "↑ Yükle" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Dosya Yükle" })).not.toBeInTheDocument();
  });
});

describe("ArchiveDocumentsView · T3 diyalogları (siteId GEÇİLMEDEN)", () => {
  it("'↑ Yükle' yükleme diyaloğunu açar; hedef klasör aktif klasördür", async () => {
    const user = userEvent.setup();
    render(<ArchiveDocumentsView />);
    await user.click(screen.getByRole("button", { name: "↑ Yükle" }));
    const dialog = screen.getByRole("dialog", { name: "Belge Yükle" });
    expect(within(dialog).getByLabelText("Klasör")).toHaveValue("df-2");
  });

  it("kesikli 'Dosya Yükle' kartı da yükleme diyaloğunu açar", async () => {
    const user = userEvent.setup();
    render(<ArchiveDocumentsView />);
    await user.click(screen.getByRole("button", { name: "Dosya Yükle" }));
    expect(screen.getByRole("dialog", { name: "Belge Yükle" })).toBeInTheDocument();
  });

  it("'+ Yeni Klasör' klasör diyaloğunu açar", async () => {
    const user = userEvent.setup();
    render(<ArchiveDocumentsView />);
    await user.click(screen.getByRole("button", { name: "+ Yeni Klasör" }));
    expect(screen.getByRole("dialog", { name: "Yeni Klasör" })).toBeInTheDocument();
  });
});

// BASILMAYANLAR (spec §4) — sızıntı taraması.
describe("ArchiveDocumentsView · BASILMAYANLAR", () => {
  it("belge silme / klasör yeniden adlandırma-silme / versiyon yüzeyi yoktur", () => {
    render(<ArchiveDocumentsView />);
    expect(screen.queryByRole("button", { name: /sil/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /yeniden adlandır/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/versiyon/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/onay bekliyor/i)).not.toBeInTheDocument();
  });

  it("şantiye kırılımı E12'de YOKTUR (ŞB'nin işi)", () => {
    render(<ArchiveDocumentsView />);
    expect(screen.queryByText(/şantiye/i)).not.toBeInTheDocument();
  });
});
