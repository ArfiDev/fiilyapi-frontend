import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { ProjectCard } from "./ProjectCard";
import type { ProjectListItem } from "@/lib/api/hooks/useProjects";

/**
 * MALİ İLERLEME ÇUBUĞU — `contracting.financial_progress`.
 *
 * 🔴 ONAYLI SAPMA (kullanıcı kararı 2026-08-27): mockup bu çubuğu ÇİZMİYOR.
 * `projedesign/Ekran 4 - Projeler.dc.html` yalnız "Fiziksel İlerleme"
 * çubuklarını taşır (185/210/235/260/279) ve "Mali/Finansal/Nakdi İlerleme"
 * dizelerinin ALTISI DA sıfır eşleşme verdi. Sonraki tur bu satırları
 * "mockup'ta yok" diye SİLMESİN.
 *
 * Kavram: fiziksel = sahada fiilen ne imal edildi (şantiye günlüğü); mali = ne
 * kadarı ONAYLANMIŞ hakedişe girdi. İkisi KASTEN ayrışır, mali her zaman
 * fizikselin gerisindedir ve aradaki fark yönetimin baktığı asıl sayıdır. Bu
 * yüzden kullanıcı kararı AYRI ÇUBUK — aynı çubuğun içinde ikinci renk DEĞİL.
 *
 * Alan YALNIZ `ContractingCard`ta yaşar, `contracting` de yalnız
 * `project_type === "taahhut"`ta doludur → mali çubuk YALNIZ taahhutta görünür.
 */

const METRIC_PENDING = (m: string) => ({ available: false, value: null, pending_module: m });
const METRIC_REAL = (value: string) => ({ available: true, value, pending_module: null });
// K-ZARF 3. hâl: backend `restricted()` — modül EKSİK değil, ROLÜN İZNİ YOK.
const METRIC_RESTRICTED = { available: false, value: null, pending_module: null };

const COUNT_PENDING = (m: string) => ({ available: false, count: null, pending_module: m });

type Metric = NonNullable<ProjectListItem["contracting"]>["spent"];

const CONTRACTING_BASE = {
  spent: METRIC_PENDING("project_costs"),
  physical_progress: METRIC_REAL("75.00"),
  final_progress_payment: METRIC_PENDING("progress_payments"),
  worker_count: COUNT_PENDING("timesheet"),
  subcontractor_count: COUNT_PENDING("subcontracts"),
};

const base: ProjectListItem = {
  id: "p-1",
  code: "PRJ-1",
  name: "Kule A",
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
  contract_amount: "11200000",
  start_date: "2025-03-01",
  end_date: "2026-12-01",
  budget: "1000000",
  progress_pct: "20",
  contracting: { ...CONTRACTING_BASE, financial_progress: METRIC_PENDING("progress_payments") },
  investment: null,
  land_share: null,
};

const taahhut = (financial_progress: Metric | null | undefined): ProjectListItem => ({
  ...base,
  contracting: { ...CONTRACTING_BASE, financial_progress },
});

// Alanın HİÇ olmadığı hâl: şemada `financial_progress?:` OPSİYONEL, yani eski
// bir backend sürümü anahtarı komple atlayabilir. Fikstür bunu taklit eder.
const taahhutAlansiz = (): ProjectListItem => ({ ...base, contracting: { ...CONTRACTING_BASE } });

const fpct = () => screen.queryByTestId("prj-financial-pct");
const ffill = () => screen.queryByTestId("prj-financial-fill");

