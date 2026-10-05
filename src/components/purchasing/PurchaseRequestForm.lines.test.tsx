import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSession } from "@/components/shell/SessionProvider";
import { useApprovalSettings } from "@/lib/api/hooks/useApprovals";
import {
  useCreatePurchaseRequest,
  useSubmitPurchaseRequest,
  useUpdatePurchaseRequest,
} from "@/lib/api/hooks/usePurchaseRequestMutations";
import { useProjects } from "@/lib/api/hooks/useProjects";
import { useSiteSections } from "@/lib/api/hooks/useSiteSections";
import { useSites } from "@/lib/api/hooks/useSites";
import { useStockSummary } from "@/lib/api/hooks/useStockSummary";
import { useSuppliers } from "@/lib/api/hooks/useSuppliers";
import type { components } from "@/lib/api/schema";
import { BackendError } from "@/lib/api/unwrap";
import type { HiddenCategory } from "@/lib/api/models";
import { meFixture } from "@/lib/auth/page-grants.testkit";

import { PurchaseRequestForm } from "./PurchaseRequestForm";
import {
  attachSavedLines,
  createPurchaseRequestLine,
  emptyPurchaseRequestFormValues,
} from "./purchase-request-form-state";

/**
 * IZN-F4d.3 — talep PATCH'i satırları sunucu `id`siyle geri gönderir (sözleşme §7.1): mevcut satır id'li, yeni satır
 * id'siz, silinen gövdede yok; maliyet gizli rolde fiyat anahtarı yok ama `id` var; 404/422 detail olduğu gibi basılır.
 */
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("@/lib/api/hooks/useProjects", () => ({ useProjects: vi.fn() }));
vi.mock("@/lib/api/hooks/useSites", () => ({ useSites: vi.fn() }));
vi.mock("@/lib/api/hooks/useSiteSections", () => ({ useSiteSections: vi.fn() }));
vi.mock("@/lib/api/hooks/useStockSummary", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useStockSummary")>()),
  useStockSummary: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useSuppliers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useSuppliers")>()),
  useSuppliers: vi.fn(),
}));
vi.mock("@/lib/api/hooks/usePurchaseRequestMutations", () => ({
  useCreatePurchaseRequest: vi.fn(),
  useUpdatePurchaseRequest: vi.fn(),
  useSubmitPurchaseRequest: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useApprovals", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useApprovals")>()),
  useApprovalSettings: vi.fn(),
}));

function queryStub<T>(data: unknown): T {
  return { data, isLoading: false, isError: false, error: null } as unknown as T;
}

type Saved = components["schemas"]["PurchaseRequestResponse"];

function savedRequest(lines: Array<{ id: string; price: string | null }>): Saved {
  return {
    id: "pr-1",
    request_no: "SAT-2026-0101",
    request_date: "2026-08-12",
    priority: "normal",
    project_id: "p-1",
    site_id: null,
    section_id: null,
    needed_by: null,
    justification: null,
    status: "draft",
    quote_deadline: null,
    approved_by_user_id: null,
    approved_at: null,
    rejected_at: null,
    rejection_reason: null,
    created_by_user_id: "u-1",
    created_at: "2026-08-12T09:00:00Z",
    estimated_total: "0.00",
    can_delete: true,
    lines: lines.map((line, index) => ({
      id: line.id,
      sort_order: index,
      stock_item_id: "s-1",
      stock_item_code: "DMR-012",
      free_text_name: null,
      free_text_unit: null,
      name: "Nervürlü Demir Ø12",
      unit: "Ton",
      quantity: "15.000",
      estimated_unit_price: line.price,
      line_total: null,
      current_stock: "2.4",
    })),
  } as unknown as Saved;
}

let createMutateAsync: ReturnType<typeof vi.fn>;
let updateMutateAsync: ReturnType<typeof vi.fn>;

function setHidden(hidden: readonly HiddenCategory[]) {
  vi.mocked(useSession).mockReturnValue({
    me: { ...meFixture({ hiddenFields: hidden }), permissions: { procurement: "full" } },
    isLoading: false,
  } as unknown as ReturnType<typeof useSession>);
}

