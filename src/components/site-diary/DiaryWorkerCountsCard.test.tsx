import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { OwnCrewFromTimesheet, WorkerSource } from "@/lib/api/hooks/useSiteDiary";

import { WORKER_SOURCE_LABELS, WORKER_SOURCE_VALUES } from "./diary-labels";
import { DiaryWorkerCountsCard, type DiaryWorkerCountsCardProps } from "./DiaryWorkerCountsCard";
import type { DiaryFormState } from "./form-state";
import type { DiaryWorkerRow } from "./worker-counts";

// PLN-F2.1b · İ:344-372 "Bugünkü İşçi Dağılımı" (G12a). Kendi ekip satırları
// backend'in `own_crew_from_timesheet`inden SALT OKUNUR basılır (kişi + saat);
// firma satırında kişi × saat girilir; eski firmasız satır "Diğer (eski
// kayıt)" etiketiyle kalır. Puantajsız gün boş kalmaz — puantaja yönlendirir.

const TIMESHEET_HREF = "/projeler/p-1/santiyeler/s-1/puantaj?iso_year=2026&iso_week=39";

// Bileşen `form`dan yalnız `workerCounts` + `workerHours`ı okur.
function buildForm(counts: Record<string, string> = {}, hours: Record<string, string> = {}): DiaryFormState {
  return { workerCounts: counts, workerHours: hours } as unknown as DiaryFormState;
}

function crew(overrides: Partial<OwnCrewFromTimesheet> = {}): OwnCrewFromTimesheet {
  return { trade: "Kalıpçı", source: "company", headcount: 3, hours: "27.0", ...overrides };
}

const FIRM: DiaryWorkerRow = { trade: "Kaya Duvar", source: "subcontractor", subcontractorId: "firm-1" };
const LEGACY: DiaryWorkerRow = { trade: "Kalıpçılar", source: "company" };

function renderCard(props: Partial<DiaryWorkerCountsCardProps> = {}) {
  return render(
    <DiaryWorkerCountsCard
      rows={[]}
      ownCrew={[]}
      timesheetHref={TIMESHEET_HREF}
      form={buildForm()}
      onChange={() => {}}
      disabled={false}
      {...props}
    />,
  );
}

function rowOf(text: string): HTMLElement {
  const row = screen.getByText(text).closest(".diary-workers__grid-row");
  if (!(row instanceof HTMLElement)) throw new Error(`satır bulunamadı: ${text}`);
  return row;
}

describe("DiaryWorkerCountsCard — worker_source beş değer", () => {
  it("enum'un HER değeri için rozet etiketli basılır, ham değer sızmaz", () => {
    const ownCrew = WORKER_SOURCE_VALUES.map((source) => crew({ trade: `Meslek-${source}`, source }));

    renderCard({ ownCrew });

    for (const source of WORKER_SOURCE_VALUES) {
      expect(screen.getAllByText(WORKER_SOURCE_LABELS[source]).length).toBeGreaterThan(0);
    }
    const rawLeakCandidates: WorkerSource[] = ["freelance", "intern", "general", "subcontractor"];
    for (const raw of rawLeakCandidates) {
      expect(screen.queryByText(raw)).toBeNull();
    }
  });
});

describe("DiaryWorkerCountsCard — kendi ekip (puantajdan, G12a)", () => {
  it("kişi ve saat SALT OKUNUR basılır; rozet satırın kendi kaynağından", () => {
    renderCard({ ownCrew: [crew({ trade: "Kalıpçı", source: "freelance", headcount: 3, hours: "27.5" })] });

    const row = rowOf("Kalıpçı");
    expect(within(row).queryByRole("textbox")).toBeNull();
    expect(within(row).getByText(WORKER_SOURCE_LABELS.freelance)).toBeInTheDocument();
    expect(within(row).getByText("3")).toBeInTheDocument();
    // Saat ve a-s aynı değerdir (kendi ekipte a-s = puantaj saati).
    expect(within(row).getAllByText("27,5")).toHaveLength(2);
  });

  it("puantaj yoksa bölüm BOŞ KALMAZ — 'Puantaja git' o günün haftasına gider (ok SVG, glif değil)", () => {
    renderCard({ ownCrew: [] });

    expect(screen.getByText(/Bu gün için puantaj girilmemiş/)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /Puantaja git/ });
    expect(link).toHaveAttribute("href", TIMESHEET_HREF);
    expect(link.querySelector("svg")).not.toBeNull();
    expect(link.textContent).not.toContain("→");
  });

  it("GKS-F1.5 · kayıtsız günde de boş hâl basılır; 'önce Taslak Kaydet' notu YOKTUR", () => {
    renderCard({ ownCrew: [] });

    expect(screen.getByText(/Bu gün için puantaj girilmemiş/)).toBeInTheDocument();
    expect(screen.queryByText(/önce “Taslak Kaydet” deyin/)).toBeNull();
    expect(screen.queryByText(/kayıt açıldıktan sonra girilebilir/)).toBeNull();
  });

  it("puantaj varsa boş hâl basılmaz", () => {
    renderCard({ ownCrew: [crew()] });

    expect(screen.queryByText(/Bu gün için puantaj girilmemiş/)).toBeNull();
  });
});

