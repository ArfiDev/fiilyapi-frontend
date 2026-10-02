// @vitest-environment node
// ═══════════════════════════════════════════════════════════════════════════
// F-ZAMAN T4 · ÜRÜN KODU TARİH ENVANTERİ — muafiyet gerekçeleri ÇÜRÜYEMESİN
// ═══════════════════════════════════════════════════════════════════════════
//
// Yukarıdaki `KASTEN_DISARIDA` gerekçelerinin çoğu "bu ekranın bileşen
// grafiğinde ürün kodunda `new Date()`/`Date.now()` YOK" diyor. Bu DONMUŞ bir
// metindir: bekçi `src/` altını okumaz, yani bir ekrana sonradan `new Date()`
// eklenmesi o gerekçeyi sessizce yalanlar (yönetim ölçümü B2 — mutasyon:
// `ProjectsView.tsx`e ekrana basılan bir `new Date()` eklendi, bekçi YEŞİL
// kaldı; tam olarak bu PR'in kapatmaya çalıştığı kusur sınıfı).
//
// Bu bekçi o yönü kapatır: ürün kodundaki tarih yerleri DOSYA BAZINDA
// sayılır ve kayıtla karşılaştırılır. Yeni bir tarih yeri açan (ya da bir
// dosyayı temizleyen) her değişiklik BU TESTİ KIRAR ve maruziyet matrisinin
// yeniden ölçülmesini ZORLAR.
//
// Sınır (kapatılmadı, ölçüldü): aynı dosyada bir tarih yeri silinip başka bir
// satıra eklenirse sayım değişmez. Satır numarası kaydetmek her düzenlemede
// gürültü üretirdi; dosya sayımı doğru dengedir.
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import ts from "typescript";
import { describe, it, expect } from "vitest";

const SRC_DIR = fileURLToPath(new URL("..", import.meta.url));

const URUN_TARIH_ENVANTERI: Record<string, number> = {
  "components/accounting/AccountingView.tsx": 1,
  "components/accounting/BankReconciliationView.tsx": 1,
  "components/accounting/JournalEntryFormModal.tsx": 1,
  "components/accounting/PeriodClosingView.tsx": 2,
  "components/accounting/TrialBalanceView.tsx": 1,
  "components/accounting/VatReturnView.tsx": 1,
  "components/ai/AiPanel.tsx": 5,
  "components/contracts/EmployerContractDetailView.tsx": 1,
  "components/documents/ArchiveDocumentsView.tsx": 1,
  // PLN-F1.4 — Takvim kartı "şu an 21.09–27.09" hafta ipucu (Ek:117). Görsel spec
  // (PLN-F1 sonraki alt görev) `page.clock.setFixedTime` ile sabitlemeli.
  "components/earned-value/settings/PlanningSettingsForm.tsx": 1,
  // TKL-F1.3 — İş Kalemi Kataloğu "Fiyat güncelleme" turuncu eşiği (182 gün) İSTEMCİ SAATİNE
  // bağlıdır (`isPriceStale(…, now)`); ekranda görünen renk saatle değişir. Görsel spec (F1.5)
  // `page.clock.setFixedTime` ile sabitlemeli.
  "components/work-item-catalog/WorkItemCatalogScreen.tsx": 1,
  // TKL-F3.3 — Teklif listesi "süresi geçti" kırmızısı (`sent ∧ valid_until < bugün İstanbul`) İSTEMCİ
  // SAATİNE bağlıdır (`OffersScreen` → `now`); satır rengi/etiketi saatle değişir. Görsel spec (F3.8)
  // `page.clock.setFixedTime` ile sabitlemeli.
  "components/offers/OffersScreen.tsx": 1,
  // PLN-F1.6 — Bütçe Adım 2 Gantt + Adım 3 S-eğrisi "bugün" çizgisi (BÜT:292, 349)
  // `localTodayIso()`. Görsel spec `page.clock.setFixedTime` ile sabitlemeli.
  "components/earned-value/budget/budget-format.ts": 1,
  // PLN-F3.4 · GİR `?tarih=` yoksa İstanbul bugünü (`todayIso`); görsel spec
  // F3.6b'de `page.clock.setFixedTime` ile sabitlenecek.
  "components/earned-value/reports/daily/daily-url-state.ts": 1,
  // PLN-F3.3 · Panel `?tarih=` yoksa İstanbul bugünü (`todayIso` — GİR'in
  // `daily-url-state.ts`teki AYNI yardımcısı, KOPYALANMADI); görsel spec
  // F3.6b'de `page.clock.setFixedTime` ile sabitlenecek.
  "components/earned-value/reports/panel/panel-url-state.ts": 1,
  "components/documents/SiteDocumentsView.tsx": 1,
  "components/equipment-rental/EquipmentRentalInvoiceDetailView.tsx": 1,
  "components/equipment-rental/EquipmentRentalInvoicesView.tsx": 1,
  "components/financial-statements/BalanceSheetView.tsx": 2,
  "components/financial-statements/CashFlowStatementView.tsx": 2,
  "components/financial-statements/FinancialStatementsHomeView.tsx": 2,
  "components/invoices/InvoiceCreateView.tsx": 1,
  "components/invoices/InvoiceDetailView.tsx": 1,
  "components/invoices/InvoicePaymentsPanel.tsx": 1,
  "components/invoices/InvoicesView.tsx": 1,
  "components/leaves/LeavesView.tsx": 1,
  "components/progress-payments/ProgressPaymentForm.tsx": 2,
  "components/progress-payments/SubcontractorProgressPaymentForm.tsx": 2,
  "components/progress-payments/SubcontractorProgressPaymentsFilters.tsx": 1,
  "components/purchasing/PurchaseOrdersView.tsx": 1,
  "components/purchasing/PurchaseRequestForm.tsx": 1,
  "components/section-detail/remainingDays.ts": 1,
  "components/settings/payroll-rates/PayrollRatesScreen.tsx": 1,
  "components/settings/roles/RolesScreen.tsx": 1,
  // PLN-F3.0 (2026-09-25) — `?tarih=` ilk değeri artık `derive.ts
  // parseDiaryDateParam`in "bugün" yedeğinden gelir (TAŞINDI, YENİ maruziyet
  // DEĞİL): `activeDate`in eski `useState(() => isoDate(new Date()))`
  // başlatıcısı buraya geçti, form seedi (`emptyDiaryForm(isoDate(new Date()))`)
  // hâlâ burada — kayıt 2→1 düştü, `derive.ts` 0→1 çıktı (aşağıda). İkisi de
  // `e2e/site-diary-visual.spec.ts` (saat çakılı) ve `site-diary-progress-
  // helpers.ts`teki `loginAtScenarioDay` (saat çakılı) ile ÖRTÜLÜDÜR.
  "components/site-diary/SiteDiaryEntryView.tsx": 1,
  "components/site-diary/SiteDiarySummaryView.tsx": 1,
  // PLN-F3.0 — bkz. yukarıdaki `SiteDiaryEntryView.tsx` notu: `parseDiaryDateParam`
  // `?tarih=` yoksa/geçersizse BUGÜNE düşer. Aynı örtü.
  "components/site-diary/derive.ts": 1,
  "components/site-planning/week.ts": 2,
  "components/stock-entry-form/StockEntryForm.tsx": 1,
  "components/subcontractors/SubcontractorsView.tsx": 1,
  "components/timesheet/iso-week.ts": 2,
  "components/timesheet/month.ts": 2,
  "lib/auth/cookies.ts": 1,
  "lib/settings/audit-query.ts": 4,
  "lib/settings/last-login.ts": 1,
  // SEKME-F1.1 — ekranda basılan bir tarih DEĞİL: `Date.now()` yalnız
  // sekme mağazasının VARSAYILAN `now()` üreticisidir (`deps.now` ile
  // enjekte edilir), `lastViewedAt` LRU SIRALAMA damgasını üretir.
  // `page.clock.setFixedTime` gerekmez.
  "lib/workspace-tabs/tabs-store.ts": 1,
};

