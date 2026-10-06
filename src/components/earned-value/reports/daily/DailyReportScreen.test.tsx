import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BackendError } from "@/lib/api/unwrap";
import type { useApproveDailyReport, useDailyReport } from "@/lib/api/hooks/useEvReports";
import type { AccessLevel } from "@/lib/auth/permissions";
import type { ReportScreenProps } from "@/components/earned-value/reports/kit/report-screen";

import {
  DAILY_REPORT_FIXTURE_APPROVED,
  DAILY_REPORT_FIXTURE_DRAFT,
  DAILY_REPORT_FIXTURE_NOT_GENERATED,
} from "./daily-fixtures";
import { DailyReportScreen } from "./DailyReportScreen";

vi.mock("@/lib/api/hooks/useEvReports", () => ({
  useDailyReport: vi.fn(),
  useApproveDailyReport: vi.fn(),
}));

vi.mock("@/lib/auth/useModulePermission", () => ({
  useModulePermission: vi.fn(),
}));

// IZN-F6a.3 · Onayla kapısı oturum sayfa izninden okunur; eski seviye niyeti `sessionLevel` ile (useModulePermission
// taklidiyle TUTARLI) kurulur.
let sessionLevel = "approve";
vi.mock("@/components/shell/SessionProvider", () => ({
  useSession: () => ({ me: evMe(sessionLevel), isLoading: false }),
}));

let searchParams = new URLSearchParams();
const replaceMock = vi.fn();
vi.mock("next/navigation", () => ({
  useParams: () => ({}),
  useRouter: () => ({ replace: replaceMock }),
  usePathname: () => "/gunluk-rapor",
  useSearchParams: () => searchParams,
}));

const LINKS: ReportScreenProps["links"] = {
  diary: (day) => `/gunluk-kayit${day ? `?tarih=${day}` : ""}`,
  budget: "/butce",
  dailyReport: (date) => `/gunluk-rapor${date ? `?tarih=${date}` : ""}`,
  weeklyReport: (week) => `/haftalik-qurr${week ? `?hafta=${week}` : ""}`,
  panel: "/panel",
};

function baseProps(): ReportScreenProps {
  return {
    siteId: "site-1",
    siteName: "A-Blok Şantiyesi",
    companyName: "FİİL Yapı",
    projectName: "Güneşkent Konut",
    siteCompleted: false,
    links: LINKS,
  };
}

function queryStub(over: Partial<ReturnType<typeof useDailyReport>> = {}) {
  return {
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    isRefetching: false,
    ...over,
  } as unknown as ReturnType<typeof useDailyReport>;
}

function permissionStub(level: AccessLevel) {
  return { level, canView: true, canWrite: true, canDelete: false };
}

function approveStub(over: Partial<ReturnType<typeof useApproveDailyReport>> = {}) {
  return {
    mutateAsync: vi.fn().mockResolvedValue({ report: DAILY_REPORT_FIXTURE_DRAFT, missing_diary_dates: [] }),
    isPending: false,
    ...over,
  } as unknown as ReturnType<typeof useApproveDailyReport>;
}

import { useApproveDailyReport as useApproveMocked, useDailyReport as useDailyReportMocked } from "@/lib/api/hooks/useEvReports";
import { useModulePermission as usePermissionMocked } from "@/lib/auth/useModulePermission";
import { evMe } from "../../ev-session.testkit";

/** S10 dışı testler için: taslak günlük YOK — Onayla düğmesi etkin. */
const DRAFT_NO_MISSING_DIARY = { ...DAILY_REPORT_FIXTURE_DRAFT, draft_diary_dates: [] };

beforeEach(() => {
  vi.clearAllMocks();
  searchParams = new URLSearchParams("tarih=2026-09-24");
  sessionLevel = "approve";
  vi.mocked(usePermissionMocked).mockReturnValue(permissionStub("approve"));
  vi.mocked(useApproveMocked).mockReturnValue(approveStub());
});

