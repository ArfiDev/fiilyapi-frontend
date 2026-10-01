import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SectionCard } from "./SectionCard";
import type { SectionResponse } from "./SectionCard";

const PROJECT_ID = "11111111-1111-1111-1111-111111111111";
const SITE_ID = "44444444-4444-4444-4444-444444444444";

const BASE_SECTION: SectionResponse = {
  id: "55555555-5555-5555-5555-555555555555",
  code: "A-01",
  name: "Kat 6–10 Kaba İnşaat",
  status: "active",
  manager_name: "Sercan Öztürk",
  start_date: "2026-01-01",
  end_date: "2026-09-30",
  sort_order: 0,
  depends_on_section_id: null,
  milestones: [],
  // ⛔ `progress_pct` yer tutucu KALIR (BLM-SAY dokunmadi) — anahtari
  // `progress_payments`tir, `boq` DEGIL (backend `to_section`).
  progress_pct: { available: false, value: null, pending_module: "progress_payments" },
  boq_item_count: { available: false, count: null, pending_module: "boq" },
  budget: { available: false, value: null, pending_module: "boq" },
  worker_count: { available: false, count: null, pending_module: "timesheet" },
  // F-BLMKART: BLM-SAY ile LISTE yanitina giren iki kayitli kolon.
  planned_worker_count: null,
};

function renderCard(overrides: Partial<SectionResponse> = {}) {
  return render(
    <SectionCard projectKey={PROJECT_ID} siteKey={SITE_ID} section={{ ...BASE_SECTION, ...overrides }} />,
  );
}

describe("SectionCard — durum etiketleri (spec §5.4, mockup birebir)", () => {
  it("completed durumu icin 'Tamamlandı' basar", () => {
    renderCard({ status: "completed" });
    expect(screen.getByText("Tamamlandı")).toBeInTheDocument();
  });

  it("active durumu icin 'Aktif — Devam Ediyor' basar", () => {
    renderCard({ status: "active" });
    expect(screen.getByText("Aktif — Devam Ediyor")).toBeInTheDocument();
  });

  it("planned durumu icin 'Planlandı' basar", () => {
    renderCard({ status: "planned" });
    expect(screen.getByText("Planlandı")).toBeInTheDocument();
  });

  // F-P6 T2: on_hold artik GERCEK rozet metnini/sinifini tasir — eskiden
  // "planned" ile ayni notr placeholder'di.
  it("on_hold durumu icin 'Beklemede' basar ve kendine ozgu sinif tasir", () => {
    renderCard({ status: "on_hold" });
    const badge = screen.getByText("Beklemede");
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain("section-card__status--on-hold");
    expect(badge.className).not.toContain("section-card__status--planned");
  });
});

describe("SectionCard — eylem her durumda bölüm detayına linklenir (F-P6 T2, spec §5.4)", () => {
  // F-P6 T2: Bölüm Detay ekranı gerçek olduğu için kart artık HER durumda
  // oraya link basar — önceki "planned -> devre dışı Düzenle" placeholder'ı
  // kaldırıldı.
  it("planned -> 'Detay →' baglantisi", () => {
    renderCard({ status: "planned" });
    const link = screen.getByRole("link", { name: "Detay →" });
    expect(link).toHaveAttribute(
      "href",
      `/projeler/${PROJECT_ID}/santiyeler/${SITE_ID}/bolumler/${BASE_SECTION.id}`,
    );
    expect(screen.queryByRole("button", { name: "Düzenle" })).not.toBeInTheDocument();
  });

  it("active -> 'Detay →' baglantisi", () => {
    renderCard({ status: "active" });
    const link = screen.getByRole("link", { name: "Detay →" });
    expect(link).toHaveAttribute(
      "href",
      `/projeler/${PROJECT_ID}/santiyeler/${SITE_ID}/bolumler/${BASE_SECTION.id}`,
    );
    expect(screen.queryByRole("button", { name: "Düzenle" })).not.toBeInTheDocument();
  });

  it("completed -> 'Detay →' baglantisi", () => {
    renderCard({ status: "completed" });
    expect(screen.getByRole("link", { name: "Detay →" })).toBeInTheDocument();
  });
});

