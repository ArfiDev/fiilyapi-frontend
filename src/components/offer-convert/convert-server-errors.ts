/**
 * TKL-F5.3 · dönüştürme HATASI sınıflandırma + konumlandırma (SAF). Plan §1 "Hata bandı", BD-4 (yapısal 422).
 * Metinler backend'den AYNEN gelir (`backendErrorMessage`); burada metin ÜRETİLMEZ, yalnız türü ayrılır.
 * 409 türleri backend `detail` metnine göre ayrılır (yapısal kod YOK): metinler plan §0'da sabittir.
 */
import { backendErrorMessage } from "@/lib/api/error-message";
import { BackendError } from "@/lib/api/unwrap";

import { includedRows, sentGroupKeys } from "./convert-model";
import type { ConvertDraft, ConvertForm } from "./convert-types";
import type { RowErrors } from "./convert-validate";

export interface ConvertIssue {
  loc: readonly (string | number)[];
  message: string;
}
export type ConvertErrorKind = "already" | "codeTaken" | "integrity" | "validation" | "forbidden" | "other";
export interface ConvertFailure {
  kind: ConvertErrorKind;
  /** Bant metni: backend `detail` AYNEN. */
  message: string;
  issues: readonly ConvertIssue[];
}

const STATUS_FORBIDDEN = 403;
const STATUS_CONFLICT = 409;
const STATUS_INVALID = 422;
const MSG_ALREADY = "Teklif zaten dönüştürüldü";
const MSG_CODE_TAKEN = "Bu proje kodu zaten kullanılıyor";
const MSG_INTEGRITY = "Veri bütünlüğü hatası";
const BODY_PREFIX = "body";

const CONFLICT_KINDS: Readonly<Record<string, ConvertErrorKind>> = {
  [MSG_ALREADY]: "already",
  [MSG_CODE_TAKEN]: "codeTaken",
  [MSG_INTEGRITY]: "integrity",
};

type Loc = ConvertIssue["loc"];
const isLoc = (value: unknown): value is Loc =>
  Array.isArray(value) && value.every((part) => typeof part === "string" || typeof part === "number");
const withoutBodyPrefix = (loc: Loc): Loc => (loc[0] === BODY_PREFIX ? loc.slice(1) : loc);

function toIssue(raw: unknown, messageKey: "message" | "msg"): ConvertIssue | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { loc, [messageKey]: message } = raw as Record<string, unknown>;
  return isLoc(loc) && typeof message === "string" ? { loc: withoutBodyPrefix(loc), message } : null;
}

/** Yapısal `errors[{loc,message}]` (BD-4) yoksa FastAPI `detail[{loc,msg}]` listesi. */
function issuesOf(body: unknown): ConvertIssue[] {
  if (typeof body !== "object" || body === null) return [];
  const { errors, detail } = body as { errors?: unknown; detail?: unknown };
  const [list, key] = Array.isArray(errors) ? ([errors, "message"] as const) : ([Array.isArray(detail) ? detail : [], "msg"] as const);
  return list.flatMap((raw) => {
    const issue = toIssue(raw, key);
    return issue ? [issue] : [];
  });
}

function kindOf(status: number, message: string): ConvertErrorKind {
  if (status === STATUS_FORBIDDEN) return "forbidden";
  if (status === STATUS_INVALID) return "validation";
  return status === STATUS_CONFLICT ? (CONFLICT_KINDS[message.trim()] ?? "other") : "other";
}

export function classifyConvertError(error: unknown): ConvertFailure {
  const message = backendErrorMessage(error);
  if (!(error instanceof BackendError)) return { kind: "other", message, issues: [] };
  return { kind: kindOf(error.status, message), message, issues: issuesOf(error.body) };
}

export interface LocatedIssues {
  fields: Partial<Record<keyof ConvertForm, string>>;
  groups: Record<string, string>;
  rows: Record<string, RowErrors>;
  general: string[];
}

const PROJECT_FIELDS: Readonly<Record<string, keyof ConvertForm>> = {
  name: "projectName",
  code: "projectCode",
  city: "city",
  start_date: "startDate",
  end_date: "endDate",
};
const CONTRACT_FIELDS: Readonly<Record<string, keyof ConvertForm>> = {
  contract_no: "contractNo",
  signature_date: "signatureDate",
  index_type: "indexType",
  base_index_value: "baseIndexValue",
  has_price_escalation: "hasPriceEscalation",
};
const ROW_FIELDS: Readonly<Record<string, keyof RowErrors>> = {
  code: "code",
  description: "description",
  unit: "unit",
  quantity: "qty",
  unit_price: "bf",
  offer_item_id: "offerItem",
};

const empty = (): LocatedIssues => ({ fields: {}, groups: {}, rows: {}, general: [] });

/** `groups[i]` = i'inci GÖNDERİLEN grup; `items[j]` = o grubun j'inci DAHİL satırı (gövde sırası = `buildConvertRequest`). */
function rowKeyAt(draft: ConvertDraft, groupIndex: number, itemIndex: number): string | undefined {
  const groupKey = sentGroupKeys(draft)[groupIndex];
  if (groupKey === undefined) return undefined;
  return includedRows(draft).filter((row) => row.groupKey === groupKey)[itemIndex]?.key;
}

function place(located: LocatedIssues, issue: ConvertIssue, draft: ConvertDraft): LocatedIssues {
  const [root, second, third, fourth, fifth] = issue.loc;
  const next = { ...located, general: [...located.general, issue.message] };
  if (root === "project" || root === "contract") {
    const field = (root === "project" ? PROJECT_FIELDS : CONTRACT_FIELDS)[String(second)];
    return field === undefined ? next : { ...located, fields: { ...located.fields, [field]: issue.message } };
  }
  if (root !== "groups" || typeof second !== "number") return next;
  if (third === "name") {
    const groupKey = sentGroupKeys(draft)[second];
    return groupKey === undefined ? next : { ...located, groups: { ...located.groups, [groupKey]: issue.message } };
  }
  const field = ROW_FIELDS[String(fifth)];
  const rowKey = third === "items" && typeof fourth === "number" ? rowKeyAt(draft, second, fourth) : undefined;
  if (rowKey === undefined || field === undefined) return next;
  return { ...located, rows: { ...located.rows, [rowKey]: { ...located.rows[rowKey], [field]: issue.message } } };
}

/** Sunucunun yapısal hatalarını ekrandaki alan/grup/satırlara bağlar; bağlanamayanlar `general`a düşer. */
export function locateIssues(issues: readonly ConvertIssue[], draft: ConvertDraft): LocatedIssues {
  return issues.reduce((located, issue) => place(located, issue, draft), empty());
}

/** Kullanıcının gitmesi gereken ilk adım: alan hatası → 1, satır/grup hatası → 2, yalnız genel → null. */
export function firstIssueStep(located: LocatedIssues): 1 | 2 | null {
  if (Object.keys(located.fields).length > 0) return 1;
  return Object.keys(located.rows).length + Object.keys(located.groups).length > 0 ? 2 : null;
}
