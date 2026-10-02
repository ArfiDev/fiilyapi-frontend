// @vitest-environment node
//
// URL-1 · `routes.ts`in ÜRETTİĞİ URL'lerin BİÇİM SÖZLEŞMESİ.
//
// 🔴 Beklenen URL'ler ELLE YAZILMIŞTIR, `routes`tan türetilmez. Türetseydik
// üretici ile iddia BİRLİKTE kayar ve bu dosya hiçbir şeyi bekçilemezdi
// (sahte-yeşilin klasik hâli). Bu dilimin sözü "üretilen URL DEĞİŞMEZ" idi;
// sözü tutan tek şey bu elle yazılmış beklentilerdir.
import { describe, it, expect } from "vitest";

import {
  buildRouteTree,
  resolveHrefIn,
} from "@/components/shell/route-tree.testkit";
import { OFFER_TEMPLATE_PARAM } from "@/lib/navigation-params";
import { PERSONNEL_RETURN_PARAM, SECTION_TAB_PARAM, routes } from "@/lib/routes";

const P = "p-1";
const S = "s-9";
const SEC = "sec-4";

describe("routes — uretilen URL bicimi (elle yazilmis beklentiler)", () => {
  it("proje ve santiye agaci bugunku yollari BIREBIR uretir", () => {
    expect(routes.projects.list()).toBe("/projeler");
    expect(routes.projects.new()).toBe("/projeler/yeni");
    expect(routes.projects.calendar()).toBe("/projeler/takvim");
    expect(routes.projects.detail({ projectId: P })).toBe("/projeler/p-1");
    expect(routes.projects.summary({ projectId: P })).toBe("/projeler/p-1/ozet");
    expect(routes.projects.sharing({ projectId: P })).toBe("/projeler/p-1/paylasim");
    expect(routes.projects.sites.new({ projectId: P })).toBe("/projeler/p-1/santiyeler/yeni");
    expect(routes.projects.sites.detail({ projectId: P, siteId: S })).toBe(
      "/projeler/p-1/santiyeler/s-9",
    );
    expect(routes.projects.sites.boq({ projectId: P, siteId: S })).toBe(
      "/projeler/p-1/santiyeler/s-9/is-kalemleri",
    );
    expect(routes.projects.sites.boqDistribution({ projectId: P, siteId: S })).toBe(
      "/projeler/p-1/santiyeler/s-9/is-kalemleri/bolum-dagilimi",
    );
    expect(routes.projects.sites.stockEntry({ projectId: P, siteId: S })).toBe(
      "/projeler/p-1/santiyeler/s-9/stok/giris",
    );
    expect(routes.projects.sites.diaryPlanning({ projectId: P, siteId: S })).toBe(
      "/projeler/p-1/santiyeler/s-9/gunluk-kayit/planlama",
    );
    expect(routes.projects.sites.sections.detail({ projectId: P, siteId: S, sectionId: SEC })).toBe(
      "/projeler/p-1/santiyeler/s-9/bolumler/sec-4",
    );
    expect(routes.projects.sites.sections.edit({ projectId: P, siteId: S, sectionId: SEC })).toBe(
      "/projeler/p-1/santiyeler/s-9/bolumler/sec-4/duzenle",
    );
  });

  it("suzgec VERILMEZSE sorgu dizesi HIC eklenmez (ciplak yolla ayni)", () => {
    // Bu iddia olmadan "?" li bir varsayılan sessizce sızabilir ve bugünkü
    // her çıplak bağlantı ayrışırdı.
    expect(routes.projects.sites.timesheet({ projectId: P, siteId: S })).toBe(
      "/projeler/p-1/santiyeler/s-9/puantaj",
    );
    expect(routes.progressPayments.list()).toBe("/hakedisler");
    expect(routes.progressPayments.new()).toBe("/hakedisler/yeni");
    expect(routes.progressPayments.subcontractor.new()).toBe("/hakedisler/taseron/yeni");
    expect(routes.documents()).toBe("/belgeler");
    expect(routes.equipment.rentalInvoices()).toBe("/makine/kira");
    expect(routes.contracts.list()).toBe("/sozlesmeler");
    expect(routes.personnel.new()).toBe("/personel/yeni");
  });

  it("suzgec VERILIRSE bugunku sorgu anahtarlariyla eklenir", () => {
    expect(routes.projects.sites.timesheet({ projectId: P, siteId: S, section: SEC })).toBe(
      "/projeler/p-1/santiyeler/s-9/puantaj?section=sec-4",
    );
    // PLN-F2.1b — puantaj ekranının okuduğu hafta anahtarları (`SiteTimesheetView` `parseIsoWeek`).
    expect(routes.projects.sites.timesheet({ projectId: P, siteId: S, isoYear: 2026, isoWeek: 39 })).toBe(
      "/projeler/p-1/santiyeler/s-9/puantaj?iso_year=2026&iso_week=39",
    );
    expect(routes.progressPayments.list({ projectId: P })).toBe("/hakedisler?project_id=p-1");
    expect(routes.progressPayments.new({ projectId: P })).toBe("/hakedisler/yeni?project=p-1");
    expect(routes.progressPayments.subcontractor.list({ projectId: P })).toBe(
      "/hakedisler/taseron?project_id=p-1",
    );
    expect(routes.progressPayments.subcontractor.new({ contractId: "c-2" })).toBe(
      "/hakedisler/taseron/yeni?contract=c-2",
    );
    expect(routes.documents({ projectId: P })).toBe("/belgeler?proje=p-1");
    expect(routes.equipment.rentalInvoices("year=2026&month=3")).toBe(
      "/makine/kira?year=2026&month=3",
    );
    expect(routes.contracts.list({ tabParam: "type", tab: "subcontractor" })).toBe(
      "/sozlesmeler?type=subcontractor",
    );
  });

  it("bos sorgu degeri ATLANIR (bos '?suzgec=' yazilmaz)", () => {
    expect(routes.documents({ projectId: "" })).toBe("/belgeler");
    expect(routes.progressPayments.list({ projectId: undefined })).toBe("/hakedisler");
    expect(routes.equipment.rentalInvoices("")).toBe("/makine/kira");
  });

  it("kimlik segmenti kacislanir — ham enjeksiyon YOK", () => {
    expect(routes.projects.detail({ projectId: "a/b" })).toBe("/projeler/a%2Fb");
    expect(routes.projects.detail({ projectId: "a b&c" })).toBe("/projeler/a%20b%26c");
    // 🔴 Sorgu DEĞERİ de `encodeURIComponent` ile kodlanır; `URLSearchParams`
    // form-urlencoded üretirdi (boşluk `+`) ve URL'i DEĞİŞTİRİRDİ.
    expect(routes.documents({ projectId: "a b&c" })).toBe("/belgeler?proje=a%20b%26c");
    expect(routes.personnel.new({ returnTo: "/puantaj?iso_week=32" })).toBe(
      "/personel/yeni?donus=%2Fpuantaj%3Fiso_week%3D32",
    );
  });

  it("donus sorgu anahtari OKUYAN tarafla ayni sabittir", () => {
    expect(PERSONNEL_RETURN_PARAM).toBe("donus");
  });
});

