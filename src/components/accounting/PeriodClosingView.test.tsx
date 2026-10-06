import type { UseMutationResult, UseQueryResult } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSession } from "@/components/shell/SessionProvider";
import { ACCOUNTING_VIEW } from "@/lib/auth/page-gates";
import { meFixture, pageGrant, pagesFor } from "@/lib/auth/page-grants.testkit";
import type { AccountingPeriodListItem, AccountingPeriodResponse } from "@/lib/api/hooks/useAccountingPeriods";
import { useAccountingPeriods } from "@/lib/api/hooks/useAccountingPeriods";
import {
  useCloseAccountingPeriod,
  useReopenAccountingPeriod,
} from "@/lib/api/hooks/useAccountingPeriodMutations";
import { useJournalEntries } from "@/lib/api/hooks/useJournalEntries";
import { useTrialBalance } from "@/lib/api/hooks/useTrialBalance";
import { BackendError } from "@/lib/api/unwrap";

import {
  draftBlockedTitle,
  SEQUENCE_BLOCKED_DETAIL,
  sequenceBlockedTitle,
} from "./period-closing";
import { PeriodClosingView } from "./PeriodClosingView";

vi.mock("@/lib/api/hooks/useAccountingPeriods", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useAccountingPeriods")>()),
  useAccountingPeriods: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useAccountingPeriodMutations", () => ({
  useCloseAccountingPeriod: vi.fn(),
  useReopenAccountingPeriod: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useTrialBalance", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useTrialBalance")>()),
  useTrialBalance: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useJournalEntries", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useJournalEntries")>()),
  useJournalEntries: vi.fn(),
}));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
// 🔴 F-MUP: modül sekme şeridi (`AccountingTabs`) artık görünümün İÇİNDEDİR
// (drill-in sidebar kalktı) ve `usePathname` okur. Mock olmadan jsdom'da
// `null` döner ve şeridin aktiflik kararı çökerdi.
vi.mock("next/navigation", () => ({ usePathname: () => "/muhasebe/donem-kapanisi" }));


function item(partial: Partial<AccountingPeriodListItem>): AccountingPeriodListItem {
  return {
    id: `period-${partial.month}`,
    year: 2026,
    month: 1,
    status: "open",
    closed_at: null,
    closed_by_id: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    entry_count: 0,
    draft_count: 0,
    closed_by_name: null,
    previous_period_open: false,
    ...partial,
  };
}

// DK:93-236 örnek dağılımı: Oca-Haz kapalı, Tem engelli, Ağu kapatılabilir,
// Eyl-Ara kayıt yok.
const DK_EXAMPLE_ITEMS: AccountingPeriodListItem[] = [
  item({ month: 1, status: "closed", entry_count: 142, closed_by_name: "Ayşe Demir", closed_at: "2026-02-05T09:00:00Z" }),
  item({ month: 2, status: "closed", entry_count: 168, closed_by_name: "Ayşe Demir", closed_at: "2026-03-04T09:00:00Z" }),
  item({ month: 3, status: "closed", entry_count: 184, closed_by_name: "Ayşe Demir", closed_at: "2026-04-06T09:00:00Z" }),
  item({ month: 4, status: "closed", entry_count: 176, closed_by_name: "Ayşe Demir", closed_at: "2026-05-05T09:00:00Z" }),
  item({ month: 5, status: "closed", entry_count: 192, closed_by_name: "Ayşe Demir", closed_at: "2026-06-04T09:00:00Z" }),
  item({ month: 6, status: "closed", entry_count: 204, closed_by_name: "Ayşe Demir", closed_at: "2026-07-07T09:00:00Z" }),
  item({ month: 7, status: "open", entry_count: 218, draft_count: 3 }),
  item({ month: 8, status: "open", entry_count: 86, draft_count: 0 }),
];

function queryResult(partial: Record<string, unknown>) {
  return {
    data: undefined,
    error: null,
    isLoading: false,
    isError: false,
    ...partial,
  } as unknown as UseQueryResult<AccountingPeriodListItem[], Error>;
}

function mutationStub(mutateAsync: ReturnType<typeof vi.fn>, isPending = false) {
  return { mutateAsync, isPending } as unknown as UseMutationResult<
    AccountingPeriodResponse,
    Error,
    { year: number; month: number }
  >;
}

