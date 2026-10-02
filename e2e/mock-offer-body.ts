// TKL-F3.2 · Teklif uçlarının GÖVDE şema kapısı — `openapi/openapi.json`dan OKUNUR (elle sınır yok).
//
// `mock-backend.ts`teki `loadBodySchema` desenidir (sahte backend, gerçek backend'in REDDEDECEĞİNİ
// kabul ederse bir ONAYLAYICIDIR, bekçi değil) ama teklif şemalarının ihtiyacı için genişletilmiştir:
//  · ondalık alanlar `anyOf [number{min,max}, string{pattern}, null]` — metin DESEN + sınır ile,
//    sayı sınırla doğrulanır; hane ihlali FastAPI'nin `decimal_*` türleriyle bildirilir,
//  · iç içe gövde (toplu ekleme `items[]`: `loc` = ["body","items",i,alan]) ve `minItems/maxItems`,
//  · `$ref` enum / nesne, `format: uuid | date`.
// 422 gövdesi FastAPI'ninkini `type`/`loc`/`msg` düzeyinde taklit eder; çok ihlalde İLKİ döner.
//
// Sayısal sınır karşılaştırması `compareDecimal` (bigint) iledir — Number() YOK.
import { readFileSync } from "node:fs";
import nodePath from "node:path";

import { compareDecimal } from "./mock-offer-calc";

type Loc = ReadonlyArray<string | number>;

export interface BodyViolation {
  detail: Array<{ type: string; loc: Loc; msg: string; input: unknown; ctx?: Record<string, unknown> }>;
}

interface RawSchema {
  type?: string;
  format?: string;
  enum?: string[];
  maxLength?: number;
  minLength?: number;
  pattern?: string;
  maximum?: number;
  minimum?: number;
  exclusiveMinimum?: number;
  maxItems?: number;
  minItems?: number;
  items?: RawSchema;
  anyOf?: RawSchema[];
  properties?: Record<string, RawSchema>;
  required?: string[];
  additionalProperties?: boolean;
  $ref?: string;
}

interface OpenApiDoc {
  components: { schemas: Record<string, RawSchema> };
}

let cached: OpenApiDoc | null = null;

function openapi(): OpenApiDoc {
  if (cached === null) {
    const file = nodePath.join(process.cwd(), "openapi", "openapi.json");
    cached = JSON.parse(readFileSync(file, "utf8")) as OpenApiDoc;
  }
  return cached;
}

function resolveRef(schema: RawSchema): RawSchema {
  if (schema.$ref === undefined) return schema;
  const name = schema.$ref.replace("#/components/schemas/", "");
  return resolveRef(openapi().components.schemas[name] as RawSchema);
}

/** Alan şemasının DALLARI: `anyOf` açılır, `$ref` çözülür; `null` dalı ayrıca bildirilir. */
function branches(schema: RawSchema): { nullable: boolean; options: RawSchema[] } {
  const raw = schema.anyOf ?? [schema];
  const options = raw.filter((option) => option.type !== "null").map(resolveRef);
  return { nullable: raw.some((option) => option.type === "null"), options };
}

