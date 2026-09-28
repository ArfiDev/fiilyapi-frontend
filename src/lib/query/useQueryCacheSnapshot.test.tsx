import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { useQueryCacheSnapshot } from "./useQueryCacheSnapshot";

const KEY = ["snapshot-test", "k1"];

function Reader() {
  const state = useQueryCacheSnapshot<{ name: string }>(KEY);
  return <div data-testid="reader">{state?.data?.name ?? "yok"}</div>;
}

function renderReader(client: QueryClient) {
  return render(
    <QueryClientProvider client={client}>
      <Reader />
    </QueryClientProvider>,
  );
}

describe("useQueryCacheSnapshot", () => {
  it("önbellekte veri varsa onu okur, ağa hiç çıkmaz", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(KEY, { name: "Güneşkent Konut" });
    const fetchSpy = vi.fn(() => Promise.reject(new Error("ağa çıkmamalı")));
    vi.stubGlobal("fetch", fetchSpy);

    renderReader(client);

    expect(screen.getByTestId("reader")).toHaveTextContent("Güneşkent Konut");
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("önbellek boşken 'yok' basar (skipToken'lı eski davranışla AYNI sözleşme)", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderReader(client);
    expect(screen.getByTestId("reader")).toHaveTextContent("yok");
  });

  it("başka bir gözlemci veriyi güncelleyince yeniden render olur (gözlemcisiz de canlı kalır)", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderReader(client);
    expect(screen.getByTestId("reader")).toHaveTextContent("yok");

    act(() => {
      client.setQueryData(KEY, { name: "A-Blok" });
    });

    await waitFor(() => expect(screen.getByTestId("reader")).toHaveTextContent("A-Blok"));
  });

  /**
   * POZİTİF KONTROL — `getSnapshot` kararlılığı. Durum DEĞİŞMEDİĞİ sürece
   * `client.getQueryState` AYNI referansı döner (Query'nin `state` alanı
   * yalnız gerçek bir geçişte değişir); bu yüzden gerçek kanca `React`ın
   * "getSnapshot should be cached" / "Maximum update depth exceeded"
   * uyarılarını HİÇ tetiklemez — birden fazla ilgisiz yeniden render'dan
   * (ör. `key` prop'unun değişmemesi) sonra bile.
   *
   * MUTASYON (elle doğrulandı, kalıcı kod DEĞİL): `getSnapshot` gövdesi
   * `() => ({ ...client.getQueryState(queryKey) })` gibi HER ÇAĞRIDA yeni
   * bir nesne dönecek şekilde bozulduğunda bu test `console.error`
   * çağrıldığı için KIRMIZI düşer (React'ın sonsuz döngü uyarısı) —
   * mutasyon geri alınınca yeniden YEŞİL olur.
   */
  it("kararlı referans: ilgisiz yeniden render sonrasında da React uyarı basmaz", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(KEY, { name: "Sabit" });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const { rerender } = renderReader(client);
    // Aynı client'la, veri DEĞİŞMEDEN birkaç kez daha render edilir — kararlı
    // referans bu döngüde React'ı asla "sonsuz render" sanmaya itmemelidir.
    for (let i = 0; i < 5; i += 1) {
      rerender(
        <QueryClientProvider client={client}>
          <Reader />
        </QueryClientProvider>,
      );
    }

    expect(screen.getByTestId("reader")).toHaveTextContent("Sabit");
    expect(consoleError).not.toHaveBeenCalled();

    consoleError.mockRestore();
  });
});
