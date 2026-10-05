import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { ProjectCard } from "./ProjectCard";
import type { ProjectListItem } from "@/lib/api/hooks/useProjects";

/**
 * F-ILRUI — kart ilerleme cubugu ZARFA baglanir.
 *
 * Olculmus olgu: `projects.progress_pct` sutununun backend'de HICBIR YAZMA YOLU
 * YOKTUR (`backend/app/modules/projects/cards.py`) — kullanicinin actigi her
 * projede kalici olarak `0`. Yani bu alan bir FOSIL ve kartin ilerleme cubugu
 * onu basamaz. Dogru kaynaklar tip basina AYRI zarflardir:
 *   taahhut       → `contracting.physical_progress`   (mockup 185/210/235/260/279)
 *   kat_karsiligi → `land_share.construction_progress` (mockup 157)
 *   kendi_yatirim → `investment.sales_ratio`           (mockup 124)
 *
 * K-IKIZ1: her "dolu zarf yuzdeyi basar" iddiasinin YANINDA "bos zarf '—' basar
 * ve cubuk dolgusu YOKTUR" ikizi durur; yoksa her zaman ayni seyi basan bozuk
 * kod da yesil gecer.
 */

const METRIC_PENDING = (m: string) => ({ available: false, value: null, pending_module: m });
const METRIC_REAL = (value: string) => ({ available: true, value, pending_module: null });
// K-ZARF 3. hâl: backend `restricted()` fabrikasi — modul EKSIK degil, ROLUN
// IZNI YOK. Anahtar tasimaz, dolayisiyla "modulle birlikte gelir" gerekcesi
// bu hâlde bir YALAN olur.
const METRIC_RESTRICTED = { available: false, value: null, pending_module: null };

const COUNT_PENDING = (m: string) => ({ available: false, count: null, pending_module: m });

const CONTRACTING_PLACEHOLDERS = {
  spent: METRIC_PENDING("project_costs"),
  physical_progress: METRIC_PENDING("progress_payments"),
  // Mali cubuk AYRI bir zarftan okur (`prj-financial-*` testid'leri); burada
  // dolu birakilmasi bu dosyanin FIZIKSEL iddialarini kirletmemesi icindir —
  // iki cubugun testid'leri ayridir, `getByTestId` tekil kalir.
  financial_progress: METRIC_PENDING("progress_payments"),
  final_progress_payment: METRIC_PENDING("progress_payments"),
  worker_count: COUNT_PENDING("timesheet"),
  subcontractor_count: COUNT_PENDING("subcontracts"),
};

const INVESTMENT_PLACEHOLDERS = {
  sales_target: "48200000.00",
  land_cost: "5000000.00",
  sold_amount: METRIC_PENDING("units"),
  sales_ratio: METRIC_PENDING("units"),
  unit_summary: COUNT_PENDING("units"),
  total_cost: METRIC_PENDING("project_costs"),
  estimated_profit: METRIC_PENDING("progress_payments"),
  margin: METRIC_PENDING("progress_payments"),
};

const LAND_SHARE_PLACEHOLDERS = {
  landowner_name: "Yılmaz Ailesi",
  our_share_pct: "55.00",
  owner_share_pct: "45.00",
  land_cost: "0.00",
  contract_no: null,
  notary_date: null,
  land_area_m2: null,
  construction_area_m2: null,
  delivery_date: null,
  daily_penalty: null,
  guarantee_amount: null,
  shareholder_count: 0,
  shareholders: [],
  our_unit_count: COUNT_PENDING("units"),
  owner_unit_count: COUNT_PENDING("units"),
  our_share_value: METRIC_PENDING("units"),
  construction_cost: METRIC_PENDING("project_costs"),
  estimated_profit: METRIC_PENDING("progress_payments"),
  margin: METRIC_PENDING("progress_payments"),
  construction_progress: METRIC_PENDING("progress_payments"),
};