// Mockup KAZANIR: metrik etiketleri duruma gore degisir (mockup satir
// 168-182 / 242-256 / 279-292). Spec §5.4 sabit dortlu yaziyordu, guncellendi.
describe("SectionCard — metrik etiketleri duruma gore degisir (mockup birebir)", () => {
  it("completed -> İlerleme · İş Kalemleri · Bölüm Bedeli · İşçi (zirve)", () => {
    renderCard({ status: "completed" });
    expect(screen.getByText("İlerleme")).toBeInTheDocument();
    expect(screen.getByText("İş Kalemleri")).toBeInTheDocument();
    expect(screen.getByText("Bölüm Bedeli")).toBeInTheDocument();
    expect(screen.getByText("İşçi (zirve)")).toBeInTheDocument();
    expect(screen.queryByText("Aktif İşçi")).not.toBeInTheDocument();
    expect(screen.queryByText("Tahmini Bedel")).not.toBeInTheDocument();
    expect(screen.queryByText("Planlanan İşçi")).not.toBeInTheDocument();
  });

  it("active -> İlerleme · İş Kalemleri · Bölüm Bedeli · Aktif İşçi", () => {
    renderCard({ status: "active" });
    expect(screen.getByText("İlerleme")).toBeInTheDocument();
    expect(screen.getByText("İş Kalemleri")).toBeInTheDocument();
    expect(screen.getByText("Bölüm Bedeli")).toBeInTheDocument();
    expect(screen.getByText("Aktif İşçi")).toBeInTheDocument();
    expect(screen.queryByText("İşçi (zirve)")).not.toBeInTheDocument();
    expect(screen.queryByText("Tahmini Bedel")).not.toBeInTheDocument();
    expect(screen.queryByText("Planlanan İşçi")).not.toBeInTheDocument();
  });

  it("planned -> İlerleme · İş Kalemleri · Tahmini Bedel · Planlanan İşçi", () => {
    renderCard({ status: "planned" });
    expect(screen.getByText("İlerleme")).toBeInTheDocument();
    expect(screen.getByText("İş Kalemleri")).toBeInTheDocument();
    expect(screen.getByText("Tahmini Bedel")).toBeInTheDocument();
    expect(screen.getByText("Planlanan İşçi")).toBeInTheDocument();
    expect(screen.queryByText("Bölüm Bedeli")).not.toBeInTheDocument();
    expect(screen.queryByText("İşçi (zirve)")).not.toBeInTheDocument();
    expect(screen.queryByText("Aktif İşçi")).not.toBeInTheDocument();
  });
});

describe("SectionCard — 4 metrik hepsi yer tutucu (spec §5.4, §7.1)", () => {
  it("dort metrigin dordu de '—' basar ve title tasir", () => {
    renderCard();
    const dashes = screen.getAllByText("—");
    expect(dashes).toHaveLength(4);
    // BLF-F1.3: "Bölüm Bedeli" artık TEK kaynaktan (türev `budget` zarfı) gelir
    // ve öbür zarf hücreleriyle AYNI yer tutucu yolundan geçer → dördü de
    // ipucu (title) taşır. (Eski elle `budget_amount` hücresinin "gerekçe
    // yazılmaz" istisnası kolonla birlikte kalktı.)
    dashes.forEach((el) => expect(el).toHaveAttribute("title"));
  });
});

// KOD INCELEME BULGUSU: bu iki metrik ham basiliyordu ("%62", "8400000.00")
// oysa SiteCard/SiteHeroBar ayni sekilleri paylasilan bicimlendiricilerden
// geciriyor.
describe("SectionCard — sayilar paylasilan bicimlendiricilerden gecer", () => {
  it("ilerleme formatPercent ile basilir (tr-TR ondalik)", () => {
    renderCard({ progress_pct: { available: true, value: "62.5", pending_module: "boq" } });
    expect(screen.getByText("%62,5")).toBeInTheDocument();
  });

  it("bolum bedeli formatCompactCurrency ile basilir", () => {
    renderCard({ budget: { available: true, value: "8400000.00", pending_module: null } });
    expect(screen.getByText("₺ 8,4M")).toBeInTheDocument();
  });
});

