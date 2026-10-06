import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SiteDiaryDetailView } from "./SiteDiaryDetailView";
import { useSiteDiaryEntry, type SiteDiaryEntryDetail } from "@/lib/api/hooks/useSiteDiary";
import { useSection } from "@/lib/api/hooks/useSection";
import { useSite } from "@/lib/api/hooks/useSites";
import { useSession } from "@/components/shell/SessionProvider";
import { BackendError } from "@/lib/api/unwrap";
import { diaryMe } from "../site-diary/diary-session.testkit";

// DET-1.2 · Günlük kayıt detay sayfasının İSKELETİ — başlık kartının
// sözleşmeden (DET-1.B) BAĞIMSIZ kısmı + yükleniyor / 404 / 403 / hata hâlleri.
// Mockup: `projedesign/Şantiye - Günlük Kayıt Detay (Salt Okunur).dc.html`.

const PROJECT_KEY = "guneskent";
const SITE_KEY = "a-blok";
const SECTION_KEY = "kat-6-10";
const ENTRY_ID = "e-24";
const SITE_ID = "s-uuid";

vi.mock("@/lib/api/hooks/useSiteDiary", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useSiteDiary")>()),
  useSiteDiaryEntry: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useSection", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useSection")>()),
  useSection: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useSites", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useSites")>()),
  useSite: vi.fn(),
}));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("next/navigation", () => ({
  useParams: () => ({
    projectId: PROJECT_KEY,
    siteId: SITE_KEY,
    sectionId: SECTION_KEY,
    entryId: ENTRY_ID,
  }),
}));

/** Bölümün günlük kayıt sekmesi — ELLE yazılmış beklenti (routes'tan türetilmez). */
const SECTION_DIARY_TAB_HREF = `/projeler/${PROJECT_KEY}/santiyeler/${SITE_KEY}/bolumler/${SECTION_KEY}?sekme=gunluk-kayit`;

function entry(overrides: Partial<SiteDiaryEntryDetail> = {}): SiteDiaryEntryDetail {
  return {
    id: ENTRY_ID,
    site_id: SITE_ID,
    project_id: "p-uuid",
    entry_date: "2026-09-24",
    section_id: "sec-uuid",
    status: "submitted",
    created_at: "2026-09-24T05:12:00Z",
    created_by: "u-1",
    updated_at: "2026-09-24T15:40:00Z",
    // İskelet testi: kartların içeriği bu dosyanın konusu değil — boş/kapalı gün.
    weather: null,
    work_done: null,
    chief_note: null,
    safety_meeting_held: false,
    ppe_checked: false,
    has_incident: false,
    incident_note: null,
    lines: [],
    lines_total: "0.00",
    worker_counts: [],
    worker_total: 0,
    // DET-1.1 sözleşmesi (backend det-1 adc8226)
    site_name: "A-Blok Şantiyesi",
    project_name: "Güneşkent Konut",
    section_name: "Kat 6–10 Kaba İnşaat",
    created_by_name: "Hasan Kaya",
    submitted_at: "2026-09-24T15:40:00Z",
    submitted_by: "u-2",
    submitted_by_name: "Sercan Öztürk",
    locked: false,
    lock_report_date: null,
    prev_id: "e-23",
    prev_entry_date: "2026-09-23",
    next_id: "e-25",
    next_entry_date: "2026-09-25",
    ...overrides,
  } satisfies SiteDiaryEntryDetail;
}

function mockSession(siteDiaryLevel?: string) {
  vi.mocked(useSession).mockReturnValue({
    me: diaryMe(siteDiaryLevel === undefined ? undefined : { site_diary: siteDiaryLevel }) as never,
    isLoading: false,
  });
}

function mockEntry(result: Record<string, unknown>) {
  vi.mocked(useSiteDiaryEntry).mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    ...result,
  } as never);
}

