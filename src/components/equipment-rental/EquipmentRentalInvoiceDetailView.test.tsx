import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";
import {
  QueryClient,
  QueryClientProvider,
  type UseQueryResult,
} from "@tanstack/react-query";

import { EquipmentRentalInvoiceDetailView } from "./EquipmentRentalInvoiceDetailView";
import { useEquipmentRentalInvoice } from "@/lib/api/hooks/useEquipmentRentalInvoices";
import type { RentalInvoiceDetailResponse } from "@/lib/api/hooks/useEquipmentRentalInvoices";
import { useSuppliers } from "@/lib/api/hooks/useSuppliers";
import { useSiteOptions } from "@/lib/api/hooks/useSiteOptions";
import { useSession } from "@/components/shell/SessionProvider";
import { meFixture, pageGrant } from "@/lib/auth/page-grants.testkit";
import type { MeResponse } from "@/lib/auth/types";

/*
 * F-KIRA FINAL REVIEW BEKÇİSİ — YÜKLEME/HATA DALLARININ SIRASI.
 *
 * 🔴 BULUNAN KUSUR: hata dalı, yükleme dalından SONRA yazılmıştı. Hata
 * hâlinde `isLoading` false olur ama `data` yine `undefined`, dolayısıyla
 * ondan türeyen form taslağı da `null` kalır — yükleme koşulu bunu yutuyordu
 * ve ekran SONSUZA KADAR "Yükleniyor…" basıyordu. Kullanıcı hatayı HİÇ
 * görmezdi ve "sessiz atlama yok" kuralı fiilen çiğnenirdi.
 *
 * Dört kapının dördü de bunu göremezdi (tip doğru, lint temiz, derleme
 * geçiyor) ve e2e'de bir sunucu hatasını zorlamak da kolay değil — bu yüzden
 * bekçi BURADA, dalların doğrudan çakıldığı yerde yaşar.
 */

vi.mock("next/navigation", () => ({
  usePathname: () => "/makine/kira/rental-2",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock(
  "@/lib/api/hooks/useEquipmentRentalInvoices",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("@/lib/api/hooks/useEquipmentRentalInvoices")
    >()),
    useEquipmentRentalInvoice: vi.fn(),
  }),
);
vi.mock("@/lib/api/hooks/useSuppliers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useSuppliers")>()),
  useSuppliers: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useSiteOptions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useSiteOptions")>()),
  useSiteOptions: vi.fn(),
}));

const mockDetail = vi.mocked(useEquipmentRentalInvoice);
const mockSuppliers = vi.mocked(useSuppliers);
const mockSites = vi.mocked(useSiteOptions);
const mockSession = vi.mocked(useSession);

type DetailQuery = UseQueryResult<RentalInvoiceDetailResponse, Error>;

/** Mutasyon hook'lari bir `QueryClient` ister (invalidate icin). */
function renderView() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <EquipmentRentalInvoiceDetailView invoiceId="rental-2" />
    </QueryClientProvider>,
  );
}

function detailQuery(overrides: Partial<DetailQuery>): DetailQuery {
  return {
    data: undefined,
    error: null,
    isLoading: false,
    isError: false,
    isSuccess: false,
    ...overrides,
  } as DetailQuery;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.mockReturnValue({
    me: { permissions: { equipment: "full" } } as unknown as MeResponse,
  } as unknown as ReturnType<typeof useSession>);
  mockSuppliers.mockReturnValue({
    data: { items: [], total: 0, limit: 200, offset: 0 },
    isSuccess: true,
  } as unknown as ReturnType<typeof useSuppliers>);
  mockSites.mockReturnValue({ options: [], isLoading: false, isError: false });
});

