import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { BoqTable } from "./BoqTable";
import { SectionBoqCard } from "../section-detail/SectionBoqCard";
import type { BoqGroup, BoqItem, BoqTotals } from "@/lib/api/hooks/useBoq";

/**
 * F-ILRUI · BEŞİNCİ YÜZEY — POZ SATIRININ `Gerç. %` hücresi (Ekran 13 · 102
 * başlık, 110/120/134/144/158/167 `%100 %100 %75 %72 %60 %30`).
 *
 * 🔴 ÖLÇÜLMÜŞ OLGU (backend `ffb055e`): satır yüzdesi de BAĞLIDIR —
 * `boq/service.py:126` `progress_pct=_progress_metric(realized, taban,
 * izinli=izinli)`. Görev emri yalnız DÖRT yüzey sayıyordu; bu beşincisi aynı
 * kusuru iki kopyada taşıyordu (`BoqTable` + `SectionBoqCard`) ve koşulsuz "—"
 * basıyordu. `izinli=False` dalı tam olarak K-ZARF 3. hâlini (`restricted()`)
 * üretir, yani üç hâlin ÜÇÜ de bu hücrede gerçekten görülebilir.
 */
type Metric = BoqItem["progress_pct"];

const DOLU: Metric = { available: true, value: "75", pending_module: null };
const BOS: Metric = { available: false, value: null, pending_module: "site_diary" };
// 3. hâl: izin yok — gerekçe YOKTUR, uydurulmaz.
const IZINSIZ: Metric = { available: false, value: null, pending_module: null };
// 🔴 KARŞIT KANIT (K-IKIZ1): bayrak kapalı ama DEĞER DOLU. Yalnız `value`ya
// bakan kod bunu basar; `available`a bakan kod basmaz.
const YALANCI: Metric = { available: false, value: "99", pending_module: "site_diary" };

function item(progress: Metric): BoqItem {
  return {
    id: "i-1",
    code: "15.150",
    description: "Betonarme kalıbı",
    unit: "m²",
    quantity: "1200.000",
    unit_price: "450.00",
    amount: "540000.00",
    progress_pct: progress,
    sort_order: 10,
    allocated_quantity: "0.000",
    unallocated_quantity: "1200.000",
    contract_item_id: null,
  };
}

function groups(progress: Metric): BoqGroup[] {
  return [
    { id: "g-1", name: "Betonarme İşleri", sort_order: 10, group_total: "540000.00", items: [item(progress)] },
  ];
}

function totals(): BoqTotals {
  return {
    contract_total: { available: false, value: null, pending_module: "contracts" },
    realized_total: { available: false, value: null, pending_module: "progress_payments" },
    remaining_total: { available: false, value: null, pending_module: "progress_payments" },
    revision_total: { available: false, value: null, pending_module: "contracts" },
    grand_total: "540000.00",
    grand_progress_pct: { available: false, value: null, pending_module: "site_diary" },
  };
}

// İki ekran BİREBİR aynı hücreyi basar; ikisi de aynı kümeyle ölçülür, yoksa
// kusur bir kopyada sağ kalır (bu dilimde tam olarak öyle olmuştu).
const YUZEYLER = [
  {
    ad: "BoqTable",
    testId: "boq-pct",
    render: (p: Metric) => render(<BoqTable groups={groups(p)} totals={totals()} />),
  },
  {
    ad: "SectionBoqCard",
    testId: "section-boq-pct",
    render: (p: Metric) =>
      render(<SectionBoqCard groups={groups(p)} totals={totals()} sectionName="A1 · Kenar Ayak" />),
  },
] as const;

