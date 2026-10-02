// TKL-F3.2 · sahte backend teklif HATA/DOĞRULAMA yardımcıları — `mock-offer-service.ts` ile `mock-offer-templates.ts` /
// `mock-offer-create-sources.ts` ARASINDA döngüsel ithalat olmasın diye ayrıldı (TKL-F4.4; davranış DEĞİŞMEDİ,
// kod `mock-offer-service.ts`ten TAŞINDI ve oradan yeniden dışa aktarılır).
import { offerBodyViolation, offerNullRejected, type BodyViolation } from "./mock-offer-body";

export class Failure extends Error {
  constructor(
    readonly status: number,
    readonly payload: unknown,
  ) {
    super(typeof payload === "object" ? JSON.stringify(payload) : String(payload));
  }
}

export const fail = (status: number, detail: string): Failure => new Failure(status, { detail });
export const invalid = (violation: BodyViolation): Failure => new Failure(422, violation);

/** pydantic `value_error` (field/model validator `ValueError`ı): `msg` "Value error, …" ile başlar. */
export const valueError = (msg: string, loc: ReadonlyArray<string | number>, input: unknown): BodyViolation => ({
  detail: [{ type: "value_error", loc, msg: `Value error, ${msg}`, input, ctx: { error: {} } }],
});

/** Backend metinleri (`locking.py`, `offer_service.py`, `item_service.py`) — AYNEN. */
export const OFFER_MESSAGES = {
  offerMissing: "Teklif bulunamadı",
  revisionMissing: "Teklif revizyonu bulunamadı",
  notLatest: "Yalnız en son revizyon üzerinde işlem yapılabilir",
  notDraft:
    "Revizyon taslak değil; içerik yalnız taslak revizyonda değiştirilebilir. Değişiklik için yeni revizyon açın",
  employerMissing: "İşveren bulunamadı",
  deleteNotAllowed: "Teklif yalnız tek revizyonlu ve taslak iken silinebilir",
  newRevisionNotAllowed:
    "Yeni revizyon yalnız son revizyon gönderilmiş ya da kaybedilmiş iken açılabilir",
  indexRequired: "Fiyat farkı «TÜİK endeksli» iken endeks türü zorunludur",
  indexNotAllowed: "Sabit fiyatta endeks türü girilemez",
  noItemsToSend: "Teklifte kalem yok",
  unquantifiedItems: "Miktarı girilmemiş kalem var",
  catalogMissing: "Katalog iş tipi bulunamadı",
  groupMissing: "Teklif grubu bulunamadı",
  groupForeign: "Grup bu revizyona ait değil",
  itemMissing: "Teklif kalemi bulunamadı",
  dateRange: "Başlangıç tarihi bitiş tarihinden sonra olamaz",
  blankPaymentTerms: "Ödeme koşulu boş olamaz",
} as const;

/** Şablon + oluşturma kaynağı metinleri (`template_service.py:55-58`, `template_schemas.py:24-29`, `offer_schemas.py:104-106`) — AYNEN. */
export const TEMPLATE_MESSAGES = {
  templateMissing: "Teklif şablonu bulunamadı",
  stale: "Şablon başka biri tarafından değiştirildi; sayfayı yenileyin",
  copySuffix: " (kopya)",
  groupsTooMany: "Şablonda en fazla 100 grup olabilir",
  itemsTooMany: "Şablonda en fazla 1000 kalem olabilir",
  sourceExclusive: "template_id ve copy_from birlikte verilemez",
  employerRequired: "employer_id: İşveren zorunludur",
  titleRequired: "title: İş adı zorunludur",
} as const;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function pathViolation(name: string, input: string, type: string, msg: string): Failure {
  return new Failure(422, { detail: [{ type, loc: ["path", name], msg, input }] });
}

export function uuidParam(name: string, value: string): string {
  if (!UUID_PATTERN.test(value)) {
    throw pathViolation(name, value, "uuid_parsing", "Input should be a valid UUID, invalid character: expected an optional prefix of `urn:uuid:` followed by [0-9a-fA-F-]");
  }
  return value.toLowerCase();
}

export function validate(schema: string, body: unknown): void {
  const violation = offerBodyViolation(schema, body);
  if (violation !== null) throw invalid(violation);
}

export function rejectNull(body: Record<string, unknown>, fields: readonly string[]): void {
  const violation = offerNullRejected(body, fields);
  if (violation !== null) throw invalid(violation);
}