// PLN-F3.0 · `?tarih=` — Günlük Kayıt'ın açık günü.
describe("routes — Günlük Kayıt `?tarih=`", () => {
  it("tarih verilmezse eklenMEZ — bugünkü çıplak yolla BİREBİR", () => {
    expect(routes.projects.sites.diary({ projectId: P, siteId: S })).toBe(
      `/projeler/${P}/santiyeler/${S}/gunluk-kayit`,
    );
    expect(routes.siteDiary()).toBe("/gunluk-kayit");
  });

  it("şantiye altı ikiz: `date` verilirse `?tarih=` eklenir", () => {
    expect(routes.projects.sites.diary({ projectId: P, siteId: S, date: "2026-09-24" })).toBe(
      `/projeler/${P}/santiyeler/${S}/gunluk-kayit?tarih=2026-09-24`,
    );
  });

  it("kök ikiz: `site` ve `date` İKİSİ de opsiyonel, birlikte de taşınabilir", () => {
    expect(routes.siteDiary({ site: S })).toBe(`/gunluk-kayit?site=${S}`);
    expect(routes.siteDiary({ date: "2026-09-24" })).toBe("/gunluk-kayit?tarih=2026-09-24");
    expect(routes.siteDiary({ site: S, date: "2026-09-24" })).toBe(
      `/gunluk-kayit?site=${S}&tarih=2026-09-24`,
    );
  });

  it("DIARY_DATE_PARAM okuyan tarafla (ekran) aynı sabittir", async () => {
    const { DIARY_DATE_PARAM } = await import("@/lib/routes");
    expect(DIARY_DATE_PARAM).toBe("tarih");
  });
});