describe("EquipmentRentalInvoiceDetailView · yükleme/hata dallarının SIRASI", () => {
  it("🔴 HATA hâlinde 'Yükleniyor…' DEĞİL hata mesajı basılır", () => {
    mockDetail.mockReturnValue(
      detailQuery({ isError: true, error: new Error("500") }),
    );

    renderView();

    expect(screen.getByText("Kira hakedişi yüklenemedi.")).toBeVisible();
    // Kusur geri gelirse BU iddia kırılır: hata yükleme dalına yutulurdu.
    expect(screen.queryByText("Yükleniyor…")).toBeNull();
  });

  it("gerçekten yüklenirken 'Yükleniyor…' basılır (dal hâlâ çalışıyor)", () => {
    mockDetail.mockReturnValue(detailQuery({ isLoading: true }));

    renderView();

    expect(screen.getByText("Yükleniyor…")).toBeVisible();
    expect(screen.queryByText("Kira hakedişi yüklenemedi.")).toBeNull();
  });
});

/*
 * KÖR BEKÇİ · "makine-kira-loaded-sites" İŞARETİ HATA HÂLİNDE DE TAKILIYORDU.
 *
 * `useSiteOptions` `isLoading` ile `isError`i AYRI döndürür
 * (src/lib/api/hooks/useSiteOptions.ts:46-47). Bir projenin
 * `GET /projects/{id}/sites` çağrısı 500 dönerse `isLoading` false olur,
 * `options` EKSİK kalır ve işaret yine de takılırdı. Şantiye seçicisi KAPALI
 * bir `<select>` olduğundan görsel kare değişmez — görsel kapı bu körlüğe
 * yedek OLAMAZ.
 */
const DETAIL_FIXTURE = {
  id: "rental-2",
  status: "draft",
  supplier_id: "sup-1",
  supplier_name: "Kiralama A.Ş.",
  invoice_no: "F-1",
  invoice_amount: "1000.00",
  period_year: 2026,
  period_month: 7,
  site_id: null,
  rate_period: "monthly",
  lines: [],
  site_distribution: [],
  totals: {
    excluded_breakdown_amount: "0.00",
    excluded_breakdown_unknown_count: 0,
    invoice_amount: "1000.00",
    our_total: "1000.00",
    our_total_unknown_count: 0,
    owned_total: "0.00",
    owned_total_unknown_count: 0,
    payable_total: "1000.00",
    vat_amount: "200.00",
    vat_rate: "20.00",
  },
} as unknown as RentalInvoiceDetailResponse;

describe("EquipmentRentalInvoiceDetailView · izin eşiği backend ile eşleşir (kayıt 92)", () => {
  it("`equipment` seviyesi `approve` iken form SALT-OKUNUR (backend yalnız `full` ister)", () => {
    mockSession.mockReturnValue({
      me: { permissions: { equipment: "approve" } } as unknown as MeResponse,
    } as unknown as ReturnType<typeof useSession>);
    mockDetail.mockReturnValue(detailQuery({ isSuccess: true, data: DETAIL_FIXTURE }));

    renderView();

    expect(screen.getByTestId("makine-kira-supplier")).toBeDisabled();
  });
});

describe("EquipmentRentalInvoiceDetailView · Şantiye alanı DÜZENLENEBİLİR bir alandır, süzgeç değil (kayıt 94)", () => {
  it("boş seçenek 'Tüm Şantiyeler' DEĞİL, depoya özdeş 'Atanmamış' metnini taşır", () => {
    mockDetail.mockReturnValue(detailQuery({ isSuccess: true, data: DETAIL_FIXTURE }));

    renderView();

    const select = screen.getByTestId("makine-kira-site") as HTMLSelectElement;
    const emptyOption = select.querySelector('option[value=""]');
    expect(emptyOption).not.toBeNull();
    expect(emptyOption?.textContent).toBe("Atanmamış");
    expect(emptyOption?.textContent).not.toBe("Tüm Şantiyeler");
  });
});

describe("EquipmentRentalInvoiceDetailView · şantiye seçeneklerinin 'yüklendi' işareti", () => {
  it("🔴 şantiye çağrısı HATA verdiğinde 'yüklendi' işareti TAKILMAZ", () => {
    mockDetail.mockReturnValue(
      detailQuery({ data: DETAIL_FIXTURE, isSuccess: true }),
    );
    mockSites.mockReturnValue({ options: [], isLoading: false, isError: true });

    renderView();

    expect(screen.queryByTestId("makine-kira-loaded-sites")).toBeNull();
  });

  // POZİTİF KONTROL — yoksa yukarıdaki iddia "hiç var olmayan" bir şeyi ölçer.
  it("şantiyeler gerçekten yüklendiğinde işaret TAKILIR", () => {
    mockDetail.mockReturnValue(
      detailQuery({ data: DETAIL_FIXTURE, isSuccess: true }),
    );
    mockSites.mockReturnValue({
      options: [{ siteId: "s-1", projectId: "p-1", label: "Güneşkent A-Blok" }],
      isLoading: false,
      isError: false,
    });

    renderView();

    expect(screen.getByTestId("makine-kira-loaded-sites")).toBeInTheDocument();
  });
});

