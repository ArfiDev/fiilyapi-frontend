import Link from "next/link";
import type { ReactNode } from "react";

import { cx } from "@/lib/cx";
import type { ProjectListItem } from "@/lib/api/hooks/useProjects";
import { formatCompactCurrency, formatMonthYear, formatPercent } from "@/lib/format";
import { pendingModuleHint, pendingModuleLabel } from "@/lib/pending-modules";
import type { MetricPlaceholder } from "@/lib/api/scale";

import { ShareBar } from "./ShareBar";
import "./projects.css";
import { routes, routeKeyOf } from "@/lib/routes";

type Project = ProjectListItem;
// NOT: gercek semada tip-basi metrikler duz alanlar degil, ContractingCard /
// InvestmentCard / LandShareCard icine gomulu MetricPlaceholder'lar (plan Task 4
// duz `project.spent`/`project.sales`/`project.profit` varsaymisti — bunlar yerine
// `project.contracting.spent`, `project.investment.sold_amount` vb. kullanildi).
type Metric = NonNullable<Project["contracting"]>["spent"];
// FAZ 2d (TYPE-F1 madde 1/3) — `physical_progress` (ContractingCard) artık
// DeepScale'in `innerScale: "percent"` eşlemesiyle `.value: Percent | null`
// taşıyor; `financial_progress`/`construction_progress`/`sales_ratio`/`margin`
// AYNI şekle sahip (hepsi ham `components["schemas"]["MetricPlaceholder"]`den
// türer, `Omit`+marka birebir aynı yapıyı üretir) — TEK takma ad yeterli.
type PercentMetric = NonNullable<Project["contracting"]>["physical_progress"];

const TYPE_LABELS: Record<Project["project_type"], string> = {
  taahhut: "TAAHHÜT",
  kendi_yatirim: "KENDİ YATIRIM",
  kat_karsiligi: "KAT KARŞILIĞI",
};

const STATUS_LABELS: Record<Project["status"], string> = {
  planning: "Planlama",
  active: "Aktif",
  on_hold: "Beklemede",
  completed: "Tamamlandı",
};

// ⛔ ESKI GEREKCE (F-ILRUI · 2026-08-27 ITIBARIYLA BAYAT, tarihsel tutuluyor):
// «Mockup kendi yatirimda "Satış Oranı" der; satis verisi units modulunde —
//  o gelene kadar cubuk progress_pct bastigi icin etiket de onu soyler (spec §7.5).»
// Gerekce OLDU: cubuk artik `progress_pct` BASMIYOR (o alan fosil, asagiya bak),
// kendi yatirimda `investment.sales_ratio` zarfini basiyor. Etiketin "İnşaat
// İlerlemesi" demesinin tek dayanagi bastigi verinin ilerleme olmasiydi; veri
// artik satis orani, dolayisiyla etiket mockup'a (satir 124) doner.
// Mockup 124 tam metni "Satış Oranı (34/52 ünite)"; parantezli sayac `units`
// sayaclarina baglidir ve bu dilimin kapsami DISINDADIR — basilmaz.
const PROGRESS_LABELS: Record<Project["project_type"], string> = {
  taahhut: "Fiziksel İlerleme", // mockup 185/210/235/260/279
  kendi_yatirim: "Satış Oranı", // mockup 124
  kat_karsiligi: "İnşaat İlerlemesi", // mockup 157
};

// 🔴 ILERLEME CUBUGUNUN KAYNAGI — `project.progress_pct` DEGIL.
//
// Olculdu (`backend/app/modules/projects/cards.py`): `projects.progress_pct`
// sutununun HICBIR YAZMA YOLU YOKTUR. Kullanicinin actigi her projede kalici
// olarak `0`, tohum satirlarinda ise hicbir ekranin duzeltemeyecegi donmus bir
// sayi. Yani alan bir FOSIL; kullanicinin canlida "Fiziksel İlerleme %0"
// gormesinin sebebi tam olarak buydu. Cubuk tip basina AYRI zarflardan okur.
function progressMetric(project: Project): PercentMetric | undefined {
  if (project.project_type === "taahhut") return project.contracting?.physical_progress;
  if (project.project_type === "kat_karsiligi") return project.land_share?.construction_progress;
  return project.investment?.sales_ratio;
}

