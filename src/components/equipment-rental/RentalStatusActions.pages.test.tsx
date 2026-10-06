import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { RentalStatusActions } from "./RentalStatusActions";
import type { RentalInvoiceDetailResponse } from "@/lib/api/hooks/useEquipmentRentalInvoices";
import { useSession } from "@/components/shell/SessionProvider";
import { meFixture, pageGrant } from "@/lib/auth/page-grants.testkit";

// IZN-F2.x — kira hakedişi Onayla / Ödendi / Onayı Geri Al = saha.makine_kira ONAYLAR (düzenle değil).
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));

function session(me: ReturnType<typeof meFixture>) {
  vi.mocked(useSession).mockReturnValue({ me, isLoading: false } as ReturnType<typeof useSession>);
}

function renderActions(status: RentalInvoiceDetailResponse["status"]) {
  const detail = { id: "rental-2", status } as RentalInvoiceDetailResponse;
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <RentalStatusActions detail={detail} />
    </QueryClientProvider>,
  );
}

describe("RentalStatusActions · sayfa izni kapısı (IZN-F2.x)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("saha.makine_kira Onaylar → doğrulama bekleyen hakedişte 'Onayla ve Ödemeye Gönder' var", () => {
    session(meFixture({ pages: { "saha.makine_kira": pageGrant("view", true) } }));
    renderActions("pending_verification");
    expect(screen.getByTestId("makine-kira-approve")).toBeInTheDocument();
  });

  it("saha.makine_kira Düzenler (Onaylar YOK) → onay düğmesi YOK (modül izni full olsa bile)", () => {
    session(meFixture({ pages: { "saha.makine_kira": pageGrant("edit") }, permissions: { equipment: "full" } }));
    renderActions("pending_verification");
    expect(screen.queryByTestId("makine-kira-approve")).toBeNull();
    expect(screen.queryByTestId("makine-kira-actions")).toBeNull();
  });

  it("Onaylar → onaylı hakedişte 'Ödendi İşaretle' ve 'Onayı Geri Al' var", () => {
    session(meFixture({ pages: { "saha.makine_kira": pageGrant("view", true) } }));
    renderActions("approved");
    expect(screen.getByTestId("makine-kira-pay")).toBeInTheDocument();
    expect(screen.getByTestId("makine-kira-reject")).toBeInTheDocument();
  });

  it("yalnız Görür → hiçbir eylem yok", () => {
    session(meFixture({ pages: { "saha.makine_kira": pageGrant("view") } }));
    renderActions("approved");
    expect(screen.queryByTestId("makine-kira-actions")).toBeNull();
  });

  it("başka sayfanın (makine_ekipman) Onaylar bayrağı kira onayını açmaz", () => {
    session(meFixture({ pages: { "saha.makine_kira": pageGrant("edit"), "saha.makine_ekipman": pageGrant("view", true) } }));
    renderActions("pending_verification");
    expect(screen.queryByTestId("makine-kira-approve")).toBeNull();
  });

  it("pages boş → fail-closed: modül izni full olsa bile eylem yok (IZN-F6a)", () => {
    session(meFixture({ pages: {}, permissions: { equipment: "full" } }));
    renderActions("pending_verification");
    expect(screen.queryByTestId("makine-kira-actions")).toBeNull();
  });

  it("sistem yöneticisi: grant yokken bile onay düğmesi var", () => {
    session(meFixture({ pages: { "saha.makine_kira": pageGrant("none") }, isSystemAdmin: true }));
    renderActions("pending_verification");
    expect(screen.getByTestId("makine-kira-approve")).toBeInTheDocument();
  });
});