beforeEach(() => {
  vi.clearAllMocks();
  createMutateAsync = vi.fn().mockResolvedValue(savedRequest([{ id: "l-a", price: "21500.00" }]));
  updateMutateAsync = vi.fn().mockResolvedValue(savedRequest([{ id: "l-a", price: "21500.00" }]));
  setHidden([]);
  vi.mocked(useApprovalSettings).mockReturnValue(
    queryStub<ReturnType<typeof useApprovalSettings>>({ approval_threshold_try: "500000.00" }),
  );
  vi.mocked(useProjects).mockReturnValue(
    queryStub<ReturnType<typeof useProjects>>({ items: [{ id: "p-1", name: "Güneşkent" }], total: 1 }),
  );
  vi.mocked(useSites).mockReturnValue(queryStub<ReturnType<typeof useSites>>({ items: [] }));
  vi.mocked(useSiteSections).mockReturnValue(queryStub<ReturnType<typeof useSiteSections>>({ items: [] }));
  vi.mocked(useStockSummary).mockReturnValue(
    queryStub<ReturnType<typeof useStockSummary>>({
      items: [
        { id: "s-1", code: "DMR-012", name: "Nervürlü Demir Ø12", category: "steel", unit: "Ton", min_stock: "5", balance: "2.4", status: "critical", last_unit_price: "21500", warehouses: [] },
      ],
      total: 1,
      limit: 200,
      offset: 0,
      kpis: {},
    }),
  );
  vi.mocked(useSuppliers).mockReturnValue(queryStub<ReturnType<typeof useSuppliers>>({ items: [], total: 1 }));
  vi.mocked(useCreatePurchaseRequest).mockReturnValue({ mutateAsync: createMutateAsync, isPending: false } as unknown as ReturnType<typeof useCreatePurchaseRequest>);
  vi.mocked(useUpdatePurchaseRequest).mockReturnValue({ mutateAsync: updateMutateAsync, isPending: false } as unknown as ReturnType<typeof useUpdatePurchaseRequest>);
  vi.mocked(useSubmitPurchaseRequest).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as unknown as ReturnType<typeof useSubmitPurchaseRequest>);
});

function fillLine(index: number, price = "21500") {
  fireEvent.change(screen.getByTestId(`talep-malzeme-${index}`), { target: { value: "s-1" } });
  fireEvent.change(screen.getByTestId(`talep-miktar-${index}`), { target: { value: "15" } });
  const priceInput = screen.queryByTestId(`talep-fiyat-${index}`);
  if (priceInput) fireEvent.change(priceInput, { target: { value: price } });
}

function saveDraft() {
  fireEvent.click(screen.getByRole("button", { name: "Taslak Kaydet" }));
}

async function createDraftWithFirstLine() {
  fireEvent.change(screen.getByTestId("talep-proje"), { target: { value: "p-1" } });
  fillLine(0);
  saveDraft();
  await waitFor(() => expect(createMutateAsync).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(screen.getByText(/taslak olarak kaydedildi/)).toBeInTheDocument());
}

