// TEST-F2 Ajan B — Katman 2 · seçilmiş GET URL listesi.
//
// SCALE_TABLE'daki 202 şema·alanı üreten mock yolları — id'ler UYDURULMAZ,
// mock'un KENDİ fikstürlerinden test çalışırken ÖLÇÜLÜR (önce liste uçları
// çağrılır, dönen gerçek id'lerle detay uçları kurulur). Bu, statik olarak
// hardcode edilmiş UUID'lerin mock fikstürleri değiştiğinde SESSİZCE
// bayatlaması riskini ortadan kaldırır (bkz. MEMORY: "atıf tazeliği" dersleri).
//
// `buildScaleUrls` 51 openapi yol şablonunun HEPSİNİ dener (tablo içeriğinden
// BAĞIMSIZ — kapsam ölçümü tablo doldurulmadan da anlamlı olsun diye).
// Bir şablon için gerekli id keşfedilemezse ya da mock 2xx dışı dönerse
// `skipped` listesine (gerekçeli) düşer — bu ÇALIŞMA-ZAMANI MOCK_DISI'dir;
// `MOCK_DISI_STATIC` ise mock'un YAPISAL OLARAK hiç sunmadığı bilinen uçlar
// için (ör. yalnız istek gövdesinde görünen alanlar) önceden yazılmış gerekçe
// listesidir.

export interface ScaleUrlEntry {
  /** openapi yol şablonu, ör. "/sites/{site_id}/boq". */
  path: string;
  /** mock'a atılan somut yol, ör. "/sites/s-1/boq". */
  url: string;
}

export interface McockDisiEntry {
  path: string;
  reason: string;
}

export type JsonGetter = (url: string) => Promise<{ status: number; body: unknown }>;

function firstId(body: unknown, arrayKey = "items"): string | null {
  if (body && typeof body === "object" && arrayKey in (body as Record<string, unknown>)) {
    const arr = (body as Record<string, unknown>)[arrayKey];
    if (Array.isArray(arr) && arr.length > 0 && arr[0] && typeof arr[0] === "object") {
      const id = (arr[0] as Record<string, unknown>).id;
      return typeof id === "string" ? id : null;
    }
  }
  return null;
}

/** Mock'un sabit EV günlük fikstür şantiyesi (`e2e/mock-backend.ts` `EV_DAY_SITE`). */
const EV_DAY_SITE = "s-1";

/**
 * Tablo içeriğinden BAĞIMSIZ: 51 openapi yol şablonunun HEPSİ için gerçek bir
 * mock URL'i kurmayı dener. `get` her zaman `{status, body}` döner (fetch
 * hata fırlatmaz varsayımıyla) — 4xx/5xx `skipped`e düşer.
 */