function mockContext() {
  vi.mocked(useSite).mockReturnValue({
    data: { id: SITE_ID, name: "A-Blok Şantiyesi", project: { id: "p-uuid", name: "Güneşkent" } },
    isLoading: false,
    isError: false,
    error: null,
  } as never);
  vi.mocked(useSection).mockReturnValue({
    data: { id: "sec-uuid", name: "Kat 6–10 Kaba İnşaat" },
    isLoading: false,
    isError: false,
    error: null,
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSession("view");
  mockContext();
});

describe("SiteDiaryDetailView — veri bağları", () => {
  it("bölüm kimliği çözülmeden kayıt İSTENMEZ (bölüm bağlamı önce gelir)", () => {
    vi.mocked(useSection).mockReturnValue({ data: undefined, isLoading: true, isError: false, error: null } as never);
    mockEntry({ isLoading: false });
    render(<SiteDiaryDetailView />);

    expect(useSiteDiaryEntry).toHaveBeenCalledWith(ENTRY_ID, { sectionId: undefined, enabled: false });
    expect(screen.getByRole("status")).toHaveTextContent("Günlük kayıt yükleniyor");
  });

  it("bölüm okunamazsa (ör. 403) kayıt bölüm bağlamı OLMADAN yine istenir — sayfa takılmaz", () => {
    vi.mocked(useSection).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new BackendError(403, null),
    } as never);
    mockEntry({ data: entry() });
    render(<SiteDiaryDetailView />);

    expect(useSiteDiaryEntry).toHaveBeenCalledWith(ENTRY_ID, { sectionId: undefined, enabled: true });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("24.09.2026 Perşembe");
  });

  it("kaydı ADRESTEKİ kimlikle ister; kırıntı adları için şantiye/bölüm önbelleğine bağlanır", () => {
    mockEntry({ data: entry() });
    render(<SiteDiaryDetailView />);

    // Önceki/sonraki bölüm bağlamında döner → bölümün KANONİK kimliği gider.
    expect(useSiteDiaryEntry).toHaveBeenCalledWith(ENTRY_ID, { sectionId: "sec-uuid", enabled: true });
    expect(useSite).toHaveBeenCalledWith(SITE_KEY, { project: PROJECT_KEY });
    expect(useSection).toHaveBeenCalledWith(SECTION_KEY, { site: SITE_KEY, project: PROJECT_KEY });
  });
});

describe("SiteDiaryDetailView — başlık kartı (mockup D:54-96 uyarlaması)", () => {
  it("tarih (mono) + Türkçe gün adı h1'de basılır", () => {
    mockEntry({ data: entry({ entry_date: "2026-09-24" }) });
    render(<SiteDiaryDetailView />);

    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent("24.09.2026 Perşembe");
    expect(within(heading).getByText("24.09.2026")).toHaveClass("diary-detail__date");
  });

  it("'GÜNLÜK KAYIT' hapı + 'Gönderildi' durum hapı (yeşil sınıf)", () => {
    mockEntry({ data: entry({ status: "submitted" }) });
    render(<SiteDiaryDetailView />);

    expect(screen.getByText("GÜNLÜK KAYIT")).toHaveClass("diary-detail__pill--kind");
    expect(screen.getByText("Gönderildi")).toHaveClass("diary-detail__pill--submitted");
  });

  it("S1 — 'Taslak' durum hapı AMBER sınıfını taşır (nötr değil)", () => {
    mockEntry({ data: entry({ status: "draft", entry_date: "2026-09-25" }) });
    render(<SiteDiaryDetailView />);

    const pill = screen.getByText("Taslak");
    expect(pill).toHaveClass("diary-detail__pill--draft");
    expect(pill).not.toHaveClass("diary-detail__pill--submitted");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("25.09.2026 Cuma");
  });

});