// K-ZARF ucuncu hâli: `available:false` + `pending_module:null` backend'in
// `restricted()` fabrikasidir — modul EKSIK degil, ROLUN IZNI YOK.
// `pendingModuleLabel(null)` bu hâlde `FALLBACK_LABEL` ("İlgili modülle birlikte
// gelir") doner ki bu bir YALAN olur. `pendingModuleLabel`i degistirmek yerine
// CAGRI YERINDE dallaniyoruz: anahtar yoksa gerekce HIC verilmez (undefined).
// Jenerik: hem para (`Metric`) hem yüzde (`PercentMetric`) zarfları için AYNI
// fonksiyon yeterli — yalnız `pending_module` okunuyor, `.value`in tipi
// önemsiz (FAZ 2d, `MetricPlaceholder` varsayılan `V` ile).
function pendingReason(metric: MetricPlaceholder | undefined | null): string | undefined {
  return metric?.pending_module ? pendingModuleLabel(metric.pending_module) : undefined;
}

/**
 * 🔴 ONAYLI SAPMA (kullanici karari 2026-08-27) — MALI ILERLEME CUBUGU.
 *
 * Mockup bu alani CIZMIYOR: `projedesign/Ekran 4 - Projeler.dc.html` yalniz
 * "Fiziksel İlerleme" cubuklarini tasir (185/210/235/260/279) ve "Mali /
 * Finansal / Nakdi Ilerleme" dizelerinin ALTISI DA sifir eslesme verdi. Yine de
 * basiliyor cunku kullanici acikca istedi. SONRAKI TUR BUNU "mockup'ta yok"
 * DIYE SILMESIN.
 *
 * Kavram: fiziksel = sahada fiilen ne imal edildi (gonderilmis santiye
 * gunlugu); mali = ne kadari ONAYLANMIS hakedise girdi. Ikisi KASTEN ayrisir,
 * mali her zaman fizikselin gerisindedir ve aradaki fark yonetimin baktigi asil
 * sayidir. Kullanici karari AYRI CUBUK — ayni cubugun icinde ikinci renk DEGIL.
 *
 * Alan (`ContractingCard.financial_progress`) YALNIZ taahhut kartinda yasar;
 * `contracting` diger iki turde `null`dur, dolayisiyla cubuk da yoktur.
 */
type ProgressVariant = "primary" | "financial";

// 🔴 VARSAYILAN VERILMEZ (bir onceki dilimin en pahali dersi): ayristirici
// prop'a varsayilan konsaydi bir cagiran onu atlar, sessizce yanlis kimlige
// duser ve birim testlerinin HICBIRI gormezdi — yalniz gorsel kapi gorurdu.
// Bu yuzden `variant` ZORUNLUDUR ve testid'ler ondan turer.
const PROGRESS_TESTIDS: Record<ProgressVariant, { pct: string; fill: string }> = {
  primary: { pct: "prj-progress-pct", fill: "prj-progress-fill" },
  financial: { pct: "prj-financial-pct", fill: "prj-financial-fill" },
};

// Cubuk satiri — mockup'ta kart basina TEK cubuk (7 kart, 7 cubuk); mali cubuk
// yukaridaki onayli sapmayla taahhut kartlarina IKINCI satir olarak eklenir.
// Bos zarfta cubuk SILINMEZ: etiket kalir, yuzde "—" olur ve DOLGU OGESI HIC
// BASILMAZ (genislik 0 degil) — emsal `project-detail/SiteCard.tsx` ProgressBar.
//
// NOT (`metricCell` yeniden kullanimi olculdu): `src/lib/placeholder-cell.ts`
// ayni uc hâli okur ve dallanmasi `realValue`/`pendingReason` ikilisiyle
// DAVRANIS OLARAK AYNIDIR (`available === true` + deger null/undefined degil).
// Buraya YINE DE takilmadi: `metricCell` yalnizca BICIMLENMIS metni dondurur,
// cubuk genisligi ise HAM sayiyi ister (`Math.min(Number(value), 100)`).
// Zorlamak, ayni zarfi iki kez okumak ya da bicimli metni geri ayristirmak
// demek olurdu; ikisi de mevcut kanondan kotu.
function ProgressRow({
  label,
  metric,
  variant,
}: {
  label: string;
  metric: PercentMetric | undefined | null;
  variant: ProgressVariant;
}) {
  const value = realValue(metric);
  const testids = PROGRESS_TESTIDS[variant];
  return (
    <div className={cx("prj-progress", variant === "financial" && "prj-progress--financial")}>
      <div className="prj-progress__labels">
        <span>{label}</span>
        {value !== null ? (
          <span className="prj-progress__pct" data-testid={testids.pct}>
            {formatPercent(value)}
          </span>
        ) : (
          <span
            className="prj-progress__pct prj-progress__pct--pending"
            data-testid={testids.pct}
            title={pendingReason(metric)}
          >
            —
          </span>
        )}
      </div>
      <div className="prj-progress__bar">
        {value !== null && (
          <div
            className="prj-progress__fill"
            data-testid={testids.fill}
            style={{ width: `${Math.min(Number(value), 100)}%` }}
          />
        )}
      </div>
    </div>
  );
}