export async function buildScaleUrls(
  get: JsonGetter,
): Promise<{ entries: ScaleUrlEntry[]; skipped: McockDisiEntry[] }> {
  const entries: ScaleUrlEntry[] = [];
  const skipped: McockDisiEntry[] = [];

  function add(path: string, url: string): void {
    entries.push({ path, url });
  }
  function skip(path: string, reason: string): void {
    skipped.push({ path, reason });
  }

  async function tryAdd(path: string, url: string): Promise<{ status: number; body: unknown } | null> {
    const res = await get(url);
    if (res.status >= 200 && res.status < 300) {
      add(path, url);
      return res;
    }
    skip(path, `mock ${res.status} döndü (url=${url})`);
    return null;
  }

  // ── kök liste uçları (id kaynakları + kendileri de tabloya girebilir) ──
  const projects = await tryAdd("GET /projects", "/projects");
  const projectId = projects ? firstId(projects.body) : null;

  await tryAdd("GET /company", "/company");
  await tryAdd("GET /dashboard/summary", "/dashboard/summary");
  await tryAdd("GET /earned-value/catalog", "/earned-value/catalog");
  await tryAdd("GET /hr/leaves/summary", "/hr/leaves/summary");
  await tryAdd("GET /payroll/rates", "/payroll/rates");
  await tryAdd("GET /payroll/tax-brackets", "/payroll/tax-brackets");
  // yıl/ay YOKSA mock boş fikstür döner (`vatReturnFixture` bulunamayan
  // dönemde taxable_rows: [] üretir, e2e/mock-backend.ts:16610-16627) —
  // dolu `taxable_rows` için ÖLÇÜLMÜŞ gerçek dönem (2026-06, satır 16565-16580).
  await tryAdd("GET /vat-return", "/vat-return?year=2026&month=6");

  const contracts = await tryAdd("GET /contracts", "/contracts?type=employer");
  void contracts;

  const equipment = await tryAdd("GET /equipment", "/equipment");
  const equipmentId = equipment ? firstId(equipment.body) : null;

  const rentalInvoices = await tryAdd("GET /equipment/rental-invoices", "/equipment/rental-invoices");
  const rentalInvoiceId = rentalInvoices ? firstId(rentalInvoices.body) : null;

  // `year`/`month` YOKSA mock BOŞ fikstür döner (`isEquipmentFixturePeriod`,
  // e2e/mock-backend.ts:8117-8122) — dolu veri için ÖLÇÜLMÜŞ sabit dönem
  // (`EQUIPMENT_PERIOD = { year: 2026, month: 8 }`, satır 7682) gönderilir.
  await tryAdd("GET /equipment/fuel-summary", "/equipment/fuel-summary?year=2026&month=8");
  await tryAdd("GET /equipment/work-summary", "/equipment/work-summary?year=2026&month=8");

  const invoices = await tryAdd("GET /invoices", "/invoices");
  const invoiceId = invoices ? firstId(invoices.body) : null;

  const payrollPeriods = await tryAdd("GET /payroll/periods", "/payroll/periods");
  const periodId = payrollPeriods ? firstId(payrollPeriods.body) : null;

  const progressPayments = await tryAdd("GET /progress-payments", "/progress-payments");
  const paymentId = progressPayments ? firstId(progressPayments.body) : null;

  const subcontractorContracts = await tryAdd("GET /subcontractor-contracts", "/subcontractor-contracts");
  const subcontractorContractId = subcontractorContracts ? firstId(subcontractorContracts.body) : null;

  const subcontractorPayments = await tryAdd(
    "GET /subcontractor-progress-payments",
    "/subcontractor-progress-payments",
  );
  const subcontractorPaymentId = subcontractorPayments ? firstId(subcontractorPayments.body) : null;

  const aiConversations = await tryAdd("GET /ai/conversations", "/ai/conversations");
  const conversationId = aiConversations ? firstId(aiConversations.body) : null;

  const personnel = await tryAdd("GET /personnel", "/personnel");
  const personnelId = personnel ? firstId(personnel.body) : null;

  // ── proje-bağımlı uçlar ──
  // Arsa payı (land-share) uçları YALNIZ "kat karşılığı" projede vardır —
  // `e2e/mock-backend.ts` `LAND_SHARE_CONTRACT_FIXTURES`'ta tek anahtar "p-3"
  // (ÖLÇÜLMÜŞ: genel `projectId` "p-1" bu uçlarda 404 döner, kat karşılığı
  // TÜRÜ değil). Proje id'si burada tek istisna olarak sabit — `/projects`
  // listesinden "kat_karsiligi" tipini süzerek genel hale getirmek KKS'ye özel
  // ikinci bir keşif turu gerektirirdi; mevcut fikstür kümesinde tek proje
  // olduğu için doğrudan kullanmak "uydurma id" değil "ÖLÇÜLMÜŞ sabit"tir.
  const LAND_SHARE_PROJECT_ID = "p-3";
  await tryAdd(
    "GET /projects/{project_id}/land-share/summary",
    `/projects/${LAND_SHARE_PROJECT_ID}/land-share/summary`,
  );
  await tryAdd(
    "GET /projects/{project_id}/land-share/units",
    `/projects/${LAND_SHARE_PROJECT_ID}/land-share/units`,
  );

  // `SubcontractorCostRow.progress_pct` yalnız `PROJECT_COSTS_FIXTURES`teki
  // taahhüt tipi projelerde dolu (`p-2`/`p-3`, e2e/mock-backend.ts:6044+) —
  // genel keşfedilen `projectId` (ilk proje, "p-1") bu fikstürde YOK, "costs"
  // ucu p-1 için `emptyProjectCosts` (boş ama geçerli) döner. ÖLÇÜLMÜŞ sabit.
  await tryAdd("GET /projects/{project_id}/costs", "/projects/p-2/costs");

  if (projectId) {
    await tryAdd("GET /projects/{project_id}", `/projects/${projectId}`);
    await tryAdd("GET /projects/{project_id}/contract", `/projects/${projectId}/contract`);
    await tryAdd("GET /projects/{project_id}/costs", `/projects/${projectId}/costs`);
    await tryAdd(
      "GET /projects/{project_id}/progress-payments/summary",
      `/projects/${projectId}/progress-payments/summary`,
    );
    await tryAdd("GET /projects/{project_id}/units", `/projects/${projectId}/units`);

    const sites = await tryAdd("GET /projects/{project_id}/sites", `/projects/${projectId}/sites`);
    const siteId = sites ? firstId(sites.body) : null;

    const sales = await tryAdd("GET /projects/{project_id}/sales", `/projects/${projectId}/sales`);
    const saleId = sales ? firstId(sales.body) : null;
    await tryAdd("GET /projects/{project_id}/sales/summary", `/projects/${projectId}/sales/summary`);

    if (saleId) {
      await tryAdd("GET /sales/{sale_id}", `/sales/${saleId}`);
    } else {
      skip("GET /sales/{sale_id}", "proje için hiç satış fikstürü yok (sale id keşfedilemedi)");
    }

    if (siteId) {
      await tryAdd("GET /sites/{site_id}", `/sites/${siteId}`);
      const boq = await tryAdd("GET /sites/{site_id}/boq", `/sites/${siteId}/boq`);
      const boqItemId =
        boq && boq.body && typeof boq.body === "object"
          ? (() => {
              const groups = (boq.body as Record<string, unknown>).groups;
              if (Array.isArray(groups)) {
                for (const g of groups) {
                  const items = (g as Record<string, unknown>)?.items;
                  if (Array.isArray(items) && items.length > 0) {
                    const id = (items[0] as Record<string, unknown>).id;
                    return typeof id === "string" ? id : null;
                  }
                }
              }
              return null;
            })()
          : null;

      if (boqItemId) {
        await tryAdd("GET /boq/items/{item_id}/allocations", `/boq/items/${boqItemId}/allocations`);
        await tryAdd(
          "GET /sites/{site_id}/earned-value/budget/items/{boq_item_id}/suggestions",
          `/sites/${siteId}/earned-value/budget/items/${boqItemId}/suggestions`,
        );
      } else {
        skip("GET /boq/items/{item_id}/allocations", "şantiyenin BOQ'unda hiç kalem bulunamadı");
        skip(
          "GET /sites/{site_id}/earned-value/budget/items/{boq_item_id}/suggestions",
          "şantiyenin BOQ'unda hiç kalem bulunamadı",
        );
      }
      // NOT: `boqItemId` bulunsa bile suggestions 422 dönebilir — ucun EV kod
      // ağacına (bi-*/sec-* kombinasyonu) bağlı ayrı bir doğrulaması var;
      // `tryAdd` üstteki genel yolla dener, başarısız olursa kendi gerekçesiyle
      // zaten `skipped`e düşer (bkz. `tryAdd` içindeki `mock ${status} döndü`).

      await tryAdd("GET /sites/{site_id}/diary/summary", `/sites/${siteId}/diary/summary`);
      const sections = await tryAdd("GET /sites/{site_id}/sections", `/sites/${siteId}/sections`);
      const sectionId = sections ? firstId(sections.body) : null;
      if (sectionId) {
        await tryAdd("GET /sections/{section_id}", `/sections/${sectionId}`);
      } else {
        skip("GET /sections/{section_id}", "şantiyenin hiç bölümü bulunamadı");
      }
    } else {
      for (const p of [
        "GET /sites/{site_id}",
        "GET /sites/{site_id}/boq",
        "GET /sites/{site_id}/diary/summary",
        "GET /sites/{site_id}/sections",
        "GET /sections/{section_id}",
        "GET /boq/items/{item_id}/allocations",
        "GET /sites/{site_id}/earned-value/budget/items/{boq_item_id}/suggestions",
      ]) {
        skip(p, "projenin hiç şantiyesi yok (site id keşfedilemedi)");
      }
    }
  } else {
    skip("GET /projects/{project_id}", "hiç proje fikstürü yok (project id keşfedilemedi)");
  }

  // ── EV sabit fikstür şantiyesi (`e2e/mock-backend.ts` EV_DAY_SITE = "s-1") ──
  await tryAdd("GET /sites/{site_id}/earned-value/panel", `/sites/${EV_DAY_SITE}/earned-value/panel`);
  await tryAdd("GET /sites/{site_id}/earned-value/budget", `/sites/${EV_DAY_SITE}/earned-value/budget`);
  await tryAdd("GET /sites/{site_id}/earned-value/code-tree", `/sites/${EV_DAY_SITE}/earned-value/code-tree`);
  await tryAdd("GET /sites/{site_id}/earned-value/settings", `/sites/${EV_DAY_SITE}/earned-value/settings`);
  // GET .../settings/preview openapi'de VAR ama `e2e/mock-backend.ts`te bu yol
  // için hiçbir handler YOK (ÖLÇÜLMÜŞ: 404 — regex arama boş) → MOCK_DISI_STATIC.
  skip("GET /sites/{site_id}/earned-value/settings/preview", "mock bu ucu hiç sunmuyor (handler yok, openapi'de var)");
  await tryAdd(
    "GET /sites/{site_id}/earned-value/reports/daily",
    `/sites/${EV_DAY_SITE}/earned-value/reports/daily?day=2026-08-01`,
  );
  await tryAdd(
    "GET /sites/{site_id}/earned-value/reports/weekly",
    `/sites/${EV_DAY_SITE}/earned-value/reports/weekly?week_start=2026-08-01`,
  );
  // `day=2026-08-01` boş `row_patterns` üretiyordu (o günden önce SUNULMUŞ +
  // savedRows dolu bir gün YOK). ÖLÇÜLMÜŞ gerçek veri: `EV_DAY_SCENARIO_DAYS.locked`
  // (2026-10-05) durumu "submitted" ve `savedRows: { "sub-2": 48 }` (dolu) —
  // ondan SONRAKİ gün (`blocked`, 2026-10-06) previous-allocation'da bu günü
  // bulur ve `ShareOut` üretir (e2e/mock-backend.ts:22159,22667-22686).
  await tryAdd(
    "GET /sites/{site_id}/earned-value/days/{day}/previous-allocation",
    `/sites/${EV_DAY_SITE}/earned-value/days/2026-10-06/previous-allocation`,
  );

  // ── diğer bağımsız id'li uçlar ──
  if (equipmentId) {
    await tryAdd("GET /equipment/{equipment_id}", `/equipment/${equipmentId}`);
    await tryAdd("GET /equipment/{equipment_id}/detail", `/equipment/${equipmentId}/detail`);
  } else {
    skip("GET /equipment/{equipment_id}", "hiç ekipman fikstürü yok");
    skip("GET /equipment/{equipment_id}/detail", "hiç ekipman fikstürü yok");
  }

  if (rentalInvoiceId) {
    await tryAdd("GET /equipment/rental-invoices/{invoice_id}", `/equipment/rental-invoices/${rentalInvoiceId}`);
  } else {
    skip("GET /equipment/rental-invoices/{invoice_id}", "hiç kira faturası fikstürü yok");
  }

  if (invoiceId) {
    await tryAdd("GET /invoices/{invoice_id}", `/invoices/${invoiceId}`);
  } else {
    skip("GET /invoices/{invoice_id}", "hiç fatura fikstürü yok");
  }

  if (periodId) {
    await tryAdd("GET /payroll/periods/{period_id}", `/payroll/periods/${periodId}`);
    await tryAdd("GET /payroll/periods/{period_id}/sgk-summary", `/payroll/periods/${periodId}/sgk-summary`);
  } else {
    skip("GET /payroll/periods/{period_id}", "hiç bordro dönemi fikstürü yok");
    skip("GET /payroll/periods/{period_id}/sgk-summary", "hiç bordro dönemi fikstürü yok");
  }

  if (paymentId) {
    await tryAdd("GET /progress-payments/{payment_id}", `/progress-payments/${paymentId}`);
  } else {
    skip("GET /progress-payments/{payment_id}", "hiç işveren hakedişi fikstürü yok");
  }

  // TKL-F3.2 · teklif uçları. Revizyon okuması TÜM tohum tekliflerin SON revizyonlarıyla gezilir:
  // kalem düzeyi GG/kâr ezmesi, elle B.F. (türev kâr %), fiyatsız kalem ve negatif/boş türevler
  // farklı tekliflerde yaşar — tek teklif ölçeği ters kaydıran bir değeri gizleyebilirdi.
  await tryAdd("GET /offers/settings", "/offers/settings");
  const offersList = await tryAdd("GET /offers", "/offers");
  const offerRows = (offersList?.body as { items?: Array<{ id: string; rev_no: number }> } | null)?.items ?? [];
  if (offerRows.length > 0) {
    for (const row of offerRows) {
      await tryAdd("GET /offers/{offer_id}/revisions/{rev_no}", `/offers/${row.id}/revisions/${row.rev_no}`);
    }
  } else {
    skip("GET /offers/{offer_id}/revisions/{rev_no}", "hiç teklif fikstürü yok");
  }

  if (subcontractorContractId) {
    await tryAdd("GET /subcontractor-contracts/{contract_id}", `/subcontractor-contracts/${subcontractorContractId}`);
  } else {
    skip("GET /subcontractor-contracts/{contract_id}", "hiç taşeron sözleşmesi fikstürü yok");
  }

  if (subcontractorPaymentId) {
    await tryAdd(
      "GET /subcontractor-progress-payments/{payment_id}",
      `/subcontractor-progress-payments/${subcontractorPaymentId}`,
    );
  } else {
    skip("GET /subcontractor-progress-payments/{payment_id}", "hiç taşeron hakedişi fikstürü yok");
  }

  if (conversationId) {
    await tryAdd("GET /ai/conversations/{conversation_id}", `/ai/conversations/${conversationId}`);
  } else {
    skip("GET /ai/conversations/{conversation_id}", "hiç AI konuşma fikstürü yok");
  }

  if (personnelId) {
    const year = new Date().getFullYear();
    await tryAdd("GET /leave-balances/{personnel_id}/{year}", `/leave-balances/${personnelId}/${year}`);
  } else {
    skip("GET /leave-balances/{personnel_id}/{year}", "hiç personel fikstürü yok");
  }

  return { entries, skipped };
}

