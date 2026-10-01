import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, fireEvent, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import BoqPage from "./page";
import { downloadBoqExport } from "@/lib/api/boq-client";
import { useSite } from "@/lib/api/hooks/useSites";
import { useBoq } from "@/lib/api/hooks/useBoq";
import { BackendError } from "@/lib/api/unwrap";
import { useSession } from "@/components/shell/SessionProvider";
import type { SiteDetail } from "@/lib/api/hooks/useSites";
import type { BoqListResponse } from "@/lib/api/hooks/useBoq";

vi.mock("@/lib/api/hooks/useSites", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useSites")>()),
  useSite: vi.fn(),
}));

vi.mock("@/lib/api/hooks/useBoq", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useBoq")>()),
  useBoq: vi.fn(),
}));

const PROJECT_ID = "11111111-1111-1111-1111-111111111111";
const SITE_ID = "44444444-4444-4444-4444-444444444444";

vi.mock("next/navigation", () => ({
  useParams: () => ({ projectId: PROJECT_ID, siteId: SITE_ID }),
  usePathname: () => `/projeler/${PROJECT_ID}/santiyeler/${SITE_ID}/is-kalemleri`,
}));

// Modal gercek bilesen olarak render edilir (baglantiyi dogrulamak icin);
// yalniz yazma uclari taklit edilir — sayfa testi aga cikmaz.
vi.mock("@/lib/api/hooks/useBoqMutations", () => ({
  useCreateBoqGroup: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateBoqItem: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateBoqItem: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteBoqItem: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

// Indirme istemcisi (F9) — tarayici indirme akisi ayri dosyada testli.
vi.mock("@/lib/api/boq-client", () => ({ downloadBoqExport: vi.fn() }));

// Izin kapisi oturum yukunden okunur (spec §2.5.2); sayfa testinde gercek
// hook calisir, yalniz oturum kaynagi taklit edilir.
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));

/** `level` verilmezse alanı taşımayan eski oturum (bilinmezlik dalı, §2.5.3). */
function mockPermission(level?: string) {
  const base = { id: "u1", email: "a@b.c", full_name: "A", role_key: "admin", status: "active" };
  vi.mocked(useSession).mockReturnValue({
    me: (level === undefined ? base : { ...base, permissions: { boq: level } }) as never,
    isLoading: false,
  });
}

const SITE = {
  id: SITE_ID,
  name: "A-Blok Şantiyesi",
  project: { id: PROJECT_ID, name: "Güneşkent Konut" },
} as unknown as SiteDetail;

const EMPTY_BOQ: BoqListResponse = {
  groups: [],
  totals: {
    contract_total: { available: false, value: null, pending_module: "contracts" },
    realized_total: { available: false, value: null, pending_module: "progress_payments" },
    remaining_total: { available: false, value: null, pending_module: "progress_payments" },
    revision_total: { available: false, value: null, pending_module: "contracts" },
    grand_total: "0.00",
    grand_progress_pct: { available: false, value: null, pending_module: "progress_payments" },
  },
};

const FULL_BOQ: BoqListResponse = {
  ...EMPTY_BOQ,
  groups: [
    {
      id: "gggggggg-0000-0000-0000-000000000001",
      name: "Toprak ve Temel İşleri",
      sort_order: 10,
      group_total: "347200.00",
      items: [
        {
          id: "aaaaaaaa-0000-0000-0000-000000000001",
          code: "01.001",
          description: "Kazı (Makine ile)",
          unit: "m³",
          quantity: "1240.000",
          unit_price: "280.00",
          amount: "347200.00",
          sort_order: 0,
          contract_item_id: null,
          allocated_quantity: "0.000",
          unallocated_quantity: "1240.000",
          progress_pct: { available: false, value: null, pending_module: "progress_payments" },
        },
      ],
    },
  ],
};

function mockSite(value: Partial<ReturnType<typeof useSite>>) {
  vi.mocked(useSite).mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    ...value,
  } as never);
}

function mockBoq(value: Partial<ReturnType<typeof useBoq>>) {
  vi.mocked(useBoq).mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    ...value,
  } as never);
}

