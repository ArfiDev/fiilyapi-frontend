import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { useSession } from "@/components/shell/SessionProvider";

import { meFixture, pageGrant } from "./page-grants.testkit";
import { useButtonGate, usePagePermission } from "./usePagePermission";

vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));

function session(me: ReturnType<typeof meFixture> | null) {
  vi.mocked(useSession).mockReturnValue({ me, isLoading: me === null } as ReturnType<typeof useSession>);
}

describe("usePagePermission", () => {
  beforeEach(() => vi.clearAllMocks());

  it("tek anahtar: oturumdaki grant'tan V/E/A çıkarır", () => {
    session(meFixture({ pages: { "mali.fatura": pageGrant("edit", true) } }));
    const { result } = renderHook(() => usePagePermission("mali.fatura"));
    expect(result.current).toMatchObject({ canView: true, canEdit: true, canApprove: true, isSystemAdmin: false, hasGrant: true });
  });

  it("anahtar dizisi: VEYA (ikiz sayfa)", () => {
    session(meFixture({ pages: { "saha.puantaj": pageGrant("none"), "santiye.puantaj": pageGrant("edit") } }));
    const { result } = renderHook(() => usePagePermission(["saha.puantaj", "santiye.puantaj"]));
    expect(result.current.canEdit).toBe(true);
  });

  it("oturum yokken hasGrant false", () => {
    session(null);
    const { result } = renderHook(() => usePagePermission("mali.fatura"));
    expect(result.current.hasGrant).toBe(false);
  });
});

describe("useButtonGate", () => {
  beforeEach(() => vi.clearAllMocks());

  it("IZN-F6a · pages alanı olmayan eski oturum → modül izni full olsa da KAPALI (fallback yok)", () => {
    session(meFixture({ permissions: { invoicing: "full" } }));
    const { result } = renderHook(() => useButtonGate({ pages: "mali.fatura", need: "edit" }));
    expect(result.current).toBe(false);
  });

  it("IZN-F6a · pages boş ({}) → KAPALI", () => {
    session(meFixture({ pages: {} }));
    const { result } = renderHook(() => useButtonGate({ pages: "mali.fatura", need: "approve" }));
    expect(result.current).toBe(false);
  });

  it("IZN-F6a · oturum yükleniyor (me yok) → KAPALI", () => {
    vi.mocked(useSession).mockReturnValue({ me: null, isLoading: true } as ReturnType<typeof useSession>);
    const { result } = renderHook(() => useButtonGate({ pages: "mali.fatura", need: "view" }));
    expect(result.current).toBe(false);
  });

  it("grant view → edit kapısı kapalı", () => {
    session(meFixture({ pages: { "mali.fatura": pageGrant("view") } }));
    const { result } = renderHook(() => useButtonGate({ pages: "mali.fatura", need: "edit" }));
    expect(result.current).toBe(false);
  });

  it("approve bayrağı varsa approve kapısı açık, edit kapısı kapalı", () => {
    session(meFixture({ pages: { "mali.fatura": pageGrant("view", true) } }));
    const approve = renderHook(() => useButtonGate({ pages: "mali.fatura", need: "approve" }));
    const edit = renderHook(() => useButtonGate({ pages: "mali.fatura", need: "edit" }));
    expect(approve.result.current).toBe(true);
    expect(edit.result.current).toBe(false);
  });

  it("sa kapısı: sistem yöneticisi geçer, edit+approve yetmez", () => {
    session(meFixture({ pages: { "mali.fatura": pageGrant("edit", true) } }));
    expect(renderHook(() => useButtonGate({ pages: "mali.fatura", need: "sa" })).result.current).toBe(false);
    session(meFixture({ pages: { "mali.fatura": pageGrant("none") }, isSystemAdmin: true }));
    expect(renderHook(() => useButtonGate({ pages: "mali.fatura", need: "sa" })).result.current).toBe(true);
  });
});

// ── IZN-F3.2 · proje bağlamı ────────────────────────────────────────────────────────────
describe("usePagePermission / useButtonGate · proje bağlamı", () => {
  const PROJECT = "11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const member = {
    pages: { "proje.isveren_hakedis": pageGrant("view") } as const,
    projects: [{ project_id: PROJECT, role_key: "site_chief" }],
    rolePages: { site_chief: { "proje.isveren_hakedis": pageGrant("edit") } },
  };

  beforeEach(() => vi.clearAllMocks());

  it("projectId ile proje rolünün izni; projectId'siz ana rolün izni", () => {
    session(meFixture(member));
    const inProject = renderHook(() => usePagePermission("proje.isveren_hakedis", PROJECT));
    const company = renderHook(() => usePagePermission("proje.isveren_hakedis"));
    expect(inProject.result.current.canEdit).toBe(true);
    expect(company.result.current.canEdit).toBe(false);
  });

  it("useButtonGate({ projectId }): proje rolü edit verince açar; başka projede ana rol", () => {
    session(meFixture(member));
    const gate = (projectId: string | undefined) =>
      renderHook(() =>
        useButtonGate({ pages: "proje.isveren_hakedis", need: "edit", projectId }),
      ).result.current;
    expect(gate(PROJECT)).toBe(true);
    expect(gate(undefined)).toBe(false);
    expect(gate("99999999-9999-9999-9999-999999999999")).toBe(false);
  });

  it("IZN-F5c · proje rolünün haritasında anahtar yoksa (model devrede) KAPALI", () => {
    session(meFixture({ ...member, rolePages: { site_chief: {} } }));
    const allowed = renderHook(() =>
      useButtonGate({ pages: "proje.isveren_hakedis", need: "edit", projectId: PROJECT }),
    );
    expect(allowed.result.current).toBe(false);
  });

  it("adres anahtarı slug iken kimlik önbellekten çözülür (projeler detayı önbelleği)", () => {
    session(meFixture(member));
    const client = new QueryClient();
    client.setQueryData(["project", "kule-a"], { id: PROJECT });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(
      () => useButtonGate({ pages: "proje.isveren_hakedis", need: "edit", projectId: "kule-a" }),
      { wrapper },
    );
    expect(result.current).toBe(true);
  });
});
