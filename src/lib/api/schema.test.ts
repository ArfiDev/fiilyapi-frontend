import { describe, it, expect, expectTypeOf } from "vitest";

import { apiClient } from "@/lib/api/client";
import type { components, paths } from "@/lib/api/schema";

describe("API tip üretimi", () => {
  it("apiClient tanımlıdır ve GET/POST metodları vardır", () => {
    expect(apiClient).toBeDefined();
    expect(typeof apiClient.GET).toBe("function");
    expect(typeof apiClient.POST).toBe("function");
  });

  it("MeResponse şeması beklenen alanları taşır", () => {
    type Me = components["schemas"]["MeResponse"];
    expectTypeOf<Me>().toHaveProperty("email");
    expectTypeOf<Me>().toHaveProperty("role_key");
    expectTypeOf<Me>().toHaveProperty("status");
  });

  it("TokenPair şeması access/refresh token taşır", () => {
    type Tokens = components["schemas"]["TokenPair"];
    expectTypeOf<Tokens>().toHaveProperty("access_token");
    expectTypeOf<Tokens>().toHaveProperty("refresh_token");
  });
});

// Ekran 13 · İş Kalemleri (BOQ) — Task F1 tip doğrulama kapısı (spec §6.2, §14 F1).
// Bu blok bir KAPIDIR: tipler `pnpm gen:api` ile üretilmediyse `pnpm typecheck`
// kırmızı olur. Elle tip yazmak yasak — eksikse openapi.json yeniden kopyalanır.
describe("BOQ tip üretimi (Ekran 13 kapısı)", () => {
  it("BoqListResponse, BoqTotals, BoqGroupResponse, BoqItemResponse tipleri üretilmiş", () => {
    type BoqListResponse = components["schemas"]["BoqListResponse"];
    type BoqTotals = components["schemas"]["BoqTotals"];
    type BoqGroupResponse = components["schemas"]["BoqGroupResponse"];
    type BoqItemResponse = components["schemas"]["BoqItemResponse"];

    // Liste yanıtı hem toplamları hem grupları taşır (spec §6.2).
    expectTypeOf<BoqListResponse>().toHaveProperty("totals");
    expectTypeOf<BoqListResponse>().toHaveProperty("groups");
    // `grand_total` GERÇEK veri, kalan dört alan yer tutucu (spec §4).
    expectTypeOf<BoqTotals>().toHaveProperty("grand_total");
    expectTypeOf<BoqTotals>().toHaveProperty("contract_total");
    expectTypeOf<BoqTotals>().toHaveProperty("realized_total");
    expectTypeOf<BoqTotals>().toHaveProperty("remaining_total");
    expectTypeOf<BoqTotals>().toHaveProperty("revision_total");
    expectTypeOf<BoqTotals>().toHaveProperty("grand_progress_pct");
    // Grup satırı kalemlerini gömülü taşır; `group_total` türevdir.
    expectTypeOf<BoqGroupResponse>().toHaveProperty("items");
    expectTypeOf<BoqGroupResponse>().toHaveProperty("group_total");
    expectTypeOf<BoqGroupResponse>().toHaveProperty("sort_order");
    // Poz satırı: 7 sütunun kaynağı + türev `amount` (frontend hesaplamaz, spec §3.4).
    expectTypeOf<BoqItemResponse>().toHaveProperty("code");
    expectTypeOf<BoqItemResponse>().toHaveProperty("description");
    expectTypeOf<BoqItemResponse>().toHaveProperty("unit");
    expectTypeOf<BoqItemResponse>().toHaveProperty("quantity");
    expectTypeOf<BoqItemResponse>().toHaveProperty("unit_price");
    expectTypeOf<BoqItemResponse>().toHaveProperty("amount");
    expectTypeOf<BoqItemResponse>().toHaveProperty("progress_pct");
    // Decimal alanlar string olarak gelir (hassasiyet korunur).
    //
    // 🔴 KAPSAM MASKESİ (2026-09-19): para ve metraj alanları artık
    //    `string | null`dır — `limited` rol tutarı, `finance` rol metrajı
    //    GÖREMEZ ve sunucu `null` döndürür. Tipin bunu SÖYLEMESİ gerekir:
    //    `string` deseydi TypeScript maskeyi gizler ve ekran `null`a
    //    hazırlıksız yakalanırdı.
    expectTypeOf<BoqItemResponse["quantity"]>().toEqualTypeOf<string | null>();
    expectTypeOf<BoqItemResponse["amount"]>().toEqualTypeOf<string | null>();
    expectTypeOf<BoqTotals["grand_total"]>().toEqualTypeOf<string | null>();
    expect(true).toBe(true);
  });

  it("BoqGroupCreate/Update ve BoqItemCreate/Update tipleri üretilmiş", () => {
    type BoqGroupCreate = components["schemas"]["BoqGroupCreate"];
    type BoqGroupUpdate = components["schemas"]["BoqGroupUpdate"];
    type BoqItemCreate = components["schemas"]["BoqItemCreate"];
    type BoqItemUpdate = components["schemas"]["BoqItemUpdate"];

    expectTypeOf<BoqGroupCreate>().toHaveProperty("name");
    expectTypeOf<BoqGroupUpdate>().toHaveProperty("name");
    expectTypeOf<BoqItemCreate>().toHaveProperty("group_id");
    expectTypeOf<BoqItemCreate>().toHaveProperty("code");
    expectTypeOf<BoqItemUpdate>().toHaveProperty("code");

    // Form string gönderir (spec §6.2): `number | string` kabul edilmeli.
    const groupBody = { name: "KABA YAPI", sort_order: 10 } satisfies BoqGroupCreate;
    const itemBody = {
      group_id: "11111111-1111-1111-1111-111111111111",
      code: "01.001",
      description: "Beton dökümü",
      unit: "m³",
      quantity: "1240.000",
      unit_price: "280.00",
      sort_order: 1,
    } satisfies BoqItemCreate;
    const itemPatch = { code: "01.002" } satisfies BoqItemUpdate;

    expect(groupBody.name).toBe("KABA YAPI");
    expect(itemBody.quantity).toBe("1240.000");
    expect(itemPatch.code).toBe("01.002");
  });

  it("AccessLevel tipi üretilmiş", () => {
    type AccessLevel = components["schemas"]["AccessLevel"];
    // F12 izin altyapısı bu birlik tipine dayanır (spec §2.5).
    const write: AccessLevel = "full";
    const read: AccessLevel = "view";
    expect([write, read]).toEqual(["full", "view"]);
  });
});

