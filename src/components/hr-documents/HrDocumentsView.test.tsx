import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { useSession } from "@/components/shell/SessionProvider";
import {
  useHrDocumentsSummary,
  type HrDocumentsSummaryResponse,
} from "@/lib/api/hooks/useHrDocuments";

import { HrDocumentsView } from "./HrDocumentsView";
import { FILTER_PENDING_REASON, STATUS_COLUMN_PENDING_REASON } from "./hr-documents-labels";
import { PERSONNEL_VIEW } from "@/lib/auth/page-gates";
import { meFixture, pagesFor } from "@/lib/auth/page-grants.testkit";

vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("@/lib/api/hooks/useHrDocuments", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useHrDocuments")>()),
  useHrDocumentsSummary: vi.fn(),
}));

function queryStub(
  data: unknown,
  extra: Partial<{ isLoading: boolean; isError: boolean; error: unknown }> = {},
) {
  return {
    data,
    isLoading: extra.isLoading ?? false,
    isError: extra.isError ?? false,
    error: extra.error ?? null,
  } as unknown as ReturnType<typeof useHrDocumentsSummary>;
}

function summary(overrides: Partial<HrDocumentsSummaryResponse> = {}): HrDocumentsSummaryResponse {
  return {
    total_documents: 486,
    valid: 452,
    expiring: 28,
    expired: 6,
    missing: 12,
    by_type: [
      {
        type_id: "dt-1",
        type_name: "Sağlık Raporu",
        is_mandatory: true,
        validity_months: 12,
        total_documents: 142,
        valid: 132,
        expiring: 6,
        expired: 4,
        missing: 0,
      },
    ],
    expired_documents: [
      {
        id: "pd-1",
        personnel_id: "per-1",
        personnel_name: "Mehmet Yılmaz",
        document_label: "Sağlık Raporu",
        project_name: "Güneşkent A-Blok",
        valid_until: "2026-06-30",
        days_overdue: 27,
      },
      {
        id: "pd-2",
        personnel_id: "per-2",
        personnel_name: "Ali Kaya",
        document_label: "Sağlık Raporu",
        project_name: null,
        valid_until: "2026-07-15",
        days_overdue: 12,
      },
    ],
    expiring_documents: [
      {
        id: "pd-3",
        personnel_id: "per-3",
        personnel_name: "Sercan Öztürk",
        document_label: "İSG Eğitimi",
        project_name: "Çelik OSB",
        valid_until: "2026-08-05",
        days_left: 9,
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useSession).mockReturnValue({
    me: meFixture(),
    isLoading: false,
  } as ReturnType<typeof useSession>);
  vi.mocked(useHrDocumentsSummary).mockReturnValue(queryStub(summary()));
});

describe("HrDocumentsView — BT", () => {
  it("beş KPI kartı SUNUCU sayılarını AYNEN basar (istemci hesaplamaz)", () => {
    render(<HrDocumentsView />);
    const strip = screen.getByTestId("bt-kpi-strip");

    expect(within(strip).getByText("486")).toBeInTheDocument();
    expect(within(strip).getByText("452")).toBeInTheDocument();
    expect(within(strip).getByText("28")).toBeInTheDocument();
    expect(within(strip).getByText("6")).toBeInTheDocument();
    expect(within(strip).getByText("12")).toBeInTheDocument();
  });

  it("kritik bant BELGE sayacından kurulur; personel sayısı UYDURMAZ (48-55)", () => {
    render(<HrDocumentsView />);
    const alert = screen.getByTestId("bt-critical-alert");

    expect(alert).toHaveTextContent("6 belgenin süresi doldu");
    expect(alert).not.toHaveTextContent(/\d+ personel/);
  });

  it("süresi dolan belge yoksa bant HİÇ basılmaz", () => {
    vi.mocked(useHrDocumentsSummary).mockReturnValue(
      queryStub(summary({ expired: 0, expired_documents: [] })),
    );
    render(<HrDocumentsView />);

    expect(screen.queryByTestId("bt-critical-alert")).not.toBeInTheDocument();
  });

  it("bu ekranda 'Belge & Sertifika' AKTİF sekmedir, 'Personel Listesi' gerçek link", () => {
    render(<HrDocumentsView />);

    expect(screen.getByRole("tab", { name: "Belge & Sertifika" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "Personel Listesi" })).toHaveAttribute(
      "href",
      "/personel",
    );
  });

  it("süzgeç çipleri GERÇEK sayaç basar ama DEVRE-DIŞIdır (67-76)", () => {
    render(<HrDocumentsView />);

    const chip = screen.getByRole("button", { name: "Süresi Dolan (6)" });
    expect(chip).toBeDisabled();
    expect(chip).toHaveAttribute("title", FILTER_PENDING_REASON);
    // Gerekçe title'a GÖMÜLÜ kalmaz; şeritte görünür bant olarak da yazılır.
    expect(within(screen.getByTestId("bt-filters")).getByText(FILTER_PENDING_REASON)).toBeVisible();
  });

  it("iki süzgeç select'i de devre-dışıdır (74, 75)", () => {
    render(<HrDocumentsView />);

    expect(screen.getByLabelText("Belge tipi")).toBeDisabled();
    expect(screen.getByLabelText("Proje")).toBeDisabled();
  });

  it("süresi dolan satırı sunucu alanlarından kurulur; ad detaya bağlanır (79-133)", () => {
    render(<HrDocumentsView />);
    const row = screen.getByTestId("bt-expired-row-pd-1");

    expect(within(row).getByRole("link", { name: "Mehmet Yılmaz" })).toHaveAttribute(
      "href",
      "/personel/per-1",
    );
    expect(row).toHaveTextContent("Güneşkent A-Blok");
    expect(row).toHaveTextContent("30.06.2026");
    expect(row).toHaveTextContent("27 gün");
    // 96 · meslek alt satırı sunucuda YOK — uydurulmaz.
    expect(row).not.toHaveTextContent(/Kalıpçı|Usta/);
  });

  it("'Durum' sütunu SİLİNMEZ; hücre pending + görünür gerekçe basar (91)", () => {
    render(<HrDocumentsView />);

    expect(
      within(screen.getByTestId("bt-expired-card")).getByRole("columnheader", { name: "Durum" }),
    ).toBeInTheDocument();
    const row = screen.getByTestId("bt-expired-row-pd-1");
    expect(within(row).getByTitle(STATUS_COLUMN_PENDING_REASON)).toHaveTextContent("—");
  });

  it("satır aksiyonu NÖTR metinlidir ve devre-dışıdır (rota ÜRETMEZ)", () => {
    render(<HrDocumentsView />);
    const row = screen.getByTestId("bt-expired-row-pd-1");

    const action = within(row).getByRole("button", { name: "Aksiyon Al" });
    expect(action).toBeDisabled();
    expect(within(row).queryByRole("link", { name: /Randevu|Kurs|Eğitim/ })).not.toBeInTheDocument();
  });

  it("proje adı null ise GERÇEK boşluk basar (98)", () => {
    render(<HrDocumentsView />);
    expect(screen.getByTestId("bt-expired-row-pd-2")).toHaveTextContent("—");
  });

  it("yaklaşan tablosu sunucudan gelir (137-153)", () => {
    render(<HrDocumentsView />);
    const row = screen.getByTestId("bt-expiring-row-pd-3");

    expect(row).toHaveTextContent("Sercan Öztürk");
    expect(row).toHaveTextContent("İSG Eğitimi");
    expect(row).toHaveTextContent("05.08.2026");
    expect(row).toHaveTextContent("9 gün");
  });

  it("tip dağılımı oran + döküm basar; 'Ayarla →' GERÇEK rotaya gider (155-186)", () => {
    render(<HrDocumentsView />);
    const card = screen.getByTestId("bt-breakdown-card");

    expect(within(card).getByText("142 / 142")).toBeInTheDocument();
    expect(within(card).getByText("132 geçerli · 6 yaklaşan · 4 süresi dolmuş")).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "Ayarla →" })).toHaveAttribute(
      "href",
      "/ayarlar/bildirimler",
    );
  });

  it("üst bardaki iki düğme de devre-dışıdır (22-23)", () => {
    render(<HrDocumentsView />);

    expect(screen.getByRole("button", { name: "Toplu Randevu" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "+ Belge Yükle" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Toplu Randevu Al" })).toBeDisabled();
  });

  // F-BLG T3/G7 — gerekçe `title`da SAKLANMAZ, ekranda basılır ve kullanıcıyı
  // GERÇEK girişe (Personel Detay > "Belgeler" kartı > "+ Ekle") yönlendirir.
  it("'+ Belge Yükle' devre-dışı kalır; gerekçesi EKRANDA okunur ve yol tarif eder", () => {
    render(<HrDocumentsView />);

    const button = screen.getByTestId("bt-upload-button");
    expect(button).toBeDisabled();
    expect(button).not.toHaveAttribute("title");

    const reason = screen.getByTestId("bt-upload-reason");
    expect(reason).toBeVisible();
    expect(reason).toHaveTextContent(/personel seçilerek/i);
    expect(reason).toHaveTextContent(/Belgeler/);
    expect(reason).toHaveTextContent(/\+ Ekle/);
  });

  it("görüntüleme izni yoksa AccessDenied basar", () => {
    vi.mocked(useSession).mockReturnValue({
      me: meFixture({ pages: pagesFor(PERSONNEL_VIEW, "none") }),
      isLoading: false,
    } as ReturnType<typeof useSession>);
    render(<HrDocumentsView />);

    expect(screen.queryByTestId("bt-kpi-strip")).not.toBeInTheDocument();
  });

  it("özet yüklenemezse sahte SIFIR basılmaz; sayılar '—' olur", () => {
    vi.mocked(useHrDocumentsSummary).mockReturnValue(
      queryStub(undefined, { isError: true, error: new Error("boom") }),
    );
    render(<HrDocumentsView />);

    const strip = screen.getByTestId("bt-kpi-strip");
    expect(within(strip).getAllByText("—")).toHaveLength(5);
    expect(screen.getByTestId("bt-summary-error")).toBeInTheDocument();
  });

  // Kayıt 122 — HATA bandı önceden WARNING (turuncu) sınıfıyla basılıyordu.
  it("özet HATASI danger paletiyle basılır, warning sınıfıyla DEĞİL (kayıt 122)", () => {
    vi.mocked(useHrDocumentsSummary).mockReturnValue(
      queryStub(undefined, { isError: true, error: new Error("boom") }),
    );
    render(<HrDocumentsView />);

    const errorNote = screen.getByTestId("bt-summary-error");
    expect(errorNote).toHaveClass("bt-filters__note--danger");
  });

  // Kayıt 123 — "Toplu Randevu" gerekçesi önceden yalnız `title`da duruyordu
  // (klavye/ekran okuyucuyla erişilemez); F-BLG T3/G7 kanonuyla EKRANDA.
  it("'Toplu Randevu' gerekçesi EKRANDA okunur, yalnız title'da SAKLANMAZ (kayıt 123)", () => {
    render(<HrDocumentsView />);

    const reason = screen.getByTestId("bt-appointment-reason");
    expect(reason).toBeVisible();
    expect(reason).toHaveTextContent(/randevu/i);
  });
});