describe("SiteDiaryDetailView — hâller", () => {
  it("(d) yüklenirken iskelet basılır, başlık basılmaz", () => {
    mockEntry({ isLoading: true });
    render(<SiteDiaryDetailView />);

    expect(screen.getByRole("status")).toHaveTextContent("Günlük kayıt yükleniyor");
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
  });

  it("(e) 404 — 'bulunamadı' kartı + bölümün Günlük Kayıt SEKMESİNE dönüş bağlantısı", () => {
    mockEntry({ isError: true, error: new BackendError(404, null) });
    render(<SiteDiaryDetailView />);

    expect(screen.getByText("Günlük kayıt bulunamadı")).toBeInTheDocument();
    expect(screen.getByText("Kayıt silinmiş ya da bu şantiyeye ait değil.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Bölümün günlük kayıtlarına dön" })).toHaveAttribute(
      "href",
      SECTION_DIARY_TAB_HREF,
    );
  });

  it("(e) başka şantiyenin kaydı adreste açılırsa da 'bulunamadı' basılır (veri sızmaz)", () => {
    mockEntry({ data: entry({ site_id: "baska-santiye" }) });
    render(<SiteDiaryDetailView />);

    expect(screen.getByText("Günlük kayıt bulunamadı")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
  });

  it("(f) 403 — yetkisiz kartı; gidilecek yer olmadığı için bağlantı YOK", () => {
    mockEntry({ isError: true, error: new BackendError(403, null) });
    render(<SiteDiaryDetailView />);

    expect(screen.getByText("Günlük kayıtları görme yetkiniz yok")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("(f) site_diary izni 'none' ise veri gelmiş olsa bile yetkisiz kartı basılır", () => {
    mockSession("none");
    mockEntry({ data: entry() });
    render(<SiteDiaryDetailView />);

    expect(screen.getByText("Günlük kayıtları görme yetkiniz yok")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
  });

  it("(g) diğer hatalarda hata kartı + 'Tekrar dene' sorguyu yeniden çalıştırır", async () => {
    const user = userEvent.setup();
    const refetch = vi.fn();
    mockEntry({ isError: true, error: new BackendError(500, null), refetch });
    render(<SiteDiaryDetailView />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Günlük kayıt alınamadı");
    expect(alert).toHaveTextContent("Sunucu yanıt vermedi. Kayıt değişmedi.");
    await user.click(within(alert).getByRole("button", { name: "Tekrar dene" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});

describe("SiteDiaryDetailView — 'Günlük kayıtta aç' (kullanıcı kararı: yazabilen + kilitsiz gün)", () => {
  const DIARY_HREF = `/projeler/${PROJECT_KEY}/santiyeler/${SITE_KEY}/gunluk-kayit`;

  it("yazma yetkisi + kilitsiz günde şantiye günlüğüne bağlanır", () => {
    mockSession("full");
    mockEntry({ data: entry() });
    render(<SiteDiaryDetailView />);

    expect(screen.getByRole("link", { name: "Günlük kayıtta aç" })).toHaveAttribute("href", DIARY_HREF);
  });

  it("yalnız görüntüleme yetkisinde basılmaz", () => {
    mockSession("view");
    mockEntry({ data: entry() });
    render(<SiteDiaryDetailView />);

    expect(screen.queryByRole("link", { name: "Günlük kayıtta aç" })).not.toBeInTheDocument();
  });

  it("kilitli günde yazabilen kullanıcıya da basılmaz", () => {
    mockSession("full");
    mockEntry({ data: entry({ locked: true, lock_report_date: "2026-09-25" }) });
    render(<SiteDiaryDetailView />);

    expect(screen.queryByRole("link", { name: "Günlük kayıtta aç" })).not.toBeInTheDocument();
    expect(screen.getByTestId("diary-detail-lock-band")).toBeInTheDocument();
  });

  it("gezinme bağlantıları ADRES anahtarlarıyla detay rotasına gider", () => {
    mockEntry({ data: entry() });
    render(<SiteDiaryDetailView />);

    expect(screen.getByRole("link", { name: "Önceki kayıt: 23.09.2026" })).toHaveAttribute(
      "href",
      `/projeler/${PROJECT_KEY}/santiyeler/${SITE_KEY}/bolumler/${SECTION_KEY}/gunluk-kayit/e-23`,
    );
  });
});