/**
 * SEKME-F1.3b · merkezi kayda bağlanma bekçisi. 🔴 ASYNC TABAN: `draft`
 * yalnız GET başarıyla dönünce dolar (üstteki `useEffect`); dirty hesabı da
 * AYNI karşılaştırmayı kullanır, kayıt sonrası invalidation `detail`i
 * tazeler ve efekt `draft`ı yeniden hizalar — dolaylı sıfırlama.
 */
describe("EquipmentRentalInvoiceDetailView — kaydedilmemiş değişiklik kaydı", () => {
  it("yüklendi, dokunulmadı → temiz (seed efektinden SONRA da)", () => {
    mockDetail.mockReturnValue(detailQuery({ isSuccess: true, data: DETAIL_FIXTURE }));
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <EquipmentRentalInvoiceDetailView invoiceId="rental-2" />
      </QueryClientProvider>,
    );
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });

  it("başlık alanı değiştirildi → kirli", () => {
    mockDetail.mockReturnValue(detailQuery({ isSuccess: true, data: DETAIL_FIXTURE }));
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <EquipmentRentalInvoiceDetailView invoiceId="rental-2" />
      </QueryClientProvider>,
    );
    fireEvent.change(screen.getByTestId("makine-kira-invoice-no"), { target: { value: "F-2" } });
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
  });

  it("sunucudan gelen YENİ `detail` (kayıt sonrası invalidation) taslağı hizalar → temiz", () => {
    mockDetail.mockReturnValue(detailQuery({ isSuccess: true, data: DETAIL_FIXTURE }));
    const { rerender } = render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <EquipmentRentalInvoiceDetailView invoiceId="rental-2" />
      </QueryClientProvider>,
    );
    fireEvent.change(screen.getByTestId("makine-kira-invoice-no"), { target: { value: "F-2" } });
    expect(unsavedRegistry.hasUnsaved()).toBe(true);

    const updated = { ...DETAIL_FIXTURE, invoice_no: "F-2" };
    mockDetail.mockReturnValue(detailQuery({ isSuccess: true, data: updated }));
    rerender(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <EquipmentRentalInvoiceDetailView invoiceId="rental-2" />
      </QueryClientProvider>,
    );
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });
});

describe("IZN-F5b-A madde 11 · kira hakedişi başlık/satır düzenleme = saha.makine_kira Düzenler (sekme başına kapı)", () => {
  function setPages(options: Parameters<typeof meFixture>[0]) {
    mockSession.mockReturnValue({ me: meFixture(options) } as unknown as ReturnType<typeof useSession>);
    mockDetail.mockReturnValue(detailQuery({ isSuccess: true, data: DETAIL_FIXTURE }));
  }

  it("yalnız saha.makine_kira Düzenler → form DÜZENLENEBİLİR (modül none olsa da)", () => {
    setPages({ pages: { "saha.makine_kira": pageGrant("edit") }, permissions: { equipment: "none" } });
    renderView();
    expect(screen.getByTestId("makine-kira-supplier")).toBeEnabled();
  });

  it("yalnız KARDEŞ sayfalar (ekipman/çalışma/yakıt) Düzenler, kira Görür → form SALT-OKUNUR", () => {
    setPages({
      pages: {
        "saha.makine_kira": pageGrant("view"),
        "saha.makine_ekipman": pageGrant("edit"),
        "saha.makine_calisma": pageGrant("edit"),
        "saha.makine_yakit": pageGrant("edit"),
      },
      permissions: { equipment: "full" },
    });
    renderView();
    expect(screen.getByTestId("makine-kira-supplier")).toBeDisabled();
  });
});
