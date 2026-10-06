import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { UseQueryResult } from "@tanstack/react-query";

import { EquipmentDetailView } from "./EquipmentDetailView";
import { useSession } from "@/components/shell/SessionProvider";
import { ALL_PAGE_KEYS, meFixture, pageGrant, pagesFor } from "@/lib/auth/page-grants.testkit";
import { useEquipmentDetailScreen } from "@/lib/api/hooks/useEquipmentDetailScreen";
import { useEquipmentDocuments } from "@/lib/api/hooks/useEquipmentDocuments";
import { useEquipmentFuelSummary } from "@/lib/api/hooks/useEquipmentFuelSummary";
import { useEquipmentRentalInvoices } from "@/lib/api/hooks/useEquipmentRentalInvoices";
import { useEquipmentWorkSummary } from "@/lib/api/hooks/useEquipmentWorkSummary";
import { useSiteOptions } from "@/lib/api/hooks/useSiteOptions";
import { useSupplier } from "@/lib/api/hooks/useSuppliers";
import type { EquipmentResponse } from "@/lib/api/hooks/useEquipment";
import type { EquipmentDetailScreenResponse } from "@/lib/api/hooks/useEquipmentDetailScreen";
import type { WorkSummaryResponse } from "@/lib/api/hooks/useEquipmentWorkSummary";

vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("@/lib/api/hooks/useEquipmentDetailScreen", () => ({
  useEquipmentDetailScreen: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useSiteOptions", () => ({ useSiteOptions: vi.fn() }));
vi.mock("@/lib/api/hooks/useEquipmentDocuments", () => ({ useEquipmentDocuments: vi.fn() }));
vi.mock("@/lib/api/hooks/useEquipmentFuelSummary", () => ({ useEquipmentFuelSummary: vi.fn() }));
vi.mock("@/lib/api/hooks/useEquipmentWorkSummary", () => ({ useEquipmentWorkSummary: vi.fn() }));
vi.mock("@/lib/api/hooks/useSuppliers", () => ({ useSupplier: vi.fn() }));
vi.mock("@/lib/api/hooks/useEquipmentRentalInvoices", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useEquipmentRentalInvoices")>()),
  useEquipmentRentalInvoices: vi.fn(),
}));

const AS_OF = "2026-08-20";

const EQUIPMENT: EquipmentResponse = {
  id: "eq-1",
  name: "Tower Crane TC-48",
  category: "crane",
  brand: "Liebherr",
  model: "154 EC-H",
  serial_no: "LBH-2022-8842",
  plate_no: null,
  model_year: 2022,
  ownership: "rented",
  purchase_amount: null,
  purchase_date: null,
  depreciation_years: null,
  supplier_id: "sup-1",
  financing: null,
  market_value: null,
  rate_amount: "8500.00",
  rate_period: "daily",
  site_id: "site-1",
  operator_id: null,
  status: "working",
  status_note: null,
  status_expected_date: null,
  fuel_type: "diesel",
  norm_consumption: "4.20",
  norm_unit: "lt_hour",
  maintenance_period: "hours_500",
  monthly_capacity_hours: 200,
  engine_power_kw: "45.00",
  capacity_description: "8 Ton",
  hourmeter_hours: "14286.00",
  rental_contract_no: "LT-KRA-2026-004",
  rental_start_date: "2026-03-01",
  rental_end_date: "2026-12-31",
  rental_min_monthly_hours: 160,
  rental_payment_terms: "Aylık",
  last_service_date: "2026-05-18",
  last_service_hourmeter: "14000.00",
  is_company_asset: false,
  is_active: true,
  created_at: "2026-01-05T08:00:00Z",
};

function detail(
  overrides: Partial<EquipmentDetailScreenResponse> = {},
): EquipmentDetailScreenResponse {
  return {
    equipment: EQUIPMENT,
    maintenance: {
      period: "hours_500",
      period_hours: 500,
      last_service_date: "2026-05-18",
      last_service_hourmeter: "14000.00",
      hourmeter_hours: "14286.00",
      next_service_hourmeter: "14500.00",
      used_hours: "286.00",
      remaining_hours: "214.00",
      usage_pct: "57.2",
      estimated_service_date: "2026-09-05",
    },
    rental: {
      cumulative_paid: "284160.00",
      cumulative_paid_unknown_count: 0,
      paid_invoice_count: 3,
    },
    as_of: AS_OF,
    ...overrides,
  };
}

function queryStub<T>(
  data: T,
  extra: Partial<{ isLoading: boolean; isError: boolean; error: unknown }> = {},
) {
  return {
    data,
    isLoading: extra.isLoading ?? false,
    isError: extra.isError ?? false,
    error: extra.error ?? null,
  } as unknown as UseQueryResult<T, Error>;
}

function workSummary(rows: WorkSummaryResponse["rows"]): WorkSummaryResponse {
  return {
    year: 2026,
    month: 8,
    rows,
    totals: { hours: "0.00", breakdown_hours: "0.00", cost: "0.00", usage_pct_avg: null },
    weeks: [],
  };
}

const OUR_ROW = {
  equipment_id: "eq-1",
  equipment_name: "Tower Crane TC-48",
  site_id: "site-1",
  hours: "186.00",
  usage_pct: "93.00",
  usage_reason: null,
  breakdown_hours: "0.00",
  cost: "59520.00",
} as WorkSummaryResponse["rows"][number];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useSession).mockReturnValue({
    me: meFixture(),
    isLoading: false,
  } as ReturnType<typeof useSession>);
  vi.mocked(useEquipmentDetailScreen).mockReturnValue(queryStub(detail()));
  vi.mocked(useSiteOptions).mockReturnValue({
    options: [{ siteId: "site-1", projectId: "p-1", label: "Güneşkent A-Blok" }],
    isLoading: false,
    isError: false,
  });
  vi.mocked(useEquipmentWorkSummary).mockReturnValue(queryStub(workSummary([OUR_ROW])));
  vi.mocked(useEquipmentFuelSummary).mockReturnValue(
    queryStub({
      year: 2026,
      month: 8,
      total_liters: "840.00",
      total_amount: "33348.00",
      lt_per_hour_avg: "4.50",
      avg_unit_price: "39.70",
      abnormal_count: 1,
      rows: [
        {
          equipment_id: "eq-1",
          equipment_name: "Tower Crane TC-48",
          site_id: "site-1",
          liters: "840.00",
          amount: "33348.00",
          actual: "4.50",
          norm: "4.20",
          deviation_pct: "7.14",
          deviation_reason: null,
          consumption_status: "warning",
        },
      ],
    }),
  );
  vi.mocked(useEquipmentDocuments).mockReturnValue(
    queryStub({
      items: [
        {
          id: "edoc-1",
          equipment_id: "eq-1",
          type_id: "edt-3",
          type_code: "muayene",
          type_name: "Periyodik Muayene Raporu",
          filename: "muayene.pdf",
          mime_type: "application/pdf",
          size_bytes: 1024,
          document_no: "TC48-MUA",
          issued_at: "2025-09-10",
          valid_until: "2026-09-10",
          note: null,
          created_at: "2025-09-10T08:00:00Z",
        },
      ],
    }),
  );
  vi.mocked(useSupplier).mockReturnValue(
    queryStub({ id: "sup-1", name: "Liebherr Türkiye A.Ş." } as never),
  );
  vi.mocked(useEquipmentRentalInvoices).mockReturnValue(
    queryStub({ items: [], total: 0, limit: 200, offset: 0 }),
  );
});

