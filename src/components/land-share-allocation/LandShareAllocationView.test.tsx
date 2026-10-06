import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

import { LandShareAllocationView } from "./LandShareAllocationView";
import {
  ALLOCATION_ATOMIC_HINT,
  ALLOCATION_NO_CHANGES_MESSAGE,
  ALLOCATION_NO_CONTRACT_MESSAGE,
  ALLOCATION_PDF_PENDING_REASON,
  ALLOCATION_SKIPPED_WITHOUT_VALUE_MESSAGE,
} from "./constants";
import type { LandShareUnitRow } from "./allocation-state";
import type {
  LandShareSummaryResponse,
  LandShareUnitListResponse,
  UnitAllocationRequest,
} from "@/lib/api/hooks/useLandShare";
import {
  useLandShareSummary,
  useLandShareUnits,
  useUpdateAllocation,
} from "@/lib/api/hooks/useLandShare";
import type { UnitListResponse } from "@/lib/api/hooks/useProjectUnits";
import { useProjectBlocks } from "@/lib/api/hooks/useProjectBlocks";
import { useProjects } from "@/lib/api/hooks/useProjects";
import { useSession } from "@/components/shell/SessionProvider";
import { BackendError } from "@/lib/api/unwrap";
import type { MeResponse } from "@/lib/auth/types";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";
import { meFixture } from "@/lib/auth/page-grants.testkit";

// `isLandShareMissing` ve sayfa boyutu GERÇEK kalır: 404 dallanmasını
// taklit etmek, tam da ölçmek istediğimiz davranışı sahteleştirirdi.
vi.mock("@/lib/api/hooks/useLandShare", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/hooks/useLandShare")>();
  return {
    ...actual,
    useLandShareSummary: vi.fn(),
    useLandShareUnits: vi.fn(),
    useUpdateAllocation: vi.fn(),
  };
});
vi.mock("@/lib/api/hooks/useProjects", () => ({ useProjects: vi.fn() }));
vi.mock("@/lib/api/hooks/useProjectBlocks", () => ({ useProjectBlocks: vi.fn() }));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));

let searchParams = new URLSearchParams();
const pushMock = vi.fn();
const replaceMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
  usePathname: () => "/satis/paylasim-girisi",
  useSearchParams: () => searchParams,
}));

function queryStub(data: unknown, extra: Record<string, unknown> = {}) {
  return { data, isLoading: false, isError: false, error: null, ...extra } as never;
}

function errorStub(error: unknown) {
  return { data: undefined, isLoading: false, isError: true, error } as never;
}

/* ------------------------------------------------------------------ */
/* Sabitler — PG'nin kendi örnek verisi                                */
/* ------------------------------------------------------------------ */

function unitRow(overrides: Partial<LandShareUnitRow> = {}): LandShareUnitRow {
  return {
    unit_id: "u-1",
    block_id: "blk-a",
    block_name: "A Blok",
    unit_no: "A-9",
    unit_kind: "apartment",
    layout: "3+1",
    floor: "3",
    gross_area_m2: "148",
    appraisal_value: "1380000",
    owner_side: null,
    shareholder_id: null,
    shareholder_name: null,
    buyer_name: null,
    sales_status: "listed",
    ...overrides,
  };
}

/** PG 129-143 atanmamış · PG 165-179 bizim · PG 209-223 arsa sahibi. */
const UNASSIGNED = unitRow({ unit_id: "u-1", unit_no: "A-9" });
const OURS = unitRow({ unit_id: "u-2", unit_no: "A-1", owner_side: "contractor" });
const THEIRS = unitRow({
  unit_id: "u-3",
  unit_no: "A-2",
  owner_side: "landowner",
  shareholder_id: "sh-1",
  shareholder_name: "Ahmet Yılmaz",
});
const ROWS: readonly LandShareUnitRow[] = [UNASSIGNED, OURS, THEIRS];

function unitList(
  overrides: Partial<LandShareUnitListResponse> = {},
): LandShareUnitListResponse {
  return { items: [...ROWS], total: 3, limit: 50, offset: 0, ...overrides };
}

function summary(overrides: Partial<LandShareSummaryResponse> = {}): LandShareSummaryResponse {
  return {
    project_id: "prj-1",
    project_name: "Bahçelievler Konut",
    contract: {
      landowner_name: "Yılmaz Ailesi",
      our_share_pct: "55.00", // PG 68
      owner_share_pct: "45.00", // PG 69
      contract_no: "KKS-2026-001", // PG 61
      notary_date: null,
      land_area_m2: null,
      construction_area_m2: null,
      delivery_date: null,
      daily_penalty: null,
      guarantee_amount: null,
    },
    totals: { unit_count: 42, value_total: "47500000" },
    our_side: {
      unit_count: 20,
      value_total: "26400000",
      sold_count: 8,
      reserved_count: 0,
      available_count: 12,
      sold_value: "9000000",
      remaining_value: "17400000",
    },
    owner_side: { unit_count: 16, value_total: "21100000" },
    shareholders: [
      { shareholder_id: "sh-1", name: "Ahmet Yılmaz", share_pct: "50", unit_count: 10, value_total: "1" },
      { shareholder_id: "sh-2", name: "Fatma Yılmaz", share_pct: "30", unit_count: 4, value_total: "1" },
      { shareholder_id: "sh-3", name: "Ali Yılmaz", share_pct: "20", unit_count: 2, value_total: "1" },
    ],
    unassigned: { unit_count: 6, value_total: "0" },
    balance: {
      // PG 71 · 78 · 247-253
      count_balance: {
        total_unit_count: 42,
        our_expected_count: 23,
        owner_expected_count: 19,
        our_assigned_count: 20,
        owner_assigned_count: 16,
        unassigned_count: 6,
        our_missing_count: 3,
        owner_missing_count: 3,
      },
      // PG 255-266
      value_balance: {
        our_value: "26400000",
        owner_value: "21100000",
        assigned_value_total: "47500000",
        our_actual_pct: "55.6",
        owner_actual_pct: "44.4",
        deviation_pct: "0.6",
        tolerance_pct: "2.00",
        is_within_tolerance: true,
      },
    },
    ...overrides,
  };
}

