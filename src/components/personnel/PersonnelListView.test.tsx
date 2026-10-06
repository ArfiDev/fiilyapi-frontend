import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { PersonnelListView } from "./PersonnelListView";
import { usePersonnel } from "@/lib/api/hooks/usePersonnel";
import { useProjects } from "@/lib/api/hooks/useProjects";
import {
  useHrDocumentsSummary,
  type HrDocumentsSummaryResponse,
} from "@/lib/api/hooks/useHrDocuments";
import { useSession } from "@/components/shell/SessionProvider";
import type { PersonnelListItem, PersonnelListResponse } from "@/lib/api/hooks/usePersonnel";
import { EMPTY_PERSONNEL_HR_FIELDS } from "@/lib/api/hooks/personnel-fixtures";
import { errorResponse, stubExportDownload } from "@/lib/api/export-test-stub";
import { PERSONNEL_VIEW } from "@/lib/auth/page-gates";
import { meFixture, pagesFor } from "@/lib/auth/page-grants.testkit";

vi.mock("@/lib/api/hooks/usePersonnel", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/usePersonnel")>()),
  usePersonnel: vi.fn(),
}));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("@/lib/api/hooks/useProjects", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useProjects")>()),
  useProjects: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useHrDocuments", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useHrDocuments")>()),
  useHrDocumentsSummary: vi.fn(),
}));

const replaceMock = vi.fn();
let searchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  usePathname: () => "/personel",
  useRouter: () => ({ replace: replaceMock, push: vi.fn() }),
  useSearchParams: () => searchParams,
}));

const ITEMS: PersonnelListItem[] = [
  { ...EMPTY_PERSONNEL_HR_FIELDS, id: "per-1", full_name: "Mehmet Kılıç", trade: "Kalıpçı", source: "company", subcontractor_id: null, user_id: null, is_active: true },
  { ...EMPTY_PERSONNEL_HR_FIELDS, id: "per-2", full_name: "Hasan Demirci", trade: "Demirci", source: "company", subcontractor_id: null, user_id: null, is_active: true },
  { ...EMPTY_PERSONNEL_HR_FIELDS, id: "per-3", full_name: "Ramazan Yıldız", trade: "Elektrikçi", source: "subcontractor", subcontractor_id: "sub-1", user_id: null, is_active: true },
];

function response(overrides: Partial<PersonnelListResponse> = {}): PersonnelListResponse {
  return { items: ITEMS, total: ITEMS.length, limit: 200, offset: 0, ...overrides };
}

function queryStub(data: unknown, extra: Partial<{ isLoading: boolean; isError: boolean; error: unknown }> = {}) {
  return {
    data,
    isLoading: extra.isLoading ?? false,
    isError: extra.isError ?? false,
    error: extra.error ?? null,
  } as unknown as ReturnType<typeof usePersonnel>;
}

/** Proje ADI eşlemesinin + proje süzgeci seçeneklerinin kaynağı. */
const PROJECTS = {
  items: [
    { id: "p-1", name: "Kule A" },
    { id: "p-2", name: "Villa B" },
  ],
};

function documentSummary(
  overrides: Partial<HrDocumentsSummaryResponse> = {},
): HrDocumentsSummaryResponse {
  return {
    total_documents: 12,
    valid: 7,
    expiring: 2,
    expired: 3,
    missing: 4,
    by_type: [],
    expired_documents: [],
    expiring_documents: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  searchParams = new URLSearchParams();
  vi.mocked(useSession).mockReturnValue({
    me: meFixture(),
    isLoading: false,
  } as ReturnType<typeof useSession>);
  vi.mocked(usePersonnel).mockReturnValue(queryStub(response()));
  vi.mocked(useProjects).mockReturnValue(
    queryStub(PROJECTS) as unknown as ReturnType<typeof useProjects>,
  );
  vi.mocked(useHrDocumentsSummary).mockReturnValue(
    queryStub(documentSummary()) as unknown as ReturnType<typeof useHrDocumentsSummary>,
  );
});