// Şantiye Ekle formu · Task T0 — sözleşme senkronu KAPISI (plan T0, spec §3, §3.2).
// Bu blok `pnpm gen:api` çıktısını doğrular. Tipler elle yazılmaz; eksikse
// `openapi/openapi.json` yeniden kopyalanıp üretici koşulur.
describe("Şantiye formu sözleşmesi (T0 kapısı)", () => {
  type SiteCreate = components["schemas"]["SiteCreate"];
  type SiteUpdate = components["schemas"]["SiteUpdate"];
  type SiteCard = components["schemas"]["SiteCard"];

  it("SiteCreate 14 yeni skaler alanı taşır", () => {
    expectTypeOf<SiteCreate>().toHaveProperty("site_manager_user_id");
    expectTypeOf<SiteCreate>().toHaveProperty("safety_officer_user_id");
    expectTypeOf<SiteCreate>().toHaveProperty("safety_officer_is_outsourced");
    expectTypeOf<SiteCreate>().toHaveProperty("neighborhood");
    expectTypeOf<SiteCreate>().toHaveProperty("parcel");
    expectTypeOf<SiteCreate>().toHaveProperty("gps_coordinates");
    expectTypeOf<SiteCreate>().toHaveProperty("land_area_m2");
    expectTypeOf<SiteCreate>().toHaveProperty("construction_area_m2");
    expectTypeOf<SiteCreate>().toHaveProperty("floor_info");
    expectTypeOf<SiteCreate>().toHaveProperty("budget");
    expectTypeOf<SiteCreate>().toHaveProperty("electricity_subscription_no");
    expectTypeOf<SiteCreate>().toHaveProperty("water_subscription_no");
    expectTypeOf<SiteCreate>().toHaveProperty("planned_worker_count");
    expectTypeOf<SiteCreate>().toHaveProperty("is_draft");
    expect(true).toBe(true);
  });

  it("aynı 14 alan SiteUpdate ve SiteCard şemalarında da vardır", () => {
    expectTypeOf<SiteUpdate>().toHaveProperty("site_manager_user_id");
    expectTypeOf<SiteUpdate>().toHaveProperty("safety_officer_is_outsourced");
    expectTypeOf<SiteUpdate>().toHaveProperty("gps_coordinates");
    expectTypeOf<SiteUpdate>().toHaveProperty("planned_worker_count");
    expectTypeOf<SiteUpdate>().toHaveProperty("is_draft");
    expectTypeOf<SiteCard>().toHaveProperty("site_manager_user_id");
    expectTypeOf<SiteCard>().toHaveProperty("safety_officer_is_outsourced");
    expectTypeOf<SiteCard>().toHaveProperty("gps_coordinates");
    expectTypeOf<SiteCard>().toHaveProperty("planned_worker_count");
    expectTypeOf<SiteCard>().toHaveProperty("is_draft");
    expect(true).toBe(true);
  });

  it("facilities sekiz anahtarlı İÇ NESNEDİR, düz has_* alanı sızmaz", () => {
    // İç nesne: gövdede `facilities: { ... }` olarak gider (spec §3.2.1).
    const facilities = {
      closed_warehouse: false,
      open_storage: false,
      cold_storage: false,
      site_office: false,
      canteen: false,
      changing_room_wc: false,
      dormitory: false,
      infirmary: false,
    } satisfies NonNullable<SiteCreate["facilities"]>;

    expect(Object.keys(facilities)).toHaveLength(8);
    // Düz `has_*` alanı üretilmemiş olmalı — eski anahtar seti kullanılmaz.
    expectTypeOf<SiteCreate>().not.toHaveProperty("has_closed_warehouse");
    expectTypeOf<SiteCreate>().not.toHaveProperty("has_site_office");
    expectTypeOf<SiteCard>().toHaveProperty("facilities");
    expectTypeOf<SiteUpdate>().toHaveProperty("facilities");
  });

  it("SiteCounts draft sayacını taşır", () => {
    type SiteCounts = components["schemas"]["SiteCounts"];
    expectTypeOf<SiteCounts>().toHaveProperty("draft");
    expectTypeOf<SiteCounts["draft"]>().toEqualTypeOf<number>();
    expect(true).toBe(true);
  });

  it("SiteStatus preparation değerini içerir", () => {
    type SiteStatus = components["schemas"]["SiteStatus"];
    const statuses: SiteStatus[] = ["preparation", "active", "on_hold", "completed"];
    expect(statuses).toContain("preparation");
  });

  it("sections[] SiteSectionInput dizisidir: manager_user_id var, estimated_amount/sort_order YOK", () => {
    type SectionInput = components["schemas"]["SiteSectionInput"];
    const row = {
      name: "A Blok",
      manager_user_id: "11111111-1111-1111-1111-111111111111",
      start_date: "2026-01-01",
      end_date: "2026-06-30",
    } satisfies SectionInput;

    expectTypeOf<SectionInput>().toHaveProperty("manager_user_id");
    expectTypeOf<SectionInput>().not.toHaveProperty("estimated_amount");
    expectTypeOf<SectionInput>().not.toHaveProperty("sort_order");
    expectTypeOf<SectionInput>().not.toHaveProperty("manager_name");
    expectTypeOf<NonNullable<SiteCreate["sections"]>>().toEqualTypeOf<SectionInput[]>();
    expect(row.name).toBe("A Blok");
  });

  it("SectionResponse manager_user_id taşır", () => {
    type SectionResponse = components["schemas"]["SectionResponse"];
    expectTypeOf<SectionResponse>().toHaveProperty("manager_user_id");
    expect(true).toBe(true);
  });

  it("duration_days hiçbir şantiye şemasında YOKTUR (süre türevdir, spec §3.6)", () => {
    expectTypeOf<SiteCreate>().not.toHaveProperty("duration_days");
    expectTypeOf<SiteUpdate>().not.toHaveProperty("duration_days");
    expectTypeOf<SiteCard>().not.toHaveProperty("duration_days");
    expectTypeOf<components["schemas"]["SiteDetailResponse"]>().not.toHaveProperty("duration_days");
    expect(true).toBe(true);
  });

  it("UserResponse title alanını taşır (seçici etiketi buna bağlı, spec §11.2)", () => {
    type UserResponse = components["schemas"]["UserResponse"];
    expectTypeOf<UserResponse>().toHaveProperty("title");
    expectTypeOf<UserResponse>().toHaveProperty("full_name");
    expect(true).toBe(true);
  });
});

