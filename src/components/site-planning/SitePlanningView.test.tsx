import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SitePlanningView } from "./SitePlanningView";
import { useSitePlan } from "@/lib/api/hooks/useSitePlan";
import { useSiteSections } from "@/lib/api/hooks/useSiteSections";
import { useSite } from "@/lib/api/hooks/useSites";
import {
  useSaveSitePlanCells,
  useSaveSitePlanGoals,
  useSaveSitePlanRows,
  useSaveSitePlanSprint,
} from "@/lib/api/hooks/useSitePlanMutations";
import { useSession } from "@/components/shell/SessionProvider";
import { BackendError } from "@/lib/api/unwrap";
import { diaryMe } from "../site-diary/diary-session.testkit";

// F-PL T2 · Planlama ekranının OKUMA davranışları: gruplama, seyrek hücre
// eşlemesi, hafta sonu vurgusu, pending/devre-dışı öğeler ve hafta gezinmesi.
// Saf türevler kendi dosyalarında test edilir (week / grid-derive).

const replace = vi.fn();
let searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useParams: () => ({ projectId: "p-1", siteId: "s-1" }),
  usePathname: () => "/projeler/p-1/santiyeler/s-1/gunluk-kayit/planlama",
  useRouter: () => ({ replace }),
  useSearchParams: () => searchParams,
}));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("@/lib/api/hooks/useSitePlan", () => ({ useSitePlan: vi.fn() }));
vi.mock("@/lib/api/hooks/useSiteSections", () => ({ useSiteSections: vi.fn() }));
// 🔴 URL-3 — planlama ekrani slug'i KANONIK KIMLIGE burada cozer: rota
// parametresi slug olabilir, `useSitePlan`/`useSiteSections` ve dort PUT ise
// UUID bekler. `data: undefined` birakilsaydi ekran (dogru sekilde) bos
// kimlikle beklerdi ve hicbir plan sorgusu acilmazdi.
vi.mock("@/lib/api/hooks/useSites", () => ({
  useSite: vi.fn(() => ({ data: { id: "s-1", project: { id: "p-1" } } })),
}));
vi.mock("@/lib/api/hooks/useSitePlanMutations", () => ({
  useSaveSitePlanRows: vi.fn(),
  useSaveSitePlanCells: vi.fn(),
  useSaveSitePlanGoals: vi.fn(),
  useSaveSitePlanSprint: vi.fn(),
}));

function mockSession(permissions?: Record<string, string>) {
  vi.mocked(useSession).mockReturnValue({ me: diaryMe(permissions), isLoading: false });
}

/** Fikstür haftası — 2026-08-03 Pazartesi, 2026-08-09 Pazar. */
const WEEK_START = "2026-08-03";

function planWeek(overrides: Record<string, unknown> = {}) {
  return {
    site_id: "s-1",
    site_name: "A-Blok",
    project_id: "p-1",
    project_name: "Güneşkent Konut",
    week_start: WEEK_START,
    week_end: "2026-08-09",
    days: [
      { plan_date: "2026-08-03", is_weekend: false },
      { plan_date: "2026-08-04", is_weekend: false },
      { plan_date: "2026-08-05", is_weekend: false },
      { plan_date: "2026-08-06", is_weekend: false },
      { plan_date: "2026-08-07", is_weekend: false },
      { plan_date: "2026-08-08", is_weekend: true },
      { plan_date: "2026-08-09", is_weekend: true },
    ],
    groups: [
      {
        kind: "crew",
        section_id: "sec-1",
        section_name: "Kat 6–10 Kaba",
        section_manager_name: "Sercan Öztürk",
        rows: [
          {
            id: "pr-1",
            kind: "crew",
            section_id: "sec-1",
            label: "Kalıpçı",
            planned_worker_count: 14,
            sort_order: 0,
            // SEYREK: yalnız Çarşamba dolu — Pazartesi/Salı hücresi YOK.
            cells: [{ plan_date: "2026-08-05", text: "Kat 9 Kalıp", tag: "blue" }],
          },
        ],
      },
      {
        kind: "equipment",
        section_id: null,
        section_name: null,
        section_manager_name: null,
        rows: [
          {
            id: "pr-4",
            kind: "equipment",
            section_id: null,
            label: "Tower Crane",
            planned_worker_count: null,
            sort_order: 1,
            cells: [{ plan_date: "2026-08-03", text: "✓ Çalışıyor", tag: "green" }],
          },
        ],
      },
    ],
    goals: [
      {
        id: "pg-1",
        title: "Kat 9 kalıp montajı tamamla",
        note: "Sorumlu: Kalıpçı Ekibi",
        is_done: true,
        status: "completed",
        sort_order: 0,
      },
      {
        id: "pg-2",
        title: "Kat 9 döşeme betonu dök",
        note: null,
        is_done: false,
        status: "waiting",
        sort_order: 1,
      },
    ],
    active_sprint: { id: "ps-1", name: "Kat 8–9 Tamamlama" },
    ...overrides,
  };
}