describe("ProjectCard mali ilerleme cubugu — taahhut", () => {
  it("dolu zarfta 'Mali İlerleme' etiketiyle yuzdeyi basar ve cubugu doldurur", () => {
    const { container } = render(<ProjectCard project={taahhut(METRIC_REAL("62.40"))} />);
    expect(screen.getByText("Mali İlerleme")).toBeInTheDocument();
    expect(fpct()).toHaveTextContent("%62");
    expect(ffill()).toHaveStyle({ width: "62.4%" });
    // 🔴 MUTASYON DENETIMINDEN DOGDU: `variant === "financial"` dali `false`a
    // cevrildiginde 21 birim testin HEPSI yesil kaliyordu — ayirt edici sinifi
    // kimse bekcilemiyordu ve kusuru yalniz gorsel kapi gorurdu.
    const financial = container.querySelector(".prj-progress--financial");
    expect(financial).not.toBeNull();
    expect(financial?.querySelector("[data-testid='prj-financial-fill']")).not.toBeNull();
    // IKIZ: fiziksel satir o sinifi ASLA almaz.
    const primaryRow = screen
      .getByTestId("prj-progress-pct")
      .closest(".prj-progress") as HTMLElement;
    expect(primaryRow.classList.contains("prj-progress--financial")).toBe(false);
  });

  // K-IKIZ1: mali çubuk fizikselin YERİNE geçmez, YANINA gelir. İki çubuk da
  // kendi zarfını basar (62.40 ≠ 75.00 — fikstür bilerek ayrık).
  it("IKIZ · fiziksel cubuk ayri kalir ve KENDI zarfini basar", () => {
    render(<ProjectCard project={taahhut(METRIC_REAL("62.40"))} />);
    expect(screen.getByText("Fiziksel İlerleme")).toBeInTheDocument();
    expect(screen.getByTestId("prj-progress-pct")).toHaveTextContent("%75");
    expect(screen.getByTestId("prj-progress-fill")).toHaveStyle({ width: "75%" });
  });

  it("bos zarfta '—' basar, gerekce title'da durur, DOLGU OGESI HIC BASILMAZ", () => {
    render(<ProjectCard project={taahhut(METRIC_PENDING("progress_payments"))} />);
    expect(screen.getByText("Mali İlerleme")).toBeInTheDocument();
    expect(fpct()).toHaveTextContent("—");
    expect(fpct()).toHaveAttribute("title", "Hakediş verisi bu yüzeye henüz bağlanmadı");
    expect(ffill()).not.toBeInTheDocument();
  });

  it("izin yok halinde (pending_module:null) sahte gerekce basmaz; gizli ipucu + kilit basar", () => {
    render(<ProjectCard project={taahhut(METRIC_RESTRICTED)} />);
    expect(fpct()).toHaveTextContent("—");
    expect(fpct()).toHaveAttribute("title", "Bu bilgi rolünüz için gizli");
    expect(screen.queryByTitle("İlgili modülle birlikte gelir")).not.toBeInTheDocument();
    expect(ffill()).not.toBeInTheDocument();
  });

  /**
   * 🔴 KARSIT KANIT — `available` bayragi kontrolunun bekcisi. Bir onceki
   * dilimde iki mutant SAG KALDI cunku hicbir fiksturde `available:false` iken
   * `value` DOLU degildi. Bu fikstür tam olarak o mutanti oldurur.
   */
  it("available=false iken deger DOLU olsa bile basmaz", () => {
    render(
      <ProjectCard
        project={taahhut({ available: false, value: "62.40", pending_module: "progress_payments" })}
      />,
    );
    expect(screen.queryByText("%62")).not.toBeInTheDocument();
    expect(fpct()).toHaveTextContent("—");
    expect(ffill()).not.toBeInTheDocument();
  });

  it("100'un ustundeki deger cubukta %100'e kirpilir (yuzde metni kirpilmaz)", () => {
    render(<ProjectCard project={taahhut(METRIC_REAL("140.00"))} />);
    expect(fpct()).toHaveTextContent("%140");
    expect(ffill()).toHaveStyle({ width: "100%" });
  });

  /**
   * Alan opsiyonel (`financial_progress?:`) — sema onu HIC gondermeyebilir.
   * KARAR: satir SILINMEZ, bos zarfin AYNISI basilir ("—", dolgu yok, title
   * YOK). Gerekce: (a) dosyanin mevcut kanonu "bos zarfta cubuk SILINMEZ",
   * (b) `metricCell` de `undefined` zarfi bos hucre sayar ve ipucu UYDURMAZ,
   * (c) alan gelip gittiginde kart yuksekligi oynamaz.
   */
  it("financial_progress alani HIC yokken cokmez: bos cubuk basar, title YOK", () => {
    render(<ProjectCard project={taahhutAlansiz()} />);
    expect(screen.getByText("Mali İlerleme")).toBeInTheDocument();
    expect(fpct()).toHaveTextContent("—");
    expect(fpct()).not.toHaveAttribute("title");
    expect(ffill()).not.toBeInTheDocument();
  });

  it("null zarfta da (sema `| null`) bos cubuk basar", () => {
    render(<ProjectCard project={taahhut(null)} />);
    expect(fpct()).toHaveTextContent("—");
    expect(ffill()).not.toBeInTheDocument();
  });
});

describe("ProjectCard mali ilerleme cubugu — taahhut DISI turlerde YOKTUR", () => {
  // `contracting` bu turlerde `null`; alan orada YASAMAZ, dolayisiyla cubuk da
  // basilmaz. Fiziksel cubuk ise her turde vardir — karistirma.
  it("kendi yatirimda mali cubuk basilmaz", () => {
    render(
      <ProjectCard
        project={{
          ...base,
          project_type: "kendi_yatirim",
          employer_name: null,
          contracting: null,
          investment: {
            sales_target: "48200000.00",
            land_cost: "5000000.00",
            sold_amount: METRIC_PENDING("units"),
            sales_ratio: METRIC_REAL("65.00"),
            unit_summary: COUNT_PENDING("units"),
            total_cost: METRIC_PENDING("project_costs"),
            estimated_profit: METRIC_PENDING("progress_payments"),
            margin: METRIC_PENDING("progress_payments"),
          },
        }}
      />,
    );
    expect(screen.queryByText("Mali İlerleme")).not.toBeInTheDocument();
    expect(fpct()).not.toBeInTheDocument();
    expect(screen.getByText("Satış Oranı")).toBeInTheDocument();
  });

  it("kat karsiliginda mali cubuk basilmaz", () => {
    render(
      <ProjectCard
        project={{
          ...base,
          project_type: "kat_karsiligi",
          employer_name: null,
          contracting: null,
          land_share: {
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
            construction_progress: METRIC_REAL("42.00"),
            estimated_profit: METRIC_PENDING("progress_payments"),
            margin: METRIC_PENDING("progress_payments"),
          },
        }}
      />,
    );
    expect(screen.queryByText("Mali İlerleme")).not.toBeInTheDocument();
    expect(fpct()).not.toBeInTheDocument();
    expect(screen.getByText("İnşaat İlerlemesi")).toBeInTheDocument();
  });
});