describe("EquipmentDetailView", () => {
  it("künye + türev blokları sunucudan basar (yüzde İSTEMCİDE hesaplanmaz)", () => {
    render(<EquipmentDetailView equipmentId="eq-1" />);

    expect(screen.getByRole("heading", { level: 1, name: "Tower Crane TC-48" })).toBeVisible();
    // Sunucu damgası OLDUĞU GİBİ basılır: 286/500 = %57,2 istemcide yeniden
    // bölünseydi bakım takvimiyle ayrışabilirdi.
    expect(screen.getByTestId("makine-det-usage-pct")).toHaveTextContent("%57,2");
    expect(screen.getByTestId("makine-det-remaining")).toHaveTextContent("214");
    expect(screen.getByTestId("makine-det-estimated")).toHaveTextContent("~05.09.2026");
    // Dayanak günü GİZLENMEZ.
    expect(screen.getByTestId("makine-det-as-of")).toHaveTextContent("20.08.2026");
  });

  it("🔴 çalışma özetinde SATIR YOKLUĞU '0 saat' diye BASILMAZ", () => {
    // Kullanımdan kaldırılmış ve o ay kaydı olmayan ekipman sunucunun özet
    // tablosunda HİÇ BULUNMAZ (`work_summary_rows` HAVING elemesi).
    vi.mocked(useEquipmentWorkSummary).mockReturnValue(queryStub(workSummary([])));
    render(<EquipmentDetailView equipmentId="eq-1" />);

    expect(screen.getByTestId("makine-det-work-missing")).toBeVisible();
    // Hero'daki maliyet de uydurma bir ₺0'a düşmez.
    expect(screen.getByTestId("makine-det-monthly-cost")).toHaveTextContent("—");
  });

  it("BİLİNEN sıfır ile satır yokluğu AYRIDIR: 0 saatlik satır 0 basar", () => {
    vi.mocked(useEquipmentWorkSummary).mockReturnValue(
      queryStub(workSummary([{ ...OUR_ROW, hours: "0.00", cost: "0.00" }])),
    );
    render(<EquipmentDetailView equipmentId="eq-1" />);

    expect(screen.queryByTestId("makine-det-work-missing")).toBeNull();
    expect(screen.getByTestId("makine-det-monthly-cost")).toHaveTextContent("₺0");
  });

  it("usage_pct null iken UYDURMA %0 yerine sunucu gerekçesi basılır", () => {
    vi.mocked(useEquipmentWorkSummary).mockReturnValue(
      queryStub(
        workSummary([{ ...OUR_ROW, usage_pct: null, usage_reason: "no_capacity_hours" }]),
      ),
    );
    render(<EquipmentDetailView equipmentId="eq-1" />);

    expect(screen.getByTestId("makine-det-usage-tile")).toHaveTextContent("—");
    expect(screen.getByTestId("makine-det-usage-reason")).toBeVisible();
  });

  it("🔴 kümülatif ₺0, ödenmiş hakediş sayacıyla BİRLİKTE okunur", () => {
    // `paid_invoice_count` `line_kind` süzgecinden ÖNCE sayılır: sayaç > 0
    // iken 0 toplam "hiç ödeme yok" DEMEK DEĞİLDİR.
    vi.mocked(useEquipmentDetailScreen).mockReturnValue(
      queryStub(
        detail({
          rental: {
            cumulative_paid: "0.00",
            cumulative_paid_unknown_count: 0,
            paid_invoice_count: 2,
          },
        }),
      ),
    );
    render(<EquipmentDetailView equipmentId="eq-1" />);

    expect(screen.getByTestId("makine-det-cumulative-paid")).toHaveTextContent("₺0");
    expect(screen.getByTestId("makine-det-paid-count")).toHaveTextContent("2 ödenmiş");
  });

  it("hesaplanamayan kira satırı SESSİZ DÜŞMEZ, adetçe bildirilir", () => {
    vi.mocked(useEquipmentDetailScreen).mockReturnValue(
      queryStub(
        detail({
          rental: {
            cumulative_paid: "284160.00",
            cumulative_paid_unknown_count: 2,
            paid_invoice_count: 3,
          },
        }),
      ),
    );
    render(<EquipmentDetailView equipmentId="eq-1" />);

    expect(screen.getByTestId("makine-det-rental-unknown")).toHaveTextContent("2 satırının");
  });

  it("bakım penceresi yoksa çubuk ÇİZİLMEZ, gerekçe basılır (her türev AYRI null)", () => {
    vi.mocked(useEquipmentDetailScreen).mockReturnValue(
      queryStub(
        detail({
          maintenance: {
            period: "monthly",
            period_hours: null,
            last_service_date: "2026-06-04",
            last_service_hourmeter: null,
            hourmeter_hours: "38200.00",
            next_service_hourmeter: null,
            used_hours: null,
            remaining_hours: null,
            usage_pct: null,
            estimated_service_date: null,
          },
        }),
      ),
    );
    render(<EquipmentDetailView equipmentId="eq-1" />);

    expect(screen.getByTestId("makine-det-usage-missing")).toBeVisible();
    expect(screen.queryByTestId("makine-det-usage-pct")).toBeNull();
    // Bilinen olgu (son bakım TARİHİ) tek bir "bilgi yok" bayrağına
    // indirgenmez — ekranda durmaya devam eder.
    expect(screen.getByLabelText("Bakım Bilgileri")).toHaveTextContent("04.06.2026");
  });

  it("rotası olmayan mockup öğeleri SİLİNMEZ; devre-dışı + GÖRÜNÜR gerekçeyle basılır", () => {
    render(<EquipmentDetailView equipmentId="eq-1" />);

    const assetLink = screen.getByTestId("makine-det-link-asset");
    expect(assetLink).toHaveAttribute("aria-disabled", "true");
    expect(assetLink).toHaveTextContent("Şirket Varlıkları ekranı henüz yok");
    expect(screen.getByTestId("makine-det-link-supplier-invoice")).toHaveTextContent(
      "alış faturası kimliği taşımıyor",
    );
  });

  it("belge geçerliliği SUNUCUNUN as_of gününe göre türer", () => {
    render(<EquipmentDetailView equipmentId="eq-1" />);
    // 2026-08-20 → 2026-09-10 = 21 gün.
    expect(screen.getByText("21 gün kaldı")).toBeVisible();
    expect(screen.getByTestId("makine-det-doc-count")).toHaveTextContent(
      "1 belge · 1 süresi yaklaşıyor",
    );
  });

  // 🔴 Depo kanonu (spec §2.5.3 "bilinmezlik kuralı"): seviyesi BİLİNMEYEN
  // kullanıcı ekranı GÖRÜR; kapı yalnız AÇIKÇA `none` iken kapanır. Test
  // önce `permissions: {}` ile yazılmıştı ve KODU değil KENDİSİNİ yalanladı —
  // `useModulePermission` `level !== "none"` diyor.
  it("izni AÇIKÇA 'none' olan kullanıcı ekranı GÖRMEZ", () => {
    vi.mocked(useSession).mockReturnValue({
      me: meFixture({ pages: pagesFor(ALL_PAGE_KEYS, "none") }),
      isLoading: false,
    } as ReturnType<typeof useSession>);
    render(<EquipmentDetailView equipmentId="eq-1" />);

    expect(screen.queryByRole("heading", { level: 1, name: "Tower Crane TC-48" })).toBeNull();
  });

  // kalan-4 #181: `siteOptions.isError` OKUNMUYORDU. Şantiye/proje sorgusu
  // hata verirse `isLoading` false + `options` boş Map olur ve
  // `resolveSiteLabel` null döner — ŞANTİYEYE ATANMIŞ bir makine yanlışlıkla
  // "Depoda (Atanmadı)" basılırdı. Hata hâlinde de yükleniyor/bilinmez
  // durumu (`undefined` → Hero'da "…") korunmalı, YANLIŞ "atanmadı" DEĞİL.
  it("şantiye sorgusu hata verince YANLIŞ 'Depoda (Atanmadı)' BASILMAZ", () => {
    vi.mocked(useSiteOptions).mockReturnValue({
      options: [],
      isLoading: false,
      isError: true,
    });
    render(<EquipmentDetailView equipmentId="eq-1" />);

    expect(screen.queryAllByText("Depoda (Atanmadı)")).toHaveLength(0);
  });

  // kalan-4 #180: work×3/fuel/invoices sorgularının isError'u hiç okunmuyordu
  // — biri düşerse ilgili blok kalıcı "Yükleniyor…"/"—" basar, kullanıcıya
  // hata hiç söylenmezdi.
  it("çalışma özeti sorgusu HATA verince görünür bir uyarı basılır", () => {
    vi.mocked(useEquipmentWorkSummary).mockReturnValue(
      queryStub(undefined as never, { isError: true, error: new Error("boom") }),
    );
    render(<EquipmentDetailView equipmentId="eq-1" />);

    expect(screen.getByTestId("makine-det-body-error")).toBeVisible();
  });
});