describe("BoqPage — durum dalları (spec §9)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPermission();
    mockSite({ data: SITE });
  });

  it("yükleniyorken Yükleniyor… basar", () => {
    mockBoq({ isLoading: true });
    render(<BoqPage />);
    expect(screen.getByText("Yükleniyor…")).toBeInTheDocument();
  });

  it("403 alındığında AccessDenied basar", () => {
    mockBoq({ isError: true, error: new BackendError(403, { detail: "yasak" }) });
    render(<BoqPage />);
    expect(screen.getByText("Bu alana yetkiniz yok")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1, name: "İş Kalemleri (BOQ)" })).not.toBeInTheDocument();
  });

  it("diğer hatada İş kalemleri yüklenemedi basar", () => {
    mockBoq({ isError: true, error: new Error("patladi") });
    render(<BoqPage />);
    expect(screen.getByText("İş kalemleri yüklenemedi")).toBeInTheDocument();
  });
});

describe("BoqPage — başlık şeridi ve breadcrumb (mockup 62–67)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPermission();
    mockSite({ data: SITE });
    mockBoq({ data: EMPTY_BOQ });
  });

  it("başlık İş Kalemleri (BOQ) olarak tek h1 ile basılır", () => {
    render(<BoqPage />);
    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("İş Kalemleri (BOQ)");
  });

  it("iki eylem butonu mockup metinleriyle basılır (66, 67)", () => {
    const { container } = render(<BoqPage />);
    const titleBar = container.querySelector(".boq__title-bar") as HTMLElement;
    expect(within(titleBar).getByRole("button", { name: "Excel İndir" })).toBeInTheDocument();
    expect(within(titleBar).getByRole("button", { name: "+ İş Kalemi" })).toBeInTheDocument();
  });

  // BDG-F1.3 · K2: Bölüm Dağılımı ayrı sayfadır; başlıktaki bağlantı.
  it("Bölüm Dağılımı bağlantısı başlık şeridinde, doğru adrese gider", () => {
    const { container } = render(<BoqPage />);
    const titleBar = container.querySelector(".boq__title-bar") as HTMLElement;
    expect(within(titleBar).getByRole("link", { name: "Bölüm Dağılımı" })).toHaveAttribute(
      "href",
      `/projeler/${PROJECT_ID}/santiyeler/${SITE_ID}/is-kalemleri/bolum-dagilimi`,
    );
  });

  it("veri geldiğinde poz tablosunu basar", () => {
    render(<BoqPage />);
    expect(screen.getByText("İş kalemleri listesi")).toBeInTheDocument();
    expect(screen.getByText("Bu şantiyede henüz iş kalemi tanımlanmadı.")).toBeInTheDocument();
  });

  it("breadcrumb şantiyeye geri link verir ve proje/şantiye adını gösterir", () => {
    render(<BoqPage />);
    const back = screen.getByRole("link", { name: "← A-Blok Şantiyesi" });
    expect(back).toHaveAttribute("href", `/projeler/${PROJECT_ID}/santiyeler/${SITE_ID}`);
    expect(screen.getByText(/Güneşkent Konut \/ A-Blok Şantiyesi/)).toBeInTheDocument();
  });

  // Onaylı sapma C (spec §2.3, §13): sözleşme numarası uydurulmaz, görünür yer
  // tutucu da basılmaz.
  it("breadcrumb sözleşme numarası basmaz", () => {
    const { container } = render(<BoqPage />);
    const crumb = container.querySelector(".boq__crumb") as HTMLElement;
    expect(crumb).toBeInTheDocument();
    expect(crumb.textContent).not.toMatch(/SZL-/);
    expect(crumb.textContent).not.toMatch(/Sözleşme/);
  });

  // spec §9 sonu: şeridin verisi zaten sorguya bağlı değil (dördü de yer tutucu).
  it("kart şeridi yükleme ve hata durumlarında da basılır", () => {
    mockBoq({ isLoading: true });
    const { unmount } = render(<BoqPage />);
    expect(screen.getAllByTestId("boq-kpi")).toHaveLength(4);
    unmount();

    mockBoq({ isError: true, error: new Error("patladi") });
    render(<BoqPage />);
    expect(screen.getAllByTestId("boq-kpi")).toHaveLength(4);
  });

  it("şantiye yüklenmemişken breadcrumb hiç basılmaz (uydurma etiket yok)", () => {
    mockSite({ isLoading: true });
    render(<BoqPage />);
    expect(screen.queryByRole("link", { name: /←/ })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "İş Kalemleri (BOQ)" })).toBeInTheDocument();
  });
});