function setSession(level: string | undefined) {
  // IZN-F6a · modül düzeyi → sayfa izni. admin = Onaylar (Geri Aç `need: "approve"`); full = Düzenler, Onaylamaz.
  const me =
    level === undefined || level === "none"
      ? meFixture({ pages: pagesFor(ACCOUNTING_VIEW, "none") })
      : level === "view"
        ? meFixture({ pages: pagesFor(ACCOUNTING_VIEW, "view") })
        : meFixture({ pages: pagesFor(ACCOUNTING_VIEW, "edit", level === "admin") });
  vi.mocked(useSession).mockReturnValue({ me } as unknown as ReturnType<typeof useSession>);
}

const closeMutate = vi.fn();
const reopenMutate = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(2026, 6, 20, 9, 0, 0)); // 20 Temmuz 2026 — YEREL takvim
  setSession("full");
  vi.mocked(useAccountingPeriods).mockReturnValue(queryResult({ data: DK_EXAMPLE_ITEMS }));
  vi.mocked(useCloseAccountingPeriod).mockReturnValue(mutationStub(closeMutate));
  vi.mocked(useReopenAccountingPeriod).mockReturnValue(mutationStub(reopenMutate));
  vi.mocked(useTrialBalance).mockReturnValue(
    queryResult({ data: { year: 2026, month: 8, is_balanced: true, rows: [], totals: {} } }) as unknown as UseQueryResult<
      never,
      Error
    >,
  );
  // K2 düzeltmesi (yönetim bulgusu): engelli bandın taslak listesi
  // `useJournalEntries({status:"draft", year, month})`ten gelir.
  vi.mocked(useJournalEntries).mockReturnValue(
    queryResult({
      data: {
        items: [
          { id: "je-1", description: "Malzeme alımı — Demirsan A.Ş.", total_debit: "387000.00" },
          { id: "je-2", description: "Makine kirası — Liebherr", total_debit: "146995.00" },
          { id: "je-3", description: "Personel avansı", total_debit: "24000.00" },
        ],
        total: 3,
        limit: 50,
        offset: 0,
      },
    }) as unknown as ReturnType<typeof useJournalEntries>,
  );
});

describe("DK — başlık + yetki notu", () => {
  it("başlık ve alt yazı basılır (DK:60-61)", () => {
    render(<PeriodClosingView />);
    expect(screen.getByRole("heading", { name: "Dönem Kapanışı" })).toBeInTheDocument();
    expect(screen.getByTestId("dkap-subtitle")).toHaveTextContent(
      "Kapatılan döneme yeni fiş girilemez, mevcut fişler değiştirilemez",
    );
  });

  it("K1 — yetki notu metni backend'le BİREBİR basılır", () => {
    render(<PeriodClosingView />);
    const note = screen.getByTestId("dkap-role-note");
    expect(note).toHaveTextContent("Muhasebe rolü dönem kapatabilir, ancak geri açamaz.");
    expect(note).toHaveTextContent(
      "Kapalı bir dönemin geri açılması yalnızca Sistem Yöneticisi tarafından yapılabilir ve denetim günlüğüne işlenir.",
    );
  });

  it("yıl seçici varsayılan yılı YEREL takvimden alır", () => {
    render(<PeriodClosingView />);
    expect(vi.mocked(useAccountingPeriods)).toHaveBeenCalledWith(2026);
  });
});

describe("K4 — özet şeridinin dört sayısı SAYILARAK basılır", () => {
  it("DK:69 örnek dağılımıyla aynı: 6/1/1/4", () => {
    render(<PeriodClosingView />);
    expect(screen.getByTestId("dkap-summary")).toHaveTextContent(
      "6 kapalı · 1 kapatılabilir · 1 engelli · 4 kayıt yok",
    );
  });
});

