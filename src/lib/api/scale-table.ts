// AUTO-GENERATED — TEST-F2 Ajan B (2026-09-26)
// TYPE-F1 FAZ 1 (CEO kararı, 2026-09-27): bu tablo artık `scale.ts`teki
// YUMUŞAK `DeepScale`in ad-tabanlı eşlemesinin TEK kaynağıdır — bedel notu
// (marka opsiyonel, çakışan adlar `SCALE_NAME_EXCEPTIONS`te) `scale.ts`
// başındadır, buraya kopyalanmadı.
// Kaynak: backend muhendisi tablosu + opus curutmesi (3 YANLIS + 18 KISMEN duzeltildi),
// lider CEO eklerini (zarf notlari) uyguladi, TEST-F2/B mock kosusu 7 satira
// percentBelowOneOk bayragi ekledi (kanit: gercek backend degerleri kucuk yuzde,
// olcum notu satirin 'not' alaninda). olcek-tablosu-nihai.json uzerinden
// URETILDI · openapi/openapi.json sha 95a4b5b.
// Kural: MetricPlaceholder zarfi tasiyan alanlar not-scale sayilir (zarfin ic .value alani
// regex'e uymadigi icin tablonun disinda kalir). Progress-yuzde ailesi zarflari (7 satir:
// SiteCard/SiteDetailResponse/SectionResponse/SectionDetailResponse.progress_pct,
// BoqItemResponse.progress_pct, BoqTotals.grand_progress_pct, InvestmentCard.sales_ratio)
// CEO karariyla ZARF notu tasir (bkz. TEST-F2 rapor). LandShareCard.our_share_value de
// yapisal olarak MetricPlaceholder ama PARA zarfidir (percent DEGIL) — ZARF metni
// UYGULANMADI, mevcut "para tutari zarfi" notu KORUNDU (bkz. rapor "olcum farki").
//
// FAZ 2d (TYPE-F1 madde 2) — `innerScale` alani: yukaridaki 7 zarf satirina
// `innerScale: "percent"` eklendi (DeepScale artik BUNLARIN `.value`'sunu
// `Percent` olarak markalar, bkz. `scale.ts` `BrandMetricValue`). AYRICA
// ÖLÇÜLDÜ: `schema.d.ts`teki TÜM `MetricPlaceholder` alan ADLARI tarandı (32
// benzersiz ad) — 8'i GERÇEKTEN yüzde (frontend `formatPercent` tüketimiyle
// doğrulandı), CEO'nun "7" tahmininin ÜZERİNDE. Eksik 6 satir (ContractingCard
// .physical_progress/.financial_progress, InvestmentCard.margin, LandShareCard
// .construction_progress/.margin, DashboardSummaryResponse.average_margin)
// buraya EKLENDI — kanitlari yalniz FRONTEND tuketimine dayanir (bu worktree'de
// backend YOK, "TAHMİN DÜZEYİ ÖLÇÜM" olarak isaretlendi, CEO/backend caprazı
// ONERILIR). Geri kalan 24 MetricPlaceholder adi PARA/tutar alanlaridir
// (`innerScale` yok = "not-scale" varsayilir, DeepScale onlara DOKUNMAZ).

export type Scale = "fraction" | "percent" | "factor" | "enum" | "not-scale";

export type ScaleFlag = "fractionAboveOneOk" | "negativeOk" | "percentAbove100Ok" | "percentBelowOneOk";

/**
 * Yalnız `scale: "not-scale"` taşıyan `MetricPlaceholder` ZARF satırlarında
 * anlamlı: zarfın İÇ `.value` alanının ölçüsü. `"percent"` ⇒ DeepScale
 * `.value`i `Percent` marka'lar (bkz. `scale.ts` `BrandMetricValue`).
 * Belirtilmezse (para/sayaç zarfları) DeepScale zarfa DOKUNMAZ.
 */
export type InnerScale = "percent" | "not-scale";

export interface ScaleRow {
  schema: string;
  field: string;
  scale: Scale;
  innerScale?: InnerScale;
  kanit: string;
  not?: string;
  flags?: readonly ScaleFlag[];
}