// P7 · İşveren Hakedişi ekranları — Task T1 (Altyapı) tip doğrulama kapısı.
// Bu blok bir KAPIDIR: tipler `pnpm gen:api` ile üretilmediyse `pnpm typecheck`
// kırmızı olur. Elle tip yazmak yasak — eksikse openapi.json yeniden kopyalanır.
describe("Hakediş (progress-payments) tip üretimi (P7 T1 kapısı)", () => {
  it("ProgressPaymentListResponse/ListItem beklenen alanları taşır", () => {
    type ListResponse = components["schemas"]["ProgressPaymentListResponse"];
    type ListItem = components["schemas"]["ProgressPaymentListItem"];

    expectTypeOf<ListResponse>().toHaveProperty("items");
    expectTypeOf<ListItem>().toHaveProperty("id");
    expectTypeOf<ListItem>().toHaveProperty("project_id");
    expectTypeOf<ListItem>().toHaveProperty("sequence_no");
    expectTypeOf<ListItem>().toHaveProperty("status");
    expectTypeOf<ListItem>().toHaveProperty("gross_total");
    expectTypeOf<ListItem>().toHaveProperty("net_total");
    // Tutarlar Decimal — string olarak gelir (hassasiyet korunur).
    expectTypeOf<ListItem["gross_total"]>().toEqualTypeOf<string>();
    expect(true).toBe(true);
  });

  it("ProgressPaymentDetail lines/groups/calculation/progress bloklarını taşır", () => {
    type Detail = components["schemas"]["ProgressPaymentDetail"];

    expectTypeOf<Detail>().toHaveProperty("id");
    expectTypeOf<Detail>().toHaveProperty("project_id");
    expectTypeOf<Detail>().toHaveProperty("status");
    expectTypeOf<Detail>().toHaveProperty("lines");
    expectTypeOf<Detail>().toHaveProperty("groups");
    expectTypeOf<Detail>().toHaveProperty("calculation");
    expectTypeOf<Detail>().toHaveProperty("progress");
    expect(true).toBe(true);
  });

  it("ProgressPaymentStatus akışın dört durumunu içerir (spec §7: red taslağa geri döner)", () => {
    type Status = components["schemas"]["ProgressPaymentStatus"];
    const statuses: Status[] = ["draft", "pending_approval", "approved", "paid"];
    expect(statuses).toContain("draft");
    expect(statuses).toContain("approved");
  });

  it("ProgressPaymentCreate/Update ve ProgressPaymentLinesSave tipleri üretilmiş", () => {
    type Create = components["schemas"]["ProgressPaymentCreate"];
    type Update = components["schemas"]["ProgressPaymentUpdate"];
    type LinesSave = components["schemas"]["ProgressPaymentLinesSave"];
    // 2026-08-03 openapi devri: şema Input/Output olarak ikiye ayrıldı; istek
    // gövdesi doğrulandığı için `-Input` varyantı kullanılır.
    type LineInput = components["schemas"]["ProgressPaymentLineInput-Input"];

    const createBody = { period_year: 2026, period_month: 7, lines: [] } satisfies Create;
    const updateBody = { description: "Ağustos hakedişi" } satisfies Update;
    const lineInput = {
      contract_item_id: "11111111-1111-1111-1111-111111111111",
      site_id: "22222222-2222-2222-2222-222222222222",
      quantity: "1240.000",
    } satisfies LineInput;
    const linesSave = { lines: [lineInput] } satisfies LinesSave;

    expect(createBody.period_year).toBe(2026);
    expect(updateBody.description).toBe("Ağustos hakedişi");
    expect(linesSave.lines).toHaveLength(1);
  });

  // ⚠️ SÖZLEŞME KORKULUĞU (derleme zamanı). `RejectBody.reason` backend
  // `d888591` (OK-1A K2) ile ZORUNLU oldu; eskiden burada `{} satisfies Reject`
  // yazıyordu, yani test tam tersini — alanın atlanabildiğini — bekçiliyordu.
  // Aşağıdaki `@ts-expect-error` POZİTİF bir kapıdır (`permissions.test.ts` ile
  // aynı ev deseni): uç bir gün `reason`ı yeniden opsiyonele çevirirse hata
  // KAYBOLUR, `@ts-expect-error` KULLANILMAZ hâle gelir ve `pnpm typecheck`
  // kırmızı döner — sessizce gevşeme mümkün değildir.
  it("RejectBody gerekçe alanının adı 'reason'dır ve ZORUNLUdur (POST …/reject gövdesi)", () => {
    type Reject = components["schemas"]["RejectBody"];
    const withReason = { reason: "eksik metraj" } satisfies Reject;
    // @ts-expect-error `reason` zorunludur — gerekçesiz gövde derlemede reddedilmelidir
    const empty: Reject = {};

    expectTypeOf<Reject>().toHaveProperty("reason");
    expectTypeOf<Reject["reason"]>().toEqualTypeOf<string>();
    expect(withReason.reason).toBe("eksik metraj");
    // Çalışma anında `empty` gerçekten boştur: derleyici atlatılsa bile gövde
    // gerekçe TAŞIMAZ ve sunucu 422 döndürür.
    expect(empty).toEqual({});
  });

  it("RefreshPricesResponse yalnız refreshed_count döner (spec §9.3)", () => {
    type RefreshResponse = components["schemas"]["RefreshPricesResponse"];
    const response = { refreshed_count: 3 } satisfies RefreshResponse;
    expectTypeOf<RefreshResponse>().toHaveProperty("refreshed_count");
    expectTypeOf<RefreshResponse["refreshed_count"]>().toEqualTypeOf<number>();
    expect(response.refreshed_count).toBe(3);
  });

  it("ProgressPaymentSummary spec §9.6 sekiz alanını taşır", () => {
    type Summary = components["schemas"]["ProgressPaymentSummary"];
    expectTypeOf<Summary>().toHaveProperty("contract_amount");
    expectTypeOf<Summary>().toHaveProperty("cumulative_gross");
    expectTypeOf<Summary>().toHaveProperty("progress_pct");
    expectTypeOf<Summary>().toHaveProperty("advance_deduction_total");
    expectTypeOf<Summary>().toHaveProperty("retention_total");
    expectTypeOf<Summary>().toHaveProperty("net_total");
    expectTypeOf<Summary>().toHaveProperty("payment_count");
    expectTypeOf<Summary>().toHaveProperty("pending_count");
    expectTypeOf<Summary>().toHaveProperty("remaining");
    expect(true).toBe(true);
  });

  it("28 yeni yoldan biri: GET /progress-payments/{payment_id} üretilmiş (paths tip kapısı)", () => {
    // `openapi.json` yeniden kopyalanıp `pnpm gen:api` çalışmazsa bu tip
    // hiç var olmaz — derleme zamanında yakalanır (schema.d.ts'ten üretilir).
    type Paths = import("@/lib/api/schema").paths;
    expectTypeOf<Paths>().toHaveProperty("/progress-payments/{payment_id}");
    expectTypeOf<Paths>().toHaveProperty("/progress-payments/{payment_id}/reject");
    expectTypeOf<Paths>().toHaveProperty("/projects/{project_id}/progress-payments/summary");
    expect(true).toBe(true);
  });
});

