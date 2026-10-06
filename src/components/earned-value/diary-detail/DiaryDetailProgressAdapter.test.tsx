import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { useSession } from "@/components/shell/SessionProvider";
import { useEvCodeTree, useEvDay } from "@/lib/api/hooks/useEvDay";
import { useEvSettings } from "@/lib/api/hooks/useEvSettings";
import { useEvBudget, useEvBudgetRevisions } from "@/lib/api/hooks/useEvBudget";
import { useSection } from "@/lib/api/hooks/useSection";
import { useSiteDiaryEntry, type SiteDiaryEntryDetail } from "@/lib/api/hooks/useSiteDiary";
import { useSite } from "@/lib/api/hooks/useSites";

import { DAY, ITEM_KALIP, SEC_K610, SITE_ID, codeTree, dayView } from "../diary/diary-fixtures";
import { SiteDiaryDetailProgressView } from "./DiaryDetailProgressAdapter";
import { evDiaryMe } from "../ev-session.testkit";

// DET-1.3 · Adaptör ↔ çekirdek ENTEGRASYONU: çekirdek bağlamı bildirir, adaptör
// yuvaları doldurur, çekirdek basar (sonsuz döngü yok, planlamasızda kartlar tam).

vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("@/lib/api/hooks/useEvDay", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useEvDay")>()),
  useEvDay: vi.fn(),
  useEvCodeTree: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useEvSettings", () => ({ useEvSettings: vi.fn() }));
vi.mock("@/lib/api/hooks/useEvBudget", () => ({ useEvBudget: vi.fn(), useEvBudgetRevisions: vi.fn() }));
vi.mock("@/lib/api/hooks/useSiteDiary", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useSiteDiary")>()),
  useSiteDiaryEntry: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useSection", () => ({ useSection: vi.fn() }));
vi.mock("@/lib/api/hooks/useSites", () => ({ useSite: vi.fn() }));
vi.mock("next/navigation", () => ({
  useParams: () => ({ projectId: "p", siteId: "a-blok", sectionId: "kat-6-10", entryId: "e-24" }),
}));

function query(data: unknown) {
  return { data, isLoading: false, isError: false, isFetching: false, error: null, refetch: vi.fn() } as never;
}

const ENTRY = {
  id: "e-24",
  site_id: SITE_ID,
  project_id: "p-uuid",
  entry_date: DAY,
  section_id: SEC_K610,
  section_name: "Kat 6–10",
  site_name: "A-Blok",
  project_name: "Güneşkent",
  status: "submitted",
  // Kartların içeriği bu entegrasyonun konusu değil — boş/kapalı gün.
  weather: null,
  work_done: null,
  chief_note: null,
  safety_meeting_held: false,
  ppe_checked: false,
  has_incident: false,
  incident_note: null,
  created_by: "u-hasan",
  created_at: "2026-09-24T05:12:00Z",
  updated_at: "2026-09-24T15:40:00Z",
  created_by_name: "Hasan Kaya",
  submitted_at: "2026-09-24T15:40:00Z",
  submitted_by: "u-sercan",
  submitted_by_name: "Sercan Öztürk",
  locked: false,
  lock_report_date: null,
  prev_id: null,
  next_id: null,
  prev_entry_date: null,
  next_entry_date: null,
  lines: [
    {
      id: "c1",
      boq_item_id: ITEM_KALIP,
      code: "KAB.01.01",
      description: "Kalıp",
      unit: "m²",
      unit_price: "185.00",
      quantity: "93.000",
      cumulative_quantity: "1273.000",
      planned_quantity: "5300.000",
      remaining_quantity: "4027.000",
      line_amount: "17205.00",
      section_id: SEC_K610,
      section_name: "Kat 6–10",
    },
  ],
  lines_total: "17205.00",
  worker_counts: [],
  worker_total: 0,
  own_crew_from_timesheet: [],
} satisfies SiteDiaryEntryDetail;

function mockSession(permissions: Record<string, string>) {
  vi.mocked(useSession).mockReturnValue({
    me: evDiaryMe(permissions),
    isLoading: false,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSession({ site_diary: "view", earned_value: "view", progress_payments: "view" });
  vi.mocked(useSiteDiaryEntry).mockReturnValue(query(ENTRY));
  vi.mocked(useSite).mockReturnValue(query({ id: SITE_ID, name: "A-Blok" }));
  vi.mocked(useSection).mockReturnValue(query({ id: SEC_K610, name: "Kat 6–10" }));
  vi.mocked(useEvDay).mockReturnValue(query(dayView()));
  vi.mocked(useEvCodeTree).mockReturnValue(query(codeTree()));
  vi.mocked(useEvSettings).mockReturnValue(query(undefined));
  vi.mocked(useEvBudgetRevisions).mockReturnValue(query([]));
  vi.mocked(useEvBudget).mockReturnValue(query(undefined));
});

describe("SiteDiaryDetailProgressView — adaptör çekirdeği sarar", () => {
  it("gün, çekirdeğin bildirdiği KANONİK şantiye + kaydın günüyle istenir; yuvalar basılır", () => {
    render(<SiteDiaryDetailProgressView />);

    expect(useEvDay).toHaveBeenLastCalledWith(SITE_ID, DAY);
    expect(screen.getByTestId("diary-detail-meta")).toHaveTextContent("Gün 142 · H21");
    expect(within(screen.getByTestId("diary-detail-kpis")).getByText("Bugün kazanılmış")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Saat Dağıtımı · özet" })).toBeInTheDocument();
    expect(screen.getByText("Bugün kaz. a-s")).toBeInTheDocument();
  });

  it("planlamasız şantiyede (has_baseline=false) planlama parçası YOK, çekirdek kartlar tam", () => {
    vi.mocked(useEvDay).mockReturnValue(query(dayView({ has_baseline: false })));
    render(<SiteDiaryDetailProgressView />);

    expect(screen.queryByRole("region", { name: "Saat Dağıtımı · özet" })).not.toBeInTheDocument();
    expect(screen.queryByText("Bugün kaz. a-s")).not.toBeInTheDocument();
    expect(screen.getByTestId("diary-detail-meta")).not.toHaveTextContent("Gün 142");
    expect(screen.getByRole("region", { name: "👷 Bugünkü İşçi Dağılımı" })).toBeInTheDocument();
    expect(screen.getByText("Bugünkü Hakediş Katkısı")).toBeInTheDocument();
  });
});