describe("DiaryWorkerCountsCard — firma ve eski kayıt satırları", () => {
  it("firma satırında kişi × saat girilir; a-s satırda türetilir", () => {
    renderCard({
      rows: [FIRM],
      firmNameById: new Map([["firm-1", "Kaya Duvar İnşaat"]]),
      form: buildForm({ "firm|firm-1": "6" }, { "firm|firm-1": "9" }),
    });

    expect(screen.getByLabelText("Taşeron · Kaya Duvar İnşaat işçi sayısı")).toHaveValue("6");
    expect(screen.getByLabelText("Taşeron · Kaya Duvar İnşaat kişi başı saat")).toHaveValue("9");
    expect(within(rowOf("Kaya Duvar İnşaat")).getByText("54")).toBeInTheDocument();
  });

  it("eski firmasız satır 'Diğer (eski kayıt)' etiketiyle kalır; sayısı düzenlenir ve kaldırılabilir", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onRemoveRow = vi.fn();
    renderCard({ rows: [LEGACY], form: buildForm({ "company|Kalıpçılar": "4" }), onChange, onRemoveRow });

    const input = screen.getByLabelText("Şirket · Diğer (eski kayıt) · Kalıpçılar işçi sayısı");
    await user.type(input, "5");
    expect(onChange).toHaveBeenLastCalledWith("company|Kalıpçılar", "45");
    await user.click(screen.getByRole("button", { name: "Diğer (eski kayıt) · Kalıpçılar satırını kaldır" }));
    expect(onRemoveRow).toHaveBeenCalledWith("company|Kalıpçılar");
    // Eski satırın saat hücresi yoktur.
    expect(screen.queryByLabelText(/Kalıpçılar kişi başı saat/)).toBeNull();
  });

  it("ekleme seçicisi YALNIZ firma sunar (yeni firmasız satır eklenemez)", () => {
    renderCard({ onAddFirm: vi.fn(), firmOptions: [{ id: "firm-2", name: "Deniz Tesisat" }] });

    const options = within(screen.getByLabelText("Taşeron firma ekle")).getAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual(["+ Taşeron firma ekle", "Deniz Tesisat"]);
  });
});

describe("DiaryWorkerCountsCard — Toplam (G12a)", () => {
  function totalRow(container: HTMLElement): HTMLElement {
    const row = container.querySelector(".diary-workers__total");
    if (!(row instanceof HTMLElement)) throw new Error("toplam satırı yok");
    return row;
  }

  it("kişi = Σ headcount + Σ günlük satır · a-s = Σ puantaj + Σ firma a-s", () => {
    const { container } = renderCard({
      ownCrew: [crew({ headcount: 3, hours: "27.0" }), crew({ trade: "Demirci", headcount: 2, hours: "18.5" })],
      rows: [FIRM, LEGACY],
      form: buildForm({ "firm|firm-1": "6", "company|Kalıpçılar": "4" }, { "firm|firm-1": "9" }),
    });

    const total = totalRow(container);
    expect(within(total).getByText("15")).toBeInTheDocument();
    expect(within(total).getByText("99,5")).toBeInTheDocument();
  });

  it("firma a-s hesaplanamıyorsa a-s toplamı '—'", () => {
    const { container } = renderCard({
      ownCrew: [crew()],
      rows: [FIRM],
      form: buildForm({ "firm|firm-1": "6" }, { "firm|firm-1": "abc" }),
    });

    const total = totalRow(container);
    expect(within(total).getByText("9")).toBeInTheDocument();
    expect(within(total).getByText("—")).toBeInTheDocument();
  });
});

describe("GKS-F1.5 · kayıtsız günde işçi dağılımı girilebilir", () => {
  function renderEditable(props: Partial<DiaryWorkerCountsCardProps> = {}) {
    const onChange = vi.fn();
    const onHoursChange = vi.fn();
    const onAddFirm = vi.fn();
    const onRemoveRow = vi.fn();
    renderCard({
      rows: [FIRM],
      firmNameById: new Map([["firm-1", "Kaya Duvar İnşaat"]]),
      form: buildForm({ "firm|firm-1": "6" }, { "firm|firm-1": "9" }),
      onChange,
      onHoursChange,
      onAddFirm,
      onRemoveRow,
      firmOptions: [{ id: "firm-2", name: "Ay Yapı" }],
      ...props,
    });
    return { onChange, onHoursChange, onAddFirm, onRemoveRow };
  }

  it("girdiler, firma ekleme ve × AÇIK; devre dışı başlığı yok", () => {
    renderEditable();

    const count = screen.getByLabelText("Taşeron · Kaya Duvar İnşaat işçi sayısı");
    expect(count).toBeEnabled();
    expect(count).not.toHaveAttribute("title");
    expect(screen.getByLabelText("Taşeron · Kaya Duvar İnşaat kişi başı saat")).toBeEnabled();
    expect(screen.getByRole("combobox", { name: "Taşeron firma ekle" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Kaya Duvar İnşaat satırını kaldır" })).toBeInTheDocument();
    expect(screen.queryByText(/Önce taslak kaydedin/)).toBeNull();
  });

  it("salt-okunur (disabled) hâl AYNEN pasif: girdi kilitli, firma ekleme ve × yok", () => {
    renderEditable({ disabled: true });

    expect(screen.getByLabelText("Taşeron · Kaya Duvar İnşaat işçi sayısı")).toBeDisabled();
    expect(screen.queryByRole("combobox", { name: "Taşeron firma ekle" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Kaya Duvar İnşaat satırını kaldır" })).toBeNull();
  });
});