function mockPlan(overrides: Record<string, unknown> = {}) {
  vi.mocked(useSitePlan).mockReturnValue({
    data: planWeek(),
    isLoading: false,
    isError: false,
    error: null,
    ...overrides,
  } as unknown as ReturnType<typeof useSitePlan>);
}

/** Şantiyenin bölüm listesi — satır ekleme popover'ının "Bölüm" seçenekleri. */
function mockSections(overrides: Record<string, unknown> = {}) {
  vi.mocked(useSiteSections).mockReturnValue({
    data: {
      counts: { planned: 0, active: 2, completed: 0 },
      items: [
        { id: "sec-1", code: "A-01", name: "Kat 6–10 Kaba", status: "active", sort_order: 0 },
        { id: "sec-2", code: "A-02", name: "Zemin Kat Kaba", status: "active", sort_order: 1 },
      ],
    },
    isLoading: false,
    isError: false,
    ...overrides,
  } as unknown as ReturnType<typeof useSiteSections>);
}

/** Dört PUT'un çağrı SIRASI burada birikir — sıra sözleşmenin parçasıdır. */
let saveCalls: Array<{ endpoint: string; body: unknown }> = [];

interface MutationStub {
  resolve?: unknown;
  reject?: Error;
  /**
   * YALNIZ ilk çağrıda patlar. "Yeniden dene" tıklaması yeni bir render'ı
   * BEKLEMEZ — düğme, kurulduğu render'ın kanca nesnelerini taşır; bu yüzden
   * geçici hatayı `mockMutations()` çağrısıyla değil stub'ın kendisiyle
   * kurtarmak gerekir.
   */
  rejectOnce?: Error;
}

function stubMutation(endpoint: string, behaviour: MutationStub = {}) {
  let calls = 0;
  return {
    mutateAsync: vi.fn(async (body: unknown) => {
      calls += 1;
      saveCalls.push({ endpoint, body });
      if (behaviour.reject) throw behaviour.reject;
      if (behaviour.rejectOnce && calls === 1) throw behaviour.rejectOnce;
      return behaviour.resolve ?? {};
    }),
  } as unknown as ReturnType<typeof useSaveSitePlanCells>;
}

/** `rows` yanıtı: yeni satır kimliği YALNIZ buradan gelir. */
function mockMutations(overrides: Partial<Record<string, MutationStub>> = {}) {
  vi.mocked(useSaveSitePlanRows).mockReturnValue(
    stubMutation("rows", overrides.rows ?? { resolve: { rows: [] } }) as never,
  );
  vi.mocked(useSaveSitePlanCells).mockReturnValue(stubMutation("cells", overrides.cells) as never);
  vi.mocked(useSaveSitePlanGoals).mockReturnValue(stubMutation("goals", overrides.goals) as never);
  vi.mocked(useSaveSitePlanSprint).mockReturnValue(
    stubMutation("sprint", overrides.sprint) as never,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  saveCalls = [];
  searchParams = new URLSearchParams(`week=${WEEK_START}`);
  mockSession();
  mockMutations();
  mockSections();
});