// TYPE-F1 SPIKE: literal (`as const`) form — DeepScale bunun ÜZERİNDEN alan
// adı birleşimlerini türetir. `SCALE_TABLE` (aşağıda) TEST-F2 bekçilerinin
// beklediği geniş `readonly ScaleRow[]` tipini KORUR (literal tip orada
// `kanit === "TODO-BACKEND"` gibi imkânsız karşılaştırmaları YANLIŞLIKLA
// derleme hatasına çevirirdi).
const SCALE_TABLE_LITERAL = [
  { schema: "AiMessageRead", field: "duration_ms", scale: "not-scale", kanit: "app/modules/ai/router.py:321", not: "süre (ms); 'rate/oran' değil, isim eşleşmesi yanlış." },
  { schema: "BoqItemResponse", field: "progress_pct", scale: "not-scale", innerScale: "percent", kanit: "boq/progress.py:53-60 weighted_pct = quantize(num/den*100), üst sınır yok; boq/service.py:94,129; boq/schemas.py:98; projects/schemas.py:83-116 MetricPlaceholder{available,value,pending_module}; çakışma dosyası progress_pct not-scale listesi", flags: ["percentAbove100Ok"], not: "para ağırlıklı oran (Σgerçekleşen×fiyat/Σtaban×fiyat×100); üst sınır yok, aşım >100 mümkün (fractionAboveOneOk eşdeğeri percent tarafında). ZARF: .value ölçüsü percent (0–100, >100 olabilir; boq/progress.py:53-60) — bu bekçinin DIŞINDA, TYPE-F1 kuyruğunda." },
  { schema: "BoqTotals", field: "grand_progress_pct", scale: "not-scale", innerScale: "percent", kanit: "boq/service.py:205-221; boq/progress.py:53-60,201-213; boq/schemas.py:191", flags: ["percentAbove100Ok"], not: "BoqItemResponse.progress_pct ile AYNI motor (progress.py), grup satırlarından yeniden toplanmaz. ZARF: .value ölçüsü percent (0–100, >100 olabilir; boq/progress.py:53-60) — bu bekçinin DIŞINDA, TYPE-F1 kuyruğunda." },
  { schema: "BudgetTotals", field: "empty_rate_leaf_count", scale: "not-scale", kanit: "app/modules/earned_value/budget_present.py:174", not: "sayaç (COUNT), oran değil." },
  { schema: "CatalogActualSite", field: "rate", scale: "not-scale", kanit: "app/modules/earned_value/schemas_catalog.py:144-160 (CatalogActual.avg = Σspent/Σqty, catalog_service.py)", not: "birim oran/fiyat tutarı (para benzeri), 0-1/0-100 ölçekli bir pay değil." },
  { schema: "CatalogItemRead", field: "diff_pct", scale: "fraction", kanit: "earned_value/catalog_service.py:225-229; schemas_catalog.py:219-221; models.py:164 standard_unit_mhr > 0 (payda hiç 0 olmaz)", flags: ["fractionAboveOneOk", "negativeOk"], not: "negatifOk (avg < standart olabilir); ±%10 eşiği istemcide uygulanır." },
  { schema: "CodeNodeOut", field: "has_rate", scale: "not-scale", kanit: "app/modules/earned_value/day_view.py:102 (has_rate=lf.is_rated)", not: "boolean bayrak, oran değil." },
  { schema: "CollectionKpi", field: "collection_pct", scale: "percent", kanit: "app/modules/sales/summary.py:161-162 (collected*100/contracted)", not: "sözleşme yoksa None; şema yorumu 'collected_amount * 100 / contracted_amount'." },
  { schema: "CompanyRead", field: "default_vat_rate", scale: "percent", kanit: "app/modules/company/models.py:54-55 (Numeric(5,2), server_default='20.00')", not: "varsayılan %20 KDV oranı; CompanyUpdate ile aynı alan." },
  { schema: "CompanyRead", field: "gib_integration_code", scale: "not-scale", kanit: "app/modules/company/schemas.py:44 / models.py (gib_integration_code string kolon)", not: "entegrasyon kodu (dizge kimlik), ölçek değil." },
  { schema: "CompanyUpdate", field: "default_vat_rate", scale: "percent", kanit: "app/modules/company/schemas.py:28 (Field(default=None, ge=0, le=100)) + models.py:54-55 Numeric(5,2) server_default 20.00", not: "yazma ucu; aynı kolonu hedefler (CompanyRead.default_vat_rate)." },
  { schema: "CompanyUpdate", field: "gib_integration_code", scale: "not-scale", kanit: "app/modules/company/schemas.py:25 (gib_integration_code)", not: "entegrasyon kodu, ölçek değil." },
  { schema: "ContractingCard", field: "financial_progress", scale: "not-scale", innerScale: "percent", kanit: "frontend kanıtı (backend bu worktree'de YOK): src/components/projects/ProjectCard.tsx:85,425 (\"Mali İlerleme\" satırı, formatPercent ile basılıyor); schema.d.ts ContractingCard.financial_progress MetricPlaceholder zarfı", flags: ["percentAbove100Ok"], not: "TAHMİN DÜZEYİ ÖLÇÜM (madde 2 faz 2d) — backend formülü doğrulanmadı, yalnız tüketen frontend kodu kanıt; CEO/backend çaprazı ÖNERİLİR. ZARF: .value ölçüsü percent (0–100, >100 olabilir eşdeğeri diğer progress zarflarıyla aynı aile) — bu bekçinin DIŞINDA, TYPE-F1 kuyruğunda." },
  { schema: "ContractingCard", field: "physical_progress", scale: "not-scale", innerScale: "percent", kanit: "frontend kanıtı (backend bu worktree'de YOK): src/components/projects/ProjectCard.tsx:56 (\"Fiziksel İlerleme\" satırı, formatPercent ile basılıyor); schema.d.ts ContractingCard.physical_progress MetricPlaceholder zarfı", flags: ["percentAbove100Ok"], not: "TAHMİN DÜZEYİ ÖLÇÜM (madde 2 faz 2d) — backend formülü doğrulanmadı, yalnız tüketen frontend kodu kanıt. ZARF: .value ölçüsü percent (0–100, >100 olabilir) — bu bekçinin DIŞINDA, TYPE-F1 kuyruğunda." },
  { schema: "ContractListItem", field: "progress_pct", scale: "percent", kanit: "progress_payments/summary.py:35-43; progress_payments/guards.py:56 (yalnız miktar kotası); contracts/service.py:113,189", flags: ["percentAbove100Ok"], not: "para etiketli finansal ilerleme (§8); fiziksel ilerlemeden AYRI kavram (kullanıcı kararı 2026-09-19)." },
  { schema: "CurvePoint", field: "planned_pct_cum", scale: "fraction", kanit: "engine/plan.py:29-37; engine/series.py:205-216,341-355; engine/spread.py:63-79; ev_input.py:133; report_panel.py:152/197/221", not: "fractionAboveOneOk: qty_overrun uyarı kodu var (WarningOut), aşım mümkün." },
  { schema: "CurvePoint", field: "progress_pct_cum", scale: "fraction", kanit: "app/modules/earned_value/engine/numeric.py:42-45; app/modules/earned_value/engine/metrics.py:162 (progress_pct_cum=ratio(ec,budget))", flags: ["fractionAboveOneOk"], not: "fractionAboveOneOk (aşım mümkün, K18/K27 bant kararı GÖSTERİLEN değerle verilir)." },
  { schema: "DailyReport", field: "generated_at", scale: "not-scale", kanit: "app/modules/earned_value/schemas_reports.py:266 (generated_at: datetime)", not: "zaman damgası, ölçek değil." },
  { schema: "DailyReport", field: "pf_bands", scale: "not-scale", kanit: "app/modules/earned_value/schemas_reports.py:65-70 (PfBandsOut iç içe şema)", not: "nested obje (eşik seti), kendisi bir skaler değer değil — alt alanları (red_below/green_from/high_above) EvDecimal tutar/eşiktir." },
  { schema: "DailyReport", field: "unrated_entries", scale: "not-scale", kanit: "app/modules/earned_value/schemas_reports.py:33-57 (WarningOut dizisi)", not: "liste (array<WarningOut>), ölçek değil." },
  { schema: "DashboardProjectCard", field: "progress_pct", scale: "percent", kanit: "app/modules/projects/models.py:172 (Numeric(5,2), default=0) + alembic/versions/795d6498e4da_projects_seed.py:37-65 (tohum değerleri 42.50/15.00/100.00); gerekçe app/modules/projects/cards.py:317-338", not: "FOSİL sütun: hiçbir yazma yolu yoktur (bekçi test_projects_progress_pct_sutununun_YAZMA_YOLU_YOKTUR), ama DEĞER 0-100 aralığında yüzdedir; ProjectListItem.progress_pct ile aynı kolon." },
  { schema: "DashboardSummaryResponse", field: "average_margin", scale: "not-scale", innerScale: "percent", kanit: "frontend kanıtı (backend bu worktree'de YOK): src/components/project-detail/SiteTotalsStrip.tsx:58 (metricCell(totals.average_margin, formatPercent)); schema.d.ts DashboardSummaryResponse.average_margin MetricPlaceholder zarfı", flags: ["percentAbove100Ok"], not: "TAHMİN DÜZEYİ ÖLÇÜM (madde 2 faz 2d) — backend formülü doğrulanmadı, yalnız tüketen frontend kodu kanıt. ZARF: .value ölçüsü percent (0–100, >100 olabilir) — bu bekçinin DIŞINDA, TYPE-F1 kuyruğunda." },
  { schema: "DayOut", field: "planned_pct_cum", scale: "fraction", kanit: "earned_value/budget_present.py:217; engine/preview.py:281-303; schemas_budget.py:272-276", not: "fractionAboveOneOk mümkün (aynı motor ailesi)." },
  { schema: "DisciplineOut", field: "share", scale: "fraction", kanit: "app/modules/earned_value/budget_present.py:50-51 (_share = part/total, ×100 YOK)", not: "0-1 kesir (doğrudan bütçe ÷ toplam doğrudan bütçe)." },
  { schema: "DisciplinePreviewOut", field: "share", scale: "fraction", kanit: "engine/preview.py:61,202-205; budget_present.py:240", not: "aynı _share fonksiyonu." },
  { schema: "EmployerContractDetail", field: "advance_pct", scale: "percent", kanit: "projects/models.py:205-211 CHECK ck_contract_pct_range (advance/retainage/vat BETWEEN 0 AND 100), :228-236 Numeric(5,2); contracts/schemas.py:283; contracts/service.py:449" },
  { schema: "EmployerContractDetail", field: "retainage_pct", scale: "percent", kanit: "projects/models.py:205-211,231-232" },
  { schema: "EmployerContractDetail", field: "vat_pct", scale: "percent", kanit: "projects/models.py:205-211,234-235" },
  { schema: "EquipmentCreate", field: "rate_amount", scale: "not-scale", kanit: "app/modules/equipment/schemas.py:58,93 (_MONEY alanı)", not: "tutar (birim bedel), oran/skala değil." },
  { schema: "EquipmentCreate", field: "rate_period", scale: "not-scale", kanit: "app/modules/equipment/models/enums.py:63-68 (EquipmentRatePeriod: hourly/daily/monthly)", not: "kategorik dönem enum'u (hourly/daily/monthly) — ölçek/bant DEĞİL; lider denetimiyle tüm rate_period satırları tek sınıfa çekildi" },
  { schema: "EquipmentMaintenanceBlock", field: "usage_pct", scale: "percent", kanit: "app/modules/equipment/maintenance.py:105-115 (usage_pct = used_hours/period_hours*PERCENT_MULTIPLIER)", flags: ["percentAbove100Ok"], not: "docstring: '%57. 100'ü AŞABİLİR (gecikmiş bakım)' → percentAbove100Ok." },
  { schema: "EquipmentResponse", field: "rate_amount", scale: "not-scale", kanit: "app/modules/equipment/schemas.py:150,207 (_MONEY alanı, EquipmentResponse)", not: "tutar, oran değil." },
  { schema: "EquipmentResponse", field: "rate_period", scale: "not-scale", kanit: "app/modules/equipment/models/enums.py:63-68 (EquipmentRatePeriod: hourly/daily/monthly)", not: "kategorik dönem enum'u (hourly/daily/monthly) — ölçek/bant DEĞİL; lider denetimiyle tüm rate_period satırları tek sınıfa çekildi" },
  { schema: "EquipmentUpdate", field: "rate_amount", scale: "not-scale", kanit: "app/modules/equipment/schemas.py:150 (_MONEY alanı, EquipmentUpdate)", not: "tutar, oran değil." },
  { schema: "EquipmentUpdate", field: "rate_period", scale: "not-scale", kanit: "app/modules/equipment/models/enums.py:63-68 (EquipmentRatePeriod: hourly/daily/monthly)", not: "kategorik dönem enum'u (hourly/daily/monthly) — ölçek/bant DEĞİL; lider denetimiyle tüm rate_period satırları tek sınıfa çekildi" },
  { schema: "FuelSummaryRow", field: "deviation_pct", scale: "percent", kanit: "equipment/consumption.py:127-135", flags: ["negativeOk", "percentAbove100Ok"], not: "negatifOk: 'Negatif değer normun ALTINDA kalmaktır (iyi)'." },
  { schema: "GroupOut", field: "share", scale: "fraction", kanit: "app/modules/earned_value/budget_present.py:50-51,116,132,150", not: "_share fonksiyonu, GroupOut için de aynı kaynak." },
  { schema: "InvestmentCard", field: "margin", scale: "not-scale", innerScale: "percent", kanit: "frontend kanıtı (backend bu worktree'de YOK): src/components/projects/ProjectCard.tsx:424-426 (MarginChip, formatPercent ile \"marj\" basıyor); schema.d.ts InvestmentCard.margin MetricPlaceholder zarfı", flags: ["percentAbove100Ok"], not: "TAHMİN DÜZEYİ ÖLÇÜM (madde 2 faz 2d) — backend formülü doğrulanmadı. ZARF: .value ölçüsü percent (0–100, >100 olabilir) — bu bekçinin DIŞINDA, TYPE-F1 kuyruğunda." },
  { schema: "InvestmentCard", field: "sales_ratio", scale: "not-scale", innerScale: "percent", kanit: "projects/cards.py:45,51,231; projects/schemas.py:216; projects/cost_cards.py:20; frontend ProjectCard.tsx:58 (investment.sales_ratio zarfı)", flags: ["percentAbove100Ok"], not: "BELİRSİZ: alan HER ZAMAN yer tutucu (MetricPlaceholder, restricted/pending) döner — P10 kapsamı dışı (cost_cards.py:20 'P10 kapsamı dışı, yer tutucu KALIR'); repoda 'sales_ratio' hesaplayan tek bir formül YOK. İsim 'ratio' → en olası tahmin percent, ama gerçek formül yok. ZARF: .value ölçüsü percent (0–100, >100 olabilir; boq/progress.py:53-60) — bu bekçinin DIŞINDA, TYPE-F1 kuyruğunda. value her zaman null (cards.py:51,231)." },
  { schema: "InvoiceCreate", field: "advance_rate", scale: "percent", kanit: "app/modules/invoicing/schemas.py:80 (_RATE = Field(ge=0, le=100))" },
  { schema: "InvoiceCreate", field: "retention_rate", scale: "percent", kanit: "app/modules/invoicing/schemas.py:80" },
  { schema: "InvoiceCreate", field: "withholding_rate", scale: "percent", kanit: "app/modules/invoicing/schemas.py:80" },
  { schema: "InvoiceDetailResponse", field: "advance_rate", scale: "percent", kanit: "app/modules/invoicing/schemas.py:80 (InvoiceDetailResponse(InvoiceResponse) miras alır)" },
  { schema: "InvoiceDetailResponse", field: "retention_rate", scale: "percent", kanit: "app/modules/invoicing/schemas.py:80" },
  { schema: "InvoiceDetailResponse", field: "withholding_rate", scale: "percent", kanit: "app/modules/invoicing/schemas.py:80" },
  { schema: "InvoiceLineCreate", field: "vat_rate", scale: "percent", kanit: "app/modules/invoicing/schemas.py:87 (_VAT_RATE = Field(ge=0, le=100))" },
  { schema: "InvoiceLineResponse", field: "vat_rate", scale: "percent", kanit: "app/modules/invoicing/schemas.py:87 (aynı kolon, SAKLANAN)" },
  { schema: "InvoiceResponse", field: "advance_rate", scale: "percent", kanit: "app/modules/invoicing/schemas.py:80" },
  { schema: "InvoiceResponse", field: "retention_rate", scale: "percent", kanit: "app/modules/invoicing/schemas.py:80" },
  { schema: "InvoiceResponse", field: "withholding_rate", scale: "percent", kanit: "app/modules/invoicing/schemas.py:80" },
  { schema: "InvoiceUpdate", field: "advance_rate", scale: "percent", kanit: "app/modules/invoicing/schemas.py:80" },
  { schema: "InvoiceUpdate", field: "retention_rate", scale: "percent", kanit: "app/modules/invoicing/schemas.py:80" },
  { schema: "InvoiceUpdate", field: "withholding_rate", scale: "percent", kanit: "app/modules/invoicing/schemas.py:80" },
  { schema: "ItemOut", field: "empty_rate_count", scale: "not-scale", kanit: "app/modules/earned_value/budget_present.py:113 (empty_rate_count=sum(1 for lf in i.leaves if not lf.is_rated))", not: "sayaç (COUNT)." },
  { schema: "ItemOut", field: "share", scale: "fraction", kanit: "app/modules/earned_value/budget_present.py:50-51,92 (ItemOut _Sums.share)" },
  { schema: "KpiPf", field: "pf_cum_band", scale: "enum", kanit: "app/modules/earned_value/engine/types.py:39-44 (PfBand: red/amber/green/high)", not: "değer kümesi: red, amber, green, high." },
  { schema: "KpiPf", field: "pf_week_band", scale: "enum", kanit: "app/modules/earned_value/engine/types.py:39-44", not: "değer kümesi: red, amber, green, high." },
  { schema: "KpiRowOut", field: "pf_cum_band", scale: "enum", kanit: "app/modules/earned_value/engine/types.py:39-44", not: "değer kümesi: red, amber, green, high." },
  { schema: "KpiRowOut", field: "pf_day_band", scale: "enum", kanit: "app/modules/earned_value/engine/types.py:39-44", not: "değer kümesi: red, amber, green, high." },
  { schema: "KpiRowOut", field: "pf_week_band", scale: "enum", kanit: "app/modules/earned_value/engine/types.py:39-44", not: "değer kümesi: red, amber, green, high." },
  { schema: "KpiRowOut", field: "planned_pct_cum", scale: "fraction", kanit: "report_daily.py:88-110; engine/summary.py:141,190-191; engine/plan.py:29-37", not: "fractionAboveOneOk mümkün." },
  { schema: "KpiRowOut", field: "planned_pct_day", scale: "fraction", kanit: "report_daily.py:100; engine/plan.py:29-37", not: "fractionAboveOneOk mümkün." },
  { schema: "KpiRowOut", field: "progress_pct_cum", scale: "fraction", kanit: "app/modules/earned_value/engine/numeric.py:42-45; engine/metrics.py:162", flags: ["fractionAboveOneOk"], not: "fractionAboveOneOk mümkün." },
  { schema: "KpiRowOut", field: "progress_pct_day", scale: "fraction", kanit: "app/modules/earned_value/engine/numeric.py:42-45", flags: ["fractionAboveOneOk"], not: "fractionAboveOneOk mümkün." },
  { schema: "LandShareCard", field: "construction_progress", scale: "not-scale", innerScale: "percent", kanit: "frontend kanıtı (backend bu worktree'de YOK): src/components/projects/ProjectCard.tsx:57 (\"İnşaat İlerlemesi\" satırı, formatPercent ile basılıyor); schema.d.ts LandShareCard.construction_progress MetricPlaceholder zarfı", flags: ["percentAbove100Ok"], not: "TAHMİN DÜZEYİ ÖLÇÜM (madde 2 faz 2d) — backend formülü doğrulanmadı. ZARF: .value ölçüsü percent (0–100, >100 olabilir) — bu bekçinin DIŞINDA, TYPE-F1 kuyruğunda." },
  { schema: "LandShareCard", field: "margin", scale: "not-scale", innerScale: "percent", kanit: "frontend kanıtı (backend bu worktree'de YOK): src/components/projects/ProjectCard.tsx:428-429 (MarginChip, formatPercent ile \"marj\" basıyor); schema.d.ts LandShareCard.margin MetricPlaceholder zarfı", flags: ["percentAbove100Ok"], not: "TAHMİN DÜZEYİ ÖLÇÜM (madde 2 faz 2d) — backend formülü doğrulanmadı. ZARF: .value ölçüsü percent (0–100, >100 olabilir) — bu bekçinin DIŞINDA, TYPE-F1 kuyruğunda." },
  { schema: "LandShareCard", field: "our_share_pct", scale: "percent", kanit: "app/modules/projects/models.py:273,280 (CHECK 'our_share_pct + owner_share_pct = 100', Numeric(5,2))" },
  { schema: "LandShareCard", field: "our_share_value", scale: "not-scale", kanit: "app/modules/projects/schemas.py:245 (MetricPlaceholder, Gorunurluk.para)", not: "para tutarı zarfı, oran değil." },
  { schema: "LandShareCard", field: "owner_share_pct", scale: "percent", kanit: "app/modules/projects/models.py:273,281" },
  { schema: "LandShareCard", field: "shareholder_count", scale: "not-scale", kanit: "app/modules/projects/schemas.py:247 (shareholder_count: int)", not: "sayaç (COUNT)." },
  { schema: "LandShareCard", field: "shareholders", scale: "not-scale", kanit: "app/modules/projects/schemas.py:248 (list[ShareholderResponse])", not: "liste, ölçek değil." },
  { schema: "LandShareContract", field: "our_share_pct", scale: "percent", kanit: "app/modules/projects/models.py:273,280; tüketici app/modules/projects/land_share.py:102" },
  { schema: "LandShareContract", field: "owner_share_pct", scale: "percent", kanit: "app/modules/projects/models.py:273,281; app/modules/projects/land_share.py:103" },
  { schema: "LandShareShareholderRow", field: "share_pct", scale: "percent", kanit: "app/modules/projects/models.py:304 (Numeric(5,2)); app/modules/projects/land_share.py:145,155 'OLDUĞU GİBİ döner; toplamı 100 değilse uç düzeltmez'", not: "toplamın 100 olması ZORUNLU DEĞİL (LandShareCard/Contract'taki our/owner çiftinden FARKLI: burada CHECK yok)." },
  { schema: "LandShareShareholderRow", field: "shareholder_id", scale: "not-scale", kanit: "app/modules/projects/models.py:298-304 (LandShareShareholder FK, uuid)", not: "kimlik (uuid), ölçek değil." },
  { schema: "LandShareSummaryResponse", field: "shareholders", scale: "not-scale", kanit: "app/modules/projects/land_share_schemas.py:164-178 (list[LandShareShareholderRow])", not: "liste, ölçek değil." },
  { schema: "LandShareUnitRow", field: "shareholder_id", scale: "not-scale", kanit: "app/modules/projects/land_share_schemas.py:196 (shareholder_id: uuid | None)", not: "kimlik (uuid), ölçek değil." },
  { schema: "LandShareUnitRow", field: "shareholder_name", scale: "not-scale", kanit: "app/modules/projects/land_share_schemas.py:197 (shareholder_name: str | None)", not: "ad (dizge), ölçek değil." },
  { schema: "LandShareValueBalance", field: "deviation_pct", scale: "percent", kanit: "app/modules/projects/land_share_balance.py:121-122 (deviation = our_actual - our_share_pct)", flags: ["negativeOk", "percentBelowOneOk"], not: "negatifOk (sapma işaretlidir, mutlak değere indirgenmez). TEST-F2/B ÖLÇÜMÜ: mock deviation_pct=0.xx döndürüyor (our_actual_pct - our_share_pct farkı, land_share_balance.py:121-122) — fikstürde iki taraf birbirine yakın, deviation küçük; ÷100 hatası DEĞİL (percentBelowOneOk)." },
  { schema: "LandShareValueBalance", field: "our_actual_pct", scale: "percent", kanit: "app/modules/projects/land_share_balance.py:121 (our_actual = our_value/assigned_total*100)" },
  { schema: "LandShareValueBalance", field: "owner_actual_pct", scale: "percent", kanit: "app/modules/projects/land_share_balance.py:127 (owner_actual_pct = 100 - our_actual)" },
  { schema: "LandShareValueBalance", field: "tolerance_pct", scale: "percent", kanit: "app/modules/projects/land_share_balance.py:29 (LAND_SHARE_VALUE_TOLERANCE_PCT = Decimal('1.0')); kullanım satır 117,130,133", flags: ["percentBelowOneOk"], not: "sabit eşik değeri (%1,0), Gorunurluk.kimlik etiketli. TEST-F2/B ÖLÇÜMÜ: mock her zaman \"1.00\" döner — backend sabiti LAND_SHARE_VALUE_TOLERANCE_PCT=1.0 ile BİREBİR (land_share_balance.py:29); ÷100 hatası DEĞİL, sabit eşik (percentBelowOneOk)." },
  { schema: "LeafOut", field: "rate_source", scale: "not-scale", kanit: "app/modules/earned_value/models.py:73-78 (RateSource: catalog/history/manual)", not: "kategorik kaynak sınıflandırması (oranın NEREDEN geldiği), bant/skala enum'u değil." },
  { schema: "LeafOut", field: "share", scale: "fraction", kanit: "app/modules/earned_value/budget_present.py:50-51,92 (LeafOut.share)" },
  { schema: "LeafPatch", field: "rate_source", scale: "not-scale", kanit: "app/modules/earned_value/models.py:73-78 (RateSource)", not: "aynı kategorik enum, PATCH gövdesinde." },
  { schema: "LeaveBalanceResponse", field: "usage_pct", scale: "percent", kanit: "personnel/leave.py:151-179; personnel/service/leave_decisions.py:89-90,105-140,265-270; personnel/models.py:435; personnel/schemas.py:526,551; frontend leaves-derive.ts:212-213 (Math.min(...,100) kırpar — yüzde bekliyor, tutarlı)", flags: ["percentAbove100Ok"], not: "BELİRSİZ: integer'a ROUND_HALF_UP ile yuvarlanır (docstring örneği: 6/17=%35.29→35); kullanım hak+devri aşarsa >100 olabilir mi ölçülmedi." },
  { schema: "OfferCreate", field: "overhead_pct", scale: "percent", kanit: "app/modules/offers/offer_schemas.py Pct (ge=0 le=MAX_PCT=100, Numeric(5,2); models.py:56-59 CHECK 0-100)", not: "yüzde birimi (12 = %12); gönderilmezse offer_settings'ten kopyalanır" },
  { schema: "OfferCreate", field: "profit_pct", scale: "percent", kanit: "app/modules/offers/offer_schemas.py ProfitPct (ge=0 le=MAX_PROFIT_PCT=999.99, Numeric(6,2); models.py:56-59 CHECK 0-999.99)", flags: ["percentAbove100Ok"] },
  { schema: "OfferCreate", field: "vat_pct", scale: "percent", kanit: "app/modules/offers/offer_schemas.py Pct (ge=0 le=MAX_PCT=100, Numeric(5,2); models.py:56-59 CHECK 0-100)" },
  { schema: "OfferInternalTotalsRead", field: "profit_pct", scale: "percent", kanit: "app/modules/offers/calc.py:calc_revision (genel kâr % = ROUND(Σkâr/(Σmaliyet+ΣGG)×100, 2); payda 0 ise None) + offer_read_schemas.py OfferInternalTotalsRead (Gorunurluk.para)", flags: ["negativeOk", "percentAbove100Ok"], not: "elle B.F. maliyetin altındaysa kâr negatif olabilir; üst sınır yok (türev)" },
  { schema: "OfferItemCreate", field: "overhead_pct", scale: "percent", kanit: "app/modules/offers/offer_schemas.py Pct (ge=0 le=MAX_PCT=100, Numeric(5,2); models.py:56-59 CHECK 0-100)" },
  { schema: "OfferItemCreate", field: "profit_pct", scale: "percent", kanit: "app/modules/offers/offer_schemas.py ProfitPct (ge=0 le=MAX_PROFIT_PCT=999.99, Numeric(6,2); models.py:56-59 CHECK 0-999.99)", flags: ["percentAbove100Ok"] },
  { schema: "OfferItemInternalRead", field: "profit_pct", scale: "percent", kanit: "app/modules/offers/calc.py:calc_item (elle B.F. varsa TÜREV = ROUND((B.F./(c×(1+g))−1)×100, 2), c=0 ise None; yoksa uygulanan kâr %) + offer_read_schemas.py OfferItemInternalRead (Gorunurluk.para)", flags: ["negativeOk", "percentAbove100Ok"], not: "türev kâr % negatif/100 üstü olabilir" },
  { schema: "OfferItemRead", field: "overhead_pct", scale: "percent", kanit: "app/modules/offers/offer_schemas.py Pct (ge=0 le=MAX_PCT=100, Numeric(5,2); models.py:56-59 CHECK 0-100)", not: "kalem değeri; null = revizyon geneli" },
  { schema: "OfferItemRead", field: "profit_pct", scale: "percent", kanit: "app/modules/offers/offer_schemas.py ProfitPct (ge=0 le=MAX_PROFIT_PCT=999.99, Numeric(6,2); models.py:56-59 CHECK 0-999.99)", flags: ["percentAbove100Ok"], not: "kalem değeri; null = revizyon geneli" },
  { schema: "OfferItemUpdate", field: "overhead_pct", scale: "percent", kanit: "app/modules/offers/offer_schemas.py Pct (ge=0 le=MAX_PCT=100, Numeric(5,2); models.py:56-59 CHECK 0-100)" },
  { schema: "OfferItemUpdate", field: "profit_pct", scale: "percent", kanit: "app/modules/offers/offer_schemas.py ProfitPct (ge=0 le=MAX_PROFIT_PCT=999.99, Numeric(6,2); models.py:56-59 CHECK 0-999.99)", flags: ["percentAbove100Ok"] },
  { schema: "OfferListSummaryRead", field: "win_rate", scale: "percent", kanit: "app/modules/offers/offer_queries.py:_win_rate (kazanılan×100/(kazanılan+kaybedilen), quantize 0.01; payda 0 ise None) + Gorunurluk.kimlik", not: "0-100; yüzde" },
  { schema: "OfferRevisionRead", field: "overhead_pct", scale: "percent", kanit: "app/modules/offers/offer_schemas.py Pct (ge=0 le=MAX_PCT=100, Numeric(5,2); models.py:56-59 CHECK 0-100)" },
  { schema: "OfferRevisionRead", field: "profit_pct", scale: "percent", kanit: "app/modules/offers/offer_schemas.py ProfitPct (ge=0 le=MAX_PROFIT_PCT=999.99, Numeric(6,2); models.py:56-59 CHECK 0-999.99)", flags: ["percentAbove100Ok"] },
  { schema: "OfferRevisionRead", field: "vat_pct", scale: "percent", kanit: "app/modules/offers/offer_schemas.py Pct (ge=0 le=MAX_PCT=100, Numeric(5,2); models.py:56-59 CHECK 0-100)" },
  { schema: "OfferRevisionUpdate", field: "overhead_pct", scale: "percent", kanit: "app/modules/offers/offer_schemas.py Pct (ge=0 le=MAX_PCT=100, Numeric(5,2); models.py:56-59 CHECK 0-100)" },
  { schema: "OfferRevisionUpdate", field: "profit_pct", scale: "percent", kanit: "app/modules/offers/offer_schemas.py ProfitPct (ge=0 le=MAX_PROFIT_PCT=999.99, Numeric(6,2); models.py:56-59 CHECK 0-999.99)", flags: ["percentAbove100Ok"] },
  { schema: "OfferRevisionUpdate", field: "vat_pct", scale: "percent", kanit: "app/modules/offers/offer_schemas.py Pct (ge=0 le=MAX_PCT=100, Numeric(5,2); models.py:56-59 CHECK 0-100)" },
  { schema: "OfferSettingsRead", field: "default_overhead_pct", scale: "percent", kanit: "app/modules/offers/schemas.py OfferSettingsRead + models.py DEFAULT_OVERHEAD_PCT=12.00 (Numeric(5,2), CHECK 0-100)" },
  { schema: "OfferSettingsRead", field: "default_profit_pct", scale: "percent", kanit: "app/modules/offers/schemas.py OfferSettingsRead + models.py DEFAULT_PROFIT_PCT=15.00 (Numeric(6,2), CHECK 0-999.99)", flags: ["percentAbove100Ok"] },
  { schema: "OfferSettingsRead", field: "default_vat_pct", scale: "percent", kanit: "app/modules/offers/schemas.py OfferSettingsRead + models.py DEFAULT_VAT_PCT=20.00 (Numeric(5,2), CHECK 0-100)" },
  { schema: "OfferSettingsUpdate", field: "default_overhead_pct", scale: "percent", kanit: "app/modules/offers/schemas.py:28 (Field(ge=0, le=MAX_PCT, max_digits=5, decimal_places=2))" },
  { schema: "OfferSettingsUpdate", field: "default_profit_pct", scale: "percent", kanit: "app/modules/offers/schemas.py:29 (Field(ge=0, le=MAX_PROFIT_PCT, max_digits=6, decimal_places=2))", flags: ["percentAbove100Ok"] },
  { schema: "OfferSettingsUpdate", field: "default_vat_pct", scale: "percent", kanit: "app/modules/offers/schemas.py:30 (Field(ge=0, le=MAX_PCT, max_digits=5, decimal_places=2))" },
  { schema: "PanelKpi", field: "pf_cum_band", scale: "enum", kanit: "app/modules/earned_value/engine/types.py:39-44", not: "değer kümesi: red, amber, green, high." },
  { schema: "PanelKpi", field: "pf_week_band", scale: "enum", kanit: "app/modules/earned_value/engine/types.py:39-44", not: "değer kümesi: red, amber, green, high." },
  { schema: "PanelKpi", field: "planned_pct_cum", scale: "fraction", kanit: "report_panel.py:191-206; engine/series.py:205-216,341-355; engine/plan.py:29-37", not: "fractionAboveOneOk mümkün." },
  { schema: "PanelKpi", field: "progress_pct_cum", scale: "fraction", kanit: "app/modules/earned_value/engine/numeric.py:42-45", flags: ["fractionAboveOneOk"], not: "fractionAboveOneOk mümkün." },
  { schema: "PanelReport", field: "pf_bands", scale: "not-scale", kanit: "app/modules/earned_value/schemas_reports.py:65-70 (PfBandsOut iç içe şema)", not: "nested obje, ölçek değil." },
  { schema: "PanelRow", field: "pf_cum_band", scale: "enum", kanit: "app/modules/earned_value/engine/types.py:39-44", not: "değer kümesi: red, amber, green, high." },
  { schema: "PanelRow", field: "pf_week_band", scale: "enum", kanit: "app/modules/earned_value/engine/types.py:39-44", not: "değer kümesi: red, amber, green, high." },
  { schema: "PanelRow", field: "planned_pct_cum", scale: "fraction", kanit: "report_panel.py:141-160,210-230,272-290; engine/plan.py:57-67; engine/metrics.py:165", not: "fractionAboveOneOk mümkün." },
  { schema: "PanelRow", field: "progress_pct_cum", scale: "fraction", kanit: "app/modules/earned_value/engine/numeric.py:42-45", flags: ["fractionAboveOneOk"], not: "fractionAboveOneOk mümkün." },
  { schema: "PayrollRateResponse", field: "income_tax_pct", scale: "percent", kanit: "app/modules/payroll/schemas.py:414 (Rate = Field(ge=0, le=100))" },
  { schema: "PayrollRateResponse", field: "sgk_employee_pct", scale: "percent", kanit: "app/modules/payroll/schemas.py:414" },
  { schema: "PayrollRateResponse", field: "sgk_employer_pct", scale: "percent", kanit: "app/modules/payroll/schemas.py:414" },
  { schema: "PayrollRateResponse", field: "short_work_pct", scale: "percent", kanit: "app/modules/payroll/schemas.py:414", flags: ["percentBelowOneOk"], not: "TEST-F2/B ÖLÇÜMÜ: mock her zaman \"0.000\" döner (K2, PAYROLL_SHORT_WORK_PCT) — kısa çalışma ödeneği oranı backend seed'inde GERÇEKTEN sıfır; ÷100 hatası DEĞİL (percentBelowOneOk)." },
  { schema: "PayrollRateResponse", field: "stamp_tax_pct", scale: "percent", kanit: "app/modules/payroll/schemas.py:414", flags: ["percentBelowOneOk"], not: "TEST-F2/B ÖLÇÜMÜ: mock \"0.759\" döner (PAYROLL_RATE_SEEDS) — gerçek SGK damga vergisi oranı %0,759; ÷100 hatası DEĞİL (percentBelowOneOk)." },
  { schema: "PayrollRateResponse", field: "unemployment_employee_pct", scale: "percent", kanit: "app/modules/payroll/schemas.py:414", flags: ["percentBelowOneOk"], not: "TEST-F2/B ÖLÇÜMÜ: mock \"1.000\" döner (PAYROLL_RATE_SEEDS) — gerçek işsizlik sigortası işçi payı %1; ÷100 hatası DEĞİL (percentBelowOneOk)." },
  { schema: "PayrollRateResponse", field: "unemployment_employer_pct", scale: "percent", kanit: "app/modules/payroll/schemas.py:414" },
  { schema: "PayrollRateUpdate", field: "income_tax_pct", scale: "percent", kanit: "app/modules/payroll/schemas.py:414 (Rate); PayrollRateUpdate.income_tax_pct None olabilir (K3 dilimli motor)", not: "income_tax_pct=None dilimli vergi rejimi anlamına gelir, 0 SAYILMAZ (model_validator _isci_paylari_yuzu_asamaz)." },
  { schema: "PayrollRateUpdate", field: "sgk_employee_pct", scale: "percent", kanit: "app/modules/payroll/schemas.py:414" },
  { schema: "PayrollRateUpdate", field: "sgk_employer_pct", scale: "percent", kanit: "app/modules/payroll/schemas.py:414" },
  { schema: "PayrollRateUpdate", field: "short_work_pct", scale: "percent", kanit: "app/modules/payroll/schemas.py:414" },
  { schema: "PayrollRateUpdate", field: "stamp_tax_pct", scale: "percent", kanit: "app/modules/payroll/schemas.py:414" },
  { schema: "PayrollRateUpdate", field: "unemployment_employee_pct", scale: "percent", kanit: "app/modules/payroll/schemas.py:414" },
  { schema: "PayrollRateUpdate", field: "unemployment_employer_pct", scale: "percent", kanit: "payroll/schemas.py:412 (Rate le=100) + schemas.py:414-422 ('İşveren kalemleri KASTEN dışarıdadır') + compute.py:105-106 (employer alanları) + compute.py:178 (/PERCENT_DIVISOR)" },
  { schema: "PayrollSgkSummaryResponse", field: "unknown_rate_count", scale: "not-scale", kanit: "app/modules/payroll/sgk.py:200 (unknown_rate_count += 1) — sayaç, oran değil", not: "integer counter" },
  { schema: "PayrollSummaryResponse", field: "bank_pct", scale: "percent", kanit: "app/modules/payroll/summary.py:79-87 (_pct: part/whole*100, PCT_QUANTUM ile yuvarlanır) + summary.py:141 (bank_pct=_pct(...))", not: "whole=0 iken null (sahte %0 değil)" },
  { schema: "PayrollSummaryResponse", field: "cash_pct", scale: "percent", kanit: "app/modules/payroll/summary.py:79-87 (_pct) + summary.py:144 (cash_pct=_pct(...))", not: "whole=0 iken null" },
  { schema: "PayrollTaxBracketInput", field: "rate_pct", scale: "percent", kanit: "app/modules/payroll/schemas.py:414 (Rate = Annotated[Decimal, Field(ge=0, le=100, ...)]) — rate_pct: Rate (satır 536)" },
  { schema: "PayrollTaxBracketResponse", field: "rate_pct", scale: "percent", kanit: "app/modules/payroll/schemas.py:414 (Rate tipi, ge=0 le=100) — Response.rate_pct aynı tipten kolon (satır 589)" },
  { schema: "ProgressBlock", field: "duration_pct", scale: "percent", kanit: "app/modules/progress_payments/calculations.py:203-216 (duration_pct: elapsed/total*100, 0-100 arası clamp)", not: "0-100 arasına kırpılır (clamp), aşım/negatif OLAMAZ" },
  { schema: "ProgressBlock", field: "financial_pct", scale: "percent", kanit: "app/modules/progress_payments/service.py:601-603 (financial_pct = cumulative_gross/contract.amount*_HUNDRED, _HUNDRED=Decimal('100') satır 46)", flags: ["percentAbove100Ok"], not: "aşım >100 mümkün (klips yok), contract.amount<=0 ise null" },
  { schema: "ProgressBlock", field: "physical_pct", scale: "percent", kanit: "app/modules/progress_payments/service.py:605-608 (physical_pct = physical_numerator/denominator*_HUNDRED)", flags: ["percentAbove100Ok"], not: "aşım >100 mümkün" },
  { schema: "ProgressPaymentDetail", field: "advance_pct", scale: "percent", kanit: "app/modules/progress_payments/models.py:62-64 (CHECK advance_pct BETWEEN 0 AND 100) + models.py:110 (Numeric(5,2))" },
  { schema: "ProgressPaymentDetail", field: "retainage_pct", scale: "percent", kanit: "app/modules/progress_payments/models.py:62-64 (CHECK retainage_pct BETWEEN 0 AND 100) + models.py:111" },
  { schema: "ProgressPaymentDetail", field: "vat_pct", scale: "percent", kanit: "app/modules/progress_payments/models.py:62-64 (CHECK vat_pct BETWEEN 0 AND 100) + models.py:109" },
  { schema: "ProgressPaymentSummary", field: "progress_pct", scale: "percent", kanit: "app/modules/progress_payments/summary.py:36-44 (progress_pct: cumulative_gross/contract_amount*_HUNDRED)", flags: ["percentAbove100Ok"], not: "aşım >100 mümkün, kırpma YOK; contract_amount<=0 ise null" },
  { schema: "ProjectContractInput", field: "advance_pct", scale: "percent", kanit: "app/modules/projects/schemas.py:619 (Field(default=Decimal('20'), ge=0, le=100))" },
  { schema: "ProjectContractInput", field: "retainage_pct", scale: "percent", kanit: "app/modules/projects/schemas.py:620 (Field(default=Decimal('5'), ge=0, le=100))" },
  { schema: "ProjectContractInput", field: "vat_pct", scale: "percent", kanit: "app/modules/projects/schemas.py:621 (Field(default=Decimal('20'), ge=0, le=100))" },
  { schema: "ProjectContractResponse", field: "advance_pct", scale: "percent", kanit: "app/modules/projects/models.py:208-234 (CHECK advance_pct BETWEEN 0 AND 100, kolon)" },
  { schema: "ProjectContractResponse", field: "retainage_pct", scale: "percent", kanit: "app/modules/projects/models.py:208-234 (CHECK retainage_pct BETWEEN 0 AND 100)" },
  { schema: "ProjectContractResponse", field: "vat_pct", scale: "percent", kanit: "app/modules/projects/models.py:208-234 (CHECK vat_pct BETWEEN 0 AND 100)" },
  { schema: "ProjectCreate", field: "land_share", scale: "not-scale", kanit: "app/modules/projects/schemas.py:587-590 (ProjectLandShareInput — nesne, skaler alan değil; iç alanları our_share_pct/owner_share_pct ayrı satırlarda)", not: "alan tipi nesne (ProjectLandShareInput), skaler değil" },
  { schema: "ProjectDetailResponse", field: "land_share", scale: "not-scale", kanit: "app/modules/projects/schemas.py:231-234 (LandShareCard — nesne)", not: "alan tipi nesne (LandShareCard)" },
  { schema: "ProjectDetailResponse", field: "progress_pct", scale: "percent", kanit: "app/modules/projects/models.py:172 (progress_pct: Mapped[Decimal] = mapped_column(Numeric(5,2), default=0)) — ProjectListItem'dan miras", not: "ProjectListItem.progress_pct ile aynı kolon (miras)" },
  { schema: "ProjectLandShareInput", field: "our_share_pct", scale: "percent", kanit: "app/modules/projects/schemas.py:589 (Field(gt=0, lt=100)) + schemas.py:602 (our_share_pct+owner_share_pct==100 kuralı)" },
  { schema: "ProjectLandShareInput", field: "owner_share_pct", scale: "percent", kanit: "app/modules/projects/schemas.py:590 (Field(gt=0, lt=100)) + schemas.py:602" },
  { schema: "ProjectLandShareInput", field: "shareholders", scale: "not-scale", kanit: "app/modules/projects/schemas.py:587-590 (shareholders: list[ShareholderInput] — dizi alanı, skaler değil)", not: "alan tipi dizi (array<ShareholderInput>)" },
  { schema: "ProjectListItem", field: "land_share", scale: "not-scale", kanit: "app/modules/projects/schemas.py:231-234 (LandShareCard — nesne)", not: "alan tipi nesne" },
  { schema: "ProjectListItem", field: "progress_pct", scale: "percent", kanit: "app/modules/projects/models.py:172 (Numeric(5,2), default=0) + service.py:129 (progress_pct=project.progress_pct)" },
  { schema: "ProjectProfitProjection", field: "margin_pct", scale: "percent", kanit: "app/modules/projects/costs.py:112-117 (_margin_pct = profit/revenue*_HUNDRED)", flags: ["negativeOk"], not: "negatifOk (kâr negatifse marj negatif); revenue<=0 ise null" },
  { schema: "ProjectUpdate", field: "land_share", scale: "not-scale", kanit: "app/modules/projects/schemas.py:587-590 (ProjectLandShareInput — nesne)", not: "alan tipi nesne" },
  { schema: "QtyTreeRow", field: "pf_cum_band", scale: "enum", kanit: "app/modules/earned_value/engine/types.py:39-44 (class PfBand(str, enum.Enum): RED/AMBER/GREEN/HIGH)", not: "bant kümesi: red|amber|green|high" },
  { schema: "QtyTreeRow", field: "pf_day_band", scale: "enum", kanit: "app/modules/earned_value/engine/types.py:39-44 (PfBand enum)", not: "bant kümesi: red|amber|green|high" },
  { schema: "QtyTreeRow", field: "progress_pct_cum", scale: "fraction", kanit: "app/modules/earned_value/engine/numeric.py:42-45 (ratio: numerator/denominator, *100 YOK)", flags: ["fractionAboveOneOk"], not: "fractionAboveOneOk (bütçe aşımı numerator>denominator olabilir)" },
  { schema: "QurrReport", field: "generated_at", scale: "not-scale", kanit: "app/modules/earned_value/schemas_reports.py:168 (generated_at: datetime | None) — zaman damgası, oran değil" },
  { schema: "QurrReport", field: "pf_bands", scale: "not-scale", kanit: "app/modules/earned_value/schemas_reports.py:65-67 (PfBandsOut — nesne, günlük+kümülatif bant çifti taşır)", not: "alan tipi nesne (PfBandsOut), skaler değil" },
  { schema: "QurrRow", field: "changed_rate", scale: "not-scale", kanit: "app/modules/earned_value/schemas_reports.py:108 (changed_rate: bool  # m != n)", not: "boolean bayrak, oran DEĞİL — isim 'rate' içeriyor ama m!=n karşılaştırma sonucu" },
  { schema: "QurrRow", field: "q_band", scale: "enum", kanit: "app/modules/earned_value/engine/types.py:39-44 (PfBand enum) + schemas_reports.py:105" },
  { schema: "QurrRow", field: "r_band", scale: "enum", kanit: "app/modules/earned_value/engine/types.py:39-44 (PfBand enum) + schemas_reports.py:106" },
  { schema: "QurrTotal", field: "q_band", scale: "enum", kanit: "app/modules/earned_value/engine/types.py:39-44 (PfBand enum) + schemas_reports.py:121" },
  { schema: "QurrTotal", field: "r_band", scale: "enum", kanit: "app/modules/earned_value/engine/types.py:39-44 (PfBand enum) + schemas_reports.py:122" },
  { schema: "RentalInvoiceCreate", field: "rate_period", scale: "not-scale", kanit: "app/modules/equipment/models/enums.py:63-68 (EquipmentRatePeriod: hourly/daily/monthly)", not: "kategorik dönem enum'u (hourly/daily/monthly) — ölçek/bant DEĞİL; lider denetimiyle tüm rate_period satırları tek sınıfa çekildi" },
  { schema: "RentalInvoiceCreate", field: "vat_rate", scale: "percent", kanit: "app/modules/equipment/rental_schemas.py:45 (_VAT_RATE = Field(default=DEFAULT_VAT_RATE, ge=0, le=100, ...)) — satır 74" },
  { schema: "RentalInvoiceDetailResponse", field: "rate_period", scale: "not-scale", kanit: "app/modules/equipment/models/enums.py:63-68 (EquipmentRatePeriod: hourly/daily/monthly)", not: "kategorik dönem enum'u (hourly/daily/monthly) — ölçek/bant DEĞİL; lider denetimiyle tüm rate_period satırları tek sınıfa çekildi" },
  { schema: "RentalInvoiceDetailResponse", field: "vat_rate", scale: "percent", kanit: "app/modules/equipment/models/rental.py:85-86 (CHECK vat_rate>=0 AND vat_rate<=100) + models/rental.py:149" },
  { schema: "RentalInvoiceLineResponse", field: "effective_rate_amount", scale: "not-scale", kanit: "app/modules/equipment/rental_schemas.py:117 (M5:93 'Kira B.F. ₺' — birim fiyat/TUTAR, oran değil)", not: "para tutarı (rate=birim fiyat), 'rate' adı yanıltıcı" },
  { schema: "RentalInvoiceLineResponse", field: "rate_amount", scale: "not-scale", kanit: "app/modules/equipment/rental_schemas.py:102 (M5:93 'Kira B.F. ₺') + models/rental.py:212-213 (CHECK rate_amount>=0, money)", not: "para tutarı (birim fiyat)" },
  { schema: "RentalInvoiceLineUpdate", field: "rate_amount", scale: "not-scale", kanit: "app/modules/equipment/rental_schemas.py:44-45,110 (_MONEY = Field(ge=0, max_digits=18, decimal_places=2))", not: "para tutarı" },
  { schema: "RentalInvoiceResponse", field: "rate_period", scale: "not-scale", kanit: "app/modules/equipment/models/enums.py:63-68 (EquipmentRatePeriod: hourly/daily/monthly)", not: "kategorik dönem enum'u (hourly/daily/monthly) — ölçek/bant DEĞİL; lider denetimiyle tüm rate_period satırları tek sınıfa çekildi" },
  { schema: "RentalInvoiceResponse", field: "vat_rate", scale: "percent", kanit: "app/modules/equipment/models/rental.py:85-86,149 (CHECK 0-100, Numeric)" },
  { schema: "RentalInvoiceTotals", field: "vat_rate", scale: "percent", kanit: "app/modules/equipment/models/rental.py:85-86 (CHECK vat_rate BETWEEN 0 AND 100) — fatura başlığından yansıtılır (K1: invoice_amount+vat_rate'ten türer)" },
  { schema: "RentalInvoiceUpdate", field: "rate_period", scale: "not-scale", kanit: "app/modules/equipment/models/enums.py:63-68 (EquipmentRatePeriod: hourly/daily/monthly)", not: "kategorik dönem enum'u (hourly/daily/monthly) — ölçek/bant DEĞİL; lider denetimiyle tüm rate_period satırları tek sınıfa çekildi" },
  { schema: "RentalInvoiceUpdate", field: "vat_rate", scale: "percent", kanit: "app/modules/equipment/rental_schemas.py:46 (_VAT_RATE_OPTIONAL = Field(default=None, ge=0, le=100, ...)) — satır 96" },
  { schema: "RowPatternOut", field: "shares", scale: "not-scale", kanit: "app/modules/earned_value/schemas_day.py:171-173 (shares: list[ShareOut] — dizi alanı)", not: "alan tipi dizi; iç eleman ShareOut.share fraction'dır (bkz. o satır)" },
  { schema: "SectionDetailResponse", field: "progress_pct", scale: "not-scale", innerScale: "percent", kanit: "app/modules/projects/schemas.py:83-116 (MetricPlaceholder — zarf nesnesi: available/value/pending_module)", flags: ["percentAbove100Ok"], not: "alan tipi MetricPlaceholder (nesne zarfı), skaler değil; iç .value alanı muhtemelen percent ama bu satırın kapsamı dışında ZARF: .value ölçüsü percent (0–100, >100 olabilir; boq/progress.py:53-60) — bu bekçinin DIŞINDA, TYPE-F1 kuyruğunda." },
  { schema: "SectionResponse", field: "progress_pct", scale: "not-scale", innerScale: "percent", kanit: "app/modules/projects/schemas.py:83-116 (MetricPlaceholder zarfı)", flags: ["percentAbove100Ok"], not: "alan tipi MetricPlaceholder (nesne) ZARF: .value ölçüsü percent (0–100, >100 olabilir; boq/progress.py:53-60) — bu bekçinin DIŞINDA, TYPE-F1 kuyruğunda." },
  { schema: "SettingsPreview", field: "pf_day_band", scale: "enum", kanit: "app/modules/earned_value/engine/types.py:39-44 (PfBand enum) + schemas_reports.py:441" },
  { schema: "SettingsPreview", field: "pf_week_band", scale: "enum", kanit: "app/modules/earned_value/engine/types.py:39-44 (PfBand enum) + schemas_reports.py:442" },
  { schema: "SettingsRead", field: "pf_bands", scale: "not-scale", kanit: "app/modules/earned_value/schemas_settings.py:124-132 (pf_bands: PfBands — nesne, günlük/kümülatif eşik çifti)", not: "alan tipi nesne (PfBands)" },
  { schema: "SettingsSave", field: "pf_bands", scale: "not-scale", kanit: "app/modules/earned_value/schemas_settings.py:105-114 (pf_bands: PfBands — nesne)", not: "alan tipi nesne" },
  { schema: "ShareOut", field: "share", scale: "fraction", kanit: "app/modules/earned_value/schemas_day.py:166-168 (share: EvDecimal  # satirin saatinin o koda dusen payi (0-1))", not: "docstring açıkça 0-1 diyor" },
  { schema: "ShareholderInput", field: "share_pct", scale: "percent", kanit: "app/modules/projects/schemas.py:584 (share_pct: Decimal = Field(gt=0, le=100))" },
  { schema: "ShareholderResponse", field: "share_pct", scale: "percent", kanit: "app/modules/projects/schemas.py:228 (share_pct: Annotated[Decimal, Gorunurluk.kimlik]) — ShareholderInput ile aynı kaynaktan (gt=0, le=100)" },
  { schema: "SiteCard", field: "progress_pct", scale: "not-scale", innerScale: "percent", kanit: "app/modules/projects/schemas.py:83-116 (MetricPlaceholder zarfı)", flags: ["percentAbove100Ok"], not: "alan tipi MetricPlaceholder (nesne) ZARF: .value ölçüsü percent (0–100, >100 olabilir; boq/progress.py:53-60) — bu bekçinin DIŞINDA, TYPE-F1 kuyruğunda." },
  { schema: "SiteDetailResponse", field: "progress_pct", scale: "not-scale", innerScale: "percent", kanit: "app/modules/projects/schemas.py:83-116 (MetricPlaceholder zarfı)", flags: ["percentAbove100Ok"], not: "alan tipi MetricPlaceholder (nesne) ZARF: .value ölçüsü percent (0–100, >100 olabilir; boq/progress.py:53-60) — bu bekçinin DIŞINDA, TYPE-F1 kuyruğunda." },
  { schema: "SiteDiarySummaryItem", field: "completion_ratio", scale: "fraction", kanit: "app/modules/site_diary/summary.py:46-52 (_completion_ratio = quantity/boq_quantity, *100 YOK, quantize(_RATIO_STEP=0.0001))", flags: ["fractionAboveOneOk"], not: "BELİRSİZ: mockup etiketi '%' der ama backend değeri 0-1 fraction'dır (frontend çarpıyor olabilir) — fractionAboveOneOk (aşan iş kalemi mümkün)" },
  { schema: "SubcontractorContractCreate", field: "advance_pct", scale: "percent", kanit: "app/modules/contracts/schemas.py:573 (Field(default=Decimal('10'), ge=0, le=100))" },
  { schema: "SubcontractorContractCreate", field: "retainage_pct", scale: "percent", kanit: "app/modules/contracts/schemas.py:574 (Field(default=Decimal('5'), ge=0, le=100))" },
  { schema: "SubcontractorContractCreate", field: "vat_pct", scale: "percent", kanit: "app/modules/contracts/schemas.py:576 (vat_pct: RequiredVatRate = Decimal('20'))", not: "küme {1,10,20} (units.schemas._ALLOWED_VAT_RATES)" },
  { schema: "SubcontractorContractDetail", field: "advance_pct", scale: "percent", kanit: "app/modules/contracts/schemas.py:634 + models(subcontractor_contracts) CHECK 0-100 (aynı desen progress_payments/models.py ile)" },
  { schema: "SubcontractorContractDetail", field: "retainage_pct", scale: "percent", kanit: "app/modules/contracts/schemas.py:635" },
  { schema: "SubcontractorContractDetail", field: "vat_pct", scale: "percent", kanit: "app/modules/contracts/schemas.py:636" },
  { schema: "SubcontractorContractUpdate", field: "advance_pct", scale: "percent", kanit: "app/modules/contracts/schemas.py:600 (Field(default=None, ge=0, le=100))" },
  { schema: "SubcontractorContractUpdate", field: "retainage_pct", scale: "percent", kanit: "app/modules/contracts/schemas.py:601 (Field(default=None, ge=0, le=100))" },
  { schema: "SubcontractorContractUpdate", field: "vat_pct", scale: "percent", kanit: "app/modules/contracts/schemas.py:602 (vat_pct: VatRate = None)", not: "küme {1,10,20}" },
  { schema: "SubcontractorCostRow", field: "progress_pct", scale: "percent", kanit: "app/modules/projects/cost_summary.py:178-187 (progress_pct=financial_progress_pct(totals.paid, contract_amount) — progress_payments.summary.progress_pct'i ÇAĞIRIR)", flags: ["percentAbove100Ok"], not: "aynı formül progress_payments.summary.progress_pct ile (K3, kopya değil çağrı); aşım >100 mümkün" },
  { schema: "SubcontractorProgressPaymentDetail", field: "advance_pct", scale: "percent", kanit: "app/modules/subcontractor_progress_payments/models.py:78-80 (CHECK 0-100) + models.py:132" },
  { schema: "SubcontractorProgressPaymentDetail", field: "retainage_pct", scale: "percent", kanit: "app/modules/subcontractor_progress_payments/models.py:78-80 (CHECK 0-100) + models.py:133" },
  { schema: "SubcontractorProgressPaymentDetail", field: "vat_pct", scale: "percent", kanit: "app/modules/subcontractor_progress_payments/models.py:78-80 (CHECK 0-100) + models.py:131" },
  { schema: "TrendPoint", field: "planned_pct_cum", scale: "fraction", kanit: "earned_value/engine/plan.py:28-36 (planned_pct = cum/total) + series.py:205-212,344,356 + budget_snapshot.py:205-207 + models.py:458 (budget_mhr >= 0), 490-493 ('Sifir gunler YAZILMAZ')", not: "fractionAboveOneOk" },
  { schema: "TrendPoint", field: "progress_pct_cum", scale: "fraction", kanit: "app/modules/earned_value/engine/numeric.py:42-45 (ratio) + engine/metrics.py:162 (progress_pct_cum=ratio(ec, budget))", flags: ["fractionAboveOneOk"], not: "fractionAboveOneOk" },
  { schema: "UnitAllocationItem", field: "shareholder_id", scale: "not-scale", kanit: "app/modules/units/schemas.py:506 (shareholder_id: uuid.UUID | None) — kimlik alanı" },
  { schema: "UnitBulkCreate", field: "floor_price_increase_pct", scale: "percent", kanit: "app/modules/units/schemas.py:568-570 (Field(default=None, ge=0, le=100, ...))  # TU 138 'Kat basina %1.5'" },
  { schema: "UnitCreate", field: "vat_rate", scale: "percent", kanit: "app/modules/units/schemas.py:106-110 (VatRate = Annotated[Decimal|None, Field(ge=0,...), AfterValidator(_check_vat_rate)]) + satır 92 (_ALLOWED_VAT_RATES=(1,10,20))", not: "küme {1,10,20}" },
  { schema: "UnitResponse", field: "is_landowner_share", scale: "not-scale", kanit: "app/modules/units/schemas.py:295-298 (computed_field: owner_side is UnitOwnerSide.landowner) — boolean" },
  { schema: "UnitResponse", field: "shareholder_id", scale: "not-scale", kanit: "app/modules/units/schemas.py:263 (shareholder_id: uuid.UUID | None) — kimlik" },
  { schema: "UnitResponse", field: "shareholder_name", scale: "not-scale", kanit: "app/modules/units/schemas.py:264 (shareholder_name: str | None) — dizge/ad" },
  { schema: "UnitResponse", field: "vat_rate", scale: "percent", kanit: "app/modules/units/models.py:301 (CHECK vat_rate BETWEEN 0 AND 100) + models.py:357 (Numeric(5,2))" },
  { schema: "UnitSaleCreate", field: "late_fee_monthly_pct", scale: "percent", kanit: "app/modules/sales/schemas.py:92-94 (Field(default=None, ge=0, max_digits=5, decimal_places=2)) — üst sınır (le) YOK", flags: ["percentAbove100Ok"], not: "le sınırı yok, teorik olarak 100'ü aşabilir; aylık gecikme faiz oranı küçük değer beklenir" },
  { schema: "UnitSaleCreate", field: "term_interest_pct", scale: "percent", kanit: "app/modules/sales/schemas.py:101-103 (Field(default=None, ge=0, max_digits=5, decimal_places=2))", flags: ["percentAbove100Ok"], not: "le sınırı yok" },
  { schema: "UnitSaleCreate", field: "vat_pct", scale: "percent", kanit: "app/modules/sales/schemas.py:79 (vat_pct: VatRate = None) — küme {1,10,20}" },
  { schema: "UnitSaleResponse", field: "late_fee_monthly_pct", scale: "percent", kanit: "app/modules/sales/schemas.py:161 (Annotated[Decimal|None, Gorunurluk.kimlik]) — aynı kolon, ge=0 le yok (satır 92-94 emsali)", flags: ["percentAbove100Ok"], not: "le sınırı yok" },
  { schema: "UnitSaleResponse", field: "term_interest_pct", scale: "percent", kanit: "app/modules/sales/schemas.py:166 — aynı kolon (satır 101-103 emsali)", flags: ["percentAbove100Ok", "percentBelowOneOk"], not: "le sınırı yok TEST-F2/B ÖLÇÜMÜ: tek fikstür \"0.80\" (aylık taksit faizi) — sales/schemas.py:166 üst sınır tanımlamıyor, küçük aylık oran gerçekçi; ÷100 hatası DEĞİL (percentBelowOneOk)." },
  { schema: "UnitSaleResponse", field: "vat_pct", scale: "percent", kanit: "app/modules/sales/schemas.py:151 (Annotated[Decimal|None, Gorunurluk.kimlik]) — VatRate küme {1,10,20}", flags: ["percentBelowOneOk"], not: "TEST-F2/B ÖLÇÜMÜ: mock \"1.00\" döner — VatRate kümesi {1,10,20} KDV %1'i GERÇEKTEN içerir (sales/schemas.py:151); ÷100 hatası DEĞİL (percentBelowOneOk)." },
  { schema: "UnitSaleUpdate", field: "late_fee_monthly_pct", scale: "percent", kanit: "app/modules/sales/schemas.py:92-94 emsali (aynı alan, Update'te opsiyonel)", flags: ["percentAbove100Ok"], not: "le sınırı yok" },
  { schema: "UnitSaleUpdate", field: "term_interest_pct", scale: "percent", kanit: "app/modules/sales/schemas.py:101-103 emsali", flags: ["percentAbove100Ok"], not: "le sınırı yok" },
  { schema: "UnitSaleUpdate", field: "vat_pct", scale: "percent", kanit: "app/modules/sales/schemas.py:79 emsali (VatRate küme {1,10,20})" },
  { schema: "UnitSideSummary", field: "share_pct", scale: "percent", kanit: "app/modules/units/summary.py:248-252 (share_pct = len(selected)*_HUNDRED/project_total)", not: "project_total=0 iken null" },
  { schema: "UnitUpdate", field: "vat_rate", scale: "percent", kanit: "app/modules/units/schemas.py:106-110 (VatRate, _ALLOWED_VAT_RATES={1,10,20})", not: "küme {1,10,20}" },
  { schema: "VatTaxableRow", field: "rate", scale: "percent", kanit: "app/modules/invoicing/models.py:457 (CHECK vat_rate BETWEEN 0 AND 100) — VatTaxableRow.rate = line.vat_rate (accounting/vat_return.py:240)" },
  { schema: "WorkSummaryRow", field: "usage_pct", scale: "percent", kanit: "equipment/consumption.py:50,155-167 (quantize_ratio(hours/cap×100), min/max yok); FE equipment-work/EquipmentWorkSummaryTable.tsx:126 formatPercent (tutarlı)", flags: ["percentAbove100Ok"] },
  { schema: "WorkSummaryTotals", field: "usage_pct_avg", scale: "percent", kanit: "equipment/service/work_summary.py:127-136 + consumption.py:155-167; FE EquipmentWorkSummaryTable.tsx:181 formatPercent", flags: ["percentAbove100Ok"] },
] as const satisfies readonly ScaleRow[];

/** DeepScale (bkz. `scale.ts`) için literal satır tipi — alan adı birleşimleri buradan türer. */
export type ScaleTableLiteral = typeof SCALE_TABLE_LITERAL;

/** TEST-F2 bekçilerinin/tüketicilerin kullandığı geniş (widened) tablo. */
export const SCALE_TABLE: readonly ScaleRow[] = SCALE_TABLE_LITERAL;