/** `PATCH …/units/allocation` yanıtı — GÜNCEL TAM LİSTE. */
function allocationResponse(
  units: readonly Partial<{
    id: string;
    owner_side: "contractor" | "landowner" | null;
    shareholder_id: string | null;
    shareholder_name: string | null;
  }>[],
): UnitListResponse {
  return {
    totals: {} as UnitListResponse["totals"],
    blocks: [
      {
        block: { id: "blk-a", name: "A Blok" } as UnitListResponse["blocks"][number]["block"],
        units: units.map(
          (unit) => unit as unknown as UnitListResponse["blocks"][number]["units"][number],
        ),
      },
    ],
  };
}

const mutateAsync = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  searchParams = new URLSearchParams("proje=prj-1");
  mutateAsync.mockResolvedValue(allocationResponse([]));
  vi.mocked(useSession).mockReturnValue({
    me: meFixture(),
    isLoading: false,
  } as ReturnType<typeof useSession>);
  vi.mocked(useProjects).mockReturnValue(
    queryStub({ items: [{ id: "prj-1", name: "Bahçelievler Konut" }] }),
  );
  vi.mocked(useProjectBlocks).mockReturnValue(
    queryStub({ blocks: [{ id: "blk-a", name: "A Blok", site_id: "site-1" }] }),
  );
  vi.mocked(useLandShareSummary).mockReturnValue(queryStub(summary()));
  vi.mocked(useLandShareUnits).mockReturnValue(queryStub(unitList()));
  vi.mocked(useUpdateAllocation).mockReturnValue({
    mutate: vi.fn(),
    mutateAsync,
    isPending: false,
  } as never);
});

/** Gövdeyi son `mutateAsync` çağrısından okur. */
function lastBody(): UnitAllocationRequest {
  return mutateAsync.mock.calls[mutateAsync.mock.calls.length - 1][0].body;
}

/* ------------------------------------------------------------------ */