describe("SitePlanningView — başlık ve mod anahtarı", () => {
  it("baslik ve alt metin santiye/proje adlarindan kurulur (P88-89)", () => {
    mockPlan();
    render(<SitePlanningView />);
    expect(
      screen.getByRole("heading", { name: "Planlama — A-Blok Şantiyesi" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Haftalık & aylık iş planı · Güneşkent Konut"),
    ).toBeInTheDocument();
  });

  it("KAYIT 302: 'Günlük Kayıt' sekmesi aktif görünür (activePath planlama son ekli değil)", () => {
    mockPlan();
    render(<SitePlanningView />);
    const tabs = screen.getByRole("tablist", { name: "Şantiye detay sekmeleri" });
    const diaryTab = within(tabs).getByRole("tab", { name: "Günlük Kayıt" });
    expect(diaryTab).toHaveAttribute("aria-selected", "true");
  });

  it("mod anahtarinda Planlama AKTIFtir, digerleri gercek baglantidir (P80-84)", () => {
    mockPlan();
    render(<SitePlanningView />);
    const modeSwitch = screen.getByRole("group", { name: "Görünüm seçimi" });
    expect(modeSwitch.querySelector('[aria-current="page"]')?.textContent).toBe("Planlama");
    expect(screen.getByRole("link", { name: "Kayıt Gir" })).toHaveAttribute(
      "href",
      "/projeler/p-1/santiyeler/s-1/gunluk-kayit",
    );
    expect(screen.getByRole("link", { name: "Hakediş Özeti" })).toHaveAttribute(
      "href",
      "/projeler/p-1/santiyeler/s-1/gunluk-kayit/ozet",
    );
  });

  it("Ay ve Sprint kipleri DEVRE DISI, Hafta aciktir (P92-96, spec S2)", () => {
    mockPlan();
    render(<SitePlanningView />);
    expect(screen.getByRole("button", { name: "Hafta" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Ay" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Sprint" })).toBeDisabled();
    expect(screen.getByText(/“Ay” ve “Sprint” görünümleri henüz açılmadı/)).toBeInTheDocument();
  });
});

describe("SitePlanningView — ızgara", () => {
  it("hafta araligi ve aktif sprint basilir (P105/P107)", () => {
    mockPlan();
    render(<SitePlanningView />);
    expect(screen.getByText("3 – 9 Ağustos 2026")).toBeInTheDocument();
    expect(screen.getByText("Aktif Sprint: Kat 8–9 Tamamlama")).toBeInTheDocument();
  });

  it("sprint yoksa 'Aktif Sprint' etiketi HIC basilmaz", () => {
    mockPlan({ data: planWeek({ active_sprint: null }) });
    render(<SitePlanningView />);
    expect(screen.queryByText(/Aktif Sprint/)).not.toBeInTheDocument();
  });

  it("yedi gun sutunu gercek takvimden uretilir (P111-117)", () => {
    mockPlan();
    render(<SitePlanningView />);
    for (const weekday of ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"]) {
      expect(screen.getByText(weekday), weekday).toBeInTheDocument();
    }
    expect(screen.getByText("3 Ağu")).toBeInTheDocument();
    expect(screen.getByText("9 Ağu")).toBeInTheDocument();
  });

  it("hafta sonu vurgusu days[].is_weekend'den gelir", () => {
    // Backend Cuma'yı tatil ilan ederse ekran ONA uyar, takvime değil.
    const week = planWeek();
    const days = week.days.map((day) =>
      day.plan_date === "2026-08-07" ? { ...day, is_weekend: true } : day,
    );
    mockPlan({ data: { ...week, days } });
    const { container } = render(<SitePlanningView />);
    const weekendHeads = container.querySelectorAll(".plan-grid__day--weekend");
    expect(weekendHeads).toHaveLength(3);
  });

  it("bolum grubu adi + sorumlusu, ekipman grubu SABIT baslik basar", () => {
    mockPlan();
    render(<SitePlanningView />);
    expect(screen.getByText("Kat 6–10 Kaba")).toBeInTheDocument();
    expect(screen.getByText("Bölüm sorumlusu: Sercan Öztürk")).toBeInTheDocument();
    expect(screen.getByText("Makine & Ekipman")).toBeInTheDocument();
  });

  it("ekip satiri isci sayisini parantezde, ekipman satiri yalniz adi basar", () => {
    mockPlan();
    render(<SitePlanningView />);
    expect(screen.getByText("Kalıpçı (14)")).toBeInTheDocument();
    expect(screen.getByText("Tower Crane")).toBeInTheDocument();
  });

  it("SEYREK hucre dogru gune duser (indekse gore kaymaz)", () => {
    mockPlan();
    const { container } = render(<SitePlanningView />);
    const rows = container.querySelectorAll(".plan-grid__row");
    // İlk satır başlık; ikinci satır bölüm grubu; üçüncüsü "Kalıpçı".
    const crewRow = Array.from(rows).find((row) =>
      row.querySelector(".plan-grid__lead-text")?.textContent === "Kalıpçı (14)",
    );
    const cells = crewRow?.querySelectorAll(".plan-grid__cell") ?? [];
    expect(cells).toHaveLength(7);
    expect(cells[0]?.textContent).toBe(""); // Pzt boş
    expect(cells[2]?.textContent).toBe("Kat 9 Kalıp"); // Çar dolu
    expect(cells[2]?.querySelector(".plan-cell__chip--blue")).not.toBeNull();
  });

  it("grup yoksa gorunur bos-durum metni basar", () => {
    mockPlan({ data: planWeek({ groups: [] }) });
    render(<SitePlanningView />);
    expect(screen.getByText("Bu hafta için plan satırı eklenmemiş.")).toBeInTheDocument();
  });

  it("hata durumunda gorunur mesaj basar (role=alert KULLANILMAZ)", () => {
    mockPlan({ data: undefined, isError: true, error: new Error("boom") });
    render(<SitePlanningView />);
    expect(screen.getByText("Planlama ızgarası yüklenemedi.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("SitePlanningView — hafta gezinme", () => {
  it("‹ ve › haftayi URL'de 7 gun kaydirir", async () => {
    mockPlan();
    render(<SitePlanningView />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Önceki hafta" }));
    expect(replace).toHaveBeenCalledWith(
      "/projeler/p-1/santiyeler/s-1/gunluk-kayit/planlama?week=2026-07-27",
      { scroll: false },
    );

    await user.click(screen.getByRole("button", { name: "Sonraki hafta" }));
    expect(replace).toHaveBeenCalledWith(
      "/projeler/p-1/santiyeler/s-1/gunluk-kayit/planlama?week=2026-08-10",
      { scroll: false },
    );
  });

  it("URL'deki hafta sorguya Pazartesi olarak gecer", () => {
    searchParams = new URLSearchParams("week=2026-08-06"); // Perşembe
    mockPlan();
    render(<SitePlanningView />);
    expect(vi.mocked(useSitePlan)).toHaveBeenCalledWith("s-1", WEEK_START);
  });
});

// KIRMIZI BEKÇİ (kusur: planlama-taslagi-kayboluyor) — `usePlanDraft` hafta
// değişiminde kirliliği BİLEREK korumaz (usePlanDraft.ts:32-36 doğrudur,
// başka haftanın gövdesi 422 alırdı). Korkuluk bu yüzden GÖRÜNÜM katmanında
// olmak ZORUNDA: kirli taslakla hafta oku, onay alınmadan `router.replace`
// çağıramaz. Onay diyalogu `window.confirm` DEĞİL (bu depoda hiç yok ve
// Playwright tarayıcı diyaloglarını sessizce reddeder) — deponun kanonik
// `ConfirmDialog`ı.
describe("SitePlanningView — kirli taslakla hafta gezinme", () => {
  const DISCARD_DIALOG = "Kaydedilmemiş değişiklikler";

  /** Bir hücreye plan metni yazıp uygular; taslak KİRLİ olur. */
  async function makeDraftDirty(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: "Kalıpçı (14) · Sal 4 Ağu planı" }));
    const popover = screen.getByRole("dialog");
    await user.type(within(popover).getByLabelText("Plan metni"), "Kat 9 Kalıp");
    await user.click(within(popover).getByRole("button", { name: "Uygula" }));
    expect(screen.getByRole("button", { name: "Kaydet" })).toBeEnabled();
  }

  it("kirli taslakta '›' haftayi DEGISTIRMEZ, once onay ister", async () => {
    mockPlan();
    render(<SitePlanningView />);
    const user = userEvent.setup();
    await makeDraftDirty(user);

    await user.click(screen.getByRole("button", { name: "Sonraki hafta" }));

    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: DISCARD_DIALOG })).toBeInTheDocument();
  });

  it("onay REDDEDILIRSE hafta degismez ve yazilan taslak yerinde kalir", async () => {
    mockPlan();
    render(<SitePlanningView />);
    const user = userEvent.setup();
    await makeDraftDirty(user);

    await user.click(screen.getByRole("button", { name: "Önceki hafta" }));
    await user.click(
      within(screen.getByRole("dialog", { name: DISCARD_DIALOG })).getByRole("button", {
        name: "Vazgeç",
      }),
    );

    expect(replace).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: DISCARD_DIALOG })).not.toBeInTheDocument();
    const grid = screen.getByLabelText("Haftalık plan ızgarası");
    expect(within(grid).getAllByText("Kat 9 Kalıp")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Kaydet" })).toBeEnabled();
  });

  it("onaylanirsa hafta URL'de kayar", async () => {
    mockPlan();
    render(<SitePlanningView />);
    const user = userEvent.setup();
    await makeDraftDirty(user);

    await user.click(screen.getByRole("button", { name: "Sonraki hafta" }));
    await user.click(
      within(screen.getByRole("dialog", { name: DISCARD_DIALOG })).getByRole("button", {
        name: "Değişiklikleri at",
      }),
    );

    expect(replace).toHaveBeenCalledWith(
      "/projeler/p-1/santiyeler/s-1/gunluk-kayit/planlama?week=2026-08-10",
      { scroll: false },
    );
    expect(screen.queryByRole("dialog", { name: DISCARD_DIALOG })).not.toBeInTheDocument();
  });

  it("taslak TEMIZKEN onay HIC sorulmaz (mevcut akis bozulmaz)", async () => {
    mockPlan();
    render(<SitePlanningView />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Sonraki hafta" }));

    expect(screen.queryByRole("dialog", { name: DISCARD_DIALOG })).not.toBeInTheDocument();
    expect(replace).toHaveBeenCalledWith(
      "/projeler/p-1/santiyeler/s-1/gunluk-kayit/planlama?week=2026-08-10",
      { scroll: false },
    );
  });
});