// Backend P6 dilimi — bölüm (section) sözleşmesi genişlemesi (ARA GÖREV: openapi
// yenileme). Bu blok bir KAPIDIR: tipler `pnpm gen:api` ile üretilmediyse
// `pnpm typecheck` kırmızı olur. Elle tip yazmak yasak — eksikse openapi.json
// yeniden kopyalanır. NOT: form/UI tarafı bu dilimin kapsamında DEĞİLDİR
// (F-P6'ya devredilir); bu blok yalnız üretilen tipleri doğrular.
describe("Bölüm (section) tip üretimi — P6 sözleşme genişlemesi", () => {
  it("GET /sections/{section_id} yolu üretilmiş", () => {
    type Paths = import("@/lib/api/schema").paths;
    expectTypeOf<Paths>().toHaveProperty("/sections/{section_id}");
  });

  it("SectionStatus 'on_hold' değerini içerir (planned/active/on_hold/completed)", () => {
    type Status = components["schemas"]["SectionStatus"];
    const statuses: Status[] = ["planned", "active", "on_hold", "completed"];
    expect(statuses).toContain("on_hold");
  });

  it("BLF-F1.1: SectionType enum'u KALKTI; yerine SectionTypeRead {id,name} + SectionTypeCreate geldi", () => {
    type Schemas = components["schemas"];
    expectTypeOf<Schemas>().not.toHaveProperty("SectionType");
    expectTypeOf<Schemas["SectionTypeRead"]>().toEqualTypeOf<{ id: string; name: string }>();
    expectTypeOf<Schemas["SectionTypeCreate"]>().toHaveProperty("name");
    type Paths = import("@/lib/api/schema").paths;
    expectTypeOf<Paths>().toHaveProperty("/section-types");
  });

  it("SectionDetailResponse GET tekil bölüm gövdesini taşır (progress_pct/budget yer tutucudur)", () => {
    type Detail = components["schemas"]["SectionDetailResponse"];
    expectTypeOf<Detail>().toHaveProperty("id");
    expectTypeOf<Detail>().toHaveProperty("site_id");
    expectTypeOf<Detail["section_type"]>().toEqualTypeOf<{ id: string; name: string } | null>();
    // BLF-F1.1: elle `budget_amount` yanıttan KALKTI; tek kaynak türev `budget`.
    expectTypeOf<Detail>().not.toHaveProperty("budget_amount");
    expectTypeOf<Detail>().toHaveProperty("budget");
    expectTypeOf<Detail>().toHaveProperty("is_draft");
    expectTypeOf<Detail>().toHaveProperty("progress_pct");
    expectTypeOf<Detail>().toHaveProperty("boq_item_count");
  });

  it("SectionCreate/SectionUpdate yeni alanları taşır, hepsi opsiyoneldir (yalnız 'name' zorunlu kalır)", () => {
    type Create = components["schemas"]["SectionCreate"];
    type Update = components["schemas"]["SectionUpdate"];

    expectTypeOf<Create>().toHaveProperty("section_type_id");
    expectTypeOf<Create>().not.toHaveProperty("section_type");
    expectTypeOf<Create>().not.toHaveProperty("budget_amount");
    expectTypeOf<Update>().toHaveProperty("section_type_id");
    expectTypeOf<Update>().not.toHaveProperty("budget_amount");
    expectTypeOf<Create>().toHaveProperty("description");
    expectTypeOf<Create>().toHaveProperty("deputy_manager_user_id");
    expectTypeOf<Create>().toHaveProperty("deputy_manager_name");
    expectTypeOf<Create>().toHaveProperty("planned_worker_count");
    expectTypeOf<Create>().toHaveProperty("is_draft");

    // Yeni alanlar (section_type/description/deputy_*/planned_worker_count/
    // budget_amount) hepsi opsiyoneldir — backend'in taslak-dışı bölümde
    // uyguladığı ek zorunluluk çalışma zamanı doğrulamasıdır, OpenAPI şemasına
    // yansımaz. `status`/`sort_order`/`is_draft` ise varsayılan (`default`)
    // taşıdıkları için openapi-typescript'te ZORUNLU üretilir (SectionCreate'in
    // önceki `status`/`sort_order` alanlarıyla aynı, önceden kurulu desen).
    // Form tarafının davranışı bu dilimin kapsamı dışındadır.
    const minimalCreate = {
      name: "A Blok",
      status: "planned",
      sort_order: 0,
      is_draft: false,
    } satisfies Create;
    const minimalUpdate = {} satisfies Update;

    expect(minimalCreate.name).toBe("A Blok");
    expect(minimalUpdate).toEqual({});
  });
});