export interface MockDisiFieldEntry {
  schema: string;
  field: string;
  reason: string;
}

/**
 * SCALE_TABLE'daki (not-scale hariç) satırlardan mock'un GET yanıtlarında
 * HİÇ üretmediği her biri, GERÇEK GEREKÇESİYLE burada. Her gerekçe ölçüldü
 * (`e2e/mock-backend.ts` içinde ya da `openapi/openapi.json`da) — uydurma
 * gerekçe YOK. Üç kategori:
 *
 * 1. "yalnız istek gövdesi" — şema adı Create/Update/Input ile bitiyor,
 *    hiçbir GET yanıtı bu şemayı DÖNMEZ (yalnız POST/PUT/PATCH gövdesinde
 *    okunur).
 * 2. "mock bu ucu sunmuyor: settings/preview" — `GET .../earned-value/settings/preview`
 *    openapi'de VAR ama `e2e/mock-backend.ts`te hiçbir handler'ı YOK (404) —
 *    bu ucun altındaki TÜM şemalar (`SettingsPreview`, `PreviewOut` zinciri:
 *    `DisciplinePreviewOut`, `SeriesOut.days` → `DayOut`) dolayısıyla erişilemez.
 * 3. "mock hiç doldurmuyor" — uç GERÇEKTEN sunuluyor ama mock'un o alanı
 *    üreten kod yolu YOK ya da fikstür verisi hep boş.
 */