const base: ProjectListItem = {
  id: "11111111-1111-1111-1111-111111111111",
  code: "GK-A",
  name: "Güneşkent A-Blok",
  project_type: "taahhut",
  status: "active",
  category: "Konut",
  city: "Ankara",
  employer_name: "Güneşkent A.Ş.",
  employer: null,
  contract: null,
  budget_lines: { material: "0", labor: "0", subcontractor: "0", overhead: "0" },
  is_draft: false,
  contract_no: "SZL-2025-01",
  contract_amount: "11200000.00",
  start_date: "2025-03-01",
  end_date: "2026-12-01",
  budget: "1000000.00",
  // FOSIL: her senaryoda DOLU birakiliyor ki ekranin ona bakmadigi olculebilsin.
  progress_pct: "75.00",
  contracting: { ...CONTRACTING_PLACEHOLDERS },
  investment: null,
  land_share: null,
};

// Zarf tipi sozlesmeden turetiliyor (elle yeniden bildirilmiyor) — sema
// degisirse fikstürler typecheck'te kirilir.
type Metric = NonNullable<ProjectListItem["contracting"]>["spent"];

const taahhut = (physical_progress: Metric): ProjectListItem => ({
  ...base,
  contracting: { ...CONTRACTING_PLACEHOLDERS, physical_progress },
});

const katKarsiligi = (construction_progress: Metric): ProjectListItem => ({
  ...base,
  project_type: "kat_karsiligi",
  name: "Bahçelievler Konut",
  employer_name: null,
  contracting: null,
  land_share: { ...LAND_SHARE_PLACEHOLDERS, construction_progress },
});

const kendiYatirim = (sales_ratio: Metric): ProjectListItem => ({
  ...base,
  project_type: "kendi_yatirim",
  name: "Yeşilvadi Rezidans",
  employer_name: null,
  contracting: null,
  investment: { ...INVESTMENT_PLACEHOLDERS, sales_ratio },
});

function fill() {
  return screen.queryByTestId("prj-progress-fill");
}

describe("ProjectCard ilerleme cubugu — taahhut · contracting.physical_progress", () => {
  it("dolu zarfta yuzdeyi basar ve cubugu doldurur", () => {
    render(<ProjectCard project={taahhut(METRIC_REAL("42.00"))} />);
    expect(screen.getByText("Fiziksel İlerleme")).toBeInTheDocument();
    expect(screen.getByText("%42")).toBeInTheDocument();
    expect(fill()).toHaveStyle({ width: "42%" });
  });

  // K-IKIZ1 ikizi
  it("bos zarfta '—' basar, cubuk dolgusu YOKTUR, gerekce title'da durur", () => {
    render(<ProjectCard project={taahhut(METRIC_PENDING("progress_payments"))} />);
    expect(screen.getByText("Fiziksel İlerleme")).toBeInTheDocument();
    expect(screen.getByTestId("prj-progress-pct")).toHaveTextContent("—");
    expect(screen.getByTestId("prj-progress-pct")).toHaveAttribute(
      "title",
      "Hakediş verisi bu yüzeye henüz bağlanmadı",
    );
    expect(fill()).not.toBeInTheDocument();
  });

  /**
   * 🔴 FOSIL BEKCISI — kullanicinin canlida gordugu kusurun TERSI.
   * `progress_pct` DOLU, zarf BOS: ekran fosili basarsa bu test kirmizi doner.
   */
  it("progress_pct dolu ama zarf bos ise fosili BASMAZ", () => {
    render(
      <ProjectCard
        project={{ ...taahhut(METRIC_PENDING("progress_payments")), progress_pct: "75.00" }}
      />,
    );
    expect(screen.queryByText("%75")).not.toBeInTheDocument();
    expect(screen.getByTestId("prj-progress-pct")).toHaveTextContent("—");
    expect(fill()).not.toBeInTheDocument();
  });

  /**
   * 🔴 K-ZARF birinci cumlesi: okuma YALNIZ `available` bayragindan yapilir.
   * MUTASYON DENETIMINDE ACIGA CIKTI — `available` kontrolu kaldirildigi hâlde
   * tum kume yesil kaliyordu, cunku hicbir fikstürde `available:false` iken
   * `value` DOLU degildi. Bu fikstür tam olarak o mutanti oldurur.
   */
  it("available=false iken deger DOLU olsa bile basmaz ('—' + dolgu yok)", () => {
    render(
      <ProjectCard
        project={taahhut({ available: false, value: "42.00", pending_module: "progress_payments" })}
      />,
    );
    expect(screen.queryByText("%42")).not.toBeInTheDocument();
    expect(screen.getByTestId("prj-progress-pct")).toHaveTextContent("—");
    expect(fill()).not.toBeInTheDocument();
  });

  it("100'un ustundeki deger cubukta %100'e kirpilir (yuzde metni kirpilmaz)", () => {
    render(<ProjectCard project={taahhut(METRIC_REAL("150.00"))} />);
    expect(screen.getByText("%150")).toBeInTheDocument();
    expect(fill()).toHaveStyle({ width: "100%" });
  });
});