function metaLine(project: Project): string {
  const base = [project.category, project.city].filter(Boolean).join(" · ");
  if (project.project_type === "taahhut" && project.employer_name) {
    return `${base} · İşveren: ${project.employer_name}`;
  }
  if (project.project_type === "kat_karsiligi" && project.land_share) {
    return `${base} · Arsa Sahibi: ${project.land_share.landowner_name}`;
  }
  return base;
}

function KpiCell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="prj-kpi__label">{label}</div>
      {children}
    </div>
  );
}

// Zarfin TEK okuma noktasi: dallanma alan TIPINE degil `available` BAYRAGINA
// bakar (P10 sozlesmesi). Bayrak dolu ama deger yoksa yine bos durum sayilir —
// "—" basmak, bos hucre birakmaktan durusttur.
// Jenerik (FAZ 2d): para (`Metric`, `.value: string|number|null`) ve yüzde
// (`PercentMetric`, `.value: Percent|null`) zarfları AYNI fonksiyonla okunur;
// dönüş tipi çağıranın verdiği zarfın `V`sini KORUR (kaçış YOK).
function realValue<V extends string | number>(
  metric: MetricPlaceholder<V> | undefined | null,
): V | null {
  if (!metric?.available) return null;
  return metric.value ?? null;
}

// available:false → etiket kalir, deger "—", ipucu title'da (spec §7.2).
function MetricValue({
  metric,
  tone,
}: {
  metric: Metric | undefined;
  tone?: "success" | "danger" | "profit";
}) {
  const value = realValue(metric);
  if (value !== null) {
    // kalan-4 #262: `tone="profit"` isarete BAKMAZDI — negatif kar (zarar)
    // ayni pozitif renkle (mor/turkuaz) basiliyordu. Negatifte danger'a don.
    const effectiveTone = tone === "profit" && Number(value) < 0 ? "danger" : tone;
    return (
      <span className={cx("prj-kpi__value", effectiveTone && `prj-kpi__value--${effectiveTone}`)}>
        {formatCompactCurrency(value)}
      </span>
    );
  }
  return (
    <span
      className="prj-kpi__value prj-kpi__value--pending"
      title={pendingModuleHint(metric?.pending_module)}
    >
      —
    </span>
  );
}

/**
 * "Arsa Maliyeti" hucresi (mockup 156).
 *
 * 🔴 `?? 0` KESTIRMESI KALDIRILDI. `LandShareCard.land_cost`
 * `Gorunurluk.para` etiketlidir ve `limited` kapsamli rollerde — `projects`
 * matris satirinda UC hucre `_LIM`dir — `null` gelir. `?? 0`,
 * `formatCompactCurrency(0)` ile ekrana **"₺ 0"** basiyordu: kullanici
 * gizlenmis bir tutari GERCEK bir sayi olarak okuyor ve arsanin bedava
 * oldugunu saniyordu. Bu, gizlemekten daha kotudur.
 *
 * 🔴 SIFIR MASKELENMIS DEGILDIR ve dal bunu korur: alanin tanimsal gercegi
 * "daima 0"dir (backend saklamaz, spec §3.3), yani gorunur `"0"` icin "₺ 0"
 * DOGRU cevaptir ve basilmaya devam eder. Ayrimi `null` tasir.
 *
 * Ton da maskeyle birlikte duser: yesil `--success` bir OLUMLU iddiadir
 * ("maliyet yok"); bilinmeyen bir tutarin uzerine boyanmaz. Komsu hucrelerin
 * (`MetricValue` / `MarginChip`) bos hali hangi sinifi kullaniyorsa o kullanilir.
 *
 * 🔴 IPUCU (title) VERILMEZ: bu alan `MetricPlaceholder` zarfi DEGIL duz bir
 * `Decimal | None`dir, yani `pending_module` tasimaz ve sebep OLCULEMEZ.
 * `placeholder-cell.ts`in 3. hali burada da gecerlidir — uydurma gerekce
 * yerine sessiz "—".
 */