// PLN-F3.6a · Panel/GİR/QURR.
describe("routes — Planlama raporları (Panel/GİR/QURR)", () => {
  it("şantiye altı: Panel parametresiz, GİR `?tarih=`, QURR `?hafta=` (verilmezse EKLENMEZ)", () => {
    expect(routes.projects.sites.evPanel({ projectId: P, siteId: S })).toBe(
      `/projeler/${P}/santiyeler/${S}/planlama-paneli`,
    );
    expect(routes.projects.sites.evDailyReport({ projectId: P, siteId: S })).toBe(
      `/projeler/${P}/santiyeler/${S}/gunluk-ilerleme-raporu`,
    );
    expect(routes.projects.sites.evDailyReport({ projectId: P, siteId: S, date: "2026-09-24" })).toBe(
      `/projeler/${P}/santiyeler/${S}/gunluk-ilerleme-raporu?tarih=2026-09-24`,
    );
    expect(routes.projects.sites.evWeeklyReport({ projectId: P, siteId: S })).toBe(
      `/projeler/${P}/santiyeler/${S}/haftalik-qurr`,
    );
    expect(routes.projects.sites.evWeeklyReport({ projectId: P, siteId: S, week: 12 })).toBe(
      `/projeler/${P}/santiyeler/${S}/haftalik-qurr?hafta=12`,
    );
  });

  it("kök ikizler parametresiz de çağrılabilir — eski çıplak yolla BİREBİR", () => {
    expect(routes.planning.budget()).toBe("/planlama/adam-saat-butcesi");
    expect(routes.planning.workItemCatalog()).toBe("/planlama/is-kalemi-katalogu");
    expect(routes.planning.panel()).toBe("/planlama/panel");
    expect(routes.planning.dailyReport()).toBe("/planlama/gunluk-rapor");
    expect(routes.planning.weeklyReport()).toBe("/planlama/haftalik-qurr");
  });

  it("kök ikizler (lider denetimi F3.6a-ek) `?site=` KABUL EDER — bir kök ikizden diğerine seçili şantiye TAŞINABİLİR", () => {
    expect(routes.planning.budget({ site: S })).toBe(`/planlama/adam-saat-butcesi?site=${S}`);
    expect(routes.planning.panel({ site: S })).toBe(`/planlama/panel?site=${S}`);
    expect(routes.planning.dailyReport({ site: S })).toBe(`/planlama/gunluk-rapor?site=${S}`);
    expect(routes.planning.dailyReport({ site: S, date: "2026-09-24" })).toBe(
      `/planlama/gunluk-rapor?site=${S}&tarih=2026-09-24`,
    );
    expect(routes.planning.weeklyReport({ site: S })).toBe(`/planlama/haftalik-qurr?site=${S}`);
    expect(routes.planning.weeklyReport({ site: S, week: 21 })).toBe(
      `/planlama/haftalik-qurr?site=${S}&hafta=21`,
    );
  });

  it("EVB_WEEK_PARAM okuyan tarafla (QURR ekranı) aynı sabittir", async () => {
    const { EVB_WEEK_PARAM } = await import("@/lib/routes");
    expect(EVB_WEEK_PARAM).toBe("hafta");
  });
});