describe("IZN-F5b-A madde 11 · '+ Belge Ekle' = saha.makine_ekipman Düzenler (sekme başına kapı)", () => {
  function setPages(options: Parameters<typeof meFixture>[0]) {
    vi.mocked(useSession).mockReturnValue({ me: meFixture(options), isLoading: false } as ReturnType<typeof useSession>);
  }

  it("yalnız saha.makine_ekipman Düzenler → '+ Belge Ekle' var (modül view olsa da)", () => {
    setPages({ pages: { "saha.makine_ekipman": pageGrant("edit") }, permissions: { equipment: "view" } });
    render(<EquipmentDetailView equipmentId="eq-1" />);
    expect(screen.getByRole("button", { name: "+ Belge Ekle" })).toBeInTheDocument();
  });

  it("yalnız KARDEŞ sayfalar (çalışma/yakıt/kira) Düzenler, ekipman Görür → '+ Belge Ekle' YOK", () => {
    setPages({
      pages: {
        "saha.makine_ekipman": pageGrant("view"),
        "saha.makine_calisma": pageGrant("edit"),
        "saha.makine_yakit": pageGrant("edit"),
        "saha.makine_kira": pageGrant("edit"),
      },
      permissions: { equipment: "full" },
    });
    render(<EquipmentDetailView equipmentId="eq-1" />);
    expect(screen.queryByRole("button", { name: "+ Belge Ekle" })).toBeNull();
  });
});