describe("PersonnelListView — başlık, sekmeler, KPI", () => {
  it("mockup başlığı basılır, kabuk YENİDEN çizilmez", () => {
    render(<PersonnelListView />);
    expect(screen.getByRole("heading", { name: "İnsan Kaynakları" })).toBeInTheDocument();
    // 🔴 F-NAVSAHA · üst-etiket kabuk nav'ının GRUP BAŞLIĞIDIR. Grup ikiye
    // ayrılınca (kullanıcı kararı 2026-09-05) burası `Saha & İK` kalsaydı sol
    // menü `İK` derken sayfa `Saha & İK` derdi — görsel kapı bunu YAKALAYAMAZ
    // (etiket zaten öyleydi, içerik baytı değişmezdi).
    expect(screen.getByText("İK")).toBeInTheDocument();
    expect(screen.queryByText("Gösterge Paneli")).not.toBeInTheDocument();
  });

  it("liste HER ZAMAN açık limit tavanıyla istenir", () => {
    render(<PersonnelListView />);
    expect(vi.mocked(usePersonnel).mock.calls[0][0]).toEqual({ limit: 200, offset: 0, isDraft: false });
  });

  it("KPI'ları TÜREV olarak basar: toplam/şirket/taşeron", () => {
    render(<PersonnelListView />);
    const strip = screen.getByTestId("personel-kpi-strip");
    expect(strip).toHaveTextContent("Toplam Personel");
    expect(strip).toHaveTextContent("3");
    expect(strip).toHaveTextContent("2"); // şirket
    expect(strip).toHaveTextContent("1"); // taşeron
  });

  it("uyarı bandı GERÇEK sayaçlardan kurulur ve BELGE sayısı basar (personel DEĞİL)", () => {
    render(<PersonnelListView />);
    const alert = screen.getByTestId("personel-document-alert");
    expect(alert).toHaveTextContent("3 belgenin süresi doldu");
    expect(alert).toHaveTextContent("2 belgenin süresi yaklaşıyor");
    // Mockup'ın "N personelin…" ifadesi SUNUCUDA yok — uydurulmaz.
    expect(alert).not.toHaveTextContent("personelin");
    expect(screen.getByRole("link", { name: "Belgeleri Gör →" })).toHaveAttribute(
      "href",
      "/personel/belgeler",
    );
  });

  it("süresi dolan/yaklaşan yoksa uyarı bandı HİÇ basılmaz", () => {
    vi.mocked(useHrDocumentsSummary).mockReturnValue(
      queryStub(documentSummary({ expired: 0, expiring: 0 })) as unknown as ReturnType<
        typeof useHrDocumentsSummary
      >,
    );
    render(<PersonnelListView />);
    expect(screen.queryByTestId("personel-document-alert")).not.toBeInTheDocument();
  });

  it("özet ucu hata verirse bant SESSİZCE düşer, ekranın geri kalanı çalışır", () => {
    vi.mocked(useHrDocumentsSummary).mockReturnValue(
      queryStub(undefined, { isError: true }) as unknown as ReturnType<
        typeof useHrDocumentsSummary
      >,
    );
    render(<PersonnelListView />);
    expect(screen.queryByTestId("personel-document-alert")).not.toBeInTheDocument();
    expect(screen.getByText("Mehmet Kılıç")).toBeInTheDocument();
  });

  it("'Belge & Sertifika' sekmesi GERÇEK rotaya gider", () => {
    render(<PersonnelListView />);
    expect(screen.getByRole("tab", { name: "Belge & Sertifika" })).toHaveAttribute(
      "href",
      "/personel/belgeler",
    );
  });

  /** 🔴 EXPORT-XLSX: `GET /personnel/export.xlsx` açıldı; düğme artık GERÇEK. */
  it("'Dışa Aktar' ETKİNDİR ve bekleyen-modül gerekçesi ARTIK YOKTUR", () => {
    render(<PersonnelListView />);
    const button = screen.getByRole("button", { name: "Dışa Aktar" });
    expect(button).toBeEnabled();
    expect(button).not.toHaveAttribute("title");
    expect(screen.queryByTestId("personel-export-blocked")).toBeNull();
  });

  // 🔴 URL-1 ÖLÇÜLMÜŞ SAPMA — `%2F`, eskiden ham `/` idi.
  // `?donus=` anahtarını kuran İKİ çağıran vardı ve BİRBİRİNDEN FARKLI
  // davranıyorlardı: burası değeri HAM yazıyordu, `AddPersonnelLink` ise
  // `encodeURIComponent`ten geçiriyordu. Merkezîleştirme ikisinden birini
  // seçmeyi ZORUNLU kıldı ve kodlayan hâl SEÇİLDİ — çünkü `AddPersonnelLink`
  // sözleşmesi gereği dönüş hedefi SORGU DİZESİ TAŞIYABİLİR
  // (`/puantaj?iso_year=2026&iso_week=32`); kodlanmazsa o `?` dönüş yolunu
  // KESERDİ. Davranış AYNIDIR: `PersonnelForm` değeri
  // `searchParams.get(RETURN_PARAM)` ile okur ve `URLSearchParams` `%2F`yi de
  // ham `/`yi de aynı `/personel` dizesine çözer.
  it("'+ Personel Ekle' mevcut forma döner (?donus=%2Fpersonel)", () => {
    render(<PersonnelListView />);
    expect(screen.getByRole("link", { name: "+ Personel Ekle" })).toHaveAttribute(
      "href",
      "/personel/yeni?donus=%2Fpersonel",
    );
  });

  it("izinsiz kullanıcı erişim reddi görür", () => {
    vi.mocked(useSession).mockReturnValue({
      me: meFixture({ pages: pagesFor(PERSONNEL_VIEW, "none") }),
      isLoading: false,
    } as ReturnType<typeof useSession>);
    render(<PersonnelListView />);
    expect(screen.queryByRole("heading", { name: "İnsan Kaynakları" })).not.toBeInTheDocument();
  });
});