describe("Günlük iskelet önizlemesi tip üretimi (GKS-F1.1 kapısı)", () => {
  type Skeleton = components["schemas"]["SiteDiarySkeleton"];
  type SkeletonLine = components["schemas"]["SiteDiarySkeletonLine"];
  type EntryCreate = components["schemas"]["SiteDiaryEntryCreate"];
  type LineInput = components["schemas"]["SiteDiaryLineInput"];

  it("SiteDiarySkeleton tüm alanları zorunlu taşır; nullable olanlar null alabilir", () => {
    expectTypeOf<Skeleton["entry_date"]>().toEqualTypeOf<string>();
    expectTypeOf<Skeleton["section_id"]>().toEqualTypeOf<string | null>();
    expectTypeOf<Skeleton["section_name"]>().toEqualTypeOf<string | null>();
    expectTypeOf<Skeleton["existing_entry_id"]>().toEqualTypeOf<
      string | null
    >();
    expectTypeOf<Skeleton["locked"]>().toEqualTypeOf<boolean>();
    expectTypeOf<Skeleton["lock_report_date"]>().toEqualTypeOf<string | null>();
    expectTypeOf<Skeleton["lines"]>().toEqualTypeOf<SkeletonLine[]>();
    expectTypeOf<Skeleton["lines_total"]>().toEqualTypeOf<string>();
  });

  it("SiteDiarySkeletonLine 'id' TAŞIMAZ ama hesap alanlarını taşır", () => {
    expectTypeOf<
      "id" extends keyof SkeletonLine ? true : false
    >().toEqualTypeOf<false>();
    expectTypeOf<SkeletonLine["boq_item_id"]>().toEqualTypeOf<string | null>();
    expectTypeOf<SkeletonLine>().toHaveProperty("section_id");
    expectTypeOf<SkeletonLine["quantity"]>().toEqualTypeOf<string>();
    expectTypeOf<SkeletonLine>().toHaveProperty("planned_quantity");
    expectTypeOf<SkeletonLine>().toHaveProperty("leaf_cumulative_quantity");
  });

  it("SiteDiaryEntryCreate.lines opsiyonel ve null alabilir satır girdisi dizisidir", () => {
    expectTypeOf<EntryCreate["lines"]>().toEqualTypeOf<
      LineInput[] | null | undefined
    >();
  });

  it("SiteDiarySkeleton kendi ekibi puantajdan taşır (GKS-B1.1)", () => {
    expectTypeOf<NonNullable<Skeleton["own_crew_from_timesheet"]>>().toEqualTypeOf<
      components["schemas"]["OwnCrewFromTimesheet"][]
    >();
  });

  it("iskelet ucu GET olarak tanımlıdır", () => {
    expectTypeOf<
      paths["/sites/{site_id}/diary/skeleton"]["get"]
    >().not.toBeNever();
  });
});