describe("K2 — engelli satır (draft_count > 0)", () => {
  it("Temmuz satırı engelli görünür, 'Dönemi Kapat' devre dışı ve gerekçe görünür bant taşır", () => {
    render(<PeriodClosingView />);
    const closeButton = screen.getByTestId("dkap-close-7");
    expect(closeButton).toBeDisabled();
    expect(closeButton).toHaveAttribute("title", "Dönem kapatılamıyor — 3 taslak fiş var");

    const banner = screen.getByTestId("dkap-blocked-reason-7");
    expect(within(banner).getByText("Dönem kapatılamıyor — 3 taslak fiş var")).toBeInTheDocument();
  });

  it("🔴 yönetim bulgusu: taslak fişlerin KENDİSİ listelenir (numara/açıklama/tutar UYDURULMAZ)", () => {
    render(<PeriodClosingView />);
    expect(vi.mocked(useJournalEntries)).toHaveBeenCalledWith({
      status: "draft",
      year: 2026,
      month: 7,
    });
    const list = screen.getByTestId("dkap-draft-list-7");
    expect(within(list).getByText("Malzeme alımı — Demirsan A.Ş.")).toBeInTheDocument();
    expect(within(list).getByText("₺ 387.000")).toBeInTheDocument();
    expect(within(list).getAllByText("Aç →")).toHaveLength(3);
  });

  it("🔴 N+1 korkuluğu: kapatılabilir/kapalı/kayıt-yok satırlar için useJournalEntries HİÇ çağrılmaz", () => {
    render(<PeriodClosingView />);
    // TEK engelli dönem (Temmuz) var ⇒ tam bir çağrı; 12 satır için 12 DEĞİL.
    expect(vi.mocked(useJournalEntries)).toHaveBeenCalledTimes(1);
  });

  it("Ağustos (kapatılabilir) satırında düğme AKTİFtir", () => {
    render(<PeriodClosingView />);
    expect(screen.getByTestId("dkap-close-8")).toBeEnabled();
    expect(screen.queryByTestId("dkap-blocked-reason-8")).not.toBeInTheDocument();
  });
});

describe("K3 — kayıt yok ayları eylemsizdir", () => {
  it("Eylül (kayıt yok) satırında 'Dönemi Kapat' devre dışıdır, gerekçe tooltip'te", () => {
    render(<PeriodClosingView />);
    const button = screen.getByTestId("dkap-close-9");
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute(
      "title",
      "Kaydı olmayan dönem zaten açıktır, kapatmaya gerek yok",
    );
  });

  it("Fiş sütununda '0' basılır, tire DEĞİL (DK:63)", () => {
    render(<PeriodClosingView />);
    expect(screen.getByTestId("dkap-row-9")).toHaveTextContent("0");
  });
});

describe("K1 — 'Geri Aç' yalnız admin'de aktif", () => {
  it("full seviyeli kullanıcıda devre dışı ve gerekçe tooltip'te", () => {
    setSession("full");
    render(<PeriodClosingView />);
    const reopen = screen.getByTestId("dkap-reopen-1");
    expect(reopen).toBeDisabled();
    expect(reopen).toHaveAttribute("title", "Geri açma yetkisi yalnızca Sistem Yöneticisinde");
  });

  it("admin seviyeli kullanıcıda AKTİFtir", () => {
    setSession("admin");
    render(<PeriodClosingView />);
    expect(screen.getByTestId("dkap-reopen-1")).toBeEnabled();
  });

  it("kapatma yetkisi olmayan (view) kullanıcıda 'Dönemi Kapat' devre dışıdır", () => {
    setSession("view");
    render(<PeriodClosingView />);
    expect(screen.getByTestId("dkap-close-8")).toBeDisabled();
  });
});

describe("K5 — closed_by_name / kapatma tarihi", () => {
  it("kapalı satırda kapatan + tarih basılır", () => {
    render(<PeriodClosingView />);
    const row = screen.getByTestId("dkap-row-1");
    expect(row).toHaveTextContent("Ayşe Demir");
    expect(row).toHaveTextContent("05.02.2026");
  });

  it("açık/kayıt-yok satırlarda tire basılır, 'Bilinmiyor' UYDURULMAZ", () => {
    render(<PeriodClosingView />);
    const row = screen.getByTestId("dkap-row-8");
    expect(row).toHaveTextContent("—");
    expect(row).not.toHaveTextContent("Bilinmiyor");
  });
});