function LandCostValue({ value }: { value: string | null | undefined }) {
  if (value === null || value === undefined) {
    return (
      <span className="prj-kpi__value prj-kpi__value--pending" data-testid="prj-land-cost">
        —
      </span>
    );
  }
  return (
    <span className="prj-kpi__value prj-kpi__value--success" data-testid="prj-land-cost">
      {formatCompactCurrency(value)}
    </span>
  );
}

// Kart alt seridi — mockup 126-129 (kendi yatirim) / 158-161 (kat karsiligi).
// Bu dilimde yalniz MARJ cipi baglanir (mockup 128 / 160, P10 zarfi); seridin
// diger ogeleri ("48 daire + 4 dükkan" 127, "3 hissedar" 159) `units`
// sayaclarina baglidir ve bu dilimin kapsami disindadir.
// `MetricValue` ile ayni dallanma: `available` BAYRAGI + deger; bos zarfta cip
// SILINMEZ, "—" + gerekce basar.
function MarginChip({ metric }: { metric: PercentMetric | undefined }) {
  const value = realValue(metric);
  return (
    <div className="prj-card__footer">
      <span className="prj-card__footer-icon" aria-hidden="true">
        📈
      </span>
      {value !== null ? (
        <span
          className={cx("prj-card__margin", Number(value) < 0 && "prj-card__margin--negative")}
        >{`${formatPercent(value)} marj`}</span>
      ) : (
        <span
          className="prj-card__margin prj-card__margin--pending"
          title={pendingModuleHint(metric?.pending_module)}
        >
          — marj
        </span>
      )}
    </div>
  );
}

function TaahhutKpis({ project }: { project: Project }) {
  const contracting = project.contracting;
  if (project.status === "completed") {
    return (
      <div className="prj-kpis">
        <KpiCell label="Sözleşme Bedeli">
          <span className="prj-kpi__value">
            {project.contract_amount ? formatCompactCurrency(project.contract_amount) : "—"}
          </span>
        </KpiCell>
        <KpiCell label="Final Hakediş">
          <MetricValue metric={contracting?.final_progress_payment} />
        </KpiCell>
      </div>
    );
  }
  return (
    <div className="prj-kpis">
      <KpiCell label="Sözleşme Bedeli">
        <span className="prj-kpi__value">
          {project.contract_amount ? formatCompactCurrency(project.contract_amount) : "—"}
        </span>
      </KpiCell>
      <KpiCell label="Harcanan">
        <MetricValue metric={contracting?.spent} />
      </KpiCell>
      <KpiCell label="Başlangıç">
        <span className="prj-kpi__value prj-kpi__value--date">
          {project.start_date ? formatMonthYear(project.start_date) : "—"}
        </span>
      </KpiCell>
      <KpiCell label="Bitiş">
        <span className="prj-kpi__value prj-kpi__value--date">
          {project.end_date ? formatMonthYear(project.end_date) : "—"}
        </span>
      </KpiCell>
    </div>
  );
}

function KendiYatirimKpis({ project }: { project: Project }) {
  const investment = project.investment;
  return (
    <div className="prj-kpis">
      <KpiCell label="Satış Hedefi">
        <span className="prj-kpi__value">
          {investment?.sales_target ? formatCompactCurrency(investment.sales_target) : "—"}
        </span>
      </KpiCell>
      <KpiCell label="Satılan">
        <MetricValue metric={investment?.sold_amount} tone="success" />
      </KpiCell>
      <KpiCell label="Toplam Maliyet">
        <MetricValue metric={investment?.total_cost} tone="danger" />
      </KpiCell>
      <KpiCell label="Tahmini Kâr">
        <MetricValue metric={investment?.estimated_profit} tone="profit" />
      </KpiCell>
    </div>
  );
}