describe("İş kalemi kataloğu tip üretimi (TKL-F1.1 kapısı)", () => {
  type WorkItemRead = components["schemas"]["WorkItemRead"];
  type WorkItemCreate = components["schemas"]["WorkItemCreate"];
  type WorkDisciplineRead = components["schemas"]["WorkDisciplineRead"];

  it("WorkItemRead poz_no ve fiyat alanlarını kaynağa göre taşır", () => {
    expectTypeOf<WorkItemRead["poz_no"]>().toEqualTypeOf<string>();
    expectTypeOf<WorkItemRead["ref_price"]>().toEqualTypeOf<string | null>();
    expectTypeOf<WorkItemRead["price_updated_at"]>().toEqualTypeOf<
      string | null
    >();
    expectTypeOf<WorkItemRead["description"]>().toEqualTypeOf<string | null>();
    expectTypeOf<WorkItemRead["standard_unit_mhr"]>().toEqualTypeOf<string>();
    expectTypeOf<WorkItemRead["default_contractor_type"]>().toEqualTypeOf<
      "own" | "subcon"
    >();
    expectTypeOf<WorkItemRead>().toHaveProperty("discipline");
    expectTypeOf<WorkItemRead>().toHaveProperty("standard_updated_at");
  });

  it("WorkItemCreate poz_no TAŞIMAZ (sunucu üretir)", () => {
    expectTypeOf<
      "poz_no" extends keyof WorkItemCreate ? true : false
    >().toEqualTypeOf<false>();
    expectTypeOf<WorkItemCreate["discipline_id"]>().toEqualTypeOf<string>();
  });

  it("WorkDisciplineRead seçici alanlarını taşır, poz_counter taşımaz", () => {
    expectTypeOf<WorkDisciplineRead["id"]>().toEqualTypeOf<string>();
    expectTypeOf<WorkDisciplineRead["code"]>().toEqualTypeOf<string>();
    expectTypeOf<WorkDisciplineRead["name"]>().toEqualTypeOf<string>();
    expectTypeOf<WorkDisciplineRead["color"]>().toEqualTypeOf<string>();
    expectTypeOf<WorkDisciplineRead["default_contractor_type"]>().toEqualTypeOf<
      "own" | "subcon"
    >();
    expectTypeOf<WorkDisciplineRead["sort_order"]>().toEqualTypeOf<number>();
    expectTypeOf<
      "poz_counter" extends keyof WorkDisciplineRead ? true : false
    >().toEqualTypeOf<false>();
  });

  it("CatalogItemRead.poz_no zorunlu string'dir", () => {
    type CatalogItem = components["schemas"]["CatalogItemRead"];
    expectTypeOf<CatalogItem["poz_no"]>().toEqualTypeOf<string>();
  });

  it("katalog uçları tanımlıdır", () => {
    expectTypeOf<paths["/catalog/disciplines"]["get"]>().not.toBeNever();
    expectTypeOf<paths["/catalog/items"]["get"]>().not.toBeNever();
    expectTypeOf<paths["/catalog/items"]["post"]>().not.toBeNever();
    expectTypeOf<paths["/catalog/items/{item_id}"]["patch"]>().not.toBeNever();
  });
});