export const MOCK_DISI_STATIC: readonly MockDisiFieldEntry[] = [
  // ── 1. yalnız istek gövdesi (Create/Update/Input) ──
  { schema: "CompanyUpdate", field: "default_vat_rate", reason: "yalnız istek gövdesi (PUT /company)" },
  { schema: "InvoiceCreate", field: "advance_rate", reason: "yalnız istek gövdesi (POST /invoices)" },
  { schema: "InvoiceCreate", field: "retention_rate", reason: "yalnız istek gövdesi (POST /invoices)" },
  { schema: "InvoiceCreate", field: "withholding_rate", reason: "yalnız istek gövdesi (POST /invoices)" },
  { schema: "InvoiceLineCreate", field: "vat_rate", reason: "yalnız istek gövdesi (PUT /invoices/{id}/lines)" },
  { schema: "InvoiceUpdate", field: "advance_rate", reason: "yalnız istek gövdesi (PATCH /invoices/{id})" },
  { schema: "InvoiceUpdate", field: "retention_rate", reason: "yalnız istek gövdesi (PATCH /invoices/{id})" },
  { schema: "InvoiceUpdate", field: "withholding_rate", reason: "yalnız istek gövdesi (PATCH /invoices/{id})" },
  { schema: "PayrollRateUpdate", field: "income_tax_pct", reason: "yalnız istek gövdesi (PUT /payroll/rates/{year}/{source})" },
  { schema: "PayrollRateUpdate", field: "sgk_employee_pct", reason: "yalnız istek gövdesi (PUT /payroll/rates/{year}/{source})" },
  { schema: "PayrollRateUpdate", field: "sgk_employer_pct", reason: "yalnız istek gövdesi (PUT /payroll/rates/{year}/{source})" },
  { schema: "PayrollRateUpdate", field: "short_work_pct", reason: "yalnız istek gövdesi (PUT /payroll/rates/{year}/{source})" },
  { schema: "PayrollRateUpdate", field: "stamp_tax_pct", reason: "yalnız istek gövdesi (PUT /payroll/rates/{year}/{source})" },
  { schema: "PayrollRateUpdate", field: "unemployment_employee_pct", reason: "yalnız istek gövdesi (PUT /payroll/rates/{year}/{source})" },
  { schema: "PayrollRateUpdate", field: "unemployment_employer_pct", reason: "yalnız istek gövdesi (PUT /payroll/rates/{year}/{source})" },
  { schema: "PayrollTaxBracketInput", field: "rate_pct", reason: "yalnız istek gövdesi (girdi şeması, GET yanıtı PayrollTaxBracketResponse kullanır)" },
  { schema: "ProjectContractInput", field: "advance_pct", reason: "yalnız istek gövdesi (girdi şeması)" },
  { schema: "ProjectContractInput", field: "retainage_pct", reason: "yalnız istek gövdesi (girdi şeması)" },
  { schema: "ProjectContractInput", field: "vat_pct", reason: "yalnız istek gövdesi (girdi şeması)" },
  { schema: "ProjectLandShareInput", field: "our_share_pct", reason: "yalnız istek gövdesi (POST /projects — land_share girdisi)" },
  { schema: "ProjectLandShareInput", field: "owner_share_pct", reason: "yalnız istek gövdesi (POST /projects — land_share girdisi)" },
  { schema: "RentalInvoiceCreate", field: "vat_rate", reason: "yalnız istek gövdesi (POST /equipment/rental-invoices)" },
  { schema: "RentalInvoiceUpdate", field: "vat_rate", reason: "yalnız istek gövdesi (PATCH /equipment/rental-invoices/{id})" },
  { schema: "ShareholderInput", field: "share_pct", reason: "yalnız istek gövdesi (girdi şeması)" },
  { schema: "SubcontractorContractCreate", field: "advance_pct", reason: "yalnız istek gövdesi (POST /projects/{id}/subcontractor-contracts)" },
  { schema: "SubcontractorContractCreate", field: "retainage_pct", reason: "yalnız istek gövdesi (POST /projects/{id}/subcontractor-contracts)" },
  { schema: "SubcontractorContractCreate", field: "vat_pct", reason: "yalnız istek gövdesi (POST /projects/{id}/subcontractor-contracts)" },
  { schema: "SubcontractorContractUpdate", field: "advance_pct", reason: "yalnız istek gövdesi (PATCH /subcontractor-contracts/{id})" },
  { schema: "SubcontractorContractUpdate", field: "retainage_pct", reason: "yalnız istek gövdesi (PATCH /subcontractor-contracts/{id})" },
  { schema: "SubcontractorContractUpdate", field: "vat_pct", reason: "yalnız istek gövdesi (PATCH /subcontractor-contracts/{id})" },
  { schema: "UnitBulkCreate", field: "floor_price_increase_pct", reason: "yalnız istek gövdesi (POST /projects/{id}/units/bulk)" },
  { schema: "UnitCreate", field: "vat_rate", reason: "yalnız istek gövdesi (girdi şeması)" },
  { schema: "UnitSaleCreate", field: "late_fee_monthly_pct", reason: "yalnız istek gövdesi (POST /projects/{id}/sales)" },
  { schema: "UnitSaleCreate", field: "term_interest_pct", reason: "yalnız istek gövdesi (POST /projects/{id}/sales)" },
  { schema: "UnitSaleCreate", field: "vat_pct", reason: "yalnız istek gövdesi (POST /projects/{id}/sales)" },
  { schema: "UnitSaleUpdate", field: "late_fee_monthly_pct", reason: "yalnız istek gövdesi (PATCH /sales/{id})" },
  { schema: "UnitSaleUpdate", field: "term_interest_pct", reason: "yalnız istek gövdesi (PATCH /sales/{id})" },
  { schema: "UnitSaleUpdate", field: "vat_pct", reason: "yalnız istek gövdesi (PATCH /sales/{id})" },
  { schema: "UnitUpdate", field: "vat_rate", reason: "yalnız istek gövdesi (girdi şeması)" },
  { schema: "OfferCreate", field: "overhead_pct", reason: "yalnız istek gövdesi (POST /offers)" },
  { schema: "OfferCreate", field: "profit_pct", reason: "yalnız istek gövdesi (POST /offers)" },
  { schema: "OfferCreate", field: "vat_pct", reason: "yalnız istek gövdesi (POST /offers)" },
  { schema: "OfferItemCreate", field: "overhead_pct", reason: "yalnız istek gövdesi (POST /offers/{id}/revisions/{rev}/items[/bulk])" },
  { schema: "OfferItemCreate", field: "profit_pct", reason: "yalnız istek gövdesi (POST /offers/{id}/revisions/{rev}/items[/bulk])" },
  { schema: "OfferItemUpdate", field: "overhead_pct", reason: "yalnız istek gövdesi (PATCH /offers/{id}/revisions/{rev}/items/{item_id})" },
  { schema: "OfferItemUpdate", field: "profit_pct", reason: "yalnız istek gövdesi (PATCH /offers/{id}/revisions/{rev}/items/{item_id})" },
  { schema: "OfferRevisionUpdate", field: "overhead_pct", reason: "yalnız istek gövdesi (PATCH /offers/{id}/revisions/{rev})" },
  { schema: "OfferRevisionUpdate", field: "profit_pct", reason: "yalnız istek gövdesi (PATCH /offers/{id}/revisions/{rev})" },
  { schema: "ConvertContract", field: "advance_pct", reason: "yalnız istek gövdesi (POST /offers/{id}/convert)" },
  { schema: "ConvertContract", field: "retainage_pct", reason: "yalnız istek gövdesi (POST /offers/{id}/convert)" },
  { schema: "ConvertContract", field: "vat_pct", reason: "yalnız istek gövdesi (POST /offers/{id}/convert)" },
  { schema: "TemplateCreate", field: "overhead_pct", reason: "yalnız istek gövdesi (POST /offers/templates)" },
  { schema: "TemplateCreate", field: "profit_pct", reason: "yalnız istek gövdesi (POST /offers/templates)" },
  { schema: "TemplateUpdate", field: "overhead_pct", reason: "yalnız istek gövdesi (PATCH /offers/templates/{id})" },
  { schema: "TemplateUpdate", field: "profit_pct", reason: "yalnız istek gövdesi (PATCH /offers/templates/{id})" },
  { schema: "TemplateDetailRead", field: "overhead_pct", reason: "mock şablon uçlarını hiç sunmuyor (TKL-F4.1: şablon mock'u F4 dilimlerinde)" },
  { schema: "TemplateDetailRead", field: "profit_pct", reason: "mock şablon uçlarını hiç sunmuyor (TKL-F4.1: şablon mock'u F4 dilimlerinde)" },
  { schema: "TemplateListItem", field: "overhead_pct", reason: "mock şablon uçlarını hiç sunmuyor (TKL-F4.1: şablon mock'u F4 dilimlerinde)" },
  { schema: "TemplateListItem", field: "profit_pct", reason: "mock şablon uçlarını hiç sunmuyor (TKL-F4.1: şablon mock'u F4 dilimlerinde)" },
  { schema: "OfferRevisionUpdate", field: "vat_pct", reason: "yalnız istek gövdesi (PATCH /offers/{id}/revisions/{rev})" },
  { schema: "OfferSettingsUpdate", field: "default_overhead_pct", reason: "yalnız istek gövdesi (PUT /offers/settings)" },
  { schema: "OfferSettingsUpdate", field: "default_profit_pct", reason: "yalnız istek gövdesi (PUT /offers/settings)" },
  { schema: "OfferSettingsUpdate", field: "default_vat_pct", reason: "yalnız istek gövdesi (PUT /offers/settings)" },

  // ── 2. mock bu ucu sunmuyor: settings/preview (handler yok, openapi'de var) ──
  // Ölçüldü: `SettingsPreview`/`PreviewOut` zinciri (`DisciplinePreviewOut` →
  // `SeriesOut.days` → `DayOut`) YALNIZ bu uçtan gelir; başka hiçbir şema onu
  // içermez (openapi $ref taraması, bkz. TEST-F2 rapor).
  { schema: "SettingsPreview", field: "pf_day_band", reason: "mock bu ucu sunmuyor: GET .../earned-value/settings/preview handler'ı yok (openapi'de var, 404)" },
  { schema: "SettingsPreview", field: "pf_week_band", reason: "mock bu ucu sunmuyor: GET .../earned-value/settings/preview handler'ı yok (openapi'de var, 404)" },
  { schema: "DisciplinePreviewOut", field: "share", reason: "mock bu ucu sunmuyor: DisciplinePreviewOut yalnız settings/preview yanıtında var, o uç mock'ta yok" },
  { schema: "DayOut", field: "planned_pct_cum", reason: "mock bu ucu sunmuyor: DayOut yalnız settings/preview → PreviewOut.series → SeriesOut.days zincirinde var, o uç mock'ta yok" },

  // ── 3. uç sunuluyor ama mock hiç doldurmuyor ──
  {
    schema: "ProjectContractResponse",
    field: "advance_pct",
    reason: "mock hiç doldurmuyor: ProjectDetailResponse/ProjectListItem.contract alanı MockProject arayüzünde YOK (e2e/mock-backend.ts:600-620) — GET /projects ve /projects/{id} bu alanı hiçbir zaman göndermez",
  },
  {
    schema: "ProjectContractResponse",
    field: "retainage_pct",
    reason: "mock hiç doldurmuyor: aynı gerekçe (ProjectContractResponse.advance_pct)",
  },
  {
    schema: "ProjectContractResponse",
    field: "vat_pct",
    reason: "mock hiç doldurmuyor: aynı gerekçe (ProjectContractResponse.advance_pct)",
  },
  {
    schema: "ShareholderResponse",
    field: "share_pct",
    reason: "mock hiç doldurmuyor: LandShareCard.shareholders dizisi mock'taki TEK kat-karşılığı fikstüründe (p-3) hep boş döner (LAND_SHARE_PLACEHOLDERS varsayılanı `shareholders: []`, e2e/mock-backend.ts:1296) — ShareholderResponse'u üretecek bir öğe hiç yok",
  },
];
