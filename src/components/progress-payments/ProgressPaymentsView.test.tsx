import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { ProgressPaymentsView } from "./ProgressPaymentsView";
import { useProgressPayments } from "@/lib/api/hooks/useProgressPayments";
import { useProjects } from "@/lib/api/hooks/useProjects";
import { useSession } from "@/components/shell/SessionProvider";
import { BackendError } from "@/lib/api/unwrap";
import { EMPLOYER_PAYMENT_EDIT } from "@/lib/auth/page-gates";
import { levelPages } from "@/lib/auth/legacy-level.testkit";
import { meFixture } from "@/lib/auth/page-grants.testkit";

vi.mock("@/lib/api/hooks/useProgressPayments", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useProgressPayments")>()),
  useProgressPayments: vi.fn(),
}));

// `useModulePermission` ağ isteği atmaz, kaynağı `useSession`'dır — kapı
// testlerinde o taklit edilir (bkz. `useModulePermission.test.tsx`).
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));

// F-PRJTAB T3: görünüm artık proje süzgecini URL'den okur ve süzgeç çubuğu
// proje listesini çeker — ikisi de taklit edilir (QueryClient sarmalayıcısı
// gerekmez).
vi.mock("@/lib/api/hooks/useProjects", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useProjects")>()),
  useProjects: vi.fn(),
}));

const replace = vi.fn();
let searchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/hakedisler",
  useSearchParams: () => searchParams,
}));

function mockSession(permissions?: Record<string, string>) {
  // IZN-F6a.3 · eski modül seviyesi niyeti sayfa izni olarak kurulur (`undefined` = tam yetkili oturum, SA).
  const level = permissions?.progress_payments;
  const me =
    permissions === undefined
      ? meFixture({ isSystemAdmin: true })
      : meFixture({ pages: levelPages(EMPLOYER_PAYMENT_EDIT, level), isSystemAdmin: level === "admin" });
  vi.mocked(useSession).mockReturnValue({ me, isLoading: false });
}

function mockQuery(value: Partial<ReturnType<typeof useProgressPayments>>) {
  vi.mocked(useProgressPayments).mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    ...value,
  } as never);
}

const baseItem = {
  id: "22222222-2222-2222-2222-222222222222",
  project_id: "33333333-3333-3333-3333-333333333333",
  project_name: "Güneşkent A-Blok",
  sequence_no: 5,
  period_year: 2026,
  period_month: 5,
  description: "Kat 6–8 döşeme",
  status: "pending_approval" as const,
  gross_total: "2100000.00",
  net_total: "2000000.00",
};