function KatKarsiligiKpis({ project }: { project: Project }) {
  const landShare = project.land_share;
  return (
    <div className="prj-kpis">
      <KpiCell label="Kendi Pay Değeri">
        <MetricValue metric={landShare?.our_share_value} />
      </KpiCell>
      <KpiCell label="Arsa Maliyeti">
        <LandCostValue value={landShare?.land_cost} />
      </KpiCell>
      <KpiCell label="İnşaat Maliyeti">
        <MetricValue metric={landShare?.construction_cost} tone="danger" />
      </KpiCell>
      <KpiCell label="Tahmini Kâr">
        <MetricValue metric={landShare?.estimated_profit} tone="profit" />
      </KpiCell>
    </div>
  );
}

// 2026-07-30: Kart artik proje detayina goturen bir link. Onceki karar ("kart
// tiklanmaz", spec §9) P1'de verilmisti; o sirada detay ekrani yoktu. P2'de
// `/projeler/[projectId]` geldi ve liste tarafinda baska giris noktasi olmadigi
// icin sayfaya yalnizca URL elle yazilarak ulasilabiliyordu (kullanici bildirimi).
// Mockup zaten kartlari link diyor: "Ekran 4 - Projeler.dc.html" satir 106/134
// `<a href="Proje - ...dc.html" ... cursor:pointer;text-decoration:none;display:block>`.
// Yani bu mockup'tan sapma DEGIL, mockup'a donus — geri alma.
export function ProjectCard({ project }: { project: Project }) {
  const isCompleted = project.status === "completed";
  return (
    <article
      className={cx(
        "prj-card",
        `prj-card--${project.project_type}`,
        isCompleted && "prj-card--completed",
      )}
    >
      {/* Kart icinde baska etkilesimli oge yok; tum govde tek link olarak sarilir. */}
      <Link
        // 🔴 URL-3 — kullanicinin GORDUGU degisiklik BURADA dogar: liste
        // kartindan detaya giris, projenin okunur anahtariyla kurulur
        // (`/projeler/kopru-guclendirme`). `slug` NULLABLE oldugu icin dusus
        // `routeKeyOf`ta yapilir; `project.slug!` canlida bozuk link uretirdi.
        href={routes.projects.detail({ projectId: routeKeyOf(project) })}
        className="prj-card__link"
        aria-label={`${project.name} projesini aç`}
      >
        <div className="prj-card__strip" aria-hidden="true" />
        <div className="prj-card__body">
          <div className="prj-card__head">
            <div>
              <span className="prj-type-badge prj-type-badge--card">
                {TYPE_LABELS[project.project_type]}
              </span>
              <h3 className="prj-card__name">{project.name}</h3>
              <p className="prj-card__meta">{metaLine(project)}</p>
            </div>
            <span className={`prj-status prj-status--${project.status}`}>
              {STATUS_LABELS[project.status]}
            </span>
          </div>
          {project.project_type === "kat_karsiligi" && project.land_share && (
            <ShareBar share={project.land_share} />
          )}
          {project.project_type === "taahhut" && <TaahhutKpis project={project} />}
          {project.project_type === "kendi_yatirim" && <KendiYatirimKpis project={project} />}
          {project.project_type === "kat_karsiligi" && <KatKarsiligiKpis project={project} />}
          <ProgressRow
            label={PROGRESS_LABELS[project.project_type]}
            metric={progressMetric(project)}
            variant="primary"
          />
          {/* ONAYLI SAPMA — yukaridaki ProgressRow docstring'ine bak. Alan
              OPSIYONEL (`financial_progress?:`): eski bir backend surumu
              anahtari komple atlayabilir. O hâlde satir SILINMEZ, bos zarfin
              AYNISI basilir ("—", dolgu yok, title yok) — cunku (a) bu dosyanin
              kanonu "bos zarfta cubuk SILINMEZ", (b) `metricCell` de tanimsiz
              zarfi bos hucre sayip ipucu UYDURMAZ, (c) alan gelip gittiginde
              kart yuksekligi oynamaz. */}
          {project.project_type === "taahhut" && (
            <ProgressRow
              label="Mali İlerleme"
              metric={project.contracting?.financial_progress}
              variant="financial"
            />
          )}
          {project.project_type === "kendi_yatirim" && (
            <MarginChip metric={project.investment?.margin} />
          )}
          {project.project_type === "kat_karsiligi" && (
            <MarginChip metric={project.land_share?.margin} />
          )}
        </div>
      </Link>
    </article>
  );
}
