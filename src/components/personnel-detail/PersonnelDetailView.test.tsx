import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { PersonnelDetailView } from "./PersonnelDetailView";
import { usePersonnelDetail } from "@/lib/api/hooks/usePersonnelDetail";
import { useProjects } from "@/lib/api/hooks/useProjects";
import { usePersonnelDocuments } from "@/lib/api/hooks/useHrDocuments";
import { useSession } from "@/components/shell/SessionProvider";
import { BackendError } from "@/lib/api/unwrap";
import { EMPTY_PERSONNEL_HR_FIELDS } from "@/lib/api/hooks/personnel-fixtures";
import { PERSONNEL_VIEW } from "@/lib/auth/page-gates";
import { levelPages } from "@/lib/auth/legacy-level.testkit";
import { meFixture } from "@/lib/auth/page-grants.testkit";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "per-9" }),
}));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("@/lib/api/hooks/usePersonnelDetail", () => ({ usePersonnelDetail: vi.fn() }));
vi.mock("@/lib/api/hooks/useProjects", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useProjects")>()),
  useProjects: vi.fn(),
}));
// F-İK T5 · "Belgeler" kartı artık GERÇEK listedir (`GET /personnel/{id}/documents`)
// — kendi hook'unu çağırır; bu ekranın testinde ağ yerine stub verilir.
vi.mock("@/lib/api/hooks/useHrDocuments", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useHrDocuments")>()),
  usePersonnelDocuments: vi.fn(),
}));

// F-İK T3 · GERÇEK HR alanları (İK-1 sözleşmesi) — PD 40-61'in geçen
// kısımlarını kanıtlar. `assigned_project_id` "p-1" → `PROJECTS` fikstüründen
// "Güneşkent A-Blok" adına eşlenir (alt başlık, PD 38).
const PERSON = {
  ...EMPTY_PERSONNEL_HR_FIELDS,
  id: "per-9",
  full_name: "Mehmet Yılmaz",
  trade: "Kalıpçı Usta",
  source: "company" as const,
  subcontractor_id: null,
  user_id: null,
  is_active: true,
  phone: "0532 123 45 67",
  email: "m.yilmaz@fiilinsaat.com",
  address: "Ankara",
  wage_type: "daily" as const,
  wage_amount: "1200.00",
  sgk_no: "123-456-789-00",
  hire_date: "2025-03-01",
  iban: "TR330006100519786457841326",
  assigned_project_id: "p-1",
};

const PROJECTS = { items: [{ id: "p-1", name: "Güneşkent A-Blok" }] };

function mockSession(level: string) {
  vi.mocked(useSession).mockReturnValue({
    me: meFixture({ pages: levelPages(PERSONNEL_VIEW, level) }),
    isLoading: false,
  });
}

function projectsQueryStub(
  data: unknown,
  extra: Partial<{ isLoading: boolean; isError: boolean; error: unknown }> = {},
) {
  return {
    data,
    isLoading: extra.isLoading ?? false,
    isError: extra.isError ?? false,
    error: extra.error ?? null,
  } as unknown as ReturnType<typeof useProjects>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSession("view");
  vi.mocked(usePersonnelDetail).mockReturnValue({
    data: PERSON,
    isLoading: false,
    isError: false,
    error: null,
  } as never);
  vi.mocked(useProjects).mockReturnValue(projectsQueryStub(PROJECTS));
  vi.mocked(usePersonnelDocuments).mockReturnValue({
    data: [],
    isLoading: false,
    isError: false,
    error: null,
  } as never);
});