function violation(type: string, loc: Loc, msg: string, input: unknown, ctx?: Record<string, unknown>): BodyViolation {
  return { detail: [{ type, loc, msg, input, ...(ctx === undefined ? {} : { ctx }) }] };
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const INTEGER_TEXT = /^[+-]?\d+$/;

function isValidDate(text: string): boolean {
  if (!DATE_PATTERN.test(text)) return false;
  const parsed = Date.parse(`${text}T00:00:00Z`);
  return !Number.isNaN(parsed) && new Date(parsed).toISOString().startsWith(text);
}

function enumMessage(values: readonly string[]): string {
  const quoted = values.map((value) => `'${value}'`);
  if (quoted.length === 1) return `Input should be ${quoted[0]}`;
  return `Input should be ${quoted.slice(0, -1).join(", ")} or ${quoted[quoted.length - 1]}`;
}

/** Desenden `\d{0,W}` (tam kısım) ve `\.\d{0,N}` (kesir) üst sınırlarını okur. */
function decimalDigitLimits(pattern: string): { whole: number; places: number } {
  const whole = /\(\?:\\d\{0,(\d+)\}/.exec(pattern);
  const places = /\\\.\\d\{0,(\d+)\}/.exec(pattern);
  return {
    whole: whole === null ? Number.POSITIVE_INFINITY : parseInt(whole[1] ?? "0", 10),
    places: places === null ? Number.POSITIVE_INFINITY : parseInt(places[1] ?? "0", 10),
  };
}

function decimalValue(branchList: RawSchema[], loc: Loc, value: unknown): BodyViolation | null {
  const numberBranch = branchList.find((option) => option.type === "number");
  const stringBranch = branchList.find((option) => option.type === "string");
  let text: string;
  if (typeof value === "number") {
    text = String(value);
  } else if (typeof value === "string" && stringBranch !== undefined) {
    text = value.trim();
  } else {
    return violation("decimal_type", loc, "Decimal input should be an integer, float, string or Decimal object", value);
  }
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(text)) {
    return violation("decimal_parsing", loc, "Input should be a valid decimal", value);
  }
  // 🔴 openapi `pattern` TEK BAŞINA doğrulayıcı DEĞİLDİR: pydantic'in ürettiği desen ilk dalda `$` ile
  // bitmez ("12.345" `\d{0,3}` dalıyla öneki eşleşir). Gerçek kural `max_digits`/`decimal_places`tir;
  // limitler desenin SAYILARINDAN okunur ve hane sayımı elle yapılır.
  if (stringBranch?.pattern !== undefined) {
    const limits = decimalDigitLimits(stringBranch.pattern);
    const [wholePart = "", fractionPart = ""] = text.replace(/^[+-]/, "").split(".");
    if (fractionPart.replace(/0+$/, "").length > limits.places) {
      return violation("decimal_max_places", loc, `Decimal input should have no more than ${limits.places} decimal places`, value);
    }
    if (wholePart.replace(/^0+/, "").length > limits.whole) {
      return violation("decimal_whole_digits", loc, `Decimal input should have no more than ${limits.whole} digits before the decimal point`, value);
    }
  }
  const bounds = numberBranch;
  if (bounds?.exclusiveMinimum !== undefined && compareDecimal(text, String(bounds.exclusiveMinimum)) <= 0) {
    return violation("greater_than", loc, `Input should be greater than ${bounds.exclusiveMinimum}`, value, { gt: String(bounds.exclusiveMinimum) });
  }
  if (bounds?.minimum !== undefined && compareDecimal(text, String(bounds.minimum)) < 0) {
    return violation("greater_than_equal", loc, `Input should be greater than or equal to ${bounds.minimum}`, value, { ge: String(bounds.minimum) });
  }
  if (bounds?.maximum !== undefined && compareDecimal(text, String(bounds.maximum)) > 0) {
    return violation("less_than_equal", loc, `Input should be less than or equal to ${bounds.maximum}`, value, { le: String(bounds.maximum) });
  }
  return null;
}

function stringValue(option: RawSchema, loc: Loc, value: unknown, field: string): BodyViolation | null {
  const strip = STRIPPED_FIELDS.has(field);
  if (typeof value !== "string") return violation("string_type", loc, "Input should be a valid string", value);
  if (option.enum !== undefined) {
    return option.enum.includes(value) ? null : violation("enum", loc, enumMessage(option.enum), value);
  }
  if (option.format === "uuid" && !MOCK_NON_UUID_FIELDS.has(field) && !UUID_PATTERN.test(value)) {
    return violation("uuid_parsing", loc, "Input should be a valid UUID, invalid character: expected an optional prefix of `urn:uuid:` followed by [0-9a-fA-F-]", value);
  }
  if (option.format === "date" && !isValidDate(value)) {
    return violation("date_from_datetime_parsing", loc, "Input should be a valid date or datetime, invalid character in year", value);
  }
  const measured = strip ? value.trim() : value;
  if (option.maxLength !== undefined && measured.length > option.maxLength) {
    return violation("string_too_long", loc, `String should have at most ${option.maxLength} characters`, value, { max_length: option.maxLength });
  }
  if (option.minLength !== undefined && measured.length < option.minLength) {
    return violation("string_too_short", loc, `String should have at least ${option.minLength} character${option.minLength === 1 ? "" : "s"}`, value, { min_length: option.minLength });
  }
  return null;
}

function integerValue(option: RawSchema, loc: Loc, value: unknown): BodyViolation | null {
  const text = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
  if (!(typeof value === "number" && Number.isInteger(value)) && !(typeof value === "string" && INTEGER_TEXT.test(text))) {
    return violation("int_type", loc, "Input should be a valid integer", value);
  }
  if (option.minimum !== undefined && compareDecimal(text, String(option.minimum)) < 0) {
    return violation("greater_than_equal", loc, `Input should be greater than or equal to ${option.minimum}`, value, { ge: option.minimum });
  }
  if (option.maximum !== undefined && compareDecimal(text, String(option.maximum)) > 0) {
    return violation("less_than_equal", loc, `Input should be less than or equal to ${option.maximum}`, value, { le: option.maximum });
  }
  return null;
}

/**
 * `format: uuid` denetiminden MUAF alanlar: sahte backend'in İŞVEREN kimlikleri UUID DEĞİLDİR
 * (`emp-1`; `GET /employers` fikstürü) — gerçek backend'de UUID'dir. Başka alan bu listeye GİRMEZ.
 */
const MOCK_NON_UUID_FIELDS = new Set(["employer_id"]);

/** Strip edilen metin alanları (backend `StringConstraints(strip_whitespace=True)`). */
const STRIPPED_FIELDS = new Set(["title", "name", "lost_reason"]);

function validateValue(schema: RawSchema, loc: Loc, value: unknown, field: string): BodyViolation | null {
  const { nullable, options } = branches(schema);
  if (value === null) {
    return nullable ? null : violation("missing", loc, "Input should not be null", null);
  }
  const first = options[0];
  if (first === undefined) return null;
  if (options.some((option) => option.type === "number")) return decimalValue(options, loc, value);
  if (first.type === "array") return arrayValue(first, loc, value);
  if (first.type === "object") return validateObject(first, loc, value);
  if (first.type === "integer") return integerValue(first, loc, value);
  if (first.type === "boolean") return typeof value === "boolean" ? null : violation("bool_type", loc, "Input should be a valid boolean", value);
  return stringValue(first, loc, value, field);
}

function arrayValue(option: RawSchema, loc: Loc, value: unknown): BodyViolation | null {
  if (!Array.isArray(value)) return violation("list_type", loc, "Input should be a valid list", value);
  if (option.minItems !== undefined && value.length < option.minItems) {
    return violation("too_short", loc, `List should have at least ${option.minItems} item${option.minItems === 1 ? "" : "s"} after validation, not ${value.length}`, value, { min_length: option.minItems });
  }
  if (option.maxItems !== undefined && value.length > option.maxItems) {
    return violation("too_long", loc, `List should have at most ${option.maxItems} items after validation, not ${value.length}`, value, { max_length: option.maxItems });
  }
  const itemSchema = option.items === undefined ? null : resolveRef(option.items);
  if (itemSchema === null) return null;
  for (let index = 0; index < value.length; index += 1) {
    const found = validateObject(itemSchema, [...loc, index], value[index]);
    if (found !== null) return found;
  }
  return null;
}

function validateObject(schema: RawSchema, loc: Loc, value: unknown): BodyViolation | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return violation("model_attributes_type", loc, "Input should be a valid dictionary or object to extract fields from", value);
  }
  const body = value as Record<string, unknown>;
  const properties = schema.properties ?? {};
  if (schema.additionalProperties === false) {
    for (const name of Object.keys(body)) {
      if (!(name in properties)) return violation("extra_forbidden", [...loc, name], "Extra inputs are not permitted", body[name]);
    }
  }
  const required = new Set(schema.required ?? []);
  for (const [name, property] of Object.entries(properties)) {
    const present = Object.hasOwn(body, name) && body[name] !== undefined;
    if (!present) {
      if (required.has(name)) return violation("missing", [...loc, name], "Field required", null);
      continue;
    }
    const found = validateValue(property, [...loc, name], body[name], name);
    if (found !== null) return found;
  }
  return null;
}

