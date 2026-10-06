import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ProgressPaymentStatusActions } from "./ProgressPaymentStatusActions";
import { SubcontractorProgressPaymentStatusActions } from "./SubcontractorProgressPaymentStatusActions";
import { useSession } from "@/components/shell/SessionProvider";
import { meFixture, pageGrant } from "@/lib/auth/page-grants.testkit";
import type { ProgressPaymentDetail } from "@/lib/api/hooks/useProgressPayments";
import type { SubcontractorProgressPaymentDetail } from "@/lib/api/hooks/useSubcontractorProgressPayments";

// IZN-F2.x — Onaya Gönder = hakediş sayfaları Düzenler · Onayla/Reddet/Ödendi = hakediş Onaylar (işveren / taşeron ayrı) ·
// Onayı Geri Al = YALNIZ sistem yöneticisi.
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));

function session(me: ReturnType<typeof meFixture>) {
  vi.mocked(useSession).mockReturnValue({ me, isLoading: false } as ReturnType<typeof useSession>);
}

function employer(status: ProgressPaymentDetail["status"]) {
  const detail = { id: "pp-1", status } as ProgressPaymentDetail;
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ProgressPaymentStatusActions detail={detail} />
    </QueryClientProvider>,
  );
}

function subcontractor(status: SubcontractorProgressPaymentDetail["status"]) {
  const detail = { id: "spp-1", status } as SubcontractorProgressPaymentDetail;
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <SubcontractorProgressPaymentStatusActions detail={detail} />
    </QueryClientProvider>,
  );
}

const button = (name: string) => screen.queryByRole("button", { name });

beforeEach(() => vi.clearAllMocks());

describe("İşveren hakediş durum eylemleri · sayfa izni kapıları (IZN-F2.x)", () => {
  it("hakediş sayfası Düzenler → taslakta 'Onaya Gönder' var", () => {
    session(meFixture({ pages: { "mali.hakedis_isveren": pageGrant("edit") } }));
    employer("draft");
    expect(button("Onaya Gönder")).toBeInTheDocument();
  });

  it("IZN-F5b · Onaya Gönder = işveren ailesi: santiye.hakedisler Düzenler açar; taşeron hakediş Düzenler AÇMAZ", () => {
    session(meFixture({ pages: { "santiye.hakedisler": pageGrant("edit") } }));
    const { unmount } = employer("draft");
    expect(button("Onaya Gönder")).toBeInTheDocument();
    unmount();
    session(meFixture({ pages: { "mali.hakedis_taseron": pageGrant("edit") } }));
    employer("draft");
    expect(button("Onaya Gönder")).toBeNull();
  });

  it("yalnız Görür → 'Onaya Gönder' YOK", () => {
    session(meFixture({ pages: { "mali.hakedis_isveren": pageGrant("view") } }));
    employer("draft");
    expect(button("Onaya Gönder")).toBeNull();
  });

  it("Onaylar → Onayla + Reddet var; Düzenler tek başına YOK", () => {
    session(meFixture({ pages: { "mali.hakedis_isveren": pageGrant("view", true) } }));
    const { unmount } = employer("pending_approval");
    expect(button("Onayla")).toBeInTheDocument();
    expect(button("Reddet")).toBeInTheDocument();
    unmount();
    session(meFixture({ pages: { "mali.hakedis_isveren": pageGrant("edit") } }));
    employer("pending_approval");
    expect(button("Onayla")).toBeNull();
  });

  it("santiye.hakedisler Onaylar (ortak sayfa) → işveren onayını açar", () => {
    session(meFixture({ pages: { "santiye.hakedisler": pageGrant("view", true) } }));
    employer("pending_approval");
    expect(button("Onayla")).toBeInTheDocument();
  });

  it("taşeron hakediş Onaylar bayrağı İŞVEREN onayını AÇMAZ", () => {
    session(meFixture({ pages: { "mali.hakedis_isveren": pageGrant("view"), "mali.hakedis_taseron": pageGrant("view", true) } }));
    employer("pending_approval");
    expect(button("Onayla")).toBeNull();
  });

  it("Onayı Geri Al yalnız SA: Onaylar kullanıcıda Ödendi var, Geri Al YOK; SA'da ikisi de var", () => {
    session(meFixture({ pages: { "mali.hakedis_isveren": pageGrant("edit", true) } }));
    const { unmount } = employer("approved");
    expect(button("Ödendi İşaretle")).toBeInTheDocument();
    expect(button("Onayı Geri Al")).toBeNull();
    unmount();
    session(meFixture({ pages: { "mali.hakedis_isveren": pageGrant("view") }, isSystemAdmin: true }));
    employer("approved");
    expect(button("Ödendi İşaretle")).toBeInTheDocument();
    expect(button("Onayı Geri Al")).toBeInTheDocument();
  });

  it("pages boş → fail-closed: modül izni approve/admin olsa bile Ödendi İşaretle ve Onayı Geri Al YOK (IZN-F6a)", () => {
    session(meFixture({ pages: {} }));
    const { unmount } = employer("approved");
    expect(button("Ödendi İşaretle")).toBeNull();
    expect(button("Onayı Geri Al")).toBeNull();
    unmount();
    session(meFixture({ pages: {} }));
    employer("approved");
    expect(button("Ödendi İşaretle")).toBeNull();
    expect(button("Onayı Geri Al")).toBeNull();
  });
});

describe("Taşeron hakediş durum eylemleri · sayfa izni kapıları (IZN-F2.x)", () => {
  it("mali.hakedis_taseron Onaylar → Onayla var; yalnız işveren Onaylar → YOK", () => {
    session(meFixture({ pages: { "mali.hakedis_taseron": pageGrant("view", true) } }));
    const { unmount } = subcontractor("pending_approval");
    expect(button("Onayla")).toBeInTheDocument();
    unmount();
    session(meFixture({ pages: { "mali.hakedis_isveren": pageGrant("view", true), "mali.hakedis_taseron": pageGrant("view") } }));
    subcontractor("pending_approval");
    expect(button("Onayla")).toBeNull();
  });

  it("IZN-F5b · Onaya Gönder = taşeron ailesi: mali.hakedis_taseron Düzenler açar; işveren ailesi (santiye.hakedisler dahil) AÇMAZ", () => {
    session(meFixture({ pages: { "proje.taseron_hakedis": pageGrant("edit") } }));
    const { unmount } = subcontractor("draft");
    expect(button("Onaya Gönder")).toBeInTheDocument();
    unmount();
    session(meFixture({ pages: { "mali.hakedis_isveren": pageGrant("edit") } }));
    const second = subcontractor("draft");
    expect(button("Onaya Gönder")).toBeNull();
    second.unmount();
    session(meFixture({ pages: { "santiye.hakedisler": pageGrant("edit") } }));
    subcontractor("draft");
    expect(button("Onaya Gönder")).toBeNull();
  });

  it("IZN-F5b · taşeron Onayla/Reddet: santiye.hakedisler Onaylar AÇMAZ (ortak sayfa yalnız işveren onayında)", () => {
    session(meFixture({ pages: { "santiye.hakedisler": pageGrant("view", true) } }));
    subcontractor("pending_approval");
    expect(button("Onayla")).toBeNull();
    expect(button("Reddet")).toBeNull();
  });

  it("Onayı Geri Al yalnız SA", () => {
    session(meFixture({ pages: { "mali.hakedis_taseron": pageGrant("edit", true) } }));
    subcontractor("approved");
    expect(button("Onayı Geri Al")).toBeNull();
  });
});