describe("ProjectCard ilerleme cubugu — kat karsiligi · land_share.construction_progress", () => {
  it("dolu zarfta yuzdeyi basar ve cubugu doldurur", () => {
    render(<ProjectCard project={katKarsiligi(METRIC_REAL("42.00"))} />);
    expect(screen.getByText("İnşaat İlerlemesi")).toBeInTheDocument();
    expect(screen.getByText("%42")).toBeInTheDocument();
    expect(fill()).toHaveStyle({ width: "42%" });
  });

  it("bos zarfta '—' basar ve cubuk dolgusu YOKTUR", () => {
    render(<ProjectCard project={katKarsiligi(METRIC_PENDING("progress_payments"))} />);
    expect(screen.getByTestId("prj-progress-pct")).toHaveTextContent("—");
    expect(screen.queryByText("%75")).not.toBeInTheDocument();
    expect(fill()).not.toBeInTheDocument();
  });
});

describe("ProjectCard ilerleme cubugu — kendi yatirim · investment.sales_ratio", () => {
  // Mockup 124 etiketi "Satış Oranı (34/52 ünite)"; parantezli sayac units
  // sayaclarina baglidir ve bu dilimin kapsami disindadir.
  it("dolu zarfta 'Satış Oranı' etiketiyle yuzdeyi basar", () => {
    render(<ProjectCard project={kendiYatirim(METRIC_REAL("65.00"))} />);
    expect(screen.getByText("Satış Oranı")).toBeInTheDocument();
    expect(screen.queryByText("İnşaat İlerlemesi")).not.toBeInTheDocument();
    expect(screen.getByText("%65")).toBeInTheDocument();
    expect(fill()).toHaveStyle({ width: "65%" });
  });

  it("bos zarfta '—' basar ve cubuk dolgusu YOKTUR", () => {
    render(<ProjectCard project={kendiYatirim(METRIC_PENDING("units"))} />);
    expect(screen.getByText("Satış Oranı")).toBeInTheDocument();
    expect(screen.getByTestId("prj-progress-pct")).toHaveTextContent("—");
    expect(fill()).not.toBeInTheDocument();
  });
});

describe("ProjectCard ilerleme cubugu — K-ZARF 3. hâl (izin yok)", () => {
  /**
   * `available:false` + `pending_module:null` = backend `restricted()`.
   * `pendingModuleLabel(null)` "İlgili modülle birlikte gelir" doner; bu hâlde
   * o metin YALANDIR (modul var, izin yok) → title HIC verilmemelidir.
   */
  it("izin yok hâlinde sahte gerekce basmaz; title = gizli ipucu (IZN-F4.2)", () => {
    render(<ProjectCard project={taahhut(METRIC_RESTRICTED)} />);
    const pct = screen.getByTestId("prj-progress-pct");
    expect(pct).toHaveTextContent("—");
    expect(pct).toHaveAttribute("title", "Bu bilgi rolünüz için gizli");
    expect(screen.queryByTitle("İlgili modülle birlikte gelir")).not.toBeInTheDocument();
    expect(fill()).not.toBeInTheDocument();
  });

  // available:true fakat deger null (sozlesme disi yuk) — yine bos, yine sahte
  // gerekce yok.
  it("available=true fakat deger null ise bos durum, sahte gerekce yok", () => {
    render(
      <ProjectCard project={taahhut({ available: true, value: null, pending_module: null })} />,
    );
    const pct = screen.getByTestId("prj-progress-pct");
    expect(pct).toHaveTextContent("—");
    expect(pct).not.toHaveAttribute("title");
    expect(fill()).not.toBeInTheDocument();
  });
});
