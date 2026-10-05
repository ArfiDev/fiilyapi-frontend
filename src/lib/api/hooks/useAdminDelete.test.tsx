import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { backendClient } from "@/lib/api/client";
import { BackendError } from "@/lib/api/unwrap";
import { useAdminDelete, useDeletePreview } from "./useAdminDelete";
import { SITE_QUERY_KEY, SITES_QUERY_KEY } from "./useSites";
import { SECTION_QUERY_KEY } from "./useSection";
import { INVOICE_DETAIL_QUERY_KEY, INVOICE_PAYMENTS_QUERY_KEY } from "./useInvoiceDetail";
import { INVOICES_QUERY_KEY } from "./useInvoices";
import { CATALOG_ITEMS_QUERY_KEY } from "./catalog-query-keys";
import { PROGRESS_PAYMENTS_QUERY_KEY, PROGRESS_PAYMENT_QUERY_KEY } from "./useProgressPayments";
import { JOURNAL_ENTRIES_QUERY_KEY } from "./useJournalEntries";

vi.mock("@/lib/api/client", () => ({ backendClient: { GET: vi.fn(), DELETE: vi.fn() } }));

const ID = "44444444-4444-4444-4444-444444444444";

describe("useAdminDelete / useDeletePreview", () => {
  let client: QueryClient;
  function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  });

  it("önizleme türü ve kimliği yola, silme preview_token'ı sorguya verir", async () => {
    vi.mocked(backendClient.GET).mockResolvedValue({
      data: { preview_token: "tok" },
      error: undefined,
      response: new Response(),
    } as never);
    vi.mocked(backendClient.DELETE).mockResolvedValue({
      data: undefined,
      error: undefined,
      response: new Response(null, { status: 204 }),
    } as never);
    const preview = renderHook(() => useDeletePreview("site", ID), { wrapper });
    await waitFor(() => expect(preview.result.current.isSuccess).toBe(true));
    expect(backendClient.GET).toHaveBeenCalledWith("/admin/silme/{kind}/{record_id}/onizleme", {
      params: { path: { kind: "site", record_id: ID } },
    });

    const del = renderHook(() => useAdminDelete(), { wrapper });
    act(() => del.result.current.mutate({ kind: "site", id: ID, previewToken: "tok" }));
    await waitFor(() => expect(del.result.current.isSuccess).toBe(true));
    expect(backendClient.DELETE).toHaveBeenCalledWith("/admin/silme/{kind}/{record_id}", {
      params: { path: { kind: "site", record_id: ID }, query: { preview_token: "tok" } },
    });
  });

  it("başarıda şantiye/bölüm/liste sorguları yeniden ÇEKMEDEN bayat işaretlenir", async () => {
    const spy = vi.spyOn(client, "invalidateQueries");
    vi.mocked(backendClient.DELETE).mockResolvedValue({
      data: undefined,
      error: undefined,
      response: new Response(null, { status: 204 }),
    } as never);
    const del = renderHook(() => useAdminDelete(), { wrapper });
    act(() => del.result.current.mutate({ kind: "section", id: ID, previewToken: "t" }));
    await waitFor(() => expect(del.result.current.isSuccess).toBe(true));
    for (const key of [SITES_QUERY_KEY, SITE_QUERY_KEY, SECTION_QUERY_KEY]) {
      expect(spy).toHaveBeenCalledWith({ queryKey: [key], refetchType: "none" });
    }
  });

  it("hata fırlatırsa sorgular bayat işaretlenmez ve BackendError taşınır", async () => {
    const spy = vi.spyOn(client, "invalidateQueries");
    vi.mocked(backendClient.DELETE).mockResolvedValue({
      data: undefined,
      error: { code: "preview_stale", detail: "x" },
      response: new Response(null, { status: 409 }),
    } as never);
    const del = renderHook(() => useAdminDelete(), { wrapper });
    act(() => del.result.current.mutate({ kind: "site", id: ID, previewToken: "t" }));
    await waitFor(() => expect(del.result.current.isError).toBe(true));
    expect(del.result.current.error).toBeInstanceOf(BackendError);
    expect(spy).not.toHaveBeenCalled();
  });

  // SIL-F2.2 · mali aileler: AÇIK liste yeniden çekilir, silinen kaydın detayı ÇEKİLMEZ.
  describe("mali aileler (SIL-F2.2)", () => {
    async function deleteKind(kind: "progress_payment" | "invoice" | "payment" | "journal_entry") {
      const spy = vi.spyOn(client, "invalidateQueries");
      vi.mocked(backendClient.DELETE).mockResolvedValue({
        data: undefined,
        error: undefined,
        response: new Response(null, { status: 204 }),
      } as never);
      const del = renderHook(() => useAdminDelete(), { wrapper });
      act(() => del.result.current.mutate({ kind, id: ID, previewToken: "t" }));
      await waitFor(() => expect(del.result.current.isSuccess).toBe(true));
      return spy;
    }

    it("hakediş: liste + katalog son-fiyat AKTİF tazelenir, detay refetchType none", async () => {
      const spy = await deleteKind("progress_payment");
      expect(spy).toHaveBeenCalledWith({ queryKey: [PROGRESS_PAYMENTS_QUERY_KEY] });
      expect(spy).toHaveBeenCalledWith({ queryKey: [CATALOG_ITEMS_QUERY_KEY] });
      expect(spy).toHaveBeenCalledWith({ queryKey: [PROGRESS_PAYMENT_QUERY_KEY], refetchType: "none" });
    });

    it("fatura: detay ve ödemeler refetchType none (silinen fatura 404 yanıp sönmez)", async () => {
      const spy = await deleteKind("invoice");
      expect(spy).toHaveBeenCalledWith({ queryKey: [INVOICES_QUERY_KEY] });
      expect(spy).toHaveBeenCalledWith({ queryKey: [INVOICE_DETAIL_QUERY_KEY], refetchType: "none" });
      expect(spy).toHaveBeenCalledWith({ queryKey: [INVOICE_PAYMENTS_QUERY_KEY], refetchType: "none" });
    });

    it("ödeme: faturanın detayı + ödemeleri AKTİF tazelenir (fatura silinmedi, durumu türetilir)", async () => {
      const spy = await deleteKind("payment");
      expect(spy).toHaveBeenCalledWith({ queryKey: [INVOICE_PAYMENTS_QUERY_KEY] });
      expect(spy).toHaveBeenCalledWith({ queryKey: [INVOICE_DETAIL_QUERY_KEY] });
    });

    it("fiş: muhasebe kapsamı AKTİF tazelenir", async () => {
      const spy = await deleteKind("journal_entry");
      expect(spy).toHaveBeenCalledWith({ queryKey: [JOURNAL_ENTRIES_QUERY_KEY] });
    });
  });
});