describe("PersonnelDetailView · başlık kartı (PD 29-63) — F-İK T3 GERÇEK alanlar", () => {
  it("ad · Aktif rozeti · Tür rozeti · meslek basılır", () => {
    render(<PersonnelDetailView />);
    const header = screen.getByTestId("personnel-header-card");
    expect(header).toHaveTextContent("Mehmet Yılmaz");
    expect(header).toHaveTextContent("Aktif");
    expect(header).toHaveTextContent("Şirket");
    expect(header).toHaveTextContent("Kalıpçı Usta");
  });

  it("Pasif personel Pasif rozetini basar", () => {
    vi.mocked(usePersonnelDetail).mockReturnValue({
      data: { ...PERSON, is_active: false },
      isLoading: false,
      isError: false,
      error: null,
    } as never);
    render(<PersonnelDetailView />);
    expect(screen.getByTestId("personnel-header-card")).toHaveTextContent("Pasif");
  });

  it("bilinmeyen `source` (İK-3 freelance/intern) çökmez — nötr rozet + 'Serbest' etiketi", () => {
    vi.mocked(usePersonnelDetail).mockReturnValue({
      data: { ...PERSON, source: "freelance" },
      isLoading: false,
      isError: false,
      error: null,
    } as never);
    render(<PersonnelDetailView />);
    expect(screen.getByTestId("personnel-header-card")).toHaveTextContent("Serbest");
  });

  it("telefon (📞)/e-posta (✉️)/'şehir' (📍, `address`) GERÇEK değer basar", () => {
    render(<PersonnelDetailView />);
    const contact = screen.getByTestId("personnel-header-contact");
    expect(contact).toHaveTextContent("0532 123 45 67");
    expect(contact).toHaveTextContent("m.yilmaz@fiilinsaat.com");
    expect(contact).toHaveTextContent("Ankara");
  });

  it("telefon/e-posta/adres `null` ⇒ sade '—' (pending gerekçesi TAŞIMAZ)", () => {
    vi.mocked(usePersonnelDetail).mockReturnValue({
      data: { ...PERSON, phone: null, email: null, address: null },
      isLoading: false,
      isError: false,
      error: null,
    } as never);
    render(<PersonnelDetailView />);
    const contact = screen.getByTestId("personnel-header-contact");
    for (const item of contact.querySelectorAll(".pd-hero__contact-item")) {
      expect(item).not.toHaveAttribute("title");
    }
    expect(contact.textContent).toContain("—");
  });

  it("Günlük Ücret `wage_amount`+`wage_type` biçimlendirilerek basılır", () => {
    render(<PersonnelDetailView />);
    expect(screen.getByTestId("personnel-header-card")).toHaveTextContent("₺ 1.200");
  });

  it("alt başlık meslek + proje ADINI basar (`assigned_project_id` → `useProjects`)", () => {
    render(<PersonnelDetailView />);
    expect(screen.getByTestId("personnel-header-card")).toHaveTextContent(
      "Kalıpçı Usta · Güneşkent A-Blok",
    );
  });

  it("proje listesi yüklenemezse alt başlığın proje yarısı pending gerekçeye düşer", () => {
    vi.mocked(useProjects).mockReturnValue(projectsQueryStub(undefined, { isError: true }));
    render(<PersonnelDetailView />);
    const pending = screen
      .getByTestId("personnel-header-card")
      .querySelector(".pd-hero__subtitle-project--pending");
    expect(pending).not.toBeNull();
    expect(pending?.textContent).toContain("—");
    expect(pending).toHaveAttribute("title");
  });

  it("`assigned_project_id` null (atanmamış YA DA görünmeyen proje — IZN-F5a) ⇒ proje yuvası \"—\"", () => {
    vi.mocked(usePersonnelDetail).mockReturnValue({
      data: { ...PERSON, assigned_project_id: null },
      isLoading: false,
      isError: false,
      error: null,
    } as never);
    render(<PersonnelDetailView />);
    const subtitle = screen
      .getByTestId("personnel-header-card")
      .querySelector(".pd-hero__subtitle");
    expect(subtitle?.textContent).toBe("Kalıpçı Usta · —");
  });

  it("SGK No · İşe Giriş (dd.mm.yyyy) GERÇEK basılır", () => {
    render(<PersonnelDetailView />);
    const header = screen.getByTestId("personnel-header-card");
    expect(header).toHaveTextContent("123-456-789-00");
    expect(header).toHaveTextContent("01.03.2025");
  });

  it("IBAN MASKELİ basılır — tam değer YAZILMAZ (spec K5)", () => {
    render(<PersonnelDetailView />);
    const header = screen.getByTestId("personnel-header-card");
    expect(header).toHaveTextContent("TR33 0006 1005...");
    expect(header.textContent).not.toContain("TR330006100519786457841326");
  });

  it("SGK/İşe Giriş/IBAN `null` ⇒ gerçek boşluk '—' (pending gerekçesi DEĞİL)", () => {
    vi.mocked(usePersonnelDetail).mockReturnValue({
      data: { ...PERSON, sgk_no: null, hire_date: null, iban: null },
      isLoading: false,
      isError: false,
      error: null,
    } as never);
    render(<PersonnelDetailView />);
    const strip = screen.getByTestId("personnel-header-card").querySelectorAll(
      ".pd-hero__strip-value:not(.pd-hero__strip-value--pending)",
    );
    for (const cell of strip) {
      if (cell.textContent === "—") {
        expect(cell).not.toHaveAttribute("title");
      }
    }
  });

  it("Vergi No + 'Bu Ay Net' PENDING — '—' + görünür gerekçe", () => {
    render(<PersonnelDetailView />);
    const header = screen.getByTestId("personnel-header-card");
    const pendingCells = header.querySelectorAll(
      ".pd-hero__stat-value--pending, .pd-hero__strip-value--pending",
    );
    // 1 stat (Bu Ay Net) + 1 şerit (Vergi No) = 2
    expect(pendingCells.length).toBe(2);
    for (const cell of pendingCells) {
      expect(cell.textContent).toContain("—");
      expect(cell).toHaveAttribute("title");
      expect(cell.getAttribute("title")).not.toBe("");
    }
  });

  it("'Düzenle' GERÇEK linktir; 'Bordroyu Gör' devre-dışıdır", () => {
    render(<PersonnelDetailView />);
    expect(screen.getByRole("link", { name: "Düzenle" })).toHaveAttribute(
      "href",
      "/personel/per-9/duzenle",
    );
    expect(screen.getByRole("button", { name: "Bordroyu Gör" })).toBeDisabled();
  });
});

