// TKL-F3.2 · SAHTE BACKEND — Teklif Hazırlama (`/offers*`) — backend `app/modules/offers/**` ikizi
// (origin/tkl-b4-teklif-cekirdegi 3efb5e1). `mock-backend.ts` buraya YALNIZ yönlendirir
// (`handleOffers`, tek giriş noktası); durum, hesap, doğrulama ve hata metinleri burada yaşar.
//
// ## Davranış (backend ile aynı; kaynak dosyalar parantezde)
//  · numara `TKL-YYYY-NNNN` (4 hane EN AZ; 9999'dan sonra budanmaz), yıl = OLUŞTURULMA anının İstanbul
//    yılı (SO-7), sayaç MONOTON — silme geri almaz; reddedilen oluşturma numara HARCAMAZ (numbering.py)
//  · durum makinesi `draft→sent→won|lost`, `draft|sent→withdrawn`; geçişler YALNIZ son revizyonda;
//    içerik yazımı yalnız son revizyon + taslak (409) (locking.py, offer_service.py)
//  · kalemsiz `send` 422 "Teklifte kalem yok" (SO-9/SO-17); fiyatsız kalemli revizyon gönderilebilir
//  · elle B.F. + boş maliyet 422 (SO-4); toplu ekleme 1–200 HEP-YA-HİÇ (item_service.py)
//  · `cost_unit_price` kalem eklemede: alan YOK → SON FİYAT → REFERANS → BOŞ önerisi (SO-6/T38);
//    açık `null` = BOŞ; değer = değer (`model_fields_set` ayrımı; PATCH'te `null` = temizle)
//  · silme yalnız tek revizyonlu taslak (409 aksi); yeni revizyon = önceki revizyonun KOPYASI,
//    teklif tarihi BUGÜN, `lost_reason`/`winning_amount` KOPYALANMAZ (SO-10)
//  · liste özeti `status` süzgecinden BAĞIMSIZ; `expired_count`, `win_rate` (SO-12)
//  · katalog son fiyatı: kazanılan revizyonun MALİYET B.F.'si (TKL kaynağı, `tklLastPrices`)
//
// ⚠️ Mock'ta rol/izin/maske YOKTUR (`mock-offer-views.ts` başlığı): kısıtlı kullanıcı 403'ü ve
// `limited` rol para maskesi TAKLİT EDİLMEZ.
import {
  OFFER_MESSAGES,
  fail,
  addItems,
  createGroup,
  createOffer,
  createRevision,
  deleteGroup,
  deleteItem,
  deleteOffer,
  findOffer,
  parseListFilters,
  revParam,
  settingsRead,
  transition,
  updateGroup,
  updateItem,
  updateOffer,
  updateRevision,
  updateSettings,
  uuidParam,
  validate,
  rejectNull,
  Failure,
  type OfferAction,
} from "./mock-offer-service";
import type { GroupRec, ItemRec, OffersPort, OffersState } from "./mock-offer-types";
import { handleOfferTemplates } from "./mock-offer-templates";
import { listOffers, readItem, readOfferDetail, readRevision } from "./mock-offer-views";

export { OFFER_MESSAGES } from "./mock-offer-service";
export { tklLastPrices, type TklLastPrice } from "./mock-offer-views";
export { createOffersState } from "./mock-offer-seed";
export { emptyOffersState, type OffersState, type OfferCatalogEntry, type OffersPort } from "./mock-offer-types";

// ------------------------------------------------------------------------------ yönlendirme

const REVISION_ACTIONS = new Set<string>(["send", "win", "lose", "withdraw"]);

/** `true` = istek bu bloğa aitti (yanıtlandı ya da gövde okunuyor). `/offers*` DEĞİLSE `false`. */
export function handleOffers(state: OffersState, port: OffersPort): boolean {
  if (port.path !== "/offers" && !port.path.startsWith("/offers/")) return false;
  const guarded = (run: () => void): void => {
    try {
      run();
    } catch (error) {
      if (!(error instanceof Failure)) throw error;
      port.send(error.status, error.payload);
    }
  };
  const withBody = (run: (body: Record<string, unknown>) => void): void =>
    port.readBody((body) => guarded(() => run(body)));
  guarded(() => dispatch(state, port, withBody));
  return true;
}