describe.each(YUZEYLER)("$ad · poz satırı Gerç. %", ({ testId, render: renderSurface }) => {
  it("dolu zarfta yüzdeyi basar; soluk sınıf ve ipucu YOKTUR", () => {
    renderSurface(DOLU);
    const cell = screen.getByTestId(testId);
    expect(cell).toHaveTextContent("%75");
    expect(cell).not.toHaveClass("boq-table__pct--pending");
    expect(cell).not.toHaveAttribute("title");
  });

  // 🔴 KARŞIT KANIT: bu olmadan "her zaman değeri basan" bozuk kod da yeşil geçer.
  it("boş zarfta '—' basar, soluk sınıf ve gerekçe taşır", () => {
    renderSurface(BOS);
    const cell = screen.getByTestId(testId);
    expect(cell).toHaveTextContent("—");
    expect(cell).not.toHaveTextContent("%");
    expect(cell).toHaveClass("boq-table__pct--pending");
    expect(cell).toHaveAttribute("title");
    expect(within(cell).getByText(/günlük|bağlanmadı|gelir/i)).toBeInTheDocument();
  });

  it("ÜÇÜNCÜ HÂL (izin yok): '—' + kilit + gizli ipucu; sahte modül gerekçesi YOK (IZN-F4.2)", () => {
    renderSurface(IZINSIZ);
    const cell = screen.getByTestId(testId);
    expect(cell).toHaveTextContent("—");
    expect(cell).toHaveAttribute("title", "Bu bilgi rolünüz için gizli");
    expect(within(cell).queryByText(/gelir|bağlanmadı/i)).not.toBeInTheDocument();
  });

  // 🔴 K-ZARF'ın ASIL iddiası: okuma `available`dan yapılır, DEĞERİN VARLIĞINDAN
  // değil. Bu test olmadan `available` kontrolünü silen mutant sağ kalır.
  it("available:false iken DEĞER DOLU olsa bile basmaz", () => {
    renderSurface(YALANCI);
    const cell = screen.getByTestId(testId);
    expect(cell).toHaveTextContent("—");
    expect(cell).not.toHaveTextContent("%99");
  });
});

/**
 * 🔴 SINIF BEKÇİSİ — F-ILRUI'de GERÇEKTEN OLAN KUSURUN bekçisi.
 *
 * Dört hücre `BoqPctCell`e alınırken `SectionBoqCard`ın TOPLAM hücresi
 * `className` geçirmeyi atladı ve bileşenin o günkü `= "boq-table__pct"`
 * VARSAYILANINA sessizce düştü: toplam hücresi satır sınıfıyla basıldı, `—`
 * glifi 1px kaydı. Kusuru YALNIZ görsel kapı gördü (`bolum-detay` karesi);
 * mevcut birim testlerinin hiçbiri kırmızı vermedi çünkü hepsi METNİ ölçüyordu,
 * SINIFI değil. Varsayılan kaldırıldı (artık `typecheck` kırılır) ve bu test
 * sınıfı da ölçer — iki bağımsız bekçi.
 */
describe("BoqPctCell · hücre sınıfları (satır ≠ toplam)", () => {
  it("BoqTable: satır hücresi satır sınıfını, TOPLAM hücresi toplam sınıflarını taşır", () => {
    render(<BoqTable groups={groups(DOLU)} totals={totals()} />);
    expect(screen.getByTestId("boq-pct")).toHaveClass("boq-table__pct");
    const total = screen.getByTestId("boq-total-pct");
    expect(total).toHaveClass("boq-table__total-pct");
    expect(total).toHaveClass("boq-table__col--pct");
    expect(total).not.toHaveClass("boq-table__pct");
  });

  it("SectionBoqCard: AYNI ayrımı taşır (kusur tam olarak burada oluştu)", () => {
    render(<SectionBoqCard groups={groups(DOLU)} totals={totals()} sectionName="A1" />);
    expect(screen.getByTestId("section-boq-pct")).toHaveClass("boq-table__pct");
    const total = screen.getByTestId("section-boq-total-pct");
    expect(total).toHaveClass("boq-table__total-pct");
    expect(total).toHaveClass("boq-table__col--pct");
    expect(total).not.toHaveClass("boq-table__pct");
  });
});