describe("DailyReportScreen — GİR (S10, S11, S12, S30)", () => {
  it("yükleniyor durumunda iskelet basar", () => {
    vi.mocked(useDailyReportMocked).mockReturnValue(queryStub({ isLoading: true }));
    render(<DailyReportScreen {...baseProps()} />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("S11: üretilemedi durumunda 'günlüğü yok' metni basılır ('üretilemedi' DEĞİL)", () => {
    vi.mocked(useDailyReportMocked).mockReturnValue(queryStub({ data: DAILY_REPORT_FIXTURE_NOT_GENERATED }));
    render(<DailyReportScreen {...baseProps()} />);
    expect(screen.getByText(/günlüğü yok — rapor üretilemedi/)).toBeInTheDocument();
  });

  it("GİR:121 — üretilemedi kutusunda 28×28 uyarı ikonu (SVG) basılır", () => {
    vi.mocked(useDailyReportMocked).mockReturnValue(queryStub({ data: DAILY_REPORT_FIXTURE_NOT_GENERATED }));
    const { container } = render(<DailyReportScreen {...baseProps()} />);
    const icon = container.querySelector(".ev-daily-empty__icon");
    expect(icon).not.toBeNull();
    expect(icon).toHaveAttribute("width", "28");
    expect(icon).toHaveAttribute("height", "28");
  });

  it("GİR:234 — miktar tablosu, TreeTable'ın başlık nowrap'ını KIRAN kendi CSS sınıfını taşır", () => {
    // jsdom `<link>`/import edilen CSS'i UYGULAMAZ (`getComputedStyle` gerçek
    // kuralı göremez) — bu yüzden davranışın KENDİSİ yerine üretilen DOM'un
    // override'ı HEDEFLEYEN sınıfı taşıdığını doğruluyoruz; kuralın gerçek
    // etkisi (metin taşmaz) Playwright görsel spec'te ölçülür.
    vi.mocked(useDailyReportMocked).mockReturnValue(queryStub({ data: DAILY_REPORT_FIXTURE_DRAFT }));
    const { container } = render(<DailyReportScreen {...baseProps()} />);
    const header = container.querySelector(".ev-daily-qty__table th.tree-table__head");
    expect(header).not.toBeNull();
  });

  it("Lider denetimi (6. tur, madde 1) — 'Toplam doğrudan' TABLONUN KENDİ satırı, ad hücresi 9 kolonu kaplar", () => {
    vi.mocked(useDailyReportMocked).mockReturnValue(queryStub({ data: DAILY_REPORT_FIXTURE_DRAFT }));
    const { container } = render(<DailyReportScreen {...baseProps()} />);
    const row = container.querySelector("tr.ev-daily-qty__total-row");
    expect(row).not.toBeNull();
    // Ad hücresi `TreeTable`nin ağaç kolonu — `<th scope="row">` (renderTreeCell), `<td>` DEĞİL.
    const nameCell = row!.querySelector("th");
    expect(nameCell).toHaveAttribute("colspan", "9");
    expect(row).toHaveTextContent("Toplam doğrudan");
    // PF/harcanan/ilerleme kendi kolonlarında (3 ayrı `<td>` — flex sarmalayıcı DEĞİL).
    expect(row!.querySelectorAll("td")).toHaveLength(3);
  });

  it("Lider denetimi (6. tur, madde 2) — miktar tablosunda BAŞLIK satırları İlerleme % kolonunda DÜZ METİN basar, çubuk YOK", () => {
    vi.mocked(useDailyReportMocked).mockReturnValue(queryStub({ data: DAILY_REPORT_FIXTURE_DRAFT }));
    const { container } = render(<DailyReportScreen {...baseProps()} />);
    // "Toplam doğrudan" da bir başlık satırıdır (uom=null) — mockup `qt.prog` düz metin.
    const totalCell = container.querySelector("tr.ev-daily-qty__total-row .ev-qty-progress-text");
    expect(totalCell).not.toBeNull();
    expect(container.querySelector("tr.ev-daily-qty__total-row .ev-qty-progress")).toBeNull();
  });

  it("CEO ölçümü (7. tur, madde G1) — yaprak satırda 'Günlük harcanan' TAM SAYI (KPI'nin wholeHours'ıyla AYNI), 3 ondalık miktar DEĞİL", () => {
    vi.mocked(useDailyReportMocked).mockReturnValue(queryStub({ data: DAILY_REPORT_FIXTURE_DRAFT }));
    const { container } = render(<DailyReportScreen {...baseProps()} />);
    const row = Array.from(container.querySelectorAll(".ev-daily-qty__table tbody tr")).find((tr) => tr.textContent?.includes("Kalıp"));
    expect(row).not.toBeUndefined();
    expect(row).toHaveTextContent("76"); // spent_day "76.18" → tam sayı
    expect(row).not.toHaveTextContent("76,18");
  });

  it("CEO ölçümü (7. tur, madde G2) — yaprak satırda İlerleme % ÇUBUK + METİN İKİSİ DE basılır (kök: madde 1'le AYNI, span display:block)", () => {
    vi.mocked(useDailyReportMocked).mockReturnValue(queryStub({ data: DAILY_REPORT_FIXTURE_DRAFT }));
    const { container } = render(<DailyReportScreen {...baseProps()} />);
    const row = Array.from(container.querySelectorAll(".ev-daily-qty__table tbody tr")).find((tr) => tr.textContent?.includes("Kalıp"));
    expect(row).not.toBeUndefined();
    const bar = row!.querySelector(".ev-qty-progress__bar") as HTMLElement | null;
    expect(bar).not.toBeNull();
    expect(bar?.style.width).toBe("49.2857%");
    expect(row).toHaveTextContent("%49,3");
  });

  it("Lider denetimi (8. tur) — ondalık kanonu: trend 'Fark' hücresi negatif→kırmızı, pozitif→yeşil sınıf taşır (compareDecimalStrings)", () => {
    const trend = DAILY_REPORT_FIXTURE_DRAFT.trend.map((t, i) => (i === 0 ? { ...t, delta: "0.015" } : t));
    vi.mocked(useDailyReportMocked).mockReturnValue(queryStub({ data: { ...DAILY_REPORT_FIXTURE_DRAFT, trend } }));
    const { container } = render(<DailyReportScreen {...baseProps()} />);
    expect(container.querySelectorAll(".ev-daily-trend__delta--pos")).toHaveLength(1);
    expect(container.querySelectorAll(".ev-daily-trend__delta--neg").length).toBeGreaterThan(0);
  });

  it("CEO şartı (7. tur) — BİRİM bekçisi: rüzgâr fikstürü mockup değerini üretir ('Cum 18 · 11 km/sa'), wind_ms çift-dönüşüm YAPMAZ", () => {
    // dc.html:502 `W=[['sun',18,29,11],...]` — km/sa DOĞRUDAN (dönüşümsüz) basılır;
    // `wind_ms` (fikstür) bu değerin /3,6'sı OLMALI (formatWindKmh ×3,6 yapar).
    // Mutant: wind_ms'e km/sa değerini (11) doğrudan yazarsan → "40 km/sa" çıkar, KIRMIZI.
    vi.mocked(useDailyReportMocked).mockReturnValue(queryStub({ data: DAILY_REPORT_FIXTURE_DRAFT }));
    render(<DailyReportScreen {...baseProps()} />);
    expect(screen.getByText("11 km/sa")).toBeInTheDocument();
    expect(screen.queryByText("40 km/sa")).not.toBeInTheDocument();
  });

  it("CEO ölçümü (7. tur, madde G3) — oransız giriş çipinde kalem adı · BÖLÜM adı (section_name) basılır, disiplin DEĞİL", () => {
    vi.mocked(useDailyReportMocked).mockReturnValue(queryStub({ data: DAILY_REPORT_FIXTURE_DRAFT }));
    render(<DailyReportScreen {...baseProps()} />);
    expect(screen.getByText(/Buat\/priz montajı · Çatı/)).toBeInTheDocument();
  });

  it("Lider denetimi (6. tur, madde 5) — PF bant dışı tablosunda hücre TAMAMI DEĞİL, küçük rozet basılır", () => {
    vi.mocked(useDailyReportMocked).mockReturnValue(queryStub({ data: DAILY_REPORT_FIXTURE_DRAFT }));
    const { container } = render(<DailyReportScreen {...baseProps()} />);
    const badge = container.querySelector(".ev-daily-footer__pf-table .pf-band-cell");
    expect(badge).not.toBeNull();
    expect(badge?.tagName).toBe("SPAN"); // `as="td"` DEĞİL — hücrenin TAMAMI boyanmaz.
    expect(badge?.closest("td")).toHaveClass("ev-daily-footer__pf-cell");
  });

  it("Lider denetimi (6. tur, madde 3) — trend durağan ipucu ortak `ChartTooltip` (koyu kutu), başlık 'gg.aa · rapor günü'", () => {
    vi.mocked(useDailyReportMocked).mockReturnValue(queryStub({ data: DAILY_REPORT_FIXTURE_DRAFT }));
    const { container } = render(<DailyReportScreen {...baseProps()} />);
    const tooltip = container.querySelector(".chart-tooltip");
    expect(tooltip).not.toBeNull();
    expect(tooltip).toHaveTextContent("24.09 · rapor günü");
    expect(tooltip).toHaveTextContent("Planlı");
    expect(tooltip).toHaveTextContent("Gerçek");
    // Eski SVG rect+text ipucu kaldırıldı.
    expect(container.querySelector(".ev-daily-trend__tooltip-box")).toBeNull();
  });

  it("S10: taslak günlük varken Onayla düğmesi PASİF ve neden gösterilir", () => {
    vi.mocked(useDailyReportMocked).mockReturnValue(queryStub({ data: DAILY_REPORT_FIXTURE_DRAFT }));
    render(<DailyReportScreen {...baseProps()} />);
    const button = screen.getByRole("button", { name: "Onayla ve kilitle" });
    expect(button).toBeDisabled();
    expect(screen.getByText(/Taslak \(gönderilmemiş\) günlük içeren günler var/)).toBeInTheDocument();
  });

  it("APPROVE izni YOKKEN Onayla düğmesi hiç basılmaz", () => {
    sessionLevel = "view";
    vi.mocked(usePermissionMocked).mockReturnValue(permissionStub("view"));
    vi.mocked(useDailyReportMocked).mockReturnValue(queryStub({ data: DRAFT_NO_MISSING_DIARY }));
    render(<DailyReportScreen {...baseProps()} />);
    expect(screen.queryByRole("button", { name: "Onayla ve kilitle" })).not.toBeInTheDocument();
  });

  it("tamamlanmış şantiyede (siteCompleted) Onayla düğmesi hiç basılmaz (izin olsa bile)", () => {
    vi.mocked(useDailyReportMocked).mockReturnValue(queryStub({ data: DRAFT_NO_MISSING_DIARY }));
    render(<DailyReportScreen {...baseProps()} siteCompleted />);
    expect(screen.queryByRole("button", { name: "Onayla ve kilitle" })).not.toBeInTheDocument();
  });

  it("onay akışı: düğme → modal → mutateAsync({day}) çağrılır → başarıda modal kapanır", async () => {
    const approve = approveStub();
    vi.mocked(useApproveMocked).mockReturnValue(approve);
    vi.mocked(useDailyReportMocked).mockReturnValue(queryStub({ data: DRAFT_NO_MISSING_DIARY }));
    render(<DailyReportScreen {...baseProps()} />);

    fireEvent.click(screen.getByRole("button", { name: "Onayla ve kilitle" }));
    expect(screen.getByText("Devam?", { exact: false })).toBeInTheDocument();

    const confirmButtons = screen.getAllByRole("button", { name: "Onayla ve kilitle" });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);

    expect(approve.mutateAsync).toHaveBeenCalledWith({ day: DRAFT_NO_MISSING_DIARY.report_date });
    // Kapanış mutateAsync çözüldükten SONRA olur; "Taslak" rozeti modal açıkken de DOM'da olduğundan onu beklemek
    // kapanışı beklemez (PR #189 CI yarışı) — doğrudan kapanış beklenir.
    await waitFor(() => expect(screen.queryByText("Devam?", { exact: false })).not.toBeInTheDocument());
  });

  it("onay 422/409 hatasında backendErrorMessage metni modalde görünür", async () => {
    const approve = approveStub({
      mutateAsync: vi.fn().mockRejectedValue(new BackendError(422, { detail: "Rapor zaten onaylı." })),
    });
    vi.mocked(useApproveMocked).mockReturnValue(approve);
    vi.mocked(useDailyReportMocked).mockReturnValue(queryStub({ data: DRAFT_NO_MISSING_DIARY }));
    render(<DailyReportScreen {...baseProps()} />);

    fireEvent.click(screen.getByRole("button", { name: "Onayla ve kilitle" }));
    const confirmButtons = screen.getAllByRole("button", { name: "Onayla ve kilitle" });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);

    expect(await screen.findByText("Rapor zaten onaylı.")).toBeInTheDocument();
  });

  it("eksik günlük bandı 'Günlük Kayıt →' bağlantısı links.diary(gün)e gider", () => {
    vi.mocked(useDailyReportMocked).mockReturnValue(queryStub({ data: DAILY_REPORT_FIXTURE_DRAFT }));
    render(<DailyReportScreen {...baseProps()} />);
    const link = screen.getAllByRole("link", { name: "Günlük Kayıt →" })[0];
    expect(link).toHaveAttribute("href", `/gunluk-kayit?tarih=${DAILY_REPORT_FIXTURE_DRAFT.report_date}`);
  });

  it("S20: unallocated_day > 0 iken ayrı 'Atanamayan saat' satırı basılır", () => {
    const report = { ...DRAFT_NO_MISSING_DIARY, footer: { ...DRAFT_NO_MISSING_DIARY.footer!, unallocated_day: "4" } };
    vi.mocked(useDailyReportMocked).mockReturnValue(queryStub({ data: report }));
    render(<DailyReportScreen {...baseProps()} />);
    expect(screen.getByText(/Atanamayan saat \(miktarsız gün\)/)).toBeInTheDocument();
  });

  it("unallocated_day = 0 iken 'Atanamayan saat' satırı YOK", () => {
    vi.mocked(useDailyReportMocked).mockReturnValue(queryStub({ data: DRAFT_NO_MISSING_DIARY }));
    render(<DailyReportScreen {...baseProps()} />);
    expect(screen.queryByText(/Atanamayan saat \(miktarsız gün\)/)).not.toBeInTheDocument();
  });

  it("GİR→QURR bağlantısı links.weeklyReport(week_no)e gider", () => {
    vi.mocked(useDailyReportMocked).mockReturnValue(queryStub({ data: DRAFT_NO_MISSING_DIARY }));
    render(<DailyReportScreen {...baseProps()} />);
    const link = screen.getByRole("link", { name: "Haftalık QURR →" });
    expect(link).toHaveAttribute("href", `/haftalik-qurr?hafta=${DRAFT_NO_MISSING_DIARY.week_no}`);
  });

  it("GİR:148 başlık 'firma · proje · şantiye' üçlüsü basılır (ekran)", () => {
    vi.mocked(useDailyReportMocked).mockReturnValue(queryStub({ data: DRAFT_NO_MISSING_DIARY }));
    render(<DailyReportScreen {...baseProps()} />);
    expect(screen.getByText("FİİL Yapı · Güneşkent Konut · A-Blok Şantiyesi")).toBeInTheDocument();
  });

  it("GİR:148 başlık üçlüsü yazdırma önizlemesinde de basılır", () => {
    vi.mocked(useDailyReportMocked).mockReturnValue(queryStub({ data: DRAFT_NO_MISSING_DIARY }));
    render(<DailyReportScreen {...baseProps()} />);
    fireEvent.click(screen.getByRole("button", { name: "Yazdırma önizlemesi" }));
    expect(screen.getAllByText("FİİL Yapı · Güneşkent Konut · A-Blok Şantiyesi").length).toBeGreaterThan(0);
  });

  it("Ekran ⇄ Yazdırma geçişi: 'Yazdırma önizlemesi' seçilince ekran gövdesi kalkar, yazdırma sayfası gelir", () => {
    vi.mocked(useDailyReportMocked).mockReturnValue(queryStub({ data: DRAFT_NO_MISSING_DIARY }));
    const { container } = render(<DailyReportScreen {...baseProps()} />);
    expect(container.querySelector(".ev-daily-report__sheet")).not.toBeNull();
    expect(container.querySelector(".ev-daily-print")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Yazdırma önizlemesi" }));

    expect(container.querySelector(".ev-daily-report__sheet")).toBeNull();
    expect(container.querySelector(".ev-daily-print")).not.toBeNull();
    expect(screen.getByText(/Sayfa 1 \//)).toBeInTheDocument();
  });

  it("S30: onaylı geçmiş rapor önce özet kart gösterir, 'Raporu göster' tam görünümü açar", () => {
    vi.mocked(useDailyReportMocked).mockReturnValue(queryStub({ data: DAILY_REPORT_FIXTURE_APPROVED }));
    render(<DailyReportScreen {...baseProps()} />);
    expect(screen.getByText(/raporu · arşiv/)).toBeInTheDocument();
    expect(screen.queryByText("1 · Disiplin KPI")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Raporu göster" }));
    expect(screen.getByText("1 · Disiplin KPI")).toBeInTheDocument();
  });

  it("F3.6b lider denetimi (5. tur) — arşiv özet kartı RAPORUN KENDİ günündeki (22.09) küm. değerleri basar, taslağın (24.09) DEĞİL", () => {
    vi.mocked(useDailyReportMocked).mockReturnValue(queryStub({ data: DAILY_REPORT_FIXTURE_APPROVED }));
    render(<DailyReportScreen {...baseProps()} />);
    const card = screen.getByText(/raporu · arşiv/).closest(".ev-daily-archive-summary");
    expect(card).not.toBeNull();
    expect(card).toHaveTextContent("%47,3"); // Küm. planlı — 22.09 (TREND satırıyla aynı), 24.09'un %48,5'i DEĞİL
    expect(card).toHaveTextContent("%44,5"); // Küm. gerçek — 22.09
  });

  it("boş siteId → ağa çıkmaz, iskelet basar", () => {
    vi.mocked(useDailyReportMocked).mockReturnValue(queryStub());
    render(<DailyReportScreen {...baseProps()} siteId="" />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});

describe("DailyReportScreen — KPI Genel etiketleri backend biçiminde (name: null)", () => {
  it("overall / overall_own / overall_subcon satırları `kind`'dan etiketlenir", () => {
    const kpis = DAILY_REPORT_FIXTURE_DRAFT.kpis.map((row) =>
      row.kind.startsWith("overall") ? { ...row, name: null } : row,
    );
    vi.mocked(useDailyReportMocked).mockReturnValue(
      queryStub({ data: { ...DAILY_REPORT_FIXTURE_DRAFT, kpis } }),
    );
    const { container } = render(<DailyReportScreen {...baseProps()} />);
    const names = Array.from(container.querySelectorAll(".ev-daily-kpi__table .ev-daily-kpi__name > span:first-child")).map(
      (el) => el.textContent,
    );
    expect(names.slice(0, 3)).toEqual(["Genel", "Genel – Kendi", "Genel – Taşeron"]);
  });
});