describe("routes — DET-1.2 bolum sekmesi + gunluk kayit detayi", () => {
  it("bolum detayi `sekme` VERILMEZSE ciplak yol kalir (bugunku baglantilar DEGISMEZ)", () => {
    expect(
      routes.projects.sites.sections.detail({ projectId: P, siteId: S, sectionId: SEC, sekme: undefined }),
    ).toBe("/projeler/p-1/santiyeler/s-9/bolumler/sec-4");
  });

  it("bolum detayi `sekme` VERILIRSE `?sekme=` ile eklenir (S4)", () => {
    expect(
      routes.projects.sites.sections.detail({
        projectId: P,
        siteId: S,
        sectionId: SEC,
        sekme: "gunluk-kayit",
      }),
    ).toBe("/projeler/p-1/santiyeler/s-9/bolumler/sec-4?sekme=gunluk-kayit");
    expect(
      routes.projects.sites.sections.detail({ projectId: P, siteId: S, sectionId: SEC, sekme: "stok" }),
    ).toBe("/projeler/p-1/santiyeler/s-9/bolumler/sec-4?sekme=stok");
  });

  it("sekme sorgu anahtari OKUYAN tarafla ayni sabittir", () => {
    expect(SECTION_TAB_PARAM).toBe("sekme");
  });

  it("gunluk kayit detayi bolum altinda kimlikle kurulur", () => {
    expect(
      routes.projects.sites.sections.diaryEntry({
        projectId: P,
        siteId: S,
        sectionId: SEC,
        entryId: "e-3",
      }),
    ).toBe("/projeler/p-1/santiyeler/s-9/bolumler/sec-4/gunluk-kayit/e-3");
    // Kimlik segmenti de kaçışlanır (seg()).
    expect(
      routes.projects.sites.sections.diaryEntry({
        projectId: P,
        siteId: S,
        sectionId: SEC,
        entryId: "a/b",
      }),
    ).toBe("/projeler/p-1/santiyeler/s-9/bolumler/sec-4/gunluk-kayit/a%2Fb");
  });
});