describe("SitePlanningView — hedefler ve pending kart", () => {
  it("hedefler kutucuk + baslik/not + durum kontrolleriyle basilir (P205-227)", () => {
    mockPlan();
    render(<SitePlanningView />);
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(2);
    for (const box of checkboxes) expect(box).toBeEnabled();
    expect(
      screen.getByRole("combobox", { name: "Kat 9 kalıp montajı tamamla — hedef durumu" }),
    ).toHaveValue("completed");
    expect(
      screen.getByRole("textbox", { name: "Kat 9 döşeme betonu dök — hedef başlığı" }),
    ).toHaveValue("Kat 9 döşeme betonu dök");
  });

  it("hedef yoksa gorunur bos-durum metni basar", () => {
    mockPlan({ data: planWeek({ goals: [] }) });
    render(<SitePlanningView />);
    expect(screen.getByText("Bu hafta için hedef girilmemiş.")).toBeInTheDocument();
  });

  it("Malzeme Plani karti PENDING'dir; mockup'in sahte satirlari BASILMAZ", () => {
    mockPlan();
    render(<SitePlanningView />);
    expect(
      screen.getByRole("heading", { name: "📦 Malzeme Planı — Bu Hafta" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Haftalık malzeme ihtiyacı hesaplanmıyor/)).toBeInTheDocument();
    expect(screen.queryByText(/Nervürlü Demir/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Acil Sipariş/)).not.toBeInTheDocument();
  });
});

describe("SitePlanningView — izin dalları", () => {
  it("gorme izni yoksa AccessDenied basar", () => {
    mockSession({ site_diary: "none" });
    mockPlan();
    render(<SitePlanningView />);
    expect(screen.queryByRole("heading", { name: /^Planlama/ })).not.toBeInTheDocument();
  });

  it("403 yanitinda AccessDenied basar", () => {
    mockPlan({
      data: undefined,
      isError: true,
      error: new BackendError(403, "Yetkiniz yok"),
    });
    render(<SitePlanningView />);
    expect(screen.queryByRole("heading", { name: /^Planlama/ })).not.toBeInTheDocument();
  });

  it("🔴 şantiye çözülemezse (404/ağ) SESSİZCE boş ızgara basmaz, hata GÖRÜNÜR olur", () => {
    vi.mocked(useSite).mockReturnValueOnce({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new BackendError(404, "Şantiye bulunamadı"),
    } as never);
    // Gerçek akışta siteId boş kalınca `useSitePlan`/`useSiteSections`
    // `enabled:false` ile idle döner — bu da AYNI hâldir.
    mockPlan({ data: undefined, isLoading: false, isError: false, error: null });
    render(<SitePlanningView />);
    expect(screen.getByText("Şantiye yüklenemedi")).toBeInTheDocument();
  });

  it("PM salt-okur: TUM giris yuzeyleri GIZLENMEZ, devre-disi basilir", async () => {
    mockSession({ site_diary: "view" });
    mockPlan();
    render(<SitePlanningView />);
    const user = userEvent.setup();

    // Kaydet + satır/hedef ekleme + satır menüleri + sprint kalemi + kutucuklar
    expect(screen.getByRole("button", { name: "Kaydet" })).toBeDisabled();
    for (const button of screen.getAllByRole("button", { name: "+ Satır" })) {
      expect(button).toBeDisabled();
    }
    expect(screen.getByRole("button", { name: "+ Hedef" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Aktif sprinti düzenle" })).toBeDisabled();
    for (const button of screen.getAllByRole("button", { name: /satır işlemleri$/ })) {
      expect(button).toBeDisabled();
    }
    for (const box of screen.getAllByRole("checkbox")) expect(box).toBeDisabled();
    for (const field of screen.getAllByRole("textbox")) expect(field).toBeDisabled();
    for (const select of screen.getAllByRole("combobox")) expect(select).toBeDisabled();

    // Hücre tıklaması popover AÇMAZ — tıklanabilir buton hiç basılmaz.
    expect(screen.queryByRole("button", { name: /planı$/ })).not.toBeInTheDocument();
    await user.click(screen.getByText("Kat 9 Kalıp"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("yazma izni olan kullanicida Kaydet degisiklik YOKKEN devre disidir", () => {
    mockPlan();
    render(<SitePlanningView />);
    expect(screen.getByRole("button", { name: "Kaydet" })).toBeDisabled();
  });
});

describe("SitePlanningView — hücre düzenleme", () => {
  it("hucreye tiklayinca popover acilir; Uygula taslagi gunceller", async () => {
    mockPlan();
    render(<SitePlanningView />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Kalıpçı (14) · Sal 4 Ağu planı" }));
    const popover = screen.getByRole("dialog");
    await user.type(within(popover).getByLabelText("Plan metni"), "Kat 9 Kalıp");
    await user.click(within(popover).getByRole("button", { name: "Yeşil" }));
    await user.click(within(popover).getByRole("button", { name: "Uygula" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Kaydet" })).toBeEnabled();
    const grid = screen.getByLabelText("Haftalık plan ızgarası");
    expect(within(grid).getAllByText("Kat 9 Kalıp")).toHaveLength(2);
  });

  it("Escape popover'i IPTAL eder (taslak degismez)", async () => {
    mockPlan();
    render(<SitePlanningView />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Kalıpçı (14) · Sal 4 Ağu planı" }));
    await user.type(screen.getByLabelText("Plan metni"), "Yazıldı ama iptal");
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText("Yazıldı ama iptal")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Kaydet" })).toBeDisabled();
  });

  it("Temizle hucreyi bosaltir", async () => {
    mockPlan();
    render(<SitePlanningView />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Kalıpçı (14) · Çar 5 Ağu planı" }));
    await user.click(screen.getByRole("button", { name: "Temizle" }));

    const grid = screen.getByLabelText("Haftalık plan ızgarası");
    expect(within(grid).queryByText("Kat 9 Kalıp")).not.toBeInTheDocument();
  });
});

describe("SitePlanningView — kaydetme akışı", () => {
  it("YALNIZ kirli bolume PUT atar", async () => {
    mockPlan();
    render(<SitePlanningView />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Kalıpçı (14) · Sal 4 Ağu planı" }));
    await user.type(screen.getByLabelText("Plan metni"), "Kalıp");
    await user.click(screen.getByRole("button", { name: "Uygula" }));
    await user.click(screen.getByRole("button", { name: "Kaydet" }));

    expect(saveCalls.map((call) => call.endpoint)).toEqual(["cells"]);
    expect(screen.getByText("Hücreler: kaydedildi")).toBeInTheDocument();
  });

  it("yeni satir ONCE rows'a yazilir, hucre ROWS YANITINDAKI kimlikle gider", async () => {
    mockPlan();
    mockMutations({
      rows: {
        resolve: {
          rows: [
            { id: "pr-1", kind: "crew", section_id: "sec-1", label: "Kalıpçı", planned_worker_count: 14, sort_order: 0 },
            { id: "pr-4", kind: "equipment", section_id: null, label: "Tower Crane", planned_worker_count: null, sort_order: 1 },
            { id: "pr-9", kind: "crew", section_id: "sec-1", label: "Demirci", planned_worker_count: 18, sort_order: 2 },
          ],
        },
      },
    });
    render(<SitePlanningView />);
    const user = userEvent.setup();

    const [addRowButton] = screen.getAllByRole("button", { name: "+ Satır" });
    await user.click(addRowButton!);
    await user.type(screen.getByLabelText("Etiket"), "Demirci");
    await user.type(screen.getByLabelText("İşçi sayısı"), "18");
    await user.click(screen.getByRole("button", { name: "Ekle" }));

    await user.click(screen.getByRole("button", { name: "Demirci (18) · Pzt 3 Ağu planı" }));
    await user.type(screen.getByLabelText("Plan metni"), "Kolon Demir");
    await user.click(screen.getByRole("button", { name: "Uygula" }));
    await user.click(screen.getByRole("button", { name: "Kaydet" }));

    expect(saveCalls.map((call) => call.endpoint)).toEqual(["rows", "cells"]);
    // Gövde haftanın TÜM hücrelerini taşır; yeni satırınki gerçek kimliğe bağlanmış olmalı.
    const cellsBody = saveCalls[1]?.body as { cells: Array<{ row_id: string; text: string }> };
    expect(cellsBody.cells.find((cell) => cell.text === "Kolon Demir")?.row_id).toBe("pr-9");
    expect(cellsBody.cells.find((cell) => cell.text === "Kat 9 Kalıp")?.row_id).toBe("pr-1");
  });

  it("kismi hata: yazilan adim gorunur, 'Yeniden dene' YALNIZ kalan adimi gonderir", async () => {
    mockPlan();
    mockMutations({ goals: { reject: new Error("boom") } });
    render(<SitePlanningView />);
    const user = userEvent.setup();

    // İki bölüm kirletilir: hücreler + hedefler.
    await user.click(screen.getByRole("button", { name: "Kalıpçı (14) · Sal 4 Ağu planı" }));
    await user.type(screen.getByLabelText("Plan metni"), "Kalıp");
    await user.click(screen.getByRole("button", { name: "Uygula" }));
    await user.type(
      screen.getByRole("textbox", { name: "Kat 9 döşeme betonu dök — hedef başlığı" }),
      " (rev)",
    );

    await user.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(saveCalls.map((call) => call.endpoint)).toEqual(["cells", "goals"]);
    expect(screen.getByText("Hücreler: kaydedildi")).toBeInTheDocument();
    expect(
      screen.getByText("Haftalık hedefler: kaydedilemedi — Haftalık hedefler kaydedilemedi."),
    ).toBeInTheDocument();
    // "kaydedildi" YALANI yok: hedef adımı başarısızken genel bir başarı mesajı basılmaz.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    mockMutations();
    saveCalls = [];
    await user.click(screen.getByRole("button", { name: "Yeniden dene" }));
    expect(saveCalls.map((call) => call.endpoint)).toEqual(["goals"]);
  });

  it("sprint adi bosaltilabilir (aktif sprinti kapatir)", async () => {
    mockPlan();
    render(<SitePlanningView />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Aktif sprinti düzenle" }));
    await user.clear(screen.getByLabelText("Sprint adı"));
    await user.click(screen.getByRole("button", { name: "Uygula" }));
    await user.click(screen.getByRole("button", { name: "Kaydet" }));

    expect(saveCalls).toEqual([{ endpoint: "sprint", body: { name: null } }]);
    expect(screen.queryByText(/Aktif Sprint:/)).not.toBeInTheDocument();
  });

  // F-PL T4 · HATA DALLARI. Kaydetme dört SIRALI PUT'tur ve 1→2 bağımlıdır;
  // bir adım patladığında akış DURMALI, sonraki adımlar HİÇ DENENMEMELİ ve
  // ekranda "kaydedildi" yalanı basılmamalıdır.
  it("rows patlarsa cells/goals/sprint HIC denenmez", async () => {
    mockPlan();
    mockMutations({ rows: { reject: new Error("boom") } });
    render(<SitePlanningView />);
    const user = userEvent.setup();

    // Dört bölümün üçü birden kirletilir: satır + hücre + sprint.
    const [addRowButton] = screen.getAllByRole("button", { name: "+ Satır" });
    await user.click(addRowButton!);
    await user.type(screen.getByLabelText("Etiket"), "Demirci");
    await user.click(screen.getByRole("button", { name: "Ekle" }));

    await user.click(screen.getByRole("button", { name: "Kalıpçı (14) · Sal 4 Ağu planı" }));
    await user.type(screen.getByLabelText("Plan metni"), "Kalıp");
    await user.click(screen.getByRole("button", { name: "Uygula" }));

    await user.click(screen.getByRole("button", { name: "Aktif sprinti düzenle" }));
    await user.clear(screen.getByLabelText("Sprint adı"));
    await user.type(screen.getByLabelText("Sprint adı"), "Yeni sprint");
    await user.click(screen.getByRole("button", { name: "Uygula" }));

    await user.click(screen.getByRole("button", { name: "Kaydet" }));

    expect(saveCalls.map((call) => call.endpoint)).toEqual(["rows"]);
    expect(
      screen.getByText("Plan satırları: kaydedilemedi — Plan satırları kaydedilemedi."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/kaydedildi$/)).not.toBeInTheDocument();
    // Hiçbir şey yazılmadığı için taslak KİRLİ kalır — "Kaydet" hâlâ açıktır.
    expect(screen.getByRole("button", { name: "Kaydet" })).toBeEnabled();
  });

  it("cells patlarsa goals ve sprint denenmez; 'Yeniden dene' kalan UCUNU gonderir", async () => {
    mockPlan();
    mockMutations({ cells: { rejectOnce: new Error("boom") } });
    render(<SitePlanningView />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Kalıpçı (14) · Sal 4 Ağu planı" }));
    await user.type(screen.getByLabelText("Plan metni"), "Kalıp");
    await user.click(screen.getByRole("button", { name: "Uygula" }));
    await user.click(screen.getAllByRole("checkbox")[1]!);

    await user.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(saveCalls.map((call) => call.endpoint)).toEqual(["cells"]);
    expect(
      screen.getByText("Hücreler: kaydedilemedi — Hücreler kaydedilemedi."),
    ).toBeInTheDocument();

    // Kaydedilemeyen adım hâlâ kirli: yeniden deneme İKİSİNİ de gönderir.
    saveCalls = [];
    await user.click(screen.getByRole("button", { name: "Yeniden dene" }));
    expect(saveCalls.map((call) => call.endpoint)).toEqual(["cells", "goals"]);
  });

  it("sprint patlamasi da gorunur gerekce basar (son adim sessizce yutulmaz)", async () => {
    mockPlan();
    mockMutations({ sprint: { reject: new Error("boom") } });
    render(<SitePlanningView />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Aktif sprinti düzenle" }));
    await user.clear(screen.getByLabelText("Sprint adı"));
    await user.type(screen.getByLabelText("Sprint adı"), "Kat 10");
    await user.click(screen.getByRole("button", { name: "Uygula" }));
    await user.click(screen.getByRole("button", { name: "Kaydet" }));

    expect(saveCalls.map((call) => call.endpoint)).toEqual(["sprint"]);
    expect(
      screen.getByText("Aktif sprint: kaydedilemedi — Aktif sprint kaydedilemedi."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Yeniden dene" })).toBeInTheDocument();
  });

  it("yinelenen satir etiketinde HIC istek atilmaz (dogrulama kapisi)", async () => {
    mockPlan();
    render(<SitePlanningView />);
    const user = userEvent.setup();

    // Aynı grupta ikinci "Kalıpçı": backend 422 verirdi ve yanıt eşlemesi
    // belirsizleşirdi (yeni satır yanlış kimliği alırdı).
    const [addRowButton] = screen.getAllByRole("button", { name: "+ Satır" });
    await user.click(addRowButton!);
    await user.type(screen.getByLabelText("Etiket"), "Kalıpçı");
    await user.click(screen.getByRole("button", { name: "Ekle" }));
    await user.click(screen.getByRole("button", { name: "Kaydet" }));

    expect(saveCalls).toEqual([]);
    expect(
      screen.getByText('Plan satırları: kaydedilemedi — Aynı grupta iki kez "Kalıpçı" satırı var.'),
    ).toBeInTheDocument();
  });

  it("basligi BOS hedefte HIC istek atilmaz + gorunur gerekce basar (T5)", async () => {
    mockPlan();
    render(<SitePlanningView />);
    const user = userEvent.setup();

    // Hedef açılır ama başlığı yazılmaz; ayrıca başka bir bölüm de kirletilir —
    // hiçbiri gönderilmemeli (sessiz atlama yok, yarım kayıt da yok).
    await user.click(screen.getByRole("button", { name: "+ Hedef" }));
    await user.click(screen.getByRole("button", { name: "Aktif sprinti düzenle" }));
    await user.clear(screen.getByLabelText("Sprint adı"));
    await user.type(screen.getByLabelText("Sprint adı"), "Kat 10");
    await user.click(screen.getByRole("button", { name: "Uygula" }));

    await user.click(screen.getByRole("button", { name: "Kaydet" }));

    expect(saveCalls).toEqual([]);
    expect(
      screen.getByText("Haftalık hedefler: kaydedilemedi — Başlığı boş bir hedef var."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/kaydedildi$/)).not.toBeInTheDocument();
  });

  it("satir silme ONAY diyalogundan gecer", async () => {
    mockPlan();
    render(<SitePlanningView />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Kalıpçı (14) satır işlemleri" }));
    await user.click(screen.getByRole("button", { name: "Sil" }));
    expect(screen.getByText(/satırı ve bu satırın TÜM hücreleri silinecek/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Sil", hidden: false }));
    const grid = screen.getByLabelText("Haftalık plan ızgarası");
    expect(within(grid).queryByText("Kalıpçı (14)")).not.toBeInTheDocument();
  });
});

// F-PL T5 · BOŞ IZGARA + BÖLÜM SEÇİCİSİ. Gruplar sunucuda yalnız mevcut
// satırlardan türer; giriş noktası yalnız grup başlığında dursaydı boş bir
// planda "+ Satır" hiçbir yerde olmaz ve plan SIFIRDAN kurulamazdı.
describe("SitePlanningView — boş ızgarada satır açma", () => {
  it("bos izgarada bos-durum metni KALIR ve yaninda '+ Satir' basilir", () => {
    mockPlan({ data: planWeek({ groups: [] }) });
    render(<SitePlanningView />);
    expect(screen.getByText("Bu hafta için plan satırı eklenmemiş.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Satır" })).toBeEnabled();
  });

  it("salt-okur kullanicida bos izgaranin '+ Satir' dugmesi DEVRE DISIdir (gizlenmez)", () => {
    mockSession({ site_diary: "view" });
    mockPlan({ data: planWeek({ groups: [] }) });
    render(<SitePlanningView />);
    expect(screen.getByRole("button", { name: "+ Satır" })).toBeDisabled();
  });

  it("bos izgaraya satir eklenir, izgara cizilir ve rows govdesine girer", async () => {
    mockPlan({ data: planWeek({ groups: [] }) });
    render(<SitePlanningView />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "+ Satır" }));
    await user.type(screen.getByLabelText("Etiket"), "Demirci");
    await user.type(screen.getByLabelText("İşçi sayısı"), "18");
    await user.click(screen.getByRole("button", { name: "Ekle" }));

    // Boş-durum metni kalkar, ızgara gerçekten çizilir (grup + satır).
    expect(screen.queryByText("Bu hafta için plan satırı eklenmemiş.")).not.toBeInTheDocument();
    const grid = screen.getByLabelText("Haftalık plan ızgarası");
    expect(within(grid).getByText("Demirci (18)")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(saveCalls.map((call) => call.endpoint)).toEqual(["rows"]);
    expect((saveCalls[0]?.body as { rows: unknown[] }).rows).toEqual([
      {
        id: null,
        kind: "crew",
        section_id: null,
        label: "Demirci",
        planned_worker_count: 18,
        sort_order: 0,
      },
    ]);
  });

  it("secilen BOLUM govdeye tasinir ve grup basligi o bolumun adiyla acilir", async () => {
    mockPlan({ data: planWeek({ groups: [] }) });
    render(<SitePlanningView />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "+ Satır" }));
    await user.selectOptions(screen.getByLabelText("Bölüm"), "sec-2");
    await user.type(screen.getByLabelText("Etiket"), "Sıvacı");
    await user.click(screen.getByRole("button", { name: "Ekle" }));

    const grid = screen.getByLabelText("Haftalık plan ızgarası");
    expect(within(grid).getByText("Zemin Kat Kaba")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Kaydet" }));
    expect((saveCalls[0]?.body as { rows: Array<{ section_id: string | null }> }).rows[0]?.section_id)
      .toBe("sec-2");
  });

  it("EKIPMAN turunde bolum secicisi kapanir ve govdeye section_id: null gider", async () => {
    mockPlan({ data: planWeek({ groups: [] }) });
    render(<SitePlanningView />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "+ Satır" }));
    await user.selectOptions(screen.getByLabelText("Bölüm"), "sec-1");
    await user.selectOptions(screen.getByLabelText("Tür"), "equipment");
    expect(screen.getByLabelText("Bölüm")).toBeDisabled();
    await user.type(screen.getByLabelText("Etiket"), "Tower Crane");
    await user.click(screen.getByRole("button", { name: "Ekle" }));

    await user.click(screen.getByRole("button", { name: "Kaydet" }));
    expect((saveCalls[0]?.body as { rows: Array<{ section_id: string | null }> }).rows[0]).toMatchObject({
      kind: "equipment",
      section_id: null,
      planned_worker_count: null,
    });
  });

  it("bolum listesi yuklenemezse secici KALIR, gorunur gerekce basar", async () => {
    mockSections({ data: undefined, isLoading: false, isError: true });
    mockPlan({ data: planWeek({ groups: [] }) });
    render(<SitePlanningView />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "+ Satır" }));
    expect(screen.getByLabelText("Bölüm")).toBeEnabled();
    expect(
      screen.getByText("Bölüm listesi yüklenemedi; satır yalnız bölümsüz açılabilir."),
    ).toBeInTheDocument();
  });
});