describe("SectionCard — İlerleme çubuğu (spec §7.1, mockup her durumda çizer)", () => {
  it("yer tutucuyken bos iz cizilir, dolgu basilmaz", () => {
    renderCard();
    const track = screen.getByTestId("section-card-progress-track");
    expect(track).toBeInTheDocument();
    expect(screen.queryByTestId("section-card-progress-fill")).not.toBeInTheDocument();
  });

  it("gercek deger geldiginde dolgu yuzdeye gore genislik alir", () => {
    renderCard({ progress_pct: { available: true, value: "62", pending_module: "boq" } });
    const fill = screen.getByTestId("section-card-progress-fill");
    expect(fill).toHaveStyle({ width: "62%" });
  });

  it("tamamlandi durumunda yesil (basari) sinifi tasir, aktif sinifi tasimaz (mockup satir 169-170/206-207)", () => {
    renderCard({
      status: "completed",
      progress_pct: { available: true, value: "100", pending_module: "boq" },
    });
    const track = screen.getByTestId("section-card-progress-track");
    const fill = screen.getByTestId("section-card-progress-fill");
    const value = screen.getByText("%100");

    expect(track.className).toContain("section-card__metric-progress--completed");
    expect(fill.className).toContain("section-card__metric-progress--completed");
    expect(value.className).toContain("section-card__metric-progress--completed");

    expect(track.className).not.toContain("section-card__metric-progress--active");
    expect(fill.className).not.toContain("section-card__metric-progress--active");
    expect(value.className).not.toContain("section-card__metric-progress--active");
  });

  it("aktif durumunda mavi sinifi tasir, tamamlandi sinifi tasimaz (mockup satir 243-244)", () => {
    renderCard({
      status: "active",
      progress_pct: { available: true, value: "62", pending_module: "boq" },
    });
    const track = screen.getByTestId("section-card-progress-track");
    const fill = screen.getByTestId("section-card-progress-fill");
    const value = screen.getByText("%62");

    expect(track.className).toContain("section-card__metric-progress--active");
    expect(fill.className).toContain("section-card__metric-progress--active");
    expect(value.className).toContain("section-card__metric-progress--active");

    expect(track.className).not.toContain("section-card__metric-progress--completed");
    expect(fill.className).not.toContain("section-card__metric-progress--completed");
    expect(value.className).not.toContain("section-card__metric-progress--completed");
  });

  it("yer tutucuyken durum siniflarindan hicbiri uygulanmaz", () => {
    renderCard({ status: "completed" });
    const track = screen.getByTestId("section-card-progress-track");
    expect(track.className).not.toContain("section-card__metric-progress--completed");
    expect(track.className).not.toContain("section-card__metric-progress--active");
    expect(track.className).not.toContain("section-card__metric-progress--planned");
  });
});

describe("SectionCard — '3 gecikme riski' BASILMAZ (spec §7.2)", () => {
  it("mockup'ta olsa da bu metin hicbir statude gorunmez", () => {
    renderCard({ status: "active" });
    expect(screen.queryByText(/gecikme riski/i)).not.toBeInTheDocument();
  });
});

describe("SectionCard — tarih ve sorumlu satiri", () => {
  it("ad ve sorumlu bilgisini basar", () => {
    renderCard({ manager_name: "M. Arslan" });
    expect(screen.getByText(/Sorumlu: M\. Arslan/)).toBeInTheDocument();
  });

  it("sorumlu atanmamissa 'Atanmadı' basar", () => {
    renderCard({ manager_name: null });
    expect(screen.getByText(/Atanmadı/)).toBeInTheDocument();
  });
});