function dispatch(state: OffersState, port: OffersPort, withBody: (run: (body: Record<string, unknown>) => void) => void): void {
  const { method, path, send } = port;
  const notAllowed = (): void => send(405, { detail: "Method Not Allowed" });
  const notFound = (): void => send(404, { detail: "Not Found" });

  if (path === "/offers") {
    if (method === "GET") return send(200, listOffers(state, parseListFilters(port.query)));
    if (method !== "POST") return notAllowed();
    return withBody((body) => send(201, readOfferDetail(state, createOffer(state, port, body))));
  }
  if (path === "/offers/templates" || path.startsWith("/offers/templates/")) return handleOfferTemplates(state, port, withBody);
  if (path === "/offers/settings") {
    if (method === "GET") return send(200, settingsRead(state));
    if (method !== "PUT") return notAllowed();
    return withBody((body) => send(200, updateSettings(state, body)));
  }

  const segments = path.split("/").slice(2); // ["{id}", "revisions", "{rev}", ...]
  const offerId = uuidParam("offer_id", segments[0] ?? "");
  if (segments.length === 1) {
    if (method === "GET") return send(200, readOfferDetail(state, findOffer(state, offerId)));
    if (method === "DELETE") {
      deleteOffer(state, offerId);
      return send(204);
    }
    if (method !== "PATCH") return notAllowed();
    return withBody((body) => send(200, readOfferDetail(state, updateOffer(state, port, offerId, body))));
  }
  if (segments[1] !== "revisions") return notFound();

  if (segments.length === 2) {
    if (method !== "POST") return notAllowed();
    const { offer, revision } = createRevision(state, port, offerId);
    return send(201, readRevision(state, offer, revision));
  }
  const revNo = revParam(segments[2] ?? "");
  const tail = segments.slice(3);

  if (tail.length === 0) {
    if (method === "GET") {
      const offer = findOffer(state, offerId);
      const revision = state.revisions.find((entry) => entry.offerId === offerId && entry.revNo === revNo);
      if (revision === undefined) throw fail(404, OFFER_MESSAGES.revisionMissing);
      return send(200, readRevision(state, offer, revision));
    }
    if (method !== "PATCH") return notAllowed();
    return withBody((body) => {
      const { offer, revision } = updateRevision(state, offerId, revNo, body);
      send(200, readRevision(state, offer, revision));
    });
  }

  const head = tail[0] as string;
  if (tail.length === 1 && REVISION_ACTIONS.has(head)) {
    if (method !== "POST") return notAllowed();
    const action = head as OfferAction;
    const finish = (loseBody: Record<string, unknown> | null): void =>
      send(200, readOfferDetail(state, transition(state, port, offerId, revNo, action, loseBody)));
    return action === "lose" ? withBody((body) => finish(body)) : finish(null);
  }
  if (head === "groups") return groupRoute(state, port, withBody, offerId, revNo, tail.slice(1));
  if (head === "items") return itemRoute(state, port, withBody, offerId, revNo, tail.slice(1));
  return notFound();
}

function groupRoute(
  state: OffersState,
  port: OffersPort,
  withBody: (run: (body: Record<string, unknown>) => void) => void,
  offerId: string,
  revNo: number,
  rest: string[],
): void {
  const { method, send } = port;
  const basic = (group: GroupRec) => ({ id: group.id, name: group.name, sort_order: group.sortOrder });
  if (rest.length === 0) {
    if (method !== "POST") return send(405, { detail: "Method Not Allowed" });
    return withBody((body) => send(201, basic(createGroup(state, offerId, revNo, body))));
  }
  const groupId = uuidParam("group_id", rest[0] as string);
  if (rest.length !== 1) return send(404, { detail: "Not Found" });
  if (method === "DELETE") {
    deleteGroup(state, offerId, revNo, groupId);
    return send(204);
  }
  if (method !== "PATCH") return send(405, { detail: "Method Not Allowed" });
  return withBody((body) => send(200, basic(updateGroup(state, offerId, revNo, groupId, body))));
}

function itemRoute(
  state: OffersState,
  port: OffersPort,
  withBody: (run: (body: Record<string, unknown>) => void) => void,
  offerId: string,
  revNo: number,
  rest: string[],
): void {
  const { method, send } = port;
  if (rest.length === 0) {
    if (method !== "POST") return send(405, { detail: "Method Not Allowed" });
    return withBody((body) => {
      validate("OfferItemCreate", body);
      rejectNull(body, ["unit_mhr", "sort_order"]);
      const { revision, items } = addItems(state, port, offerId, revNo, [body], false);
      send(201, readItem(items[0] as ItemRec, revision));
    });
  }
  if (rest[0] === "bulk" && rest.length === 1) {
    if (method !== "POST") return send(405, { detail: "Method Not Allowed" });
    return withBody((body) => {
      validate("OfferItemsBulkCreate", body);
      for (const entry of body.items as Record<string, unknown>[]) rejectNull(entry, ["unit_mhr", "sort_order"]);
      const { revision, items } = addItems(state, port, offerId, revNo, body.items as Record<string, unknown>[], true);
      send(201, { items: items.map((item) => readItem(item, revision)) });
    });
  }
  const itemId = uuidParam("item_id", rest[0] as string);
  if (rest.length !== 1) return send(404, { detail: "Not Found" });
  if (method === "DELETE") {
    deleteItem(state, offerId, revNo, itemId);
    return send(204);
  }
  if (method !== "PATCH") return send(405, { detail: "Method Not Allowed" });
  return withBody((body) => {
    const { revision, item } = updateItem(state, offerId, revNo, itemId, body);
    send(200, readItem(item, revision));
  });
}