function isProductFile(rel: string): boolean {
  return !/\.test\.tsx?$/.test(rel) && !rel.startsWith("test-guards/");
}

function collectProductDateSites(dir: string, rel: string, out: Record<string, number>) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const child = path.join(dir, entry.name);
    const childRel = rel === "" ? entry.name : `${rel}/${entry.name}`;
    if (entry.isDirectory()) {
      collectProductDateSites(child, childRel, out);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry.name) || !isProductFile(childRel)) continue;
    const source = ts.createSourceFile(
      child,
      readFileSync(child, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    let count = 0;
    function walk(node: ts.Node) {
      if (
        ts.isNewExpression(node) &&
        node.expression.getText(source) === "Date" &&
        (!node.arguments || node.arguments.length === 0)
      ) {
        count += 1;
      }
      if (ts.isCallExpression(node) && node.expression.getText(source) === "Date.now") count += 1;
      ts.forEachChild(node, walk);
    }
    walk(source);
    if (count > 0) out[childRel] = count;
  }
}

describe("urun kodu tarih envanteri — maruziyet matrisi bayatlayamaz", () => {
  it("`new Date()` / `Date.now()` tasiyan URUN dosyalari ve sayilari KAYITLA birebir", () => {
    const olculen: Record<string, number> = {};
    collectProductDateSites(SRC_DIR, "", olculen);

    const eklenen = Object.keys(olculen)
      .filter((f) => olculen[f] !== URUN_TARIH_ENVANTERI[f])
      .map((f) => `${f}: kayit=${URUN_TARIH_ENVANTERI[f] ?? 0} olculen=${olculen[f]}`);
    const kaybolan = Object.keys(URUN_TARIH_ENVANTERI)
      .filter((f) => olculen[f] === undefined)
      .map((f) => `${f}: kayit=${URUN_TARIH_ENVANTERI[f]} olculen=0`);

    const fark = [...eklenen, ...kaybolan];
    const mesaj =
      `URUN KODUNDAKI TARIH YERLERI DEGISTI:\n${fark.join("\n")}\n\n` +
      "Bu bir stil uyarisi DEGIL: `KASTEN_DISARIDA` gerekcelerinin cogu " +
      "\"bu ekranin grafiginde tarih yeri YOK\" diyor. Yeni bir tarih yeri o " +
      "gerekceyi yalanlamis OLABILIR. Once hangi gorsel kadrajin o ekrani " +
      "bastigini olc, gerekiyorsa `page.clock.setFixedTime` ekle, SONRA bu " +
      "kaydi guncelle.";
    expect(fark, mesaj).toEqual([]);
  });
});
