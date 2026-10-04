import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

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

  it("pages alanı olmayan eski oturum → fallback", () => {
    session(meFixture({ permissions: { invoicing: "full" } }));
    const allowed = renderHook(() => useButtonGate({ pages: "mali.fatura", need: "edit", fallback: true }));
    const denied = renderHook(() => useButtonGate({ pages: "mali.fatura", need: "edit", fallback: false }));
    expect(allowed.result.current).toBe(true);
    expect(denied.result.current).toBe(false);
  });

  it("pages boş ({}) → fallback", () => {
    session(meFixture({ pages: {} }));
    const { result } = renderHook(() => useButtonGate({ pages: "mali.fatura", need: "approve", fallback: true }));
    expect(result.current).toBe(true);
  });

  it("grant varken fallback yok sayılır: view → edit kapısı kapalı", () => {
    session(meFixture({ pages: { "mali.fatura": pageGrant("view") } }));
    const { result } = renderHook(() => useButtonGate({ pages: "mali.fatura", need: "edit", fallback: true }));
    expect(result.current).toBe(false);
  });

  it("approve bayrağı varsa approve kapısı açık, edit kapısı kapalı", () => {
    session(meFixture({ pages: { "mali.fatura": pageGrant("view", true) } }));
    const approve = renderHook(() => useButtonGate({ pages: "mali.fatura", need: "approve", fallback: false }));
    const edit = renderHook(() => useButtonGate({ pages: "mali.fatura", need: "edit", fallback: false }));
    expect(approve.result.current).toBe(true);
    expect(edit.result.current).toBe(false);
  });

  it("sa kapısı: sistem yöneticisi geçer, edit+approve yetmez", () => {
    session(meFixture({ pages: { "mali.fatura": pageGrant("edit", true) } }));
    expect(renderHook(() => useButtonGate({ pages: "mali.fatura", need: "sa", fallback: true })).result.current).toBe(false);
    session(meFixture({ pages: { "mali.fatura": pageGrant("none") }, isSystemAdmin: true }));
    expect(renderHook(() => useButtonGate({ pages: "mali.fatura", need: "sa", fallback: false })).result.current).toBe(true);
  });
});
