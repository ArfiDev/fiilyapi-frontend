import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

import { useDisciplineScope } from "./useDisciplineScope";
import { useSession } from "@/components/shell/SessionProvider";
import type { MeResponse } from "@/lib/auth/types";

vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));

function mockMe(extra: Record<string, unknown> | null) {
  const me = extra === null ? null : ({ id: "u1", ...extra } as unknown as MeResponse);
  vi.mocked(useSession).mockReturnValue({ me, isLoading: false });
}

describe("useDisciplineScope", () => {
  beforeEach(() => vi.clearAllMocks());

  it("disiplini olmayan kullanıcı kısıtsızdır", () => {
    mockMe({ disciplines: [] });
    const { result } = renderHook(() => useDisciplineScope());
    expect(result.current).toEqual({ isRestricted: false, names: [] });
  });

  it("oturum yokken ya da alan yokken kısıtsız sayılır", () => {
    mockMe(null);
    expect(renderHook(() => useDisciplineScope()).result.current.isRestricted).toBe(false);
    mockMe({});
    expect(renderHook(() => useDisciplineScope()).result.current.isRestricted).toBe(false);
  });

  it("boşluk-only ad: kısıtlı kalır, ad atılır (adsız metin dalı)", () => {
    mockMe({ disciplines: [{ id: "a", code: "CW", name: "  ", color: "#000000" }] });
    const { result } = renderHook(() => useDisciplineScope());
    expect(result.current).toEqual({ isRestricted: true, names: [] });
  });

  it("DisciplineRef yükü: kısıtlı, adlar dolu", () => {
    mockMe({
      disciplines: [
        { id: "a", code: "CW", name: "Civil Works", color: "#000000" },
        { id: "b", code: "MK", name: "Mekanik", color: "#111111" },
      ],
    });
    const { result } = renderHook(() => useDisciplineScope());
    expect(result.current).toEqual({ isRestricted: true, names: ["Civil Works", "Mekanik"] });
  });
});