describe("PersonnelDetailView · 4 pending kart", () => {
  it("Puantaj Özeti · İzin & Haklar · Proje Geçmişi · Belgeler kartları basılır ve gerekçeli", () => {
    render(<PersonnelDetailView />);
    for (const testId of [
      "personnel-timesheet-summary-card",
      "personnel-leave-card",
      "personnel-project-history-card",
      "personnel-documents-card",
    ]) {
      const card = screen.getByTestId(testId);
      expect(card).toBeVisible();
      expect(card.querySelector(".pd-card__pending-text")?.textContent?.length).toBeGreaterThan(0);
    }
  });

  it("Puantaj Özeti'nin 'Tümü →' bağlantısı GERÇEK /puantaj'a gider", () => {
    render(<PersonnelDetailView />);
    const card = screen.getByTestId("personnel-timesheet-summary-card");
    const link = card.querySelector("a");
    expect(link).toHaveAttribute("href", "/puantaj");
    expect(link).toHaveTextContent("Tümü →");
  });

  it("İzin & Haklar ve Proje Geçmişi kartlarında 'Tümü →' bağlantısı YOKTUR", () => {
    render(<PersonnelDetailView />);
    expect(screen.getByTestId("personnel-leave-card").querySelector("a")).toBeNull();
    expect(screen.getByTestId("personnel-project-history-card").querySelector("a")).toBeNull();
  });

  // F-İK T5: kart artık GERÇEK listedir (kart-içi davranışın tam kapsamı
  // `PersonnelDocumentsSummaryCard.test.tsx`tedir). F-BLG T2c: "+ Ekle" de
  // gerçek oldu (form mockup'ı geldi). Burada yalnız kartın detay ekranına
  // DOĞRU personel kimliğiyle bağlandığı sınanır.
  it("Belgeler kartı personelin KENDİ kimliğiyle sorgular; Düzenler yetkisiyle '+ Ekle' AÇIKtır", () => {
    mockSession("full");
    render(<PersonnelDetailView />);
    const card = screen.getByTestId("personnel-documents-card");

    expect(card.querySelector(".pd-card__add-btn")).toBeEnabled();
    expect(vi.mocked(usePersonnelDocuments)).toHaveBeenCalledWith("per-9");
  });

  it("yalnız Görür yetkisinde (kart görünür) '+ Ekle' GÖRÜNMEZ (IZN-F6a)", () => {
    render(<PersonnelDetailView />);
    const card = screen.getByTestId("personnel-documents-card");

    expect(card.querySelector(".pd-card__add-btn")).toBeNull();
  });

  it("Puantaj Özeti kartı EK SORGU ATMAZ — usePersonnelDetail YALNIZ BİR KEZ çağrılır", () => {
    render(<PersonnelDetailView />);
    // Ekran kendi detay sorgusunu + proje adı eşlemesi için `useProjects`
    // çağırır; Puantaj Özeti kartı saf sunum bileşenidir (`DiarySummaryTrendCard`
    // deseni), kendi hook'unu ÇAĞIRMAZ.
    expect(vi.mocked(usePersonnelDetail)).toHaveBeenCalledTimes(1);
  });
});

describe("PersonnelDetailView · hata/boş durumlar", () => {
  it("yükleniyor durumunda sade mesaj basar", () => {
    vi.mocked(usePersonnelDetail).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    } as never);
    render(<PersonnelDetailView />);
    expect(screen.getByText("Yükleniyor…")).toBeVisible();
  });

  it("bulunamayan personel için sade Türkçe mesaj basar", () => {
    vi.mocked(usePersonnelDetail).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new BackendError(404, { detail: "personel yok" }),
    } as never);
    render(<PersonnelDetailView />);
    expect(screen.getByText("Personel bulunamadı.")).toBeVisible();
  });

  // Kayıt 164 — 404 DIŞINDAKİ hatalar (500/ağ/422) da aynı "kayıt yok"
  // cümlesiyle basılıyordu; kullanıcı gerçek nedeni hiç göremiyordu.
  it("404 DIŞINDAKİ hatada (500) sunucunun GERÇEK mesajı basılır (kayıt 164)", () => {
    vi.mocked(usePersonnelDetail).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new BackendError(500, { detail: "Sunucu hatası oluştu." }),
    } as never);
    render(<PersonnelDetailView />);
    expect(screen.getByText("Sunucu hatası oluştu.")).toBeVisible();
    expect(screen.queryByText("Personel bulunamadı.")).not.toBeInTheDocument();
  });

  it("403 AccessDenied gösterir", () => {
    vi.mocked(usePersonnelDetail).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new BackendError(403, { detail: "yetkisiz" }),
    } as never);
    render(<PersonnelDetailView />);
    expect(screen.getByText("Bu alana yetkiniz yok")).toBeInTheDocument();
  });

  it("personnel izni 'none' olan AccessDenied görür", () => {
    mockSession("none");
    render(<PersonnelDetailView />);
    expect(screen.getByText("Bu alana yetkiniz yok")).toBeInTheDocument();
  });
});