// Davranissal klavye odak testi (kod inceleme bulgusu duzeltmesi — Task 12 takibi):
// css.test.ts yalniz CSS metnini dogrular; gercek odaklanabilirlik/Tab sirasi
// jsdom + Testing Library ile burada dogrulanir.
describe("SectionCard — eylem klavyeyle odaklanabilir (davranissal)", () => {
  it("planned -> 'Detay →' baglantisi Tab ile odaklanir", async () => {
    const user = userEvent.setup();
    renderCard({ status: "planned" });
    await user.tab();
    expect(screen.getByRole("link", { name: "Detay →" })).toHaveFocus();
  });

  it("active -> 'Detay →' baglantisi Tab ile odaklanir", async () => {
    const user = userEvent.setup();
    renderCard({ status: "active" });
    await user.tab();
    expect(screen.getByRole("link", { name: "Detay →" })).toHaveFocus();
  });

  it("completed -> 'Detay →' baglantisi Tab ile odaklanir", async () => {
    const user = userEvent.setup();
    renderCard({ status: "completed" });
    await user.tab();
    expect(screen.getByRole("link", { name: "Detay →" })).toHaveFocus();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// F-BLMKART (2026-08-27) — kullanicinin canlida bildirdigi "dort alan da bos"
// kusurunun bekcileri. Backend BLM-SAY (`1def2b9`) iki yer tutucuyu BAGLADI ve
// iki kayitli kolonu LISTE yanitina EKLEDI.
// ═══════════════════════════════════════════════════════════════════════════

describe("SectionCard — 'Bölüm Bedeli' TEK satır, TEK kaynak: türev `budget` (BLF-F1.3, F-a)", () => {
  it("BOQ tahsislerinden türeyen `budget` ana değer olarak basılır", () => {
    renderCard({ budget: { available: true, value: "3520000.00", pending_module: null } });
    expect(screen.getByText("₺ 3,5M")).toBeInTheDocument();
  });

  // 🔴 Eskiden kutu iki satırdı (elle `budget_amount` + "BOQ: …"). Elle kolon
  // kalktı; "BOQ:" alt satırı KALMAMALI — iki satır = iki kaynak izlenimi.
  it("🔴 'BOQ: …' alt satırı YOK — kutuda tek satır vardır", () => {
    renderCard({ budget: { available: true, value: "3520000.00", pending_module: null } });
    expect(screen.queryByText(/BOQ:/)).not.toBeInTheDocument();
    expect(document.querySelector(".section-card__metric-note")).toBeNull();
  });

  // K-MKD3: tahsisi olmayan bölüm `available: true` + "0.00" döner → gerçek
  // sıfırdır ("₺ 0"), yer tutucu "—" DEĞİL.
  it("tahsisi olmayan bölüm gerçek sıfır basar ('₺ 0'), '—' DEĞİL", () => {
    renderCard({ budget: { available: true, value: "0.00", pending_module: null } });
    const cell = screen.getByText("Bölüm Bedeli").closest(".section-card__metric") as HTMLElement;
    expect(cell).toHaveTextContent("₺ 0");
    expect(cell).not.toHaveTextContent("—");
  });

  it("zarf gerçekten yer tutucuyken '—' basılır ve sebebi title'da taşınır", () => {
    renderCard({ budget: { available: false, value: null, pending_module: "boq" } });
    const cell = screen.getByText("Bölüm Bedeli").closest(".section-card__metric") as HTMLElement;
    const dash = cell.querySelector(".section-card__metric-value--pending") as HTMLElement;
    expect(dash).toHaveTextContent("—");
    expect(dash.getAttribute("title")).toBeTruthy();
  });
});

describe("SectionCard — 'İş Kalemleri' TEK SAYI basar (bilinçli mockup sapması)", () => {
  it("boq_item_count gerçek değeri basılır", () => {
    renderCard({ boq_item_count: { available: true, count: 26, pending_module: "boq" } });
    expect(screen.getByText("26")).toBeInTheDocument();
  });

  // 🔴 K-MKD3: tahsisi olmayan bolum icin "0 is kalemi" DOGRU bir cumledir.
  it("count 0 iken '0' basılır, '—' DEĞİL", () => {
    renderCard({ boq_item_count: { available: true, count: 0, pending_module: "boq" } });
    expect(screen.getByText("0")).toBeInTheDocument();
    // Kalan uc metrik hâlâ yer tutucu (progress · bedel · isci) — dort DEGIL uc.
    expect(screen.getAllByText("—")).toHaveLength(3);
  });

  // Mockup `Şantiye Detay.dc.html:248` "16 / 26" yazar; PAYIN kaynagi repoda
  // YOKTUR ve UYDURULMADI.
  it("mockup'taki kesir BASILMAZ — ekranda '/' içeren bir sayı yoktur", () => {
    renderCard({ boq_item_count: { available: true, count: 26, pending_module: "boq" } });
    expect(screen.queryByText(/^\d+\s*\/\s*\d+$/)).not.toBeInTheDocument();
  });
});

describe("SectionCard — işçi hücresinin KAYNAĞI duruma göre değişir", () => {
  const WORKER: SectionResponse["worker_count"] = { available: true, count: 48, pending_module: "timesheet" };

  it("active -> worker_count basılır, planned_worker_count basılmaz", () => {
    renderCard({ status: "active", worker_count: WORKER, planned_worker_count: 30 });
    expect(screen.getByText("48")).toBeInTheDocument();
    expect(screen.queryByText("30")).not.toBeInTheDocument();
  });

  it("completed -> worker_count basılır", () => {
    renderCard({ status: "completed", worker_count: WORKER, planned_worker_count: 30 });
    expect(screen.getByText("48")).toBeInTheDocument();
    expect(screen.queryByText("30")).not.toBeInTheDocument();
  });

  it("planned -> planned_worker_count basılır, worker_count basılmaz", () => {
    renderCard({ status: "planned", worker_count: WORKER, planned_worker_count: 30 });
    expect(screen.getByText("30")).toBeInTheDocument();
    expect(screen.queryByText("48")).not.toBeInTheDocument();
  });

  it("on_hold -> planned_worker_count basılır", () => {
    renderCard({ status: "on_hold", worker_count: WORKER, planned_worker_count: 30 });
    expect(screen.getByText("30")).toBeInTheDocument();
    expect(screen.queryByText("48")).not.toBeInTheDocument();
  });

  it("planned + planned_worker_count null -> sahte sıfır basılmaz", () => {
    renderCard({ status: "planned", worker_count: WORKER, planned_worker_count: null });
    expect(screen.getByTitle("Planlanan işçi sayısı girilmemiş")).toHaveTextContent("—");
    expect(screen.queryByText("48")).not.toBeInTheDocument();
  });
});

// ⛔ POZITIF KONTROL KARSITI: diger uc alan GERCEK deger tasirken bile
// "İlerleme" DURUST BOS kalmalidir. Bu test, ilerideki bir turun `progress_pct`i
// yanlislikla baglamasini (ya da sahte %0 basmasini) yakalar.
describe("SectionCard — 'İlerleme' YER TUTUCU KALIR (progress_pct'e dokunulmadı)", () => {
  it("diğer üç alan gerçek değer taşırken bile ilerleme '—' basar, çubuk dolgusu çizilmez", () => {
    renderCard({
      status: "active",
      boq_item_count: { available: true, count: 26, pending_module: "boq" },
      budget: { available: true, value: "3520000.00", pending_module: null },
      worker_count: { available: true, count: 48, pending_module: "timesheet" },
    });
    expect(screen.getByText("26")).toBeInTheDocument();
    expect(screen.getByText("₺ 3,5M")).toBeInTheDocument();
    expect(screen.getByText("48")).toBeInTheDocument();

    const dashes = screen.getAllByText("—");
    expect(dashes).toHaveLength(1);
    expect(dashes[0].className).toContain("section-card__metric-value--progress");
    expect(screen.queryByTestId("section-card-progress-fill")).not.toBeInTheDocument();
    expect(screen.getByTestId("section-card-progress-track")).toBeInTheDocument();
  });
});