describe("K8 — 'Dönemi Kapat' onay diyaloğu ister", () => {
  it("tıklayınca hemen kapatmaz, onay diyaloğu açar", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<PeriodClosingView />);
    await user.click(screen.getByTestId("dkap-close-8"));
    expect(closeMutate).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Ağustos 2026 Kapatılsın mı?" })).toBeInTheDocument();
  });

  it("onay kutucuğu işaretlenmeden 'Dönemi Kapat' diyalog düğmesi devre dışıdır", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<PeriodClosingView />);
    await user.click(screen.getByTestId("dkap-close-8"));
    expect(screen.getByTestId("dkap-confirm-close")).toBeDisabled();
    await user.click(screen.getByTestId("dkap-confirm-ack"));
    expect(screen.getByTestId("dkap-confirm-close")).toBeEnabled();
  });

  it("onaylanınca mutation çağrılır ve başarıyla kapanır", async () => {
    closeMutate.mockResolvedValueOnce({});
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<PeriodClosingView />);
    await user.click(screen.getByTestId("dkap-close-8"));
    await user.click(screen.getByTestId("dkap-confirm-ack"));
    await user.click(screen.getByTestId("dkap-confirm-close"));
    expect(closeMutate).toHaveBeenCalledWith({ year: 2026, month: 8 });
  });

  it("🔴 tek gerçek kapı sunucudur: 409 yutulmaz, mesaj gösterilir", async () => {
    closeMutate.mockRejectedValueOnce(
      new BackendError(409, { detail: "Dönem zaten kapalı." }),
    );
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<PeriodClosingView />);
    await user.click(screen.getByTestId("dkap-close-8"));
    await user.click(screen.getByTestId("dkap-confirm-ack"));
    await user.click(screen.getByTestId("dkap-confirm-close"));
    expect(await screen.findByTestId("dkap-confirm-error")).toHaveTextContent(
      "Dönem zaten kapalı.",
    );
  });
});

/**
 * 🔴 SIRA-B (T2 KIRMIZI) — kronolojik sıra kapısının EKRAN kanıtı.
 *
 * K2.1: çıplak "düğme devre-dışı" iddiası bekçi DEĞİLDİR (yetki/meşguliyet/
 * taslak da devre-dışı bırakır). Her iddia `sequenceBlockedTitle`/
 * `draftBlockedTitle`/`SEQUENCE_BLOCKED_DETAIL` ÇAĞRILARAK üretilen METİNLE
 * güçlendirilir; elle string kopyalanmaz.
 *
 * Bant metinle sorgulanır (`getByText`), `getByRole("alert")` ile DEĞİL
 * (F-P6 dersi) ve testid'ye bağlanmaz — T3 bandın yapısında serbesttir.
 */
describe("SIRA-B — takvim olarak önceki dönem açıkken kapatma engellenir", () => {
  // Haziran kapatılabilir (öncesi kayıtsız), Temmuz'un ÖNCESİ (Haziran) AÇIK.
  const SEQUENCE_ITEMS: AccountingPeriodListItem[] = [
    item({ month: 6, status: "open", entry_count: 204, draft_count: 0, previous_period_open: false }),
    item({ month: 7, status: "open", entry_count: 218, draft_count: 0, previous_period_open: true }),
  ];

  it("'Dönemi Kapat' devre dışıdır ve title'ı SIRA metnidir (çıplak disabled YETMEZ)", () => {
    const expectedTitle = sequenceBlockedTitle(2026, 7);
    vi.mocked(useAccountingPeriods).mockReturnValue(queryResult({ data: SEQUENCE_ITEMS }));
    render(<PeriodClosingView />);

    const closeButton = screen.getByTestId("dkap-close-7");
    expect(closeButton).toBeDisabled();
    expect(closeButton).toHaveAttribute("title", expectedTitle);
  });

  it("sıra bandı görünür: başlıkta SIRA metni, açıklamada SEQUENCE_BLOCKED_DETAIL", () => {
    const expectedTitle = sequenceBlockedTitle(2026, 7);
    expect(typeof SEQUENCE_BLOCKED_DETAIL).toBe("string");
    vi.mocked(useAccountingPeriods).mockReturnValue(queryResult({ data: SEQUENCE_ITEMS }));
    render(<PeriodClosingView />);

    expect(screen.getByText(expectedTitle)).toBeInTheDocument();
    expect(screen.getByText(SEQUENCE_BLOCKED_DETAIL)).toBeInTheDocument();
  });

  it("sıra-engelli ay TASLAK bandını basmaz: taslak fiş sorgusu HİÇ yapılmaz", () => {
    vi.mocked(useAccountingPeriods).mockReturnValue(queryResult({ data: SEQUENCE_ITEMS }));
    render(<PeriodClosingView />);

    expect(vi.mocked(useJournalEntries)).not.toHaveBeenCalled();
    expect(screen.queryByTestId("dkap-blocked-reason-7")).not.toBeInTheDocument();
  });

  it("önceki dönemi (Haziran) kapatmak AKTİFtir — kapanış eskiden yeniye yürür", () => {
    vi.mocked(useAccountingPeriods).mockReturnValue(queryResult({ data: SEQUENCE_ITEMS }));
    render(<PeriodClosingView />);

    expect(screen.getByTestId("dkap-close-6")).toBeEnabled();
  });

  it("engelli ay özet şeridinde 'engelli' SAYILIR — DK:91 hâlâ DÖRT sayıdır", () => {
    vi.mocked(useAccountingPeriods).mockReturnValue(queryResult({ data: SEQUENCE_ITEMS }));
    render(<PeriodClosingView />);

    expect(screen.getByTestId("dkap-summary")).toHaveTextContent(
      "0 kapalı · 1 kapatılabilir · 1 engelli · 10 kayıt yok",
    );
  });
});