describe("PersonnelListView — süzgeçler", () => {
  it("arama metni SUNUCUYA ?q= olarak gider", () => {
    render(<PersonnelListView />);
    fireEvent.change(screen.getByLabelText("Personel ara"), { target: { value: "mehmet" } });
    expect(replaceMock).toHaveBeenCalledWith("/personel?q=mehmet", { scroll: false });

    searchParams = new URLSearchParams({ q: "mehmet" });
    render(<PersonnelListView />);
    expect(vi.mocked(usePersonnel).mock.calls.at(-1)?.[0]).toEqual({ limit: 200, offset: 0, isDraft: false, q: "mehmet" });
  });

  it("durum süzgeci SUNUCUYA is_active olarak gider", () => {
    searchParams = new URLSearchParams({ durum: "inactive" });
    render(<PersonnelListView />);
    expect(vi.mocked(usePersonnel).mock.calls[0][0]).toEqual({ limit: 200, offset: 0, isDraft: false, isActive: false });
  });

  it("proje süzgeci SUNUCUYA project_id olarak gider", () => {
    searchParams = new URLSearchParams({ proje: "p-2" });
    render(<PersonnelListView />);
    expect(vi.mocked(usePersonnel).mock.calls[0][0]).toEqual({
      limit: 200,
      offset: 0,
      isDraft: false,
      projectId: "p-2",
    });
  });

  it("proje seçimi URL'e yazılır (paylaşılabilir süzgeç)", () => {
    render(<PersonnelListView />);
    fireEvent.change(screen.getByTestId("personel-filter-project"), { target: { value: "p-1" } });
    expect(replaceMock).toHaveBeenCalledWith("/personel?proje=p-1", { scroll: false });
  });

  it("proje sütunu kimliği DEĞİL adı basar (proje listesinden eşlenir)", () => {
    vi.mocked(usePersonnel).mockReturnValue(
      queryStub(
        response({
          items: [{ ...ITEMS[0], assigned_project_id: "p-2" }],
          total: 1,
        }),
      ),
    );
    render(<PersonnelListView />);
    const cell = screen.getByTestId("personel-project-per-1");
    expect(cell).toHaveTextContent("Villa B");
    expect(cell).not.toHaveTextContent("p-2");
  });

  it("meslek süzgeci İSTEMCİDE uygulanır — sunucu sorgusuna gitmez", () => {
    searchParams = new URLSearchParams({ meslek: "Elektrikçi" });
    render(<PersonnelListView />);
    expect(vi.mocked(usePersonnel).mock.calls[0][0]).toEqual({ limit: 200, offset: 0, isDraft: false });
    expect(screen.getByText("Ramazan Yıldız")).toBeInTheDocument();
    expect(screen.queryByText("Mehmet Kılıç")).not.toBeInTheDocument();
  });

  it("kırpılma varsa görünür uyarı basılır ve TÜREV KPI'lar pending'e düşer", () => {
    vi.mocked(usePersonnel).mockReturnValue(queryStub(response({ total: 900 })));
    render(<PersonnelListView />);
    expect(screen.getByTestId("personel-truncation-notice")).toHaveTextContent("liste eksik");
    expect(screen.getByTestId("personel-kpi-company-pending")).toBeInTheDocument();
  });

  /**
   * 🔴 Kayıt 160 — KPI şeridi önceden SÜZÜLMEMİŞ `serverItems`ten kuruluyordu;
   * meslek süzgeci seçiliyken tablo (2 çalışan, 1 şirket + 1 taşeron dışı
   * hesaba katmadan filtrelenmiş) süzülmüş kadroyu, KPI şeridi ise TÜM
   * kadronun türetilmiş sayılarını (2 şirket) gösteriyordu — sunucu GERÇEKTEN
   * kırpmadığı halde kartlar tutarsızdı. Meslek süzgeci bir "kırpılma"
   * SAYILMAMALI (kart pending'e düşmemeli), sayı SADECE filtrelenmiş kümeyi
   * yansıtmalı.
   */
  it("meslek süzgeci açıkken KPI şeridi TABLONUN GÖRDÜĞÜ (süzülmüş) kümeyi yansıtır", () => {
    searchParams = new URLSearchParams({ meslek: "Kalıpçı" });
    render(<PersonnelListView />);
    // Yalnız per-1 (Mehmet Kılıç, source: company) kalır.
    const strip = screen.getByTestId("personel-kpi-strip");
    // Gerçek sunucu kırpması YOK — kart pending'e düşmemeli.
    expect(screen.queryByTestId("personel-kpi-company-pending")).not.toBeInTheDocument();
    expect(strip).toHaveTextContent("Toplam Personel");
    // Şirket kadrosu artık süzülmüş kümeden (1), TÜM kadrodan (2) DEĞİL.
    const companyCard = strip.querySelector(".personel-kpi__card--company");
    expect(companyCard).toHaveTextContent("1");
  });
});