describe("LandShareAllocationView — TAM SAYFA kabuğu (PG 31-56)", () => {
  it("başlık, alt başlık ve breadcrumb basılır (modal DEĞİL)", () => {
    render(<LandShareAllocationView />);
    expect(
      screen.getByRole("heading", { name: "Kat Karşılığı Paylaşım Girişi", level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Kırıntı yolu" })).toHaveTextContent(
      "Satış Yönetimi",
    );
  });

  it("dört kart da mockup başlıklarıyla basılır (PG 58 · 88 · 105 · 245)", () => {
    render(<LandShareAllocationView />);
    expect(screen.getByRole("heading", { name: /Sözleşme & Hedef/ })).toBeInTheDocument();
    expect(screen.getByText("Toplu İşlem")).toBeInTheDocument();
    expect(screen.getByTestId("paylasim-form-liste-kart")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Paylaşım Denge Kontrolü/ })).toBeInTheDocument();
  });

  it("PG 52 sekmesi AKTİFTİR ve bekleyen sekme gerekçesi ARTIK YOKTUR", () => {
    render(<LandShareAllocationView />);
    expect(screen.getByRole("tab", { name: "Paylaşım Girişi" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.queryByTestId("unite-form-sekme-gerekce")).toBeNull();
  });

  it("PG 61 sözleşme numarası SALT OKUNURDUR (seçici DEĞİL)", () => {
    render(<LandShareAllocationView />);
    const box = screen.getByTestId("paylasim-form-sozlesme-no");
    expect(box).toHaveTextContent("KKS-2026-001");
    expect(box.tagName).toBe("DIV");
  });

  it("PG 270-272 PDF kutucuğu DEVRE DIŞI, İŞARETSİZ ve gerekçesi EKRANDA", () => {
    render(<LandShareAllocationView />);
    const checkbox = screen.getByTestId("paylasim-form-pdf");
    expect(checkbox).toBeDisabled();
    expect(checkbox).not.toBeChecked();
    // Gerekçe `title`da SAKLANMAZ.
    expect(screen.getByText(ALLOCATION_PDF_PENDING_REASON)).toBeInTheDocument();
  });

  it("`projects` yetkisi yoksa AccessDenied basılır (`sales` DEĞİL)", () => {
    vi.mocked(useSession).mockReturnValue({
      me: { permissions: { projects: "none", sales: "full" } } as unknown as MeResponse,
      isLoading: false,
    } as ReturnType<typeof useSession>);
    render(<LandShareAllocationView />);
    expect(screen.queryByTestId("paylasim-form-govde")).not.toBeInTheDocument();
  });
});

describe("🔴 PG 65-81 — özet sayıları SUNUCUDAN gelir", () => {
  it("sözleşme oranı ve beklenen adetler basılır (istemcide hesaplanmaz)", () => {
    render(<LandShareAllocationView />);
    const tile = screen.getByTestId("paylasim-form-oran-kutusu");
    expect(tile).toHaveTextContent("Biz %55");
    expect(tile).toHaveTextContent("Arsa %45");
    // 🔴 23 + 19 SUNUCUNUN tek yuvarlamasından gelir; 42*0,55 = 23,1'i
    // istemcide yuvarlamak 23+20=43 üretebilirdi.
    expect(tile).toHaveTextContent("42 ünite → Biz 23 · Arsa Sahibi 19");
  });

  it("PG 80 atanmayan notu İŞARETLİ sayıdan kurulur (mutlak değer DEĞİL)", () => {
    vi.mocked(useLandShareSummary).mockReturnValue(
      queryStub(
        summary({
          balance: {
            ...summary().balance,
            count_balance: {
              ...summary().balance.count_balance,
              our_missing_count: -2, // FAZLA atandı
              owner_missing_count: 4,
            },
          },
        }),
      ),
    );
    render(<LandShareAllocationView />);
    const note = screen.getByTestId("paylasim-form-atanmayan-notu");
    expect(note).toHaveTextContent("2 bize fazla atandı");
    expect(note).toHaveTextContent("4 arsa sahibine kalmalı");
  });
});

describe("🔴🔴 PG 264-266 — DEĞER DENGESİ HESAPLANAMAZ HÂLİ", () => {
  it("`is_within_tolerance: null` AÇIK bir 'hesaplanamıyor' hâli basar — yeşil onay DEĞİL, `%0` DEĞİL", () => {
    // Derleyicinin GÖRMEDİĞİ hata sınıfı: tip, alanın var olduğunu zorlar;
    // `null`u "yanlış"a ya da sıfıra indirgemenin YANLIŞ olduğunu SÖYLEMEZ.
    vi.mocked(useLandShareSummary).mockReturnValue(
      queryStub(
        summary({
          balance: {
            ...summary().balance,
            value_balance: {
              our_value: "0",
              owner_value: "0",
              assigned_value_total: "0",
              our_actual_pct: null,
              owner_actual_pct: null,
              deviation_pct: null,
              tolerance_pct: "2.00",
              is_within_tolerance: null,
            },
          },
        }),
      ),
    );
    render(<LandShareAllocationView />);

    const verdict = screen.getByTestId("paylasim-form-denge-hukmu");
    expect(verdict).toHaveAttribute("data-verdict", "uncomputable");
    expect(verdict).toHaveTextContent(/hesaplanamıyor/i);
    // 🔴 "uygun" da "sapıyor" da DEMEZ.
    expect(verdict.textContent ?? "").not.toMatch(/denge(si)? uygun/i);
    // 🔴 Gerçekleşen oran `%0 / %0` BASILMAZ.
    const ratio = screen.getByTestId("paylasim-form-gerceklesen-oran");
    expect(ratio).toHaveTextContent("—");
    expect(ratio.textContent ?? "").not.toContain("%0");
  });

  it("hesaplanabilir hâlde ONAY hükmü basılır ve eşik SUNUCUDAN gelir", () => {
    render(<LandShareAllocationView />);
    const verdict = screen.getByTestId("paylasim-form-denge-hukmu");
    expect(verdict).toHaveAttribute("data-verdict", "ok");
    // `tolerance_pct: "2.00"` → istemcide eşik SABİTİ yok.
    expect(verdict).toHaveTextContent("%2");
  });

  it("PG 252 'Eksik' İŞARETLİ basılır (eksi = fazla atama)", () => {
    render(<LandShareAllocationView />);
    expect(screen.getByTestId("paylasim-form-eksik-adet")).toHaveTextContent("3 ünite");
  });
});

describe("🔴 Sözleşmesi olmayan proje — 404 BOŞ ÖZET DEĞİLDİR", () => {
  it("404 açıklayıcı boş hâl basar; '%0/%0 paylaşım' YAZILMAZ", () => {
    vi.mocked(useLandShareSummary).mockReturnValue(errorStub(new BackendError(404, null)));
    vi.mocked(useLandShareUnits).mockReturnValue(errorStub(new BackendError(404, null)));
    render(<LandShareAllocationView />);

    expect(screen.getByTestId("paylasim-form-ozet-uyari")).toHaveTextContent(
      ALLOCATION_NO_CONTRACT_MESSAGE,
    );
    // Kutucuklar ve denge kartı HİÇ basılmaz — sıfırlarla dolu bir özet,
    // kullanıcıya verisinin silindiğini düşündürürdü.
    expect(screen.queryByTestId("paylasim-form-oran-kutusu")).toBeNull();
    expect(screen.queryByTestId("paylasim-form-denge-kart")).toBeNull();
    expect(screen.getByTestId("paylasim-form-govde").textContent ?? "").not.toContain("%0");
  });

  it("403 YETKİ dalını basar (404'ten AYRI cümle)", () => {
    vi.mocked(useLandShareSummary).mockReturnValue(errorStub(new BackendError(403, null)));
    render(<LandShareAllocationView />);
    expect(screen.getByTestId("paylasim-form-ozet-uyari")).toHaveTextContent(/yetki/i);
    expect(screen.getByTestId("paylasim-form-ozet-uyari").textContent ?? "").not.toContain(
      ALLOCATION_NO_CONTRACT_MESSAGE,
    );
  });
});

describe("PG 105-241 — tablo, süzgeç ve sayfalama", () => {
  it("satırlar `LandShareUnitRow` alanlarıyla basılır (Rayiç Değer dâhil)", () => {
    render(<LandShareAllocationView />);
    const row = screen.getByTestId("paylasim-form-satir-A-9");
    expect(row).toHaveTextContent("A-9");
    expect(row).toHaveTextContent("3+1");
    expect(row).toHaveTextContent("1.380.000");
  });

  it("rayiç değeri GİRİLMEMİŞ satırda `0` DEĞİL, boş işareti basılır", () => {
    vi.mocked(useLandShareUnits).mockReturnValue(
      queryStub(unitList({ items: [unitRow({ appraisal_value: null })], total: 1 })),
    );
    render(<LandShareAllocationView />);
    const row = screen.getByTestId("paylasim-form-satir-A-9");
    expect(within(row).getAllByText("—").length).toBeGreaterThan(0);
    expect(row.textContent ?? "").not.toContain("0,00");
  });

  it("hissedar sütunu satırın TARAFINA göre değişir (PG 144 · 190 · 221)", () => {
    render(<LandShareAllocationView />);
    expect(screen.getByTestId("paylasim-form-satir-A-9")).toHaveTextContent("Atanmadı");
    expect(screen.getByTestId("paylasim-form-satir-A-1")).toHaveTextContent("Yüklenici payı");
    // ARSA satırında seçici vardır; BİZ satırında YOKTUR (422 kapısı).
    expect(screen.getByTestId("paylasim-form-hissedar-A-2")).toBeInTheDocument();
    expect(screen.queryByTestId("paylasim-form-hissedar-A-1")).toBeNull();
  });

  it("PG 112-115 dört süzgeç: üç enum üyesi + süzgeçsiz 'Tümü'", () => {
    render(<LandShareAllocationView />);
    // Varsayılan mockup'ın AKTİF sekmesidir (PG 112).
    expect(screen.getByTestId("paylasim-form-suzgec-unassigned")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(vi.mocked(useLandShareUnits).mock.calls.at(-1)?.[1]).toMatchObject({
      ownerSide: "unassigned",
    });

    fireEvent.click(screen.getByTestId("paylasim-form-suzgec-all"));
    // "Tümü" bir enum üyesi DEĞİL: `ownerSide` HİÇ gönderilmez.
    expect(vi.mocked(useLandShareUnits).mock.calls.at(-1)?.[1]).not.toHaveProperty("ownerSide");

    fireEvent.click(screen.getByTestId("paylasim-form-suzgec-contractor"));
    expect(vi.mocked(useLandShareUnits).mock.calls.at(-1)?.[1]).toMatchObject({
      ownerSide: "contractor",
    });
  });

  it("süzgeç rozetlerinin sayıları ÖZETTEN gelir (sayfadaki satırlardan DEĞİL)", () => {
    render(<LandShareAllocationView />);
    // Sayfada 3 satır var ama özet 42 ünite / 6 atanmayan diyor.
    expect(screen.getByTestId("paylasim-form-suzgec-all")).toHaveTextContent("Tümü (42)");
    expect(screen.getByTestId("paylasim-form-suzgec-unassigned")).toHaveTextContent(
      "Atanmayan (6)",
    );
  });

  it("🔴 SAYFALAMA çalışır — `offset` sunucunun `limit`iyle ilerler", () => {
    vi.mocked(useLandShareUnits).mockReturnValue(
      queryStub(unitList({ total: 120, limit: 50, offset: 0 })),
    );
    render(<LandShareAllocationView />);
    expect(screen.getByTestId("paylasim-form-sayfa")).toHaveTextContent("Sayfa 1 / 3");
    expect(screen.getByTestId("paylasim-form-onceki")).toBeDisabled();

    fireEvent.click(screen.getByTestId("paylasim-form-sonraki"));
    expect(vi.mocked(useLandShareUnits).mock.calls.at(-1)?.[1]).toMatchObject({ offset: 50 });
  });

  it("tek sayfalık listede sayfa çubuğu BASILMAZ", () => {
    render(<LandShareAllocationView />);
    expect(screen.queryByTestId("paylasim-form-sayfa")).toBeNull();
  });

  it("satılmış ünitenin sahiplik düğmeleri KİLİTLİDİR (kalan-7 · #215)", () => {
    vi.mocked(useLandShareUnits).mockReturnValue(
      queryStub(
        unitList({
          items: [
            unitRow({
              unit_id: "u-sold",
              unit_no: "A-9",
              sales_status: "sold",
              buyer_name: "Zeynep Arslan",
            }),
          ],
          total: 1,
        }),
      ),
    );
    render(<LandShareAllocationView />);

    expect(screen.getByTestId("paylasim-form-biz-A-9")).toBeDisabled();
    expect(screen.getByTestId("paylasim-form-arsa-A-9")).toBeDisabled();

    fireEvent.click(screen.getByTestId("paylasim-form-biz-A-9"));
    fireEvent.click(screen.getByTestId("paylasim-form-kaydet"));

    // Sunucudan farklı bir gövde ÜRETİLMEMELİ — tıklama etkisiz kalmalı.
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("blok süzgeci sorguya girer (gövdeye DEĞİL)", () => {
    render(<LandShareAllocationView />);
    fireEvent.change(screen.getByTestId("paylasim-form-blok-suzgec"), {
      target: { value: "blk-a" },
    });
    expect(vi.mocked(useLandShareUnits).mock.calls.at(-1)?.[1]).toMatchObject({
      blockId: "blk-a",
    });
  });
});

describe("🔴 PATCH gövdesi — YALNIZ DEĞİŞEN satırlar, `null` HAYATTA KALIR", () => {
  it("değişmemiş satırlar gövdeye GİRMEZ (uç ATOMİKTİR)", async () => {
    render(<LandShareAllocationView />);
    fireEvent.click(screen.getByTestId("paylasim-form-biz-A-9"));
    fireEvent.click(screen.getByTestId("paylasim-form-kaydet"));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    const body = lastBody();
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toEqual({
      unit_id: "u-1",
      owner_side: "contractor",
      shareholder_id: null,
    });
  });

  it("🔴 `owner_side: null` HAYATTA KALIR — atama kaldırılabilir", async () => {
    // Klasik `null` ↔ `undefined` tuzağı: doğruluk kontrolüyle elenirse
    // kullanıcı bir atamayı ASLA geri alamaz.
    render(<LandShareAllocationView />);
    // A-1 zaten BİZİM; aynı düğmeye basmak atamayı KALDIRIR.
    fireEvent.click(screen.getByTestId("paylasim-form-biz-A-1"));
    fireEvent.click(screen.getByTestId("paylasim-form-kaydet"));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    const item = lastBody().items[0];
    expect(item.unit_id).toBe("u-2");
    expect(item).toHaveProperty("owner_side");
    expect(item.owner_side).toBeNull();
  });

  it("🔴 GUARD 10 (bağlantı düzeyinde): toplu 'Yüklenici (Biz)' hissedarı TEMİZLER", async () => {
    // A-2 sunucuda ARSA + `sh-1`. BİZ'e alınınca hissedar AYNI istekte
    // temizlenmelidir; sunucu aksi hâlde 422 döner ve uç ATOMİK olduğu için
    // TÜM kayıt düşerdi.
    render(<LandShareAllocationView />);
    fireEvent.click(screen.getByLabelText("A-2 seç"));
    fireEvent.click(screen.getByTestId("paylasim-form-toplu-biz"));
    fireEvent.click(screen.getByTestId("paylasim-form-kaydet"));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    expect(lastBody().items).toEqual([
      { unit_id: "u-3", owner_side: "contractor", shareholder_id: null },
    ]);
  });

  it("satır içi hissedar seçimi gövdeye girer (yalnız ARSA satırında)", async () => {
    render(<LandShareAllocationView />);
    fireEvent.change(screen.getByTestId("paylasim-form-hissedar-A-2"), {
      target: { value: "sh-2" },
    });
    fireEvent.click(screen.getByTestId("paylasim-form-kaydet"));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    expect(lastBody().items).toEqual([
      { unit_id: "u-3", owner_side: "landowner", shareholder_id: "sh-2" },
    ]);
  });

  it("uç PATCH'tir ve proje PATH'ten gider (gövdede `project_id` YOK)", async () => {
    render(<LandShareAllocationView />);
    fireEvent.click(screen.getByTestId("paylasim-form-arsa-A-9"));
    fireEvent.click(screen.getByTestId("paylasim-form-kaydet"));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    expect(mutateAsync.mock.calls[0][0].projectId).toBe("prj-1");
    expect(lastBody()).not.toHaveProperty("project_id");
  });

  it("değişiklik yokken kaydet KAPALIDIR ve sebebi GÖRÜNÜRDÜR", () => {
    render(<LandShareAllocationView />);
    expect(screen.getByTestId("paylasim-form-kaydet")).toBeDisabled();
    expect(screen.getByTestId("paylasim-form-degisiklik-yok")).toHaveTextContent(
      ALLOCATION_NO_CHANGES_MESSAGE,
    );
    expect(mutateAsync).not.toHaveBeenCalled();
  });
});

describe("🔴 PG 101 'Otomatik Dağıt' — SUNUCUYA HİÇBİR ŞEY GİTMEZ", () => {
  it("yalnız BEKLEYEN atama üretir; 'Paylaşımı Kaydet' denene kadar istek YOK", async () => {
    render(<LandShareAllocationView />);
    fireEvent.click(screen.getByTestId("paylasim-form-otomatik-dagit"));

    // Ekranda atama GÖRÜNÜR (A-9 artık bir tarafa basıldı)…
    await waitFor(() =>
      expect(
        screen.getByTestId("paylasim-form-biz-A-9").getAttribute("aria-pressed") === "true" ||
          screen.getByTestId("paylasim-form-arsa-A-9").getAttribute("aria-pressed") === "true",
      ).toBe(true),
    );
    // …ama HİÇBİR istek atılmadı.
    expect(mutateAsync).not.toHaveBeenCalled();

    // Kaydete basılınca TEK istek gider ve YALNIZ değişen satırı taşır.
    fireEvent.click(screen.getByTestId("paylasim-form-kaydet"));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(lastBody().items).toHaveLength(1);
  });

  it("etiket SÖZLEŞMEDEN türer — mockup'ın %55/%45'i sabitlenmemiştir", () => {
    vi.mocked(useLandShareSummary).mockReturnValue(
      queryStub(
        summary({
          contract: { ...summary().contract, our_share_pct: "60.00", owner_share_pct: "40.00" },
        }),
      ),
    );
    render(<LandShareAllocationView />);
    expect(screen.getByTestId("paylasim-form-otomatik-dagit")).toHaveTextContent(
      "Otomatik Dağıt (%60/%40)",
    );
  });

  it("rayiç değeri OLMAYAN üniteler dağıtıma girmez ve gerekçe GÖRÜNÜR", async () => {
    vi.mocked(useLandShareUnits).mockReturnValue(
      queryStub(
        unitList({ items: [unitRow({ appraisal_value: null })], total: 1 }),
      ),
    );
    render(<LandShareAllocationView />);
    fireEvent.click(screen.getByTestId("paylasim-form-otomatik-dagit"));
    await waitFor(() =>
      expect(screen.getByTestId("paylasim-form-dagitim-notu")).toHaveTextContent(
        ALLOCATION_SKIPPED_WITHOUT_VALUE_MESSAGE,
      ),
    );
  });
});

describe("🔴 'Otomatik Dağıt' ZATEN ATANMIŞLARI SAYAR (varsayılan süzgeç onları GİZLER)", () => {
  it("kalan kapasite ÖZETTEKİ atanmış adetten düşülür — hedef dolu taraf atlanır", async () => {
    // 42 ünite · hedef 23/19 · 22'si bize, 2'si arsa sahibine ZATEN atanmış.
    // Varsayılan "Atanmayan" süzgecinde listede yalnız atanmamışlar görünür.
    vi.mocked(useLandShareSummary).mockReturnValue(
      queryStub(
        summary({
          balance: {
            count_balance: {
              ...summary().balance.count_balance,
              our_assigned_count: 22,
              owner_assigned_count: 2,
              unassigned_count: 18,
            },
            value_balance: {
              ...summary().balance.value_balance,
              our_value: "22000000",
              owner_value: "2000000",
            },
          },
        }),
      ),
    );
    vi.mocked(useLandShareUnits).mockReturnValue(
      queryStub({
        items: [UNASSIGNED, unitRow({ unit_id: "u-9", unit_no: "A-10", appraisal_value: "1000000" })],
        total: 18,
        limit: 50,
        offset: 0,
      }),
    );
    render(<LandShareAllocationView />);
    fireEvent.click(screen.getByTestId("paylasim-form-otomatik-dagit"));

    // Bizim hedefimizde 1 yer kaldı, arsa sahibininkinde 17: ikisi de ARSA'ya
    // gider. Sayaçlar sıfırdan sayılsaydı en pahalı ünite BİZE giderdi.
    await waitFor(() =>
      expect(screen.getByTestId("paylasim-form-arsa-A-9")).toHaveAttribute("aria-pressed", "true"),
    );
    expect(screen.getByTestId("paylasim-form-biz-A-9")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("paylasim-form-arsa-A-10")).toHaveAttribute("aria-pressed", "true");
  });
});

describe("🔴 ATOMİK BAŞARISIZLIK — 'hiçbiri yazılmadı' AÇIKÇA söylenir", () => {
  it("reddedilen PATCH sonrası tablo SUNUCU hâlini gösterir ve hiçbir şey yazılmadığı yazılır", async () => {
    mutateAsync.mockRejectedValue(new BackendError(404, { detail: "Kayıt bulunamadı" }));
    render(<LandShareAllocationView />);

    fireEvent.click(screen.getByTestId("paylasim-form-biz-A-9"));
    fireEvent.click(screen.getByTestId("paylasim-form-kaydet"));

    await waitFor(() =>
      expect(screen.getByTestId("paylasim-form-hata")).toHaveTextContent(ALLOCATION_ATOMIC_HINT),
    );
    // Sunucu gövdesi de OLDUĞU GİBİ basılır.
    expect(screen.getByTestId("paylasim-form-hata")).toHaveTextContent("Kayıt bulunamadı");
    // A-1 (sunucuda BİZİM) HÂLÂ bizimdir: ekran "bir kısmı yazıldı" demez.
    expect(screen.getByTestId("paylasim-form-biz-A-1")).toHaveAttribute("aria-pressed", "true");
    // A-2 (sunucuda ARSA) de değişmemiştir.
    expect(screen.getByTestId("paylasim-form-arsa-A-2")).toHaveAttribute("aria-pressed", "true");
  });

  // M5_1 kayıt #139: `resetSelection()` eskiden `formError`ı TEMİZLEMİYORDU —
  // yalnız `handleChangeProject` bunu ayrıca yapıyordu. Süzgeç/sayfa/blok
  // değişince bayat hata banner'ı ekranda KALIYORDU.
  it("bayat 'kaydedilemedi' hatası süzgeç değişince TEMİZLENİR", async () => {
    mutateAsync.mockRejectedValue(new BackendError(404, { detail: "Kayıt bulunamadı" }));
    render(<LandShareAllocationView />);

    fireEvent.click(screen.getByTestId("paylasim-form-biz-A-9"));
    fireEvent.click(screen.getByTestId("paylasim-form-kaydet"));
    await waitFor(() => expect(screen.getByTestId("paylasim-form-hata")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("paylasim-form-suzgec-all"));
    expect(screen.queryByTestId("paylasim-form-hata")).not.toBeInTheDocument();
  });

  // M5_1 kayıt #140: süzgeç/sayfa düğmeleri `disabled` prop'unu okumuyordu —
  // kaydetme SÜRERKEN kullanıcı süzgeç/sayfa değiştirip `resetSelection()`ı
  // tetikleyebiliyordu (seçim/bildirimler boşalır, yeni GET başlar).
  it("kaydetme SÜRERKEN süzgeç ve sayfa düğmeleri de KAPALIDIR", () => {
    vi.mocked(useUpdateAllocation).mockReturnValue({
      mutate: vi.fn(),
      mutateAsync,
      isPending: true,
    } as never);
    render(<LandShareAllocationView />);

    expect(screen.getByTestId("paylasim-form-suzgec-all")).toBeDisabled();
    expect(screen.getByTestId("paylasim-form-suzgec-unassigned")).toBeDisabled();
  });
});

describe("🔴 Başarılı kayıt — tablo CEVAPTAN çizilir, ikinci GET atılmaz", () => {
  it("yanıt güncel tam listedir: satır sunucunun yazdığı hâle döner", async () => {
    mutateAsync.mockResolvedValue(
      allocationResponse([
        { id: "u-1", owner_side: "landowner", shareholder_id: "sh-3", shareholder_name: "Ali" },
      ]),
    );
    render(<LandShareAllocationView />);

    fireEvent.click(screen.getByTestId("paylasim-form-arsa-A-9"));
    fireEvent.click(screen.getByTestId("paylasim-form-kaydet"));

    // Bekleyen katman boşaldı → "kaydedilecek değişiklik yok" hâline dönüldü.
    // LAND-FLAKY-F1 (ölçüldü): `aria-pressed` BEKLEYEN katmandan da hemen true
    // olur — onu beklemek `waitFor`u ilk senkron denemede geçiriyor, kayıt
    // sonrası render ise (await sonrası, act dışı) Scheduler'la yarışıyordu.
    // "Kayıt tamamlandı"nın ayırt edici sinyali kaydet düğmesinin kapanmasıdır.
    await waitFor(() => expect(screen.getByTestId("paylasim-form-kaydet")).toBeDisabled());
    expect(screen.getByTestId("paylasim-form-arsa-A-9")).toHaveAttribute("aria-pressed", "true");
    // Satır cevaptaki hissedarı gösterir.
    expect(
      (screen.getByTestId("paylasim-form-hissedar-A-9") as HTMLSelectElement).value,
    ).toBe("sh-3");
    // TEK istek atıldı — kaydetten sonra ikinci bir çağrı YOK.
    expect(mutateAsync).toHaveBeenCalledTimes(1);
  });
});

describe("PG 109 · 90 — toplu seçim", () => {
  it("'Tümünü Seç' görünen satırların hepsini seçer, ikinci tıklama BOŞALTIR", () => {
    render(<LandShareAllocationView />);
    fireEvent.click(screen.getByTestId("paylasim-form-tumunu-sec"));
    expect(screen.getByTestId("paylasim-form-secim-rozeti")).toHaveTextContent("3 ünite seçili");
    fireEvent.click(screen.getByTestId("paylasim-form-tumunu-sec"));
    expect(screen.getByTestId("paylasim-form-secim-rozeti")).toHaveTextContent("0 ünite seçili");
  });

  it("seçim yokken toplu düğmeler KAPALIDIR", () => {
    render(<LandShareAllocationView />);
    expect(screen.getByTestId("paylasim-form-toplu-biz")).toBeDisabled();
    expect(screen.getByTestId("paylasim-form-toplu-arsa")).toBeDisabled();
  });

  it("süzgeç değişince seçim BOŞALIR (görünmeyen satır toplu işleme girmez)", () => {
    render(<LandShareAllocationView />);
    fireEvent.click(screen.getByTestId("paylasim-form-tumunu-sec"));
    fireEvent.click(screen.getByTestId("paylasim-form-suzgec-all"));
    expect(screen.getByTestId("paylasim-form-secim-rozeti")).toHaveTextContent("0 ünite seçili");
  });

  it("toplu hissedar YALNIZ ARSA satırlarına uygulanır (BİZ satırı DEĞİŞMEZ)", async () => {
    render(<LandShareAllocationView />);
    fireEvent.click(screen.getByTestId("paylasim-form-tumunu-sec"));
    fireEvent.change(screen.getByTestId("paylasim-form-toplu-hissedar"), {
      target: { value: "sh-2" },
    });
    fireEvent.click(screen.getByTestId("paylasim-form-kaydet"));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    // Yalnız A-2 (ARSA) değişti; A-9 (atanmamış) ve A-1 (BİZ) gövdeye girmedi.
    expect(lastBody().items).toEqual([
      { unit_id: "u-3", owner_side: "landowner", shareholder_id: "sh-2" },
    ]);
  });
});

/**
 * 🔴 KUSUR 49 — SAYFA DEĞİŞTİREN KULLANICININ İŞİ SESSİZCE KAYBOLUYORDU.
 * Gövde YALNIZ görünen satırlardan kurulur (`build-body.ts` kural 4) ve
 * sayfa değişiminde bekleyen atamalar KASITLI olarak korunur (View:197-203);
 * ama başarılı kayıt TÜM `pending`i siliyordu — gönderilmeyenler dâhil.
 */
describe("🔴 Başarılı kayıt YALNIZ GÖNDERİLEN satırların bekleyenini temizler", () => {
  const PAGE_TWO_ROW = unitRow({ unit_id: "u-50", unit_no: "B-1" });

  function stubPagedUnits() {
    vi.mocked(useLandShareUnits).mockImplementation((...args: unknown[]) => {
      const offset = (args[1] as { offset?: number } | undefined)?.offset ?? 0;
      return queryStub({
        items: offset === 0 ? [UNASSIGNED] : [PAGE_TWO_ROW],
        total: 120,
        limit: 50,
        offset,
      });
    });
  }

  it("görünmeyen sayfanın bekleyen ataması kayıttan SONRA da durur", async () => {
    stubPagedUnits();
    mutateAsync.mockResolvedValue(
      allocationResponse([{ id: "u-50", owner_side: "contractor", shareholder_id: null }]),
    );
    render(<LandShareAllocationView />);

    // 1. sayfada A-9 bize atanır (bu satır HİÇ gönderilmeyecek).
    fireEvent.click(screen.getByTestId("paylasim-form-biz-A-9"));
    // 2. sayfaya geçilir ve B-1 atanır.
    fireEvent.click(screen.getByTestId("paylasim-form-sonraki"));
    fireEvent.click(await screen.findByTestId("paylasim-form-biz-B-1"));
    fireEvent.click(screen.getByTestId("paylasim-form-kaydet"));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    // Gövde sözleşmesi AYNI: yalnız görünen sayfanın değişen satırı gitti.
    expect(lastBody().items).toEqual([
      { unit_id: "u-50", owner_side: "contractor", shareholder_id: null },
    ]);

    // 1. sayfaya dönülür: A-9 ataması HÂLÂ ekranda olmalıdır.
    fireEvent.click(screen.getByTestId("paylasim-form-onceki"));
    const bizA9 = await screen.findByTestId("paylasim-form-biz-A-9");
    expect(bizA9).toHaveAttribute("aria-pressed", "true");
  });

  // SEKME-F1.3-FIX O5 · `useUnsavedChanges(hasAllocationChanges(rows, state), …)`
  // yalnız o an EKRANDA GÖRÜNEN sayfanın satırlarına bakıyordu (`build-body.ts`
  // kural 4 ile AYNI kaynak) — kaydet düğmesinin kapsamıyla doğru olsa da, üst
  // çubuğun sekme onayı için YANLIŞTIR: `state.pending` sayfalar arası TÜM
  // bekleyen atamaları taşır. 1. sayfada atama yapılıp 2. sayfaya geçilince
  // kayıt YANLIŞLIKLA temiz görünmemeli (sessiz veri kaybı riski).
  it("sayfa 1'de atama yapılıp sayfa 2'ye geçilince üst çubuk kaydı 'kirli' KALIR", async () => {
    stubPagedUnits();
    const { unmount } = render(<LandShareAllocationView />);
    expect(unsavedRegistry.hasUnsaved()).toBe(false);

    fireEvent.click(screen.getByTestId("paylasim-form-biz-A-9"));
    expect(unsavedRegistry.hasUnsaved()).toBe(true);

    fireEvent.click(screen.getByTestId("paylasim-form-sonraki"));
    await screen.findByTestId("paylasim-form-biz-B-1");
    // A-9 artık GÖRÜNMÜYOR ama ataması hâlâ `state.pending`dedir.
    expect(unsavedRegistry.hasUnsaved()).toBe(true);

    unmount();
  });
});