describe("BoqPage — istemci izin kapısı (spec §2.5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSite({ data: SITE });
    mockBoq({ data: EMPTY_BOQ });
  });

  it("canWrite false iken + İş Kalemi butonu DOM'da yok", () => {
    mockPermission("view");
    render(<BoqPage />);
    expect(screen.queryByRole("button", { name: "+ İş Kalemi" })).not.toBeInTheDocument();
  });

  // Bölüm Dağılımı bağlantısı da okuma yüzeyidir (`boq:view` yeter) — gizlenmez.
  it("canWrite false iken Bölüm Dağılımı bağlantısı görünür kalır", () => {
    mockPermission("view");
    render(<BoqPage />);
    expect(screen.getByRole("link", { name: "Bölüm Dağılımı" })).toBeInTheDocument();
  });

  // "Excel İndir" okuma ucudur (`boq:view` yeter) — gizlenmez.
  it("canWrite false iken Excel İndir butonu görünür kalır", () => {
    mockPermission("view");
    render(<BoqPage />);
    expect(screen.getByRole("button", { name: "Excel İndir" })).toBeInTheDocument();
  });

  it("canWrite true iken + İş Kalemi butonu görünür", () => {
    mockPermission("full");
    render(<BoqPage />);
    expect(screen.getAllByRole("button", { name: "+ İş Kalemi" }).length).toBeGreaterThan(0);
  });

  // ⚠️ Bilinmezlik kuralı (spec §2.5.3): alanı taşımayan ESKİ oturum. Kural ters
  // çevrilirse tam yetkili kullanıcı ekranı salt-okunur görür.
  it("izin alanı yokken yazma butonu görünür kalır (eski oturum)", () => {
    mockPermission();
    render(<BoqPage />);
    expect(screen.getAllByRole("button", { name: "+ İş Kalemi" }).length).toBeGreaterThan(0);
  });

  // Boş durumdaki buton başlık şeridindeki butonun ikizidir; aynı kapıya bağlanır,
  // yoksa salt-okunur kullanıcıya çalışmayan bir yazma yüzeyi kalır.
  it("canWrite false iken boş durumdaki + İş Kalemi butonu da basılmaz", () => {
    mockPermission("view");
    render(<BoqPage />);
    expect(screen.getByText("Bu şantiyede henüz iş kalemi tanımlanmadı.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "+ İş Kalemi" })).not.toBeInTheDocument();
  });
});

