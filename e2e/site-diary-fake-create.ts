import { expect, type Page, type Route } from "@playwright/test";

// GKS-F1.6 · günlük kaydı AÇAN akışın MOCK DURUMUNA YAZMAYAN ikizi.
//
// Mock backend TÜM spec dosyalarında tek paylaşılan sunucudur ve `fullyParallel`
// koşar: `POST /sites/{id}/diary` mock durumuna kayıt EKLER; görsel kareler o güne
// bakıyorsa yarış doğar. Bu yardımcı yazma uçlarını `page.route` + `route.fulfill`
// ile YAKALAR; yanıtlar GET iskelet önizlemesinden (mock'un okuma ucu) ve istek
// gövdesinden TÜRETİLİR, mock'a hiçbir yazma gitmez.
//
// `*.spec.ts` DEĞİLDİR (Playwright bunu test dosyası saymaz).

const API = "**/api/backend";
/** Mock'un OKUMA ucundan şablon alınan kayıt (d-2: Temmuz taslağı, yalnız GET edilir). */
const TEMPLATE_ENTRY_ID = "d-2";
const FAKE_ENTRY_ID = "e2e-fake-entry";

type Json = Record<string, unknown>;
type FakeStatus = "draft" | "submitted";

export interface FakeDiaryServer {
  /** Yakalanan `POST /sites/{siteId}/diary` gövdeleri (sırayla). */
  readonly createBodies: Json[];
  /** Yakalanan `PUT /diary/{id}/lines` + `PATCH /diary/{id}` çağrı sayısı. */
  readonly writeCalls: { readonly putLines: number; readonly patch: number };
}

function money(value: number): string {
  return value.toFixed(2);
}

function toNumber(value: unknown): number {
  return Number(value ?? 0);
}

/** İskelet satırı + gövde miktarı → detay satırı (tutarı yanıt türetir: ekran çarpmaz). */
function detailLine(skeletonLine: Json, index: number, inputs: readonly Json[]): Json {
  const input = inputs.find(
    (candidate) =>
      candidate.boq_item_id === skeletonLine.boq_item_id &&
      (candidate.section_id ?? null) === (skeletonLine.section_id ?? null),
  );
  const quantity = input === undefined ? 0 : toNumber(input.quantity);
  const cumulative = toNumber(skeletonLine.cumulative_quantity) + quantity;
  return {
    ...skeletonLine,
    id: `${FAKE_ENTRY_ID}-l-${index}`,
    quantity: quantity.toFixed(3),
    cumulative_quantity: cumulative.toFixed(3),
    leaf_cumulative_quantity: cumulative.toFixed(3),
    line_amount: money(quantity * toNumber(skeletonLine.unit_price)),
    overrun_reason: input?.overrun_reason ?? null,
  };
}

async function getJson(page: Page, path: string): Promise<Json> {
  const response = await page.request.get(`/api/backend${path}`);
  expect(response.ok(), `${path} okunamadı`).toBe(true);
  return (await response.json()) as Json;
}

function json(route: Route, status: number, body: unknown): Promise<void> {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

/**
 * `POST /sites/{siteId}/diary` + kayıt açıldıktan sonraki GET/submit/reopen uçlarını
 * yakalar. Kayıt yalnız bu sayfanın belleğinde yaşar; mock durumu DEĞİŞMEZ.
 */
export async function installFakeDiaryServer(page: Page, siteId: string): Promise<FakeDiaryServer> {
  const createBodies: Json[] = [];
  const calls = { putLines: 0, patch: 0 };
  let current: Json | null = null;

  await page.route(`${API}/sites/${siteId}/diary`, async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    const body = route.request().postDataJSON() as Json;
    createBodies.push(body);
    const entryDate = String(body.entry_date);
    const sectionId = typeof body.section_id === "string" ? body.section_id : null;
    const query = new URLSearchParams({ entry_date: entryDate });
    if (sectionId !== null) query.set("section_id", sectionId);
    const skeleton = await getJson(page, `/sites/${siteId}/diary/skeleton?${query.toString()}`);
    const template = await getJson(page, `/diary/${TEMPLATE_ENTRY_ID}`);
    const inputs = Array.isArray(body.lines) ? (body.lines as Json[]) : [];
    const lines = (skeleton.lines as Json[]).map((line, index) => detailLine(line, index, inputs));
    current = {
      ...template,
      id: FAKE_ENTRY_ID,
      site_id: siteId,
      entry_date: entryDate,
      section_id: sectionId,
      section_name: skeleton.section_name ?? null,
      status: "draft" satisfies FakeStatus,
      submitted_at: null,
      submitted_by: null,
      locked: false,
      lock_report_date: null,
      worker_counts: [],
      lines,
      lines_total: money(lines.reduce((sum, line) => sum + toNumber(line.line_amount), 0)),
    };
    return json(route, 201, current);
  });

  await page.route(`${API}/diary/${FAKE_ENTRY_ID}`, async (route) => {
    if (current === null) return json(route, 404, { detail: "gunluk kayit yok" });
    if (route.request().method() === "PATCH") calls.patch += 1;
    return json(route, 200, current);
  });
  await page.route(`${API}/diary/${FAKE_ENTRY_ID}/lines`, async (route) => {
    calls.putLines += 1;
    return json(route, 200, current ?? {});
  });
  for (const [action, status] of [
    ["submit", "submitted"],
    ["reopen", "draft"],
  ] as const) {
    await page.route(`${API}/diary/${FAKE_ENTRY_ID}/${action}`, async (route) => {
      if (current === null) return json(route, 404, { detail: "gunluk kayit yok" });
      current = {
        ...current,
        status,
        submitted_at: status === "submitted" ? "2026-09-10T09:00:00Z" : null,
        submitted_by: status === "submitted" ? "u-1" : null,
      };
      return json(route, 200, current);
    });
  }

  return {
    createBodies,
    get writeCalls() {
      return { putLines: calls.putLines, patch: calls.patch };
    },
  };
}
