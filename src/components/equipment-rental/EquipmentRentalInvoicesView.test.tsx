import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { EquipmentRentalInvoicesView } from "./EquipmentRentalInvoicesView";
import { useEquipmentRentalInvoices } from "@/lib/api/hooks/useEquipmentRentalInvoices";
import { useSuppliers } from "@/lib/api/hooks/useSuppliers";
import { useSiteOptions } from "@/lib/api/hooks/useSiteOptions";
import { useSession } from "@/components/shell/SessionProvider";
import { meFixture } from "@/lib/auth/page-grants.testkit";

/*
 * KÖR BEKÇİ · "makine-kira-loaded-sites" İŞARETİ HATA HÂLİNDE DE TAKILIYORDU.
 *
 * `useSiteOptions` `isLoading` ve `isError`i AYRI döndürür
 * (src/lib/api/hooks/useSiteOptions.ts:46-47): bir projenin
 * `GET /projects/{id}/sites` çağrısı 500 dönerse `isLoading` false olur ve
 * "yüklendi" işareti TAKILIRDI. Şantiye seçicisi KAPALI bir `<select>`
 * olduğu için görsel kare piksel olarak aynı kalır — yani görsel kapı bu
 * körlüğe yedek OLAMAZ. Üç görsel test (e2e/equipment-rental-visual.spec.ts:
 * 85/102/121) eksik seçenek listesiyle sessizce YEŞİL geçerdi.
 */

vi.mock("next/navigation", () => ({
  usePathname: () => "/makine/kira",
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
    useEquipmentRentalInvoices: vi.fn(),
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

const mockInvoices = vi.mocked(useEquipmentRentalInvoices);
const mockSuppliers = vi.mocked(useSuppliers);
const mockSites = vi.mocked(useSiteOptions);
const mockSession = vi.mocked(useSession);

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.mockReturnValue({
    me: meFixture(),
  } as unknown as ReturnType<typeof useSession>);
  mockInvoices.mockReturnValue({
    data: { items: [], total: 0, limit: 200, offset: 0 },
    error: null,
    isSuccess: true,
  } as unknown as ReturnType<typeof useEquipmentRentalInvoices>);
  mockSuppliers.mockReturnValue({
    data: { items: [], total: 0, limit: 200, offset: 0 },
    isSuccess: true,
  } as unknown as ReturnType<typeof useSuppliers>);
});

describe("EquipmentRentalInvoicesView · şantiye seçeneklerinin 'yüklendi' işareti", () => {
  it("🔴 şantiye çağrısı HATA verdiğinde 'yüklendi' işareti TAKILMAZ", () => {
    mockSites.mockReturnValue({ options: [], isLoading: false, isError: true });

    render(<EquipmentRentalInvoicesView />);

    expect(screen.queryByTestId("makine-kira-loaded-sites")).toBeNull();
  });

  // POZİTİF KONTROL — yoksa yukarıdaki iddia "hiç var olmayan" bir şeyi ölçer.
  it("şantiyeler gerçekten yüklendiğinde işaret TAKILIR", () => {
    mockSites.mockReturnValue({
      options: [{ siteId: "s-1", projectId: "p-1", label: "Güneşkent A-Blok" }],
      isLoading: false,
      isError: false,
    });

    render(<EquipmentRentalInvoicesView />);

    expect(screen.getByTestId("makine-kira-loaded-sites")).toBeInTheDocument();
  });

  it("şantiyeler YÜKLENİRKEN işaret TAKILMAZ (mevcut dal korunuyor)", () => {
    mockSites.mockReturnValue({ options: [], isLoading: true, isError: false });

    render(<EquipmentRentalInvoicesView />);

    expect(screen.queryByTestId("makine-kira-loaded-sites")).toBeNull();
  });
});