/**
 * 🔴 K3.2 — İKİ ENGEL BİRDEN ekranda: backend kapı sırası (TASLAK önce, SIRA
 * sonra) yüzünden kullanıcı ÖNCE kendi dönemindeki eksiği duyar. Bandın
 * "hangisi" olduğu, SIRA metninin ekranda BULUNMADIĞI da ölçülerek kanıtlanır
 * — yalnız taslak bandının varlığını görmek öncelik kanıtı DEĞİLDİR.
 */
describe("SIRA-B K3.2 — taslak VE sıra birlikte engelliyken TASLAK bandı basılır", () => {
  const BOTH_BLOCKED_ITEMS: AccountingPeriodListItem[] = [
    item({ month: 6, status: "open", entry_count: 204, draft_count: 0, previous_period_open: false }),
    item({ month: 7, status: "open", entry_count: 218, draft_count: 3, previous_period_open: true }),
  ];

  it("bandın başlığı TASLAK metnidir, SIRA metni ekranda BULUNMAZ", () => {
    expect(typeof SEQUENCE_BLOCKED_DETAIL).toBe("string"); // yanlış-yeşil korkuluğu
    const sequenceTitle = sequenceBlockedTitle(2026, 7);
    vi.mocked(useAccountingPeriods).mockReturnValue(queryResult({ data: BOTH_BLOCKED_ITEMS }));
    render(<PeriodClosingView />);

    const banner = screen.getByTestId("dkap-blocked-reason-7");
    expect(within(banner).getByText(draftBlockedTitle(3))).toBeInTheDocument();

    expect(screen.queryByText(SEQUENCE_BLOCKED_DETAIL)).toBeNull();
    expect(screen.queryByText(sequenceTitle)).toBeNull();
  });

  it("düğmenin title'ı da TASLAK gerekçesidir, SIRA gerekçesi DEĞİL", () => {
    vi.mocked(useAccountingPeriods).mockReturnValue(queryResult({ data: BOTH_BLOCKED_ITEMS }));
    render(<PeriodClosingView />);

    const closeButton = screen.getByTestId("dkap-close-7");
    expect(closeButton).toBeDisabled();
    expect(closeButton).toHaveAttribute("title", draftBlockedTitle(3));
    expect(closeButton).not.toHaveAttribute("title", sequenceBlockedTitle(2026, 7));
  });
});