describe("routes — uretilen her yol GERCEK bir rotaya cozulur", () => {
  // `route-tree.testkit` ağacı `src/app/(app)/` DOSYA SİSTEMİNDEN kurar; elle
  // yazılmış bir rota listesi DEĞİLDİR. Böylece `routes.ts`e uydurma bir yol
  // (F-TH'deki "/hakedisler/isveren" vakası) girerse burada patlar.
  const tree = buildRouteTree();
  const SENTINEL = new Set([P, S, SEC, "c-2", "i-7", "e-3", "r-5"]);

  const hrefs: ReadonlyArray<readonly [string, string]> = [
    ["home", routes.home()],
    ["login", routes.login()],
    ["assistant", routes.assistant()],
    ["reports", routes.reports()],
    ["siteDiary", routes.siteDiary()],
    ["approvalInbox", routes.approvalInbox()],
    ["projects.list", routes.projects.list()],
    ["projects.new", routes.projects.new()],
    ["projects.calendar", routes.projects.calendar()],
    ["projects.detail", routes.projects.detail({ projectId: P })],
    ["projects.summary", routes.projects.summary({ projectId: P })],
    ["projects.sharing", routes.projects.sharing({ projectId: P })],
    ["sites.new", routes.projects.sites.new({ projectId: P })],
    ["sites.detail", routes.projects.sites.detail({ projectId: P, siteId: S })],
    ["sites.boq", routes.projects.sites.boq({ projectId: P, siteId: S })],
    ["sites.boqDistribution", routes.projects.sites.boqDistribution({ projectId: P, siteId: S })],
    ["sites.documents", routes.projects.sites.documents({ projectId: P, siteId: S })],
    ["sites.progressPayments", routes.projects.sites.progressPayments({ projectId: P, siteId: S })],
    ["sites.stock", routes.projects.sites.stock({ projectId: P, siteId: S })],
    ["sites.stockEntry", routes.projects.sites.stockEntry({ projectId: P, siteId: S })],
    ["sites.timesheet", routes.projects.sites.timesheet({ projectId: P, siteId: S })],
    ["sites.diary", routes.projects.sites.diary({ projectId: P, siteId: S })],
    ["sites.diarySummary", routes.projects.sites.diarySummary({ projectId: P, siteId: S })],
    ["sites.diaryPlanning", routes.projects.sites.diaryPlanning({ projectId: P, siteId: S })],
    ["sites.evBudget", routes.projects.sites.evBudget({ projectId: P, siteId: S })],
    ["sites.evPanel", routes.projects.sites.evPanel({ projectId: P, siteId: S })],
    ["sites.evDailyReport", routes.projects.sites.evDailyReport({ projectId: P, siteId: S })],
    ["sites.evWeeklyReport", routes.projects.sites.evWeeklyReport({ projectId: P, siteId: S })],
    ["planning.budget", routes.planning.budget()],
    ["planning.catalog", routes.planning.catalog()],
    ["planning.workItemCatalog", routes.planning.workItemCatalog()],
    ["planning.panel", routes.planning.panel()],
    ["planning.dailyReport", routes.planning.dailyReport()],
    ["planning.weeklyReport", routes.planning.weeklyReport()],
    ["sections.new", routes.projects.sites.sections.new({ projectId: P, siteId: S })],
    ["sections.detail", routes.projects.sites.sections.detail({ projectId: P, siteId: S, sectionId: SEC })],
    ["sections.edit", routes.projects.sites.sections.edit({ projectId: P, siteId: S, sectionId: SEC })],
    [
      "sections.diaryEntry",
      routes.projects.sites.sections.diaryEntry({ projectId: P, siteId: S, sectionId: SEC, entryId: "e-3" }),
    ],
    ["settings.root", routes.settings.root()],
    ["settings.company", routes.settings.company()],
    ["settings.users", routes.settings.users()],
    ["settings.roles", routes.settings.roles()],
    ["settings.permissionMatrix", routes.settings.permissionMatrix()],
    ["settings.approvalRoles", routes.settings.approvalRoles()],
    ["settings.notifications", routes.settings.notifications()],
    ["settings.appearance", routes.settings.appearance()],
    ["settings.integrations", routes.settings.integrations()],
    ["settings.backup", routes.settings.backup()],
    ["settings.auditLog", routes.settings.auditLog()],
    ["settings.payrollRates", routes.settings.payrollRates()],
    ["settings.planning", routes.settings.planning()],
    ["documents", routes.documents()],
    ["payroll.root", routes.payroll.root()],
    ["payroll.history", routes.payroll.history()],
    ["payroll.sgk", routes.payroll.sgk()],
    ["invoices.list", routes.invoices.list()],
    ["invoices.new", routes.invoices.new()],
    ["invoices.detail", routes.invoices.detail({ invoiceId: "i-7" })],
    ["progressPayments.list", routes.progressPayments.list()],
    ["progressPayments.new", routes.progressPayments.new()],
    ["progressPayments.detail", routes.progressPayments.detail({ paymentId: "i-7" })],
    ["progressPayments.edit", routes.progressPayments.edit({ paymentId: "i-7" })],
    ["sub.list", routes.progressPayments.subcontractor.list()],
    ["sub.new", routes.progressPayments.subcontractor.new()],
    ["sub.detail", routes.progressPayments.subcontractor.detail({ paymentId: "i-7" })],
    ["sub.edit", routes.progressPayments.subcontractor.edit({ paymentId: "i-7" })],
    ["treasury.root", routes.treasury.root()],
    ["treasury.financialInstruments", routes.treasury.financialInstruments()],
    ["equipment.list", routes.equipment.list()],
    ["equipment.new", routes.equipment.new()],
    ["equipment.work", routes.equipment.work()],
    ["equipment.fuel", routes.equipment.fuel()],
    ["equipment.detail", routes.equipment.detail({ equipmentId: "e-3" })],
    ["equipment.edit", routes.equipment.edit({ equipmentId: "e-3" })],
    ["equipment.rentalInvoices", routes.equipment.rentalInvoices()],
    ["equipment.rentalInvoiceDetail", routes.equipment.rentalInvoiceDetail({ invoiceId: "i-7" })],
    ["financial.root", routes.financialStatements.root()],
    ["financial.balanceSheet", routes.financialStatements.balanceSheet()],
    ["financial.cashFlow", routes.financialStatements.cashFlow()],
    ["accounting.root", routes.accounting.root()],
    ["accounting.chartOfAccounts", routes.accounting.chartOfAccounts()],
    ["accounting.trialBalance", routes.accounting.trialBalance()],
    ["accounting.vatReturn", routes.accounting.vatReturn()],
    ["accounting.bankReconciliation", routes.accounting.bankReconciliation()],
    ["accounting.periodClosing", routes.accounting.periodClosing()],
    ["personnel.list", routes.personnel.list()],
    ["personnel.new", routes.personnel.new()],
    ["personnel.documents", routes.personnel.documents()],
    ["personnel.leaves", routes.personnel.leaves()],
    ["personnel.detail", routes.personnel.detail({ personnelId: "e-3" })],
    ["personnel.edit", routes.personnel.edit({ personnelId: "e-3" })],
    ["timesheet", routes.timesheet()],
    ["purchasing.root", routes.purchasing.root()],
    ["purchasing.orders", routes.purchasing.orders()],
    ["purchasing.suppliers", routes.purchasing.suppliers()],
    ["purchasing.newRequest", routes.purchasing.newRequest()],
    ["purchasing.requestQuotes", routes.purchasing.requestQuotes({ requestId: "r-5" })],
    ["sales.root", routes.sales.root()],
    ["sales.new", routes.sales.new()],
    ["sales.addBlock", routes.sales.addBlock()],
    ["sales.addUnit", routes.sales.addUnit()],
    ["sales.bulkUnits", routes.sales.bulkUnits()],
    ["sales.importUnits", routes.sales.importUnits()],
    ["sales.landShareAllocation", routes.sales.landShareAllocation()],
    // TKL-F3: `yeni`/`[offerId]`/`yazdir` sayfaları kendi dilimlerinde (F3.4/F3.5/F3.7) bu listeye girer.
    ["offers.list", routes.offers.list()],
    ["contracts.list", routes.contracts.list()],
    ["contracts.subcontractorList", routes.contracts.subcontractorList()],
    ["contracts.employerDetail", routes.contracts.employerDetail({ projectId: P })],
    ["contracts.employerItemDistribution", routes.contracts.employerItemDistribution({ projectId: P })],
    ["contracts.newSubcontractor", routes.contracts.newSubcontractor()],
    ["contracts.subcontractorDetail", routes.contracts.subcontractorDetail({ contractId: "c-2" })],
    ["stock", routes.stock()],
  ];

  it("kapsam bos KALMAZ", () => {
    expect(hrefs.length).toBeGreaterThan(80);
  });

  it("kalan-9/no457: home/assistant/reports/siteDiary hrefs KAPSAMDA", () => {
    // Bu dört gerçek sayfa (`/`, `/asistan`, `/raporlar`, `/gunluk-kayit`)
    // ölçüldüğünde `hrefs` dizisinde hiç yoktu — bir yazım hatası burada
    // yakalanmadan sızabilirdi.
    const names = hrefs.map(([name]) => name);
    expect(names).toEqual(
      expect.arrayContaining(["home", "assistant", "reports", "siteDiary"]),
    );
  });

  it.each(hrefs)("%s -> gercek rota", (_name, href) => {
    // `/login` `(app)` grubunun DIŞINDA yaşar; ağaç `(app)` kökünü kurduğu
    // için orada catch-all'a düşer — bu BEKLENEN sonuçtur, uydurma yol değil.
    if (href === "/login") return;
    const result = resolveHrefIn(tree, href, true, SENTINEL);
    expect(result.kind, `${href} -> ${result.kind}`).toBe("static");
  });

  it("uydurma bir yol bu bekcide PATLAR (negatif kontrol)", () => {
    // 🔴 Bekçinin "her şeye evet diyen" bozuk hâli de yeşil görünürdü.
    // F-TH'de fiilen yaşanan vaka: `/hakedisler/isveren` diye bir rota YOK,
    // `[paymentId]` onu bir kimlik sanıp yutuyordu.
    const result = resolveHrefIn(tree, "/hakedisler/isveren", true, SENTINEL);
    expect(result.kind).not.toBe("static");
  });
});

