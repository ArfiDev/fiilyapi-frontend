/**
 * TKL-F5.3 · Dönüştür ekranı testlerinin ORTAK donanımı (yalnız testlerden içe alınır). `vi.mock` çağrıları test
 * dosyalarında kalır (hoisting); burada sahte backend + izin durumu + kullanıcı eylemleri durur.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import type userEvent from "@testing-library/user-event";
import { createElement } from "react";

import { makeDetail } from "@/components/offers/offer-detail-fixtures";
import { D_DUV, D_KAB, BETON, DEMIR, SIVA } from "@/components/work-item-catalog/work-item-fixtures";
import { backendClient } from "@/lib/api/client";
import type { OfferDetailRead, OfferRevisionRead } from "@/lib/api/hooks/useOffers";
import type { WorkDisciplineRead, WorkItemRead } from "@/lib/api/models";

import { ConvertScreen } from "./ConvertScreen";
import { makeWonRevision } from "./convert-fixtures";

export const OFFER_ID = "offer-14";
export const PROJECT_ID = "11111111-2222-4333-8444-555555555555";
export const SITE_ID = "99999999-2222-4333-8444-555555555555";

type User = ReturnType<typeof userEvent.setup>;

/** `vi.fn()` yüzeyi (vitest İÇE ALINMAZ: stub bekçisi test-dışı dosyada `vitest` ithalini yasaklar). */
interface MockFn {
  mockImplementation(implementation: (...args: never[]) => unknown): void;
  mock: { calls: unknown[][] };
}
const asMock = (fn: unknown): MockFn => fn as MockFn;

export interface Reply {
  data?: unknown;
  error?: unknown;
  response: Response;
}
export const ok = (data: unknown, status = 200): Reply => ({ data, error: undefined, response: new Response(null, { status }) });
export const fail = (status: number, body: unknown): Reply => ({ data: undefined, error: body, response: new Response(null, { status }) });

export interface ConvertBackend {
  detail: OfferDetailRead | Reply;
  revision: OfferRevisionRead;
  items: WorkItemRead[];
  disciplines: WorkDisciplineRead[];
  /** `POST /offers/{id}/convert` yanıtı (gövde argümanı). */
  post: (body: unknown) => Promise<Reply> | Reply;
}

export function wonDetail(over: Partial<OfferDetailRead> = {}): OfferDetailRead {
  return makeDetail({ status: "won", conversion_state: "won_not_converted", latest_rev_no: 2, ...over });
}

export const CONVERT_RESPONSE = {
  project_id: PROJECT_ID,
  project_slug: "gunes-kent-konut",
  project_code: "PRJ-2026-004",
  site_id: SITE_ID,
  contract_item_count: 3,
  warnings: [],
};

export function wonBackend(over: Partial<ConvertBackend> = {}): ConvertBackend {
  return {
    detail: wonDetail(),
    revision: makeWonRevision(),
    items: [BETON, DEMIR, SIVA],
    disciplines: [D_KAB, D_DUV],
    post: () => ok(CONVERT_RESPONSE),
    ...over,
  };
}

const isReply = (value: unknown): value is Reply => typeof value === "object" && value !== null && "response" in value;

/** Backend'i kurar; `backend` nesnesi sonradan DEĞİŞTİRİLEBİLİR (ör. 409 sonrası detay "converted" olur). */
export function installBackend(backend: ConvertBackend): void {
  asMock(backendClient.GET).mockImplementation((async (path: string) => {
    if (path === "/offers/{offer_id}") return isReply(backend.detail) ? backend.detail : ok(backend.detail);
    if (path === "/offers/{offer_id}/revisions/{rev_no}") return ok(backend.revision);
    if (path === "/catalog/items") return ok({ items: backend.items, total: backend.items.length });
    if (path === "/catalog/disciplines") return ok({ items: backend.disciplines, total: backend.disciplines.length });
    return fail(404, { detail: `beklenmeyen GET ${path}` });
  }) as never);
  asMock(backendClient.POST).mockImplementation((async (_path: string, init: { body: unknown }) => backend.post(init.body)) as never);
}

export function renderConvert(offerId = OFFER_ID) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  return render(createElement(QueryClientProvider, { client: queryClient }, createElement(ConvertScreen, { offerId })));
}

export const convertCalls = (): unknown[][] => asMock(backendClient.POST).mock.calls;
export const convertBodies = (): unknown[] => convertCalls().map((call) => (call[1] as { body: unknown }).body);

/** Mockup düğme metinleri (TDN:176-178). */
export const NEXT_1 = "Kalemlere geç →";
export const NEXT_2 = "Onaya geç →";
export const CREATE = "Projeyi ve Sözleşmeyi Oluştur";

export async function fillStep1(user: User, values: { city?: string; contractNo?: string } = {}): Promise<void> {
  await user.type(await screen.findByLabelText("İl / İlçe"), values.city ?? "İstanbul / Kadıköy");
  await user.type(screen.getByLabelText("Sözleşme no"), values.contractNo ?? "szl-2026-011");
}

export const rowOf = (key: string) => screen.getByTestId(`convert-row-${key}`);
export const groupOf = (key: string) => screen.getByTestId(`convert-group-${key}`);
export const qtyBox = (key: string) => within(rowOf(key)).getByLabelText("Sözleşme miktarı");
export const bfBox = (key: string) => within(rowOf(key)).getByLabelText("Sözleşme birim fiyatı");

export async function typeInto(user: User, box: HTMLElement, text: string): Promise<void> {
  await user.clear(box);
  await user.type(box, text);
}

/** Adım 1'i doldurur ve Adım 2'ye geçer (`findByLabelText` ekranın açılmasını bekler). */
export async function toStep2(user: User): Promise<void> {
  await fillStep1(user);
  await user.click(screen.getByRole("button", { name: NEXT_1 }));
  await screen.findByTestId("convert-step-2");
}

/** Fiyatsız demir satırına B.F. yazar (Adım 2 kapısını açar). */
export async function priceDemir(user: User, price = "100"): Promise<void> {
  await typeInto(user, bfBox("o:it-2"), price);
}

export async function toStep3(user: User): Promise<void> {
  await toStep2(user);
  await priceDemir(user);
  await user.click(screen.getByRole("button", { name: NEXT_2 }));
  await screen.findByTestId("convert-step-3");
}

/** Metin alanı değeri, `Field` etiketiyle. */
export const fieldValue = (label: string): string => (screen.getByLabelText(label) as HTMLInputElement).value;

/** Etiketli özet alanının tüm metni (etiket + değer). */
export function fieldText(scope: HTMLElement, label: string): string {
  return within(scope).getByText(label).parentElement?.textContent ?? "";
}

/** Ham (primitive dışı) form kontrolü yok: her `input`/`select`/`textarea` `ui` primitive sınıfı taşır. */
export function rawControls(container: HTMLElement): string[] {
  const allowed = [/^input\b/, /^checkbox\b/, /^date-input\b/, /^date-input-picker\b/, /^select\b/, /^textarea\b/];
  return [...container.querySelectorAll("input, select, textarea")]
    .filter((element) => !allowed.some((pattern) => pattern.test(element.className)))
    .map((element) => element.outerHTML);
}

