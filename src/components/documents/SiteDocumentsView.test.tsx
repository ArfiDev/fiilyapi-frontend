import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SiteDocumentsView } from "./SiteDocumentsView";
import { useSession } from "@/components/shell/SessionProvider";
import { useDocumentFolders } from "@/lib/api/hooks/useDocumentFolders";
import { useDocuments } from "@/lib/api/hooks/useDocuments";
import { downloadDocument } from "@/lib/api/documents-client";
import { BackendError } from "@/lib/api/unwrap";
import type { MeResponse } from "@/lib/auth/types";
import { ALL_PAGE_KEYS, fullAccessPages, pagesFor } from "@/lib/auth/page-grants.testkit";

// F-BC T2 · ŞB ekranının OKUMA davranışları: klasör paneli, kart ızgarası,
// "Son Eklenenler" listesi, indirme, kapsam (`site_id` HER istekte), URL
// durumu (`?folder=`/`?q=`), boş durumlar ve izin kapıları.
// Saf türevler kendi dosyalarında test edilir (document-format / recent-documents).

const replace = vi.fn();
let searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useParams: () => ({ projectId: "p-1", siteId: "s-1" }),
  usePathname: () => "/projeler/p-1/santiyeler/s-1/belgeler",
  useRouter: () => ({ replace }),
  useSearchParams: () => searchParams,
}));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("@/lib/api/hooks/useDocumentFolders", () => ({ useDocumentFolders: vi.fn() }));
vi.mock("@/lib/api/hooks/useDocuments", () => ({ useDocuments: vi.fn() }));
vi.mock("@/lib/api/documents-client", () => ({ downloadDocument: vi.fn() }));
// T3 diyalogları gerçek mutasyon hook'larını çağırır; burada ağ katmanı değil
// yalnız KANCA bağlantısı sınanır (diyalogların kendi testleri ayrı dosyada).
vi.mock("@/lib/api/hooks/useDocumentMutations", () => ({
  useUploadDocument: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useCreateDocumentFolder: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));
vi.mock("@/lib/api/hooks/useSites", () => ({
  useSite: vi.fn(() => ({
    data: { id: "s-1", name: "A-Blok Şantiyesi", project: { id: "p-1", name: "Güneşkent Konut" } },
  })),
}));

const BASE_ME = {
  id: "11111111-1111-1111-1111-111111111111",
  email: "sef@ornek.com",
  full_name: "Sercan Öztürk",
  role_key: "site_chief",
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

const FOLDERS = [
  { id: "df-1", project_id: "p-1", site_id: "s-1", parent_id: null, name: "Sözleşmeler", created_at: "2025-03-03T08:00:00Z" },
  { id: "df-2", project_id: "p-1", site_id: "s-1", parent_id: null, name: "Hakedişler", created_at: "2025-03-03T08:01:00Z" },
];

const DOCUMENTS = [
  {
    id: "doc-1",
    folder_id: "df-2",
    project_id: "p-1",
    site_id: "s-1",
    filename: "Hakediş_5_Jul2026.pdf",
    mime_type: "application/pdf",
    size_bytes: 1258291,
    description: null,
    uploaded_by_name: "Sercan Öztürk",
    created_at: "2026-07-17T06:00:00Z",
  },
  {
    id: "doc-2",
    folder_id: "df-2",
    project_id: "p-1",
    site_id: "s-1",
    filename: "Puantaj_Tem2026.xlsx",
    mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    size_bytes: 860160,
    description: "Aylık denetim",
    uploaded_by_name: "Sercan Öztürk",
    created_at: "2026-07-16T06:00:00Z",
  },
];

type QueryStub = { data?: unknown; isLoading?: boolean; isError?: boolean; error?: unknown };

function mockQueries(
  documents: QueryStub = { data: { documents: DOCUMENTS } },
  folders: QueryStub = { data: { folders: FOLDERS } },
) {
  vi.mocked(useDocuments).mockReturnValue({
    isLoading: false,
    isError: false,
    error: null,
    ...documents,
  } as ReturnType<typeof useDocuments>);
  vi.mocked(useDocumentFolders).mockReturnValue({
    isLoading: false,
    isError: false,
    error: null,
    ...folders,
  } as ReturnType<typeof useDocumentFolders>);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-07-17T13:00:00Z"));
  searchParams = new URLSearchParams();
  mockSession("full");
  mockQueries();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("SiteDocumentsView — klasör paneli (ŞB 37-69)", () => {
  it("panel başlığı şantiye adını taşır ve 'Tüm Belgeler' kökü ile klasörleri basar", () => {
    render(<SiteDocumentsView />);
    const panel = screen.getByRole("navigation", { name: "Belge klasörleri" });
    expect(within(panel).getByText("A-Blok Şantiyesi Klasörleri")).toBeInTheDocument();
    expect(within(panel).getByRole("link", { name: /Tüm Belgeler/ })).toBeInTheDocument();
    expect(within(panel).getByRole("link", { name: /Sözleşmeler/ })).toBeInTheDocument();
    expect(within(panel).getByRole("link", { name: /Hakedişler/ })).toBeInTheDocument();
  });

  it("klasör seçimi URL durumuna yazılır (?folder=)", () => {
    render(<SiteDocumentsView />);
    const link = screen.getByRole("link", { name: /Hakedişler/ });
    expect(link).toHaveAttribute("href", "/projeler/p-1/santiyeler/s-1/belgeler?folder=df-2");
  });

  it("'Tüm Belgeler' kökü folder parametresini TAŞIMAZ (klasör süzgeci yok)", () => {
    searchParams = new URLSearchParams("folder=df-2");
    render(<SiteDocumentsView />);
    expect(screen.getByRole("link", { name: /Tüm Belgeler/ })).toHaveAttribute(
      "href",
      "/projeler/p-1/santiyeler/s-1/belgeler",
    );
  });

  it("aktif klasör aria-current taşır", () => {
    searchParams = new URLSearchParams("folder=df-2");
    render(<SiteDocumentsView />);
    expect(screen.getByRole("link", { name: /Hakedişler/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /Tüm Belgeler/ })).not.toHaveAttribute("aria-current");
  });

  it("klasörsüz şantiyede boş-durum metni basar (uydurma satır YOK)", () => {
    mockQueries(undefined, { data: { folders: [] } });
    render(<SiteDocumentsView />);
    expect(screen.getByText("Bu şantiyede henüz klasör yok.")).toBeInTheDocument();
  });
});

describe("SiteDocumentsView — başlık bloğu (ŞB 82-91)", () => {
  it("breadcrumb metni aktif klasörü, başlık '<Şantiye> — Belgeler' basar", () => {
    render(<SiteDocumentsView />);
    expect(screen.getByRole("heading", { level: 1, name: "A-Blok Şantiyesi — Belgeler" })).toBeInTheDocument();
    expect(screen.getByText("Tüm Belgeler", { selector: ".sdoc__crumb" })).toBeInTheDocument();
  });

  it("klasör seçiliyken breadcrumb o klasörün adını basar", () => {
    searchParams = new URLSearchParams("folder=df-1");
    render(<SiteDocumentsView />);
    expect(screen.getByText("Sözleşmeler", { selector: ".sdoc__crumb" })).toBeInTheDocument();
  });

  it("arama kutusu yazıldıkça ?q= URL durumuna yazılır", async () => {
    const user = userEvent.setup();
    render(<SiteDocumentsView />);
    await user.type(screen.getByRole("searchbox", { name: "Belge ara" }), "r");
    expect(replace).toHaveBeenCalledWith(
      "/projeler/p-1/santiyeler/s-1/belgeler?q=r",
      { scroll: false },
    );
  });
});

describe("SiteDocumentsView — kapsam kuralı (spec §2: site_id HER istekte)", () => {
  it("hem klasör hem belge sorgusu site_id ile çağrılır", () => {
    render(<SiteDocumentsView />);
    expect(useDocumentFolders).toHaveBeenCalledWith("p-1", "s-1");
    expect(useDocuments).toHaveBeenCalledWith("p-1", {
      siteId: "s-1",
      folderId: undefined,
      q: undefined,
    });
  });

  it("klasör ve arama süzgeçleri isteğe geçer, site_id yine taşınır", () => {
    searchParams = new URLSearchParams("folder=df-2&q=ruhsat");
    render(<SiteDocumentsView />);
    expect(useDocuments).toHaveBeenCalledWith("p-1", {
      siteId: "s-1",
      folderId: "df-2",
      q: "ruhsat",
    });
  });
});

describe("SiteDocumentsView — kart ızgarası (ŞB 94-133)", () => {
  it("her belge için tip ikonu, ad ve 'boyut · tarih' basar", () => {
    render(<SiteDocumentsView />);
    const card = screen.getByRole("button", { name: /Hakediş_5_Jul2026\.pdf/ });
    expect(within(card).getByText("📄")).toBeInTheDocument();
    expect(within(card).getByText("1,2 MB · Bugün")).toBeInTheDocument();
  });

  it("kart tıklaması belgeyi indirir (spec §6 S1 — tek anlamlı eylem)", async () => {
    const user = userEvent.setup();
    render(<SiteDocumentsView />);
    await user.click(screen.getByRole("button", { name: /Hakediş_5_Jul2026\.pdf/ }));
    expect(downloadDocument).toHaveBeenCalledWith("doc-1", "Hakediş_5_Jul2026.pdf");
  });

  it("indirme hatası Türkçe ve görünür basılır (sessiz yutma YOK)", async () => {
    const user = userEvent.setup();
    vi.mocked(downloadDocument).mockRejectedValueOnce(
      new BackendError(404, { detail: "Belge bulunamadı" }),
    );
    render(<SiteDocumentsView />);
    await user.click(screen.getByRole("button", { name: /Hakediş_5_Jul2026\.pdf/ }));
    expect(await screen.findByText("Belge bulunamadı")).toBeInTheDocument();
  });

  it("belgesiz klasörde boş-durum metni basar", () => {
    mockQueries({ data: { documents: [] } });
    render(<SiteDocumentsView />);
    expect(screen.getByText("Bu klasörde henüz belge yok.")).toBeInTheDocument();
  });

  it("aramada sonuç yoksa aramaya özel boş-durum metni basar", () => {
    searchParams = new URLSearchParams("q=yok");
    mockQueries({ data: { documents: [] } });
    render(<SiteDocumentsView />);
    expect(screen.getByText("Aramanızla eşleşen belge bulunamadı.")).toBeInTheDocument();
  });

  it("yükleme ve hata durumları ayrı metinlerle basılır", () => {
    mockQueries({ isLoading: true, data: undefined });
    const view = render(<SiteDocumentsView />);
    expect(screen.getByText("Belgeler yükleniyor…")).toBeInTheDocument();

    mockQueries({ isError: true, data: undefined, error: new Error("kopuk") });
    view.rerender(<SiteDocumentsView />);
    expect(screen.getByText("Belgeler yüklenemedi.")).toBeInTheDocument();
  });
});

describe("SiteDocumentsView — Son Eklenenler listesi (ŞB 137-164)", () => {
  it("satırda ikon, ad, 'klasör · açıklama' meta satırı, boyut, tarih ve İndir butonu vardır", () => {
    render(<SiteDocumentsView />);
    const list = screen.getByRole("list", { name: "Son eklenen belgeler" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(2);

    const first = rows[0];
    expect(within(first).getByText("Hakediş_5_Jul2026.pdf")).toBeInTheDocument();
    // Açıklaması olmayan belgede meta satırı YALNIZ klasör adını taşır.
    expect(within(first).getByText("Hakedişler")).toBeInTheDocument();
    expect(within(first).getByText("1,2 MB")).toBeInTheDocument();
    expect(within(first).getByText("Bugün 09:00")).toBeInTheDocument();

    const second = rows[1];
    expect(within(second).getByText("Hakedişler · Aylık denetim")).toBeInTheDocument();
    expect(within(second).getByText("Dün")).toBeInTheDocument();
  });

  it("İndir butonu o satırın belgesini indirir", async () => {
    const user = userEvent.setup();
    render(<SiteDocumentsView />);
    const list = screen.getByRole("list", { name: "Son eklenen belgeler" });
    const rows = within(list).getAllByRole("listitem");
    await user.click(within(rows[1]).getByRole("button", { name: "İndir" }));
    expect(downloadDocument).toHaveBeenCalledWith("doc-2", "Puantaj_Tem2026.xlsx");
  });

  it("belge yokken liste paneli hiç basılmaz (grid'in boş durumu yeterli)", () => {
    mockQueries({ data: { documents: [] } });
    render(<SiteDocumentsView />);
    expect(screen.queryByRole("list", { name: "Son eklenen belgeler" })).not.toBeInTheDocument();
  });
});

describe("SiteDocumentsView — izin kapıları (documents modülü)", () => {
  it("okuma izni yoksa ekran hiç basılmaz", () => {
    mockSession("none");
    render(<SiteDocumentsView />);
    expect(screen.getByText("Bu alana yetkiniz yok")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
  });

  it("403 yanıtı da yetki ekranına düşer", () => {
    mockQueries({ isError: true, data: undefined, error: new BackendError(403, null) });
    render(<SiteDocumentsView />);
    expect(screen.getByText("Bu alana yetkiniz yok")).toBeInTheDocument();
  });

  it("yazma izni olanda üç yazma tetikleyicisi de basılır (ŞB 40, 88, 89, 130)", () => {
    render(<SiteDocumentsView />);
    expect(screen.getByRole("button", { name: "↑ Yükle" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Klasör" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Yeni klasör" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dosya Yükle" })).toBeInTheDocument();
  });

  it("yalnız okuma izninde yazma tetikleyicileri GİZLENİR, okuma yüzeyi durur", () => {
    mockSession("view");
    render(<SiteDocumentsView />);
    expect(screen.queryByRole("button", { name: "↑ Yükle" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "+ Klasör" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Yeni klasör" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Dosya Yükle" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Hakediş_5_Jul2026\.pdf/ })).toBeInTheDocument();
  });
});

describe("SiteDocumentsView — T3 diyalog kancaları", () => {
  it("'↑ Yükle' düğmesi yükleme diyaloğunu açar", async () => {
    const user = userEvent.setup();
    render(<SiteDocumentsView />);
    await user.click(screen.getByRole("button", { name: "↑ Yükle" }));
    expect(screen.getByRole("dialog", { name: "Belge Yükle" })).toBeInTheDocument();
  });

  it("kesikli 'Dosya Yükle' kartı da AYNI diyaloğu açar (ŞB 130-133)", async () => {
    const user = userEvent.setup();
    render(<SiteDocumentsView />);
    await user.click(screen.getByRole("button", { name: "Dosya Yükle" }));
    expect(screen.getByRole("dialog", { name: "Belge Yükle" })).toBeInTheDocument();
  });

  it("yükleme diyaloğu aktif klasörü hedef olarak ön seçer", async () => {
    const user = userEvent.setup();
    searchParams = new URLSearchParams("folder=df-2");
    render(<SiteDocumentsView />);
    await user.click(screen.getByRole("button", { name: "↑ Yükle" }));
    expect(screen.getByLabelText("Klasör")).toHaveValue("df-2");
  });

  it("'+ Klasör' ve panel '+' düğmesi yeni klasör diyaloğunu açar", async () => {
    const user = userEvent.setup();
    render(<SiteDocumentsView />);

    await user.click(screen.getByRole("button", { name: "+ Klasör" }));
    expect(screen.getByRole("dialog", { name: "Yeni Klasör" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Vazgeç" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Yeni klasör" }));
    expect(screen.getByRole("dialog", { name: "Yeni Klasör" })).toBeInTheDocument();
  });

  it("diyaloglar şantiye kapsamını taşır (site_id ŞB'de HER zaman geçer)", async () => {
    const user = userEvent.setup();
    render(<SiteDocumentsView />);
    await user.click(screen.getByRole("button", { name: "↑ Yükle" }));
    // Kapsam kanıtı gönderim yolundadır; burada diyaloğun ŞANTİYE klasörlerini
    // (proje düzeyini değil) seçenek olarak sunduğu doğrulanır.
    const select = screen.getByLabelText("Klasör");
    expect(within(select).getByRole("option", { name: "Hakedişler" })).toBeInTheDocument();
  });

  it("okuma izninde diyalog açacak hiçbir tetikleyici yoktur", () => {
    mockSession("view");
    render(<SiteDocumentsView />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "↑ Yükle" })).not.toBeInTheDocument();
  });
});

// BASILMAYANLAR (spec §4) — sızıntı olursa bu testler kırılır.
describe("SiteDocumentsView — basılmayan yüzeyler (spec §4)", () => {
  it("belge silme, klasör yeniden adlandırma/silme düğmeleri YOKTUR", () => {
    render(<SiteDocumentsView />);
    const labels = screen.getAllByRole("button").map((b) => b.textContent ?? "");
    expect(labels.some((l) => /sil/i.test(l))).toBe(false);
    expect(labels.some((l) => /yeniden adlandır/i.test(l))).toBe(false);
    expect(screen.queryByRole("button", { name: /kaldır/i })).not.toBeInTheDocument();
  });

  it("versiyon/onay/etiket yüzeyi YOKTUR", () => {
    render(<SiteDocumentsView />);
    expect(screen.queryByText(/versiyon/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/onayla/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/etiket/i)).not.toBeInTheDocument();
  });
});