/**
 * 🔴 GERİ-AÇ-HATA (kusur öbeği `eszamanli-ustyazma`, kayıt 140) — CANLI KUSUR.
 *
 * `handleReopen` catch'i `setActionError(...)` yazıyordu ama `actionError`ın
 * TEK okuyucusu `confirmRow !== null` iken mount edilen
 * `PeriodCloseConfirmModal.errorText`ti. Geri açma onay diyaloğu AÇMADIĞI
 * için `confirmRow` null kalır ⇒ 409/403/500 sessizce yutulurdu: düğme
 * `isBusy` bitince eski hâline dönüyor, satır "Kapalı" okumaya devam ediyor
 * (başarısızlıkta invalidate da yok) ve kullanıcı "hiçbir şey olmadı" sanıyordu.
 * 409'da ekranda gördüğü durum GERÇEĞİN TERSİDİR.
 *
 * K6'nın (tek gerçek kapı sunucudur) KAPATMA dalı test:291'de kanıtlı;
 * bu ayna dal bekçisizdi.
 *
 * İkinci vaka yanlış onarımın korkuluğudur: bandı `confirmRow` kontrolü
 * OLMADAN basmak kapatma hatasını modal + band olarak İKİ KEZ gösterirdi.
 */
describe("GERİ-AÇ-HATA — 'Geri Aç' başarısızlığı ekrana ÇIKAR", () => {
  it("🔴 409 yutulmaz: sunucunun metni ekranda basılır", async () => {
    setSession("admin");
    reopenMutate.mockRejectedValueOnce(
      new BackendError(409, { detail: "Dönem zaten açık." }),
    );
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<PeriodClosingView />);

    await user.click(screen.getByTestId("dkap-reopen-1"));

    expect(reopenMutate).toHaveBeenCalledWith({ year: 2026, month: 1 });
    expect(await screen.findByTestId("dkap-action-error")).toHaveTextContent(
      "Dönem zaten açık.",
    );
  });

  it("gövdesiz hata (502) düşüş metnini basar — 'hiçbir şey olmadı' hâli YOK", async () => {
    setSession("admin");
    reopenMutate.mockRejectedValueOnce(new BackendError(502, null));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<PeriodClosingView />);

    await user.click(screen.getByTestId("dkap-reopen-1"));

    expect(await screen.findByTestId("dkap-action-error")).toHaveTextContent(
      "Dönem yeniden açılamadı.",
    );
  });

  it("başarılı geri açmada band BASILMAZ", async () => {
    setSession("admin");
    reopenMutate.mockResolvedValueOnce({});
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<PeriodClosingView />);

    await user.click(screen.getByTestId("dkap-reopen-1"));

    expect(reopenMutate).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("dkap-action-error")).toBeNull();
  });

  it("KAPATMA hatası ÇİFT basılmaz: modal açıkken band görünmez", async () => {
    setSession("admin");
    closeMutate.mockRejectedValueOnce(
      new BackendError(409, { detail: "Dönem zaten kapalı." }),
    );
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<PeriodClosingView />);

    await user.click(screen.getByTestId("dkap-close-8"));
    await user.click(screen.getByTestId("dkap-confirm-ack"));
    await user.click(screen.getByTestId("dkap-confirm-close"));

    expect(await screen.findByTestId("dkap-confirm-error")).toHaveTextContent(
      "Dönem zaten kapalı.",
    );
    expect(screen.queryByTestId("dkap-action-error")).toBeNull();
  });
});

describe("IZN-F5b-A madde 4 · 'Dönemi Kapat' = mali.donem_kapanisi Düzenler (sekme başına kapı)", () => {
  function setPages(pages: Parameters<typeof meFixture>[0]) {
    vi.mocked(useSession).mockReturnValue({ me: meFixture(pages) } as unknown as ReturnType<typeof useSession>);
  }

  it("yalnız mali.donem_kapanisi Düzenler → Ağustos kapatma düğmesi AÇIK (accounting none olsa da)", () => {
    setPages({ pages: { "mali.donem_kapanisi": pageGrant("edit") }, permissions: { accounting: "none" } });
    render(<PeriodClosingView />);
    expect(screen.getByTestId("dkap-close-8")).toBeEnabled();
  });

  it("yalnız KARDEŞ sayfalar (yevmiye + hesap planı) Düzenler, dönem kapanışı Görür → KAPALI", () => {
    setPages({
      pages: {
        "mali.donem_kapanisi": pageGrant("view"),
        "mali.yevmiye": pageGrant("edit"),
        "mali.hesap_plani": pageGrant("edit"),
      },
      permissions: { accounting: "full" },
    });
    render(<PeriodClosingView />);
    expect(screen.getByTestId("dkap-close-8")).toBeDisabled();
  });
});