describe("talep PATCH — satır id'li birleştirme", () => {
  it("POST id taşımaz; ikinci kayıtta mevcut satır id'li, yeni satır id'siz", async () => {
    render(<PurchaseRequestForm />);
    await createDraftWithFirstLine();
    for (const line of createMutateAsync.mock.calls[0][0].lines) expect(line).not.toHaveProperty("id");

    fireEvent.click(screen.getByTestId("talep-kalem-ekle"));
    fillLine(1);
    saveDraft();
    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalledTimes(1));
    const [first, second] = updateMutateAsync.mock.calls[0][0].lines;
    expect(first).toHaveProperty("id", "l-a");
    expect(first).toHaveProperty("estimated_unit_price", "21500");
    expect(second).not.toHaveProperty("id");
    expect(updateMutateAsync.mock.calls[0][0].lines).toHaveLength(2);
  });

  it("silinen satır gövdede YOK (sunucu siler); kalan satır id'sini korur", async () => {
    createMutateAsync.mockResolvedValue(savedRequest([{ id: "l-a", price: "21500.00" }, { id: "l-b", price: "21500.00" }]));
    render(<PurchaseRequestForm />);
    fireEvent.change(screen.getByTestId("talep-proje"), { target: { value: "p-1" } });
    fillLine(0);
    fireEvent.click(screen.getByTestId("talep-kalem-ekle"));
    fillLine(1);
    saveDraft();
    await waitFor(() => expect(createMutateAsync).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText(/taslak olarak kaydedildi/)).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("talep-satir-sil-0"));
    saveDraft();
    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalledTimes(1));
    const { lines } = updateMutateAsync.mock.calls[0][0];
    expect(lines).toHaveLength(1);
    expect(lines[0]).toHaveProperty("id", "l-b");
  });

  it("422 detail metni olduğu gibi hata bandında", async () => {
    render(<PurchaseRequestForm />);
    await createDraftWithFirstLine();
    updateMutateAsync.mockRejectedValue(new BackendError(422, { detail: "Aynı talep kalemi birden çok kez gönderildi." }));
    saveDraft();
    await waitFor(() =>
      expect(screen.getByTestId("talep-hata").textContent).toContain("Aynı talep kalemi birden çok kez gönderildi."),
    );
  });

  it("404 detail metni olduğu gibi hata bandında", async () => {
    render(<PurchaseRequestForm />);
    await createDraftWithFirstLine();
    updateMutateAsync.mockRejectedValue(new BackendError(404, { detail: "Seçilen talep kalemi bulunamadı" }));
    saveDraft();
    await waitFor(() =>
      expect(screen.getByTestId("talep-hata").textContent).toContain("Seçilen talep kalemi bulunamadı"),
    );
  });
});

describe("talep PATCH — maliyet gizli rol", () => {
  it("fiyatı maskeli satır id'li gider ama estimated_unit_price YOK; sonradan eklenen yeni satır da fiyatsız", async () => {
    setHidden(["maliyet_kar"]);
    createMutateAsync.mockResolvedValue(savedRequest([{ id: "l-a", price: null }]));
    render(<PurchaseRequestForm />);
    await createDraftWithFirstLine();
    // ilk POST'ta fiyat serbestti
    expect(createMutateAsync.mock.calls[0][0].lines[0]).toHaveProperty("estimated_unit_price", "21500");
    expect(screen.getByTestId("talep-fiyat-gizli-0")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("talep-kalem-ekle"));
    expect(screen.getByTestId("talep-fiyat-gizli-1")).toBeInTheDocument();
    fillLine(1);
    saveDraft();
    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalledTimes(1));
    const [first, second] = updateMutateAsync.mock.calls[0][0].lines;
    expect(first).toHaveProperty("id", "l-a");
    expect(first).not.toHaveProperty("estimated_unit_price");
    expect(second).not.toHaveProperty("id");
    expect(second).not.toHaveProperty("estimated_unit_price");
  });

  it("kategori gizli ama sunucu fiyatı DOLU → satır maskeli sayılmaz, fiyat gider", async () => {
    setHidden(["maliyet_kar"]);
    render(<PurchaseRequestForm />);
    await createDraftWithFirstLine();
    expect(screen.getByTestId("talep-fiyat-0")).toBeInTheDocument();
    saveDraft();
    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalledTimes(1));
    expect(updateMutateAsync.mock.calls[0][0].lines[0]).toHaveProperty("estimated_unit_price", "21500");
  });
});

describe("attachSavedLines", () => {
  it("sort_order sırasıyla gövde anahtarlarına eşler; eşleşmeyene dokunmaz", () => {
    const values = { ...emptyPurchaseRequestFormValues("2026-08-13"), lines: [createPurchaseRequestLine(0), createPurchaseRequestLine(1), createPurchaseRequestLine(2)] };
    const next = attachSavedLines(
      values,
      [values.lines[0].key, values.lines[2].key],
      [{ id: "b", sort_order: 1, estimated_unit_price: "1" }, { id: "a", sort_order: 0, estimated_unit_price: null }],
      true,
    );
    expect(next.lines.map((line) => line.serverId)).toEqual(["a", undefined, "b"]);
    expect(next.lines[0].isPriceMasked).toBe(true);
    expect(next.lines[2].isPriceMasked).toBe(false);
  });
});
