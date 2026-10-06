import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, renderHook, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { useSession } from "@/components/shell/SessionProvider";
import type { DiaryDetailContext, DiaryDetailExtension } from "@/components/site-diary-detail/detail-extension";
import { useEvCodeTree, useEvDay } from "@/lib/api/hooks/useEvDay";
import { useEvSettings } from "@/lib/api/hooks/useEvSettings";
import { useEvBudget, useEvBudgetRevisions } from "@/lib/api/hooks/useEvBudget";
import type { EvDayView } from "@/lib/api/models";
import { BackendError } from "@/lib/api/unwrap";

import { DAY, ITEM_KALIP, ITEM_PRIZ, SEC_K610, SITE_ID, codeTree, dayView } from "../diary/diary-fixtures";
import { useDiaryDetailExtension } from "./useDiaryDetailExtension";
import { evDiaryMe } from "../ev-session.testkit";

// DET-1.3 · Planlama adaptörünün detay sayfasına ÜRETTİĞİ yuvalar (§2.7).

vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("@/lib/api/hooks/useEvDay", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useEvDay")>()),
  useEvDay: vi.fn(),
  useEvCodeTree: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useEvSettings", () => ({ useEvSettings: vi.fn() }));
vi.mock("@/lib/api/hooks/useEvBudget", () => ({ useEvBudget: vi.fn(), useEvBudgetRevisions: vi.fn() }));

function query(data: unknown, extra: Record<string, unknown> = {}) {
  return { data, isLoading: false, isError: false, isFetching: false, error: null, refetch: vi.fn(), ...extra } as never;
}

function mockSession(permissions: Record<string, string>) {
  vi.mocked(useSession).mockReturnValue({
    me: evDiaryMe(permissions),
    isLoading: false,
  });
}

function mockDay(view: EvDayView) {
  vi.mocked(useEvDay).mockReturnValue(query(view));
}

function mockDayError(status: number) {
  vi.mocked(useEvDay).mockReturnValue(query(undefined, { isError: true, error: new BackendError(status, null) }));
}

const CTX: DiaryDetailContext = { siteId: SITE_ID, day: DAY, entryId: "e-24", currentSectionId: SEC_K610, currentSectionName: "Kat 6–10", openHref: undefined };

function extension(ctx: DiaryDetailContext | null = CTX): DiaryDetailExtension | undefined {
  const client = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return renderHook(() => useDiaryDetailExtension(ctx), { wrapper }).result.current;
}

function renderNode(node: ReactNode) {
  return render(<div>{node}</div>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSession({ earned_value: "view", site_diary: "view" });
  mockDay(dayView());
  vi.mocked(useEvCodeTree).mockReturnValue(query(codeTree()));
  vi.mocked(useEvSettings).mockReturnValue(query(undefined));
  vi.mocked(useEvBudgetRevisions).mockReturnValue(query([{ id: "rev-1", status: "active" }]));
  vi.mocked(useEvBudget).mockReturnValue(
    query({
      disciplines: [
        { groups: [{ items: [{ item_id: ITEM_KALIP, is_direct: true, contractor_type: "own" }] }] },
      ],
    }),
  );
});

describe("planlama YOKSA uzantı yok — çekirdek kartlar tam (hâl h)", () => {
  it("bağlam gelmeden uzantı yok", () => {
    expect(extension(null)).toBeUndefined();
  });

  it("şantiyede baseline yok (has_baseline=false) → undefined", () => {
    mockDay(dayView({ has_baseline: false }));
    expect(extension()).toBeUndefined();
  });

  it.each([404, 409])("gün ucu %i → undefined (planlama görünmüyor / baseline yok)", (status) => {
    mockDayError(status);
    expect(extension()).toBeUndefined();
  });
});

describe("planlama İZNİ yoksa yalnız şerit (hâl i)", () => {
  it("earned_value 'none' → gün İSTENMEZ; yalnız 'Planlama sütunları gizli' şeridi", () => {
    mockSession({ earned_value: "none", site_diary: "view" });
    const ext = extension();

    expect(useEvDay).toHaveBeenCalledWith("", DAY);
    expect(Object.keys(ext ?? {})).toEqual(["linesNotice"]);
    renderNode(ext?.linesNotice);
    expect(screen.getByText("Planlama sütunları gizli · Planlama görüntüleme izniniz yok")).toBeInTheDocument();
  });

  it("gün ucu 403 → aynı şerit, başka yuva yok", () => {
    mockDayError(403);
    const ext = extension();

    expect(Object.keys(ext ?? {})).toEqual(["linesNotice"]);
  });
});

it("gün ucu 500 → sayfa açılır; Saat Dağıtımı yerinde küçük hata kartı (hâl g)", () => {
  mockDayError(500);
  const ext = extension();

  expect(Object.keys(ext ?? {})).toEqual(["fullWidthBlock"]);
  renderNode(ext?.fullWidthBlock);
  expect(screen.getByRole("alert")).toHaveTextContent("Planlama verisi alınamadı");
});

describe("planlama VARKEN yuvalar", () => {
  it("başlık eki 'Gün 142 · H21' (EV günden)", () => {
    expect(extension()?.headerSuffix).toBe("Gün 142 · H21");
  });

  it("KPI: bu bölüm kazanılmış (harcanan notuyla) + PF (bantlı rozet)", () => {
    const kpis = extension()?.kpis ?? [];
    expect(kpis.map((kpi) => kpi.label)).toEqual(["Bugün kazanılmış", "Bugün PF"]);

    renderNode(
      <>
        {kpis.map((kpi) => (
          <div key={kpi.key} data-testid={kpi.key}>
            {kpi.value}|{kpi.note}
          </div>
        ))}
      </>,
    );
    expect(screen.getByTestId("ev-earned")).toHaveTextContent("79,1 a-s|harcanan 18,0 a-s");
    expect(within(screen.getByTestId("ev-pf")).getByText("4,39")).toHaveClass("ev-diary-pf--high");
  });

  it("kolonlar 'Bugün kaz. a-s' + 'PF'; satır hücresi motorun yaprağından; oransız satırda alt not", () => {
    const columns = extension()?.lineColumns;
    expect(columns?.headers.map((header) => header.key)).toEqual(["ev-earned", "ev-pf"]);

    renderNode(<>{columns?.renderCells({ lineId: "c1", boqItemId: ITEM_KALIP, sectionId: SEC_K610 })}</>);
    expect(screen.getByText("79,1")).toBeInTheDocument();
    expect(screen.getByText("0,94")).toHaveClass("ev-diary-pf--red");

    const unrated = columns?.renderSubRow?.({ lineId: "o1", boqItemId: ITEM_PRIZ, sectionId: null });
    renderNode(unrated);
    expect(screen.getByText("Bu kaleme oran atanmamış")).toBeInTheDocument();
    expect(screen.getByText("Miktar kaydedildi, kazanılmış hesaplanmadı.")).toBeInTheDocument();
    expect(columns?.renderSubRow?.({ lineId: "c1", boqItemId: ITEM_KALIP, sectionId: SEC_K610 })).toBeNull();
  });

  it("öksüz satırda (kalem yok) hücreler '—'", () => {
    const columns = extension()?.lineColumns;
    renderNode(<>{columns?.renderCells({ lineId: "x", boqItemId: null, sectionId: SEC_K610 })}</>);
    expect(screen.getAllByText("—")).toHaveLength(2);
  });

  it("ara toplam: bu bölümün kazanılmış/PF'si + 'harcanan' notu; gün toplamı motorun gün değerleri", () => {
    const columns = extension()?.lineColumns;
    const subtotal = columns?.renderSectionSubtotal(SEC_K610);
    renderNode(
      <>
        <span data-testid="note">{subtotal?.note}</span>
        <span data-testid="sub">{subtotal?.cells}</span>
        <span data-testid="day-label">{columns?.dayTotal?.label}</span>
        <span data-testid="day">{columns?.dayTotal?.cells}</span>
      </>,
    );
    expect(screen.getByTestId("note")).toHaveTextContent("harcanan 18,0 a-s");
    expect(screen.getByTestId("sub")).toHaveTextContent("79,14,39");
    expect(screen.getByTestId("day-label")).toHaveTextContent("Günün toplamı (tüm bölümler) · kazanılmış · harcanan 18,0 a-s");
    expect(screen.getByTestId("day")).toHaveTextContent("79,14,39");
  });

  it("alt başlık eki revizyonla; kalem etiketi aktif bütçeden (Kendi)", () => {
    const columns = extension()?.lineColumns;
    expect(columns?.captionSuffix).toBe("kazanılmış = bugün miktar × birim oran (Rev 1)");
    expect(columns?.renderLineTag?.({ lineId: "c1", boqItemId: ITEM_KALIP, sectionId: SEC_K610 })).toBe("Kendi");
    expect(columns?.renderLineTag?.({ lineId: "c1", boqItemId: null, sectionId: SEC_K610 })).toBeNull();
  });
});

describe("Saat Dağıtımı özeti (S6) — tam genişlik blok", () => {
  it("dört özet kutusu + Kural A grupları + toplam; gerekçe dağıtılmamış varsa", () => {
    mockDay(dayView({ unallocated_reason: "yardımcılar genel temizlikte" }));
    renderNode(extension()?.fullWidthBlock);

    const block = screen.getByRole("region", { name: "Saat Dağıtımı · özet" });
    expect(within(block).getByText("Puantaj toplamı")).toBeInTheDocument();
    expect(within(block).getByText("Dağıtılmamış")).toBeInTheDocument();
    expect(block).toHaveTextContent("Dağıtılmamış 66 a-s gerekçesi: yardımcılar genel temizlikte");
    expect(within(block).getByText("Bu bölüm · Kat 6–10")).toBeInTheDocument();
    expect(within(block).getByText("Kalıp · Kat 6–10")).toBeInTheDocument();
    expect(block).toHaveTextContent("Toplam · 66 a-s dağıtılmamış");
  });

  it("S8 — düzenleyemeyene 'Günlük kayıtta aç' bağlantısı YOK", () => {
    renderNode(extension()?.fullWidthBlock);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("S8 — düzenleyebilene 'Tam dağılım → Günlük kayıtta aç' günlük ekranına gider", () => {
    renderNode(extension({ ...CTX, openHref: "/projeler/p/santiyeler/s/gunluk-kayit" })?.fullWidthBlock);
    expect(screen.getByRole("link", { name: "Tam dağılım Günlük kayıtta aç" })).toHaveAttribute(
      "href",
      "/projeler/p/santiyeler/s/gunluk-kayit",
    );
  });
});
