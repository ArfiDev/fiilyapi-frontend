import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";

import { BackendError } from "@/lib/api/unwrap";
import { EMPTY_KEYS } from "./trail-node";
import { useCrumbNames } from "./useCrumbNames";

/** TKL-F3.3 · teklif kırıntısının adı = teklif numarası; YALNIZ önbellekten (`["offer", id]`). */
const OFFER_ID = "o-1";
const KEYS = { ...EMPTY_KEYS, entityId: OFFER_ID };

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

describe("useCrumbNames — teklif adı (TKL-F3.3)", () => {
  it("önbellekteki teklifin numarasını verir", () => {
    const { client, wrapper } = setup();
    client.setQueryData(["offer", OFFER_ID], { offer_no: "TKL-2026-0014" });
    const { result } = renderHook(() => useCrumbNames(KEYS), { wrapper });
    expect(result.current.offer).toBe("TKL-2026-0014");
    expect(result.current.unresolved?.has("offer")).toBe(false);
  });

  it("önbellekte yoksa ad YOK ve çözülemedi sayılmaz (iskelet beklenir)", () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useCrumbNames(KEYS), { wrapper });
    expect(result.current.offer).toBeUndefined();
    expect(result.current.unresolved?.has("offer")).toBe(false);
  });

  it("sorgu hata verdiyse (404/403) çözülemedi kümesine girer — sonsuz iskelet basılmaz", async () => {
    const { client, wrapper } = setup();
    await client
      .fetchQuery({
        queryKey: ["offer", OFFER_ID],
        queryFn: async () => {
          throw new BackendError(404, { detail: "Teklif bulunamadı" });
        },
      })
      .catch(() => undefined);
    const { result } = renderHook(() => useCrumbNames(KEYS), { wrapper });
    await waitFor(() => expect(result.current.unresolved?.has("offer")).toBe(true));
    expect(result.current.offer).toBeUndefined();
  });

  it("başka bir teklifin önbelleği bu rotanın adını vermez", () => {
    const { client, wrapper } = setup();
    client.setQueryData(["offer", "o-2"], { offer_no: "TKL-2026-0099" });
    const { result } = renderHook(() => useCrumbNames(KEYS), { wrapper });
    expect(result.current.offer).toBeUndefined();
  });
});