describe("ProgressPaymentsView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParams = new URLSearchParams();
    mockSession({ progress_payments: "draft" });
    vi.mocked(useProjects).mockReturnValue({
      // Süzgeç seçeneğinin adı liste satırlarındaki proje adından KASTEN
      // farklı — aksi halde `getByText` iki eşleşme bulur.
      data: { items: [{ id: "33333333-3333-3333-3333-333333333333", name: "Deniz Konakları" }], counts: {} },
      isLoading: false,
      isError: false,
      error: null,
    } as never);
  });

  it("yukleniyor durumunu basar", () => {
    mockQuery({ isLoading: true });
    render(<ProgressPaymentsView />);
    expect(screen.getByText("Yükleniyor…")).toBeInTheDocument();
  });

  it("hata durumunda mesaj basar", () => {
    mockQuery({ isError: true, error: new Error("patladi") });
    render(<ProgressPaymentsView />);
    expect(screen.getByText("Hakedişler yüklenemedi")).toBeInTheDocument();
  });

  it("403'te erisim reddi basar", () => {
    mockQuery({ isError: true, error: new BackendError(403, { detail: "yasak" }) });
    render(<ProgressPaymentsView />);
    expect(screen.getByText("Bu alana yetkiniz yok")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Hakedişler" })).not.toBeInTheDocument();
  });

  it("bos listede bos durum metni basar", () => {
    mockQuery({ data: { items: [] } });
    render(<ProgressPaymentsView />);
    expect(screen.getByText("Henüz hakediş oluşturulmadı")).toBeInTheDocument();
  });

  it("satiri basar: baslik, aciklama, tutar (kompakt), rozet, detay linki", () => {
    mockQuery({ data: { items: [baseItem] } });
    const { container } = render(<ProgressPaymentsView />);
    expect(screen.getByText("Güneşkent A-Blok")).toBeInTheDocument();
    expect(screen.getByText("#5 — Mayıs 2026")).toBeInTheDocument();
    expect(screen.getByText("Kat 6–8 döşeme")).toBeInTheDocument();
    // Final inceleme #4: liste satırı tutarı artık `formatCompactCurrency`
    // ile basılır (mockup + KPI şeridiyle tutarlı) — `formatCurrencyPrecise`
    // yalnız Ekran 15 detayında kalır. KPI kartı da aynı biçimi bastığından
    // (T2/T6 ortak şerit) sınıfa göre daraltılır, tekil metin sorgusu
    // birden fazla eşleşme verir.
    expect(container.querySelector(".pp-row__amount")).toHaveTextContent("₺ 2,1M");
    expect(screen.getByText("Onay Bekliyor")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /Güneşkent A-Blok/ });
    expect(link).toHaveAttribute("href", "/hakedisler/22222222-2222-2222-2222-222222222222");
  });

  // Final inceleme #3: yalnız pending_approval durumundaki tutar primary
  // mavi modifier sınıfını taşır (mockup satır 99).
  it("pending_approval satirinda tutar primary renk sinifi tasir, diger durumlarda tasimaz", () => {
    mockQuery({ data: { items: [baseItem, { ...baseItem, id: "id-2", status: "paid" as const }] } });
    const { container } = render(<ProgressPaymentsView />);
    const amounts = container.querySelectorAll(".pp-row__amount");
    expect(amounts).toHaveLength(2);
    expect(amounts[0]).toHaveClass("pp-row__amount--pending");
    expect(amounts[1]).not.toHaveClass("pp-row__amount--pending");
  });

  it("aciklama null ise satiri basmaz", () => {
    mockQuery({ data: { items: [{ ...baseItem, description: null }] } });
    render(<ProgressPaymentsView />);
    expect(screen.queryByText("Kat 6–8 döşeme")).not.toBeInTheDocument();
  });

  it("donem null ise yalniz #N basar", () => {
    mockQuery({
      data: { items: [{ ...baseItem, period_year: null, period_month: null }] },
    });
    render(<ProgressPaymentsView />);
    expect(screen.getByText("#5")).toBeInTheDocument();
    expect(screen.queryByText(/Mayıs/)).not.toBeInTheDocument();
  });

  it("hicbir satirda '%62 ilerleme' gibi ilerleme metni basilmaz (liste semasinda yok)", () => {
    mockQuery({ data: { items: [baseItem] } });
    render(<ProgressPaymentsView />);
    expect(screen.queryByText(/ilerleme/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/%\d/)).not.toBeInTheDocument();
  });

  it.each([
    ["draft", "Taslak"],
    ["pending_approval", "Onay Bekliyor"],
    ["approved", "Onaylandı"],
    ["paid", "Ödendi"],
  ] as const)("durum %s icin rozet metni %s basar", (status, label) => {
    mockQuery({ data: { items: [{ ...baseItem, status }] } });
    render(<ProgressPaymentsView />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("yazma yetkisi varken 'Yeni Hakediş' butonu gorunur", () => {
    mockSession({ progress_payments: "draft" });
    mockQuery({ data: { items: [] } });
    render(<ProgressPaymentsView />);
    expect(screen.getByRole("link", { name: "+ Yeni Hakediş" })).toHaveAttribute(
      "href",
      "/hakedisler/yeni",
    );
  });

  it("salt-okunur yetkide 'Yeni Hakediş' butonu gorunmez", () => {
    mockSession({ progress_payments: "view" });
    mockQuery({ data: { items: [] } });
    render(<ProgressPaymentsView />);
    expect(screen.queryByRole("link", { name: "+ Yeni Hakediş" })).not.toBeInTheDocument();
  });

  // Round 2 (coordinator review): bu ekranda TEK bir proje yok (liste
  // proje-genel), o yüzden `useProgressPaymentSummary` HİÇ ÇAĞRILMAZ — KPI
  // alt metni yalnız kalem sayısını basar, mockup 82'deki yüzde BURADA YOK.
  it("KPI alt metni yalnız hakediş sayısını basar, yüzde BASILMAZ (proje bağlamı yok)", () => {
    mockQuery({ data: { items: [baseItem, { ...baseItem, id: "44444444-4444-4444-4444-444444444444" }] } });
    render(<ProgressPaymentsView />);
    expect(screen.getByTestId("pp-kpi-subtitle")).toHaveTextContent("2 hakediş");
    expect(screen.getByTestId("pp-kpi-subtitle").textContent).not.toMatch(/%/);
  });

  // F-PRJTAB T3 · URL proje süzgeci. Sekme şeridi proje detayından
  // `?project_id=<id>` ile gelir; liste sorgusu bu parametreyi backend'e
  // GEÇİRMELİDİR.
  describe("proje suzgeci (project_id)", () => {
    it("URL'de project_id varken backend istegine gecer", () => {
      searchParams = new URLSearchParams("project_id=33333333-3333-3333-3333-333333333333");
      mockQuery({ data: { items: [baseItem] } });
      render(<ProgressPaymentsView />);
      expect(useProgressPayments).toHaveBeenCalledWith({
        project_id: "33333333-3333-3333-3333-333333333333",
      });
    });

    // VARSAYILAN YOL BEKÇİSİ: parametre yokken süzgeç GÖNDERİLMEZ, liste tüm
    // projeleri kapsar.
    it("URL'de project_id yokken suzgecsiz kosar (tum projeler)", () => {
      mockQuery({ data: { items: [baseItem] } });
      render(<ProgressPaymentsView />);
      expect(useProgressPayments).toHaveBeenCalledWith({ project_id: undefined });
    });

    it("suzgec cubugu gorunur ve URL'deki proje secili durur", () => {
      searchParams = new URLSearchParams("project_id=33333333-3333-3333-3333-333333333333");
      mockQuery({ data: { items: [baseItem] } });
      render(<ProgressPaymentsView />);
      const select = screen.getByRole("combobox", { name: "Proje filtresi" });
      expect(select).toHaveValue("33333333-3333-3333-3333-333333333333");
      expect(screen.getByRole("option", { name: "Tüm Projeler" })).toBeInTheDocument();
    });

    it("suzgec aktifken bos liste ayri (zarif) bos durum metni basar", () => {
      searchParams = new URLSearchParams("project_id=33333333-3333-3333-3333-333333333333");
      mockQuery({ data: { items: [] } });
      render(<ProgressPaymentsView />);
      expect(screen.getByText("Seçili projede hakediş yok")).toBeInTheDocument();
      expect(screen.queryByText("Henüz hakediş oluşturulmadı")).not.toBeInTheDocument();
    });
  });

  // F-SZLEKR T2 — ÇAĞIRAN-DÜZEYİ BEKÇİ: düğme etiketi ile boş-durum ipucundaki
  // eylem etiketinin AYNI sabitten geldiğini kanıtlar. Bu, "düğmeyi değiştir,
  // ipucunu unut" çürümesini yakalayan TEK bekçidir (kusur tam bunun için
  // oluştu: düğme "+ Hakediş Oluştur" oldu, ipucu "+ Yeni Hakediş"te kaldı).
  it("düğme etiketi ile boş-durum ipucundaki eylem etiketi AYNI metindir", () => {
    mockSession({ progress_payments: "draft" });
    mockQuery({ data: { items: [] } });
    render(<ProgressPaymentsView />);
    const buttonLabel = screen.getByRole("link", { name: /Yeni Hakediş/ }).textContent;
    expect(screen.getByText(`${buttonLabel} ile başlayın`)).toBeInTheDocument();
  });

  it("salt-okunur yetkide boş-durum ipucu eylem VAAT ETMEZ (dürüst metin)", () => {
    mockSession({ progress_payments: "view" });
    mockQuery({ data: { items: [] } });
    render(<ProgressPaymentsView />);
    expect(screen.queryByText(/ile başlayın/)).not.toBeInTheDocument();
    expect(
      screen.getByText("Hakedişler ekranından oluşturulan kayıtlar burada listelenir"),
    ).toBeInTheDocument();
  });
});