// F8: yazma yüzeylerinin modale bağlanması (spec §7.1, §7.2).
describe("BoqPage — BoqItemFormModal bağlantısı (spec §7)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPermission("full");
    mockSite({ data: SITE });
    mockBoq({ data: FULL_BOQ });
  });

  it("başlangıçta modal kapalıdır", () => {
    render(<BoqPage />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("+ İş Kalemi modalı create kipinde açar", () => {
    render(<BoqPage />);
    fireEvent.click(screen.getByRole("button", { name: "+ İş Kalemi" }));
    expect(screen.getByRole("dialog", { name: "Yeni İş Kalemi" })).toBeInTheDocument();
  });

  it("boş durumdaki + İş Kalemi de modalı açar", () => {
    mockBoq({ data: EMPTY_BOQ });
    render(<BoqPage />);
    // Başlık şeridindeki ikiziyle karışmaması için boş durum hücresine kapsanır.
    const emptyCell = screen.getByTestId("boq-empty");
    fireEvent.click(within(emptyCell).getByRole("button", { name: "+ İş Kalemi" }));
    expect(screen.getByRole("dialog", { name: "Yeni İş Kalemi" })).toBeInTheDocument();
  });

  it("poz satırına tıklamak modalı edit kipinde ve dolu açar", () => {
    render(<BoqPage />);
    fireEvent.click(
      screen.getByRole("button", { name: "01.001 — Kazı (Makine ile) kalemini düzenle" }),
    );
    expect(screen.getByRole("dialog", { name: "İş Kalemi Düzenle" })).toBeInTheDocument();
    expect(screen.getByLabelText("Poz No")).toHaveValue("01.001");
  });

  // F13 / §7.5.6: sayfanin silme kapisi modale KADAR tasinmali — modal kendi
  // kapisini kurmaz, aksi halde iki ayri dogruluk kaynagi olur.
  //
  // ⚠️ Kapi `canWrite` DEGIL `canDelete`'tir (kullanici karari: silme yalniz
  // sistem yoneticisinde). `full` seviyeli kullanici yazar ama silemez.
  it("boq: 'full' kullanıcı Sil'i görmez ama Kaydet'i görür", () => {
    mockPermission("full");
    render(<BoqPage />);
    fireEvent.click(
      screen.getByRole("button", { name: "01.001 — Kazı (Makine ile) kalemini düzenle" }),
    );
    expect(screen.getByRole("button", { name: "Kaydet" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sil" })).not.toBeInTheDocument();
  });

  it("boq: 'admin' kullanıcı Sil'i görür", () => {
    mockPermission("admin");
    render(<BoqPage />);
    fireEvent.click(
      screen.getByRole("button", { name: "01.001 — Kazı (Makine ile) kalemini düzenle" }),
    );
    expect(screen.getByRole("button", { name: "Sil" })).toBeInTheDocument();
  });

  // Bilinmezlik kurali: alani tasimayan eski oturumda silme yuzeyi KALIR.
  it("izin alanı yokken (eski oturum) Sil görünür kalır", () => {
    mockPermission();
    render(<BoqPage />);
    fireEvent.click(
      screen.getByRole("button", { name: "01.001 — Kazı (Makine ile) kalemini düzenle" }),
    );
    expect(screen.getByRole("button", { name: "Sil" })).toBeInTheDocument();
  });

  it("Vazgeç modalı kapatır", () => {
    render(<BoqPage />);
    fireEvent.click(screen.getByRole("button", { name: "+ İş Kalemi" }));
    fireEvent.click(screen.getByRole("button", { name: "Vazgeç" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("canWrite false iken satır tetikleyicisi hiç basılmaz", () => {
    mockPermission("view");
    render(<BoqPage />);
    expect(
      screen.queryByRole("button", { name: "01.001 — Kazı (Makine ile) kalemini düzenle" }),
    ).not.toBeInTheDocument();
  });
});

// F9: "Excel İndir" durumları (spec §8.3, metin envanteri §9.2 #4-6).
describe("BoqPage — Excel İndir (spec §8.3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPermission("full");
    mockSite({ data: SITE });
    mockBoq({ data: EMPTY_BOQ });
  });

  function excelButton(): HTMLElement {
    return screen.getByRole("button", { name: /Excel İndir|İndiriliyor…/ });
  }

  it("tıklanınca şantiyenin export ucunu çağırır", async () => {
    vi.mocked(downloadBoqExport).mockResolvedValue(undefined);
    render(<BoqPage />);
    fireEvent.click(excelButton());
    await waitFor(() => expect(downloadBoqExport).toHaveBeenCalledWith(SITE_ID));
  });

  it("indirme sürerken buton disabled ve İndiriliyor… yazar", async () => {
    let release: () => void = () => {};
    vi.mocked(downloadBoqExport).mockReturnValue(
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    );
    render(<BoqPage />);
    fireEvent.click(excelButton());
    await waitFor(() => expect(screen.getByRole("button", { name: "İndiriliyor…" })).toBeDisabled());
    await act(async () => {
      release();
    });
    expect(await screen.findByRole("button", { name: "Excel İndir" })).toBeEnabled();
  });

  it("403'te 'Bu işlem için yetkiniz yok' satırı basılır", async () => {
    vi.mocked(downloadBoqExport).mockRejectedValue(new BackendError(403, { detail: "yasak" }));
    render(<BoqPage />);
    fireEvent.click(excelButton());
    expect(await screen.findByText("Bu işlem için yetkiniz yok")).toBeInTheDocument();
  });

  it("diğer hatada 'Excel dosyası indirilemedi.' basılır", async () => {
    vi.mocked(downloadBoqExport).mockRejectedValue(new BackendError(500, null));
    render(<BoqPage />);
    fireEvent.click(excelButton());
    expect(await screen.findByText("Excel dosyası indirilemedi.")).toBeInTheDocument();
  });

  it("başarıda ek geri bildirim basılmaz", async () => {
    vi.mocked(downloadBoqExport).mockResolvedValue(undefined);
    render(<BoqPage />);
    fireEvent.click(excelButton());
    await waitFor(() => expect(downloadBoqExport).toHaveBeenCalled());
    expect(screen.queryByText("Excel dosyası indirilemedi.")).not.toBeInTheDocument();
    expect(screen.queryByText("Bu işlem için yetkiniz yok")).not.toBeInTheDocument();
  });

  // Okuma ucudur: `boq:view` yeter → izin kapısı bu butona uygulanmaz.
  it("canWrite false iken de indirme çalışır", async () => {
    mockPermission("view");
    vi.mocked(downloadBoqExport).mockResolvedValue(undefined);
    render(<BoqPage />);
    fireEvent.click(excelButton());
    await waitFor(() => expect(downloadBoqExport).toHaveBeenCalledWith(SITE_ID));
  });
});

// Spec §10 — sayfa düzeyinde a11y sözleşmesi (F11 denetimi).
describe("BoqPage — a11y (spec §10)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSite({ data: SITE });
    mockBoq({ data: FULL_BOQ });
  });

  it("odak sırası okuma yönünü izler: sekme şeridi → breadcrumb → Bölüm Dağılımı → Excel İndir → + İş Kalemi → satır", async () => {
    mockPermission("full");
    const user = userEvent.setup();
    render(<BoqPage />);
    const expected = [
      // Kayıt 303 — `SiteDetailTabs` artık bu sayfada da basılır (kardeş
      // görünümlerle aynı desen), yani şerit ilk odaklanabilir öğe olur.
      "Bölümler",
      "İş Kalemleri",
      "Puantaj",
      "Stok",
      "Hakedişler",
      "Günlük Kayıt",
      "Belgeler",
      "← A-Blok Şantiyesi",
      "Bölüm Dağılımı",
      "Excel İndir",
      "+ İş Kalemi",
      "01.001",
    ];
    for (const label of expected) {
      await user.tab();
      expect(document.activeElement).toHaveTextContent(label);
    }
  });

  it("salt-okunur kullanıcıda gövde yalnız breadcrumb, Bölüm Dağılımı ve Excel İndir odağı bırakır", async () => {
    mockPermission("view");
    const user = userEvent.setup();
    render(<BoqPage />);
    // Kayıt 303 — sekme şeridi (7 sekme) breadcrumb'tan ÖNCE gelir.
    for (const label of [
      "Bölümler",
      "İş Kalemleri",
      "Puantaj",
      "Stok",
      "Hakedişler",
      "Günlük Kayıt",
      "Belgeler",
    ]) {
      await user.tab();
      expect(document.activeElement).toHaveTextContent(label);
    }
    await user.tab();
    expect(document.activeElement).toHaveTextContent("← A-Blok Şantiyesi");
    await user.tab();
    expect(document.activeElement).toHaveTextContent("Bölüm Dağılımı");
    await user.tab();
    expect(document.activeElement).toHaveTextContent("Excel İndir");
    // Yazma yüzeyleri hiç basılmadığı için sıradaki Tab sayfadan çıkar (body).
    await user.tab();
    expect(document.activeElement).toBe(document.body);
  });

  it("sayfada tek h1 vardır ve başlık hiyerarşisi atlamaz", () => {
    mockPermission("full");
    render(<BoqPage />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("indirme hatası canlı bölge olarak duyurulur (role=alert)", async () => {
    mockPermission("full");
    vi.mocked(downloadBoqExport).mockRejectedValue(new Error("bozuk"));
    render(<BoqPage />);
    fireEvent.click(screen.getByRole("button", { name: /Excel İndir/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Excel dosyası indirilemedi.");
  });
});

// Kayıt 303 — `SiteDetailTabs` kardeş görünümlerin (Stok/Puantaj/Belgeler/
// Günlük/Hakedişler) hepsinin bastığı şeridi bu sayfa hiç basmıyordu.
describe("BoqPage — sekme şeridi (kayıt 303)", () => {
  it("SiteDetailTabs'ı basar ve İş Kalemleri sekmesi aktif işaretlenir", () => {
    mockPermission("full");
    render(<BoqPage />);
    expect(
      screen.getByRole("tablist", { name: "Şantiye detay sekmeleri" }),
    ).toBeInTheDocument();
    const activeTab = screen.getByRole("tab", { name: "İş Kalemleri" });
    expect(activeTab).toHaveAttribute("aria-selected", "true");
  });
});
