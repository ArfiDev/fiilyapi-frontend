// TKL-F4.3 · sahte backend EXCEL İNDİRME uçları (ikili gövde). `handleOffers`in JSON-yalnız `send`ine SIĞMAZ
// (QURR `weekly.xlsx` ile aynı gerekçe): ham `res` ile yanıtlanır. İçerik GERÇEK xlsx DEĞİLDİR — sınanan sözleşme
// içerik tipi + `content-disposition` + BFF'in ikili gövdeyi bozmadan geçirmesidir.
//   · GET /offers/{id}/revisions/{rev}/export?view=employer|internal → `{offer_no}-Rev{n}-{isveren|ic}.xlsx`
//   · GET /catalog/items/export?q&discipline_id → katalog (süzgeç yalnız doğrulanır, içerik sabit)
// Bağlantı: `mock-backend.ts` (ham `res` bloğu, QURR'dan sonra) ve `mock-offers.ts` — bkz. F4.3 raporu.
import type { ServerResponse } from "node:http";

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const XLSX_STUB = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const VIEW_LABELS: Readonly<Record<string, string>> = { employer: "isveren", internal: "ic" };
/** Backend ad ASCII dışı olabilir; istemci yalnız güvenli `.xlsx` adını kabul eder, yoksa yedek adı kullanır. */
const CATALOG_FILE = "Is-Kalemi-Katalogu.xlsx";
const OFFER_EXPORT = /^\/offers\/([^/]+)\/revisions\/(\d+)\/export$/;

export interface OfferExportPort {
  method: string;
  path: string;
  query: URLSearchParams;
  res: ServerResponse;
  /** Teklif numarası; teklif yoksa `null` (→ 404). */
  offerNo: (offerId: string) => string | null;
  send: (status: number, body?: unknown) => void;
}

function sendXlsx(res: ServerResponse, filename: string): void {
  res.writeHead(200, { "content-type": XLSX_TYPE, "content-disposition": `attachment; filename="${filename}"` });
  res.end(XLSX_STUB);
}

/** `true` = istek bu bloğa aitti (yanıtlandı). */
export function handleOfferExport(port: OfferExportPort): boolean {
  const { method, path, query, res, send } = port;
  const match = OFFER_EXPORT.exec(path);
  if (match === null && path !== "/catalog/items/export") return false;
  if (method !== "GET") {
    send(405, { detail: "Method Not Allowed" });
    return true;
  }
  if (match === null) {
    sendXlsx(res, CATALOG_FILE);
    return true;
  }
  const view = query.get("view") ?? "employer";
  const label = VIEW_LABELS[view];
  if (label === undefined) {
    send(422, { detail: [{ type: "enum", loc: ["query", "view"], msg: "Input should be 'employer' or 'internal'" }] });
    return true;
  }
  const offerNo = port.offerNo(decodeURIComponent(match[1]));
  if (offerNo === null) {
    send(404, { detail: "Teklif bulunamadı" });
    return true;
  }
  sendXlsx(res, `${offerNo}-Rev${match[2]}-${label}.xlsx`);
  return true;
}