/** `null` = ihlal yok. `schemaName` = openapi `components.schemas` adı (ör. `OfferItemCreate`). */
export function offerBodyViolation(schemaName: string, body: unknown): BodyViolation | null {
  const schema = openapi().components.schemas[schemaName];
  if (schema === undefined) throw new Error(`openapi'de şema yok: ${schemaName}`);
  return validateObject(schema, ["body"], body);
}

/** Backend `_reject_null` doğrulayıcısının 422'si (NOT NULL alana açık `null`). */
export function offerNullRejected(body: Record<string, unknown>, fields: readonly string[]): BodyViolation | null {
  for (const field of fields) {
    if (Object.hasOwn(body, field) && body[field] === null) {
      return violation("value_error", ["body", field], "Value error, Alan boşaltılamaz; değiştirmemek için gövdeden çıkarın.", null, { error: {} });
    }
  }
  return null;
}

/** Kalem PATCH'inde katalogdan gelen alanların değiştirilmesi (`model_validator(mode="before")`). */
export function offerImmutableItemFields(body: Record<string, unknown>): BodyViolation | null {
  const bad = ["catalog_item_id", "poz_no", "description", "unit"].filter((name) => Object.hasOwn(body, name));
  if (bad.length === 0) return null;
  return violation(
    "value_error",
    ["body"],
    `Value error, ${bad.join(", ")}: katalogdan gelen alan değiştirilemez; kalemi silip katalogdan yeniden ekleyin`,
    body,
    { error: {} },
  );
}
