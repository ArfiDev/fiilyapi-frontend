import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { backendClient } from "@/lib/api/client";

import {
  OFFERS_QUERY_KEY,
  normalizeOfferListFilter,
  offerDetailKey,
  offerListKey,
  offerRevisionKey,
  offerSettingsKey,
} from "./offer-query-keys";
import { useOffer, useOfferRevision, useOfferSettings, useOffers } from "./useOffers";

vi.mock("@/lib/api/client", () => ({ backendClient: { GET: vi.fn() } }));

let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function ok(data: unknown) {
  return { data, error: undefined, response: new Response(null, { status: 200 }) } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

describe("offer-query-keys — anahtarlar TEK yerde", () => {
  it("anahtar biçimleri (liste · detay · revizyon · ayar)", () => {
    expect(offerListKey({})).toEqual([OFFERS_QUERY_KEY, {}]);
    expect(offerDetailKey("o-1")).toEqual(["offer", "o-1"]);
    expect(offerRevisionKey("o-1", 2)).toEqual(["offer", "o-1", "revision", 2]);
    expect(offerSettingsKey()).toEqual(["offer-settings"]);
  });

  it("revizyon anahtarı detay anahtarının ÖN EKİYLE başlar (exact olmayan geçersizleme ikisini de tazeler)", () => {
    expect(offerRevisionKey("o-1", 0).slice(0, 2)).toEqual(offerDetailKey("o-1"));
  });

  it("aynı süzgeç → aynı anahtar: alan sırası ve boş/undefined alanlar anahtarı DEĞİŞTİRMEZ", () => {
    expect(offerListKey({ status: "sent", q: "kaba" })).toEqual(offerListKey({ q: "kaba", status: "sent", employerId: "", dateFrom: undefined }));
    expect(normalizeOfferListFilter({ q: "", status: undefined, limit: 0 })).toEqual({ limit: 0 }); // 0 bir DEĞERDİR
  });

  it("TKL-B6.8: `conversion` süzgeci anahtara girer; farklı değer → farklı anahtar, boş → anahtarı DEĞİŞTİRMEZ", () => {
    expect(offerListKey({ conversion: "converted" })).toEqual([OFFERS_QUERY_KEY, { conversion: "converted" }]);
    expect(offerListKey({ conversion: "converted" })).not.toEqual(offerListKey({ conversion: "won_not_converted" }));
    expect(offerListKey({ conversion: undefined, status: "won" })).toEqual(offerListKey({ status: "won" }));
  });
});

describe("useOffers / useOffer / useOfferRevision / useOfferSettings", () => {
  it("liste: yalnız dolu süzgeçler sorguya girer (snake_case parametre adlarıyla)", async () => {
    vi.mocked(backendClient.GET).mockResolvedValue(ok({ items: [], total: 0 }));
    const { result } = renderHook(
      () => useOffers({ status: "sent", q: "kaba", employerId: "emp-1", dateFrom: "2026-01-01", dateTo: "2026-12-31", limit: 200, offset: 0 }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(backendClient.GET).toHaveBeenCalledWith("/offers", {
      params: {
        query: { status: "sent", q: "kaba", employer_id: "emp-1", offer_date_from: "2026-01-01", offer_date_to: "2026-12-31", limit: 200, offset: 0 },
      },
    });
  });

  it("TKL-B6.8: conversion sorguya `conversion` adıyla girer", async () => {
    vi.mocked(backendClient.GET).mockResolvedValue(ok({ items: [], total: 0 }));
    const { result } = renderHook(() => useOffers({ conversion: "won_not_converted", status: "won" }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(backendClient.GET).toHaveBeenCalledWith("/offers", {
      params: { query: { status: "won", conversion: "won_not_converted" } },
    });
  });

  it("boş süzgeç: sorgu parametresi YOK (boş metin gönderilmez)", async () => {
    vi.mocked(backendClient.GET).mockResolvedValue(ok({ items: [], total: 0 }));
    const { result } = renderHook(() => useOffers({ q: "" }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(backendClient.GET).toHaveBeenCalledWith("/offers", { params: { query: {} } });
  });

  it("detay: yol parametresi + anahtar; offerId yokken sorgu KAPALI (istek atılmaz)", async () => {
    vi.mocked(backendClient.GET).mockResolvedValue(ok({ id: "o-1" }));
    const idle = renderHook(() => useOffer(undefined), { wrapper });
    expect(idle.result.current.fetchStatus).toBe("idle");
    expect(backendClient.GET).not.toHaveBeenCalled();

    const { result } = renderHook(() => useOffer("o-1"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(backendClient.GET).toHaveBeenCalledWith("/offers/{offer_id}", { params: { path: { offer_id: "o-1" } } });
    expect(client.getQueryData(offerDetailKey("o-1"))).toEqual({ id: "o-1" });
  });

  it("revizyon: rev_no 0 geçerli bir DEĞERDİR (sorgu açık); rev undefined iken KAPALI", async () => {
    vi.mocked(backendClient.GET).mockResolvedValue(ok({ rev_no: 0 }));
    const idle = renderHook(() => useOfferRevision("o-1", undefined), { wrapper });
    expect(idle.result.current.fetchStatus).toBe("idle");

    const { result } = renderHook(() => useOfferRevision("o-1", 0), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(backendClient.GET).toHaveBeenCalledWith("/offers/{offer_id}/revisions/{rev_no}", {
      params: { path: { offer_id: "o-1", rev_no: 0 } },
    });
    expect(client.getQueryData(offerRevisionKey("o-1", 0))).toEqual({ rev_no: 0 });
  });

  it("ayarlar: GET /offers/settings", async () => {
    vi.mocked(backendClient.GET).mockResolvedValue(ok({ default_vat_pct: "20.00" }));
    const { result } = renderHook(() => useOfferSettings(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(backendClient.GET).toHaveBeenCalledWith("/offers/settings", {});
  });

  it("403 (kısıtlı kullanıcı, SO-19) BackendError olarak yüzer", async () => {
    vi.mocked(backendClient.GET).mockResolvedValue({
      data: undefined,
      error: { detail: "forbidden" },
      response: new Response(null, { status: 403 }),
    } as never);
    const { result } = renderHook(() => useOffers(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toMatchObject({ status: 403 });
  });
});