/* ------------------------------------------------- EXPORT-XLSX · SIZINTI KAPISI */

/**
 * 🔴🔴 ANTI-SIZINTI BEKÇİSİ — Excel, EKRANIN O AN GÖSTERDİĞİ kadroyu taşımak
 * ZORUNDADIR. "Kule A · pasifler" süzgeciyle bakarken TÜM kadroyu indirmek
 * kullanıcının süzdüğünü sandığı bir veri sızıntısıdır.
 *
 * Bekçi düğmeyi GERÇEKTEN tıklar ve GERÇEK istemciyi koşturur (`fetch`
 * sahtelenir); ekranın `usePersonnel` çağrısı ile indirme sorgusu YAN YANA
 * ölçülür.
 */
describe("EXPORT-XLSX · Excel sorgusu = ekran sorgusu", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("arama + proje + durum süzgeçleri indirmeye AYNEN geçer", async () => {
    // Arrange
    searchParams = new URLSearchParams({ q: "mehmet", proje: "p-2", durum: "inactive" });
    const stub = stubExportDownload();
    render(<PersonnelListView />);
    const screenFilter = vi.mocked(usePersonnel).mock.lastCall?.[0] ?? {};

    // Act
    fireEvent.click(screen.getByRole("button", { name: "Dışa Aktar" }));

    // Assert — ekranın sunucuya gönderdiği süzgeç kümesiyle BİREBİR
    // (`isDraft: false` dahil — 🔴 EXPORT SINIFI, 2026-09-23 ölçümü: bu
    // bekçinin kendi başlığı "Excel sorgusu = ekran sorgusu" derken önceden
    // `is_draft` istisna bırakılmıştı, bekçi kendi kuralını ihlal ediyordu).
    await waitFor(() => {
      expect(stub.lastQuery()).toEqual({
        q: "mehmet",
        project_id: "p-2",
        is_active: "false",
        is_draft: "false",
      });
    });
    expect(screenFilter).toMatchObject({ q: "mehmet", projectId: "p-2", isActive: false, isDraft: false });
  });

  it("süzgeçsiz ekranda indirme diger sunucu süzgeçlerinden serbesttir (isDraft HARIÇ)", async () => {
    // Arrange
    const stub = stubExportDownload();
    render(<PersonnelListView />);

    // Act
    fireEvent.click(screen.getByRole("button", { name: "Dışa Aktar" }));

    // Assert — 🔴 EXPORT SINIFI (2026-09-23): liste sorgusu `isDraft: false`i
    // AÇIKÇA taşır (satır 104-109); export de AYNI süzgeci taşımalı, aksi
    // halde Excel TASLAK personeli de indirir.
    await waitFor(() => {
      expect(stub.lastQuery()).toEqual({ is_draft: "false" });
    });
  });

  /**
   * 🔴🔴 EN KRİTİK DAL — `trade` SUNUCUDA YOKTUR (spec K-B), süzme
   * İSTEMCİDEDİR. Uç meslek almadığı için indirilecek dosya ekranda
   * görülenden GENİŞ olurdu: düğme KAPANIR, gerekçe GÖRÜNÜR olur ve HİÇBİR
   * istek atılmaz.
   */
  it("meslek süzgeci açıkken düğme KAPALI, gerekçe GÖRÜNÜR ve istek ATILMAZ", async () => {
    // Arrange
    searchParams = new URLSearchParams({ meslek: "Elektrikçi" });
    const stub = stubExportDownload();
    render(<PersonnelListView />);

    // Act
    const button = screen.getByRole("button", { name: "Dışa Aktar" });
    fireEvent.click(button);

    // Assert
    expect(button).toBeDisabled();
    expect(screen.getByTestId("personel-export-blocked")).toHaveTextContent(
      "Meslek süzgeci açıkken Excel indirilemez",
    );
    expect(stub.fetchMock).not.toHaveBeenCalled();
  });

  it("indirme hatası YUTULMAZ — sunucunun Türkçe metni EKRANA basılır", async () => {
    // Arrange
    stubExportDownload(errorResponse(403, { detail: "Personel yetkiniz yok." }));
    render(<PersonnelListView />);

    // Act
    fireEvent.click(screen.getByRole("button", { name: "Dışa Aktar" }));

    // Assert
    expect(await screen.findByTestId("personel-export-error")).toHaveTextContent(
      "Personel yetkiniz yok.",
    );
  });
});