describe("routes.offers (TKL-F3 · Teklif Hazırlama)", () => {
  it("liste ve yeni sabit yollardır", () => {
    expect(routes.offers.list()).toBe("/teklif-hazirlama");
    expect(routes.offers.new()).toBe("/teklif-hazirlama/yeni");
  });

  it("şablonlar: çıplak yol statik segmenttir; ?sablon= yalnız verilince eklenir ve kodlanır (TKL-F4)", () => {
    expect(routes.offers.templates()).toBe("/teklif-hazirlama/sablonlar");
    expect(routes.offers.templates({})).toBe("/teklif-hazirlama/sablonlar");
    expect(routes.offers.templates({ templateId: "t-1" })).toBe("/teklif-hazirlama/sablonlar?sablon=t-1");
    expect(routes.offers.templates({ templateId: "a/b" })).toBe("/teklif-hazirlama/sablonlar?sablon=a%2Fb");
  });

  it("yeni: çıplak çağrı kırılmaz; templateId ?sablon= önseçimi taşır (TKL-F4)", () => {
    expect(routes.offers.new({})).toBe("/teklif-hazirlama/yeni");
    expect(routes.offers.new({ templateId: "t-1" })).toBe("/teklif-hazirlama/yeni?sablon=t-1");
  });

  it("OFFER_TEMPLATE_PARAM = sablon (URL anahtarı TEK yerde)", () => {
    expect(OFFER_TEMPLATE_PARAM).toBe("sablon");
  });

  it("detay: revizyon verilmezse sorgu dizesi HİÇ eklenmez; rev 0 da yazılır", () => {
    expect(routes.offers.detail({ offerId: "o-1" })).toBe("/teklif-hazirlama/o-1");
    expect(routes.offers.detail({ offerId: "o-1", rev: 0 })).toBe("/teklif-hazirlama/o-1?rev=0");
    expect(routes.offers.detail({ offerId: "o-1", rev: 3 })).toBe("/teklif-hazirlama/o-1?rev=3");
  });

  it("yazdır: rev + tur birlikte; kimlik kodlanır", () => {
    expect(routes.offers.print({ offerId: "o-1", rev: 2, kind: "isveren" })).toBe(
      "/teklif-hazirlama/o-1/yazdir?rev=2&tur=isveren",
    );
    expect(routes.offers.print({ offerId: "a/b", rev: 0, kind: "ic" })).toBe(
      "/teklif-hazirlama/a%2Fb/yazdir?rev=0&tur=ic",
    );
  });
});
