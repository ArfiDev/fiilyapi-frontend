// TEST-F2 Ajan B — Şema-yönlü yürüyücü.
//
// Bir GET yanıtının GERÇEK JSON gövdesini, o yolun openapi 200 yanıt şemasıyla
// BİRLİKTE yürür ve alan adı ölçek-şüpheli regex'e uyan her (schema, field)
// çifti için GÖZLENEN değerleri toplar. `$ref`, `allOf`, `anyOf`/`oneOf`
// (null dahil — değerin tipine göre dal seçilir), `array.items` ve
// `additionalProperties` (sözlük tipi) çözülür.
//
// "schema" burada openapi component adıdır (path'e özel takma ad değil) —
// SCALE_TABLE'daki satırlarla eşleşsin diye.
import { SCALE_FIELD_NAME_PATTERN } from "./openapi-scale-fields";

export interface JsonSchemaNode {
  type?: string | string[];
  properties?: Record<string, JsonSchemaNode>;
  items?: JsonSchemaNode;
  allOf?: JsonSchemaNode[];
  anyOf?: JsonSchemaNode[];
  oneOf?: JsonSchemaNode[];
  additionalProperties?: JsonSchemaNode | boolean;
  enum?: unknown[];
  $ref?: string;
  nullable?: boolean;
  [key: string]: unknown;
}

export interface OpenApiComponents {
  schemas?: Record<string, JsonSchemaNode>;
}

export interface OpenApiDocForWalk {
  components?: OpenApiComponents;
}

/** `schema.field` anahtarlı gözlem haritası. Bir alan birden çok yerde/dizide görülebilir. */
export type ObservedValues = Map<string, unknown[]>;

function resolveRef(node: JsonSchemaNode, doc: OpenApiDocForWalk): { name: string | null; schema: JsonSchemaNode } {
  if (node.$ref) {
    const name = node.$ref.replace("#/components/schemas/", "");
    const schema = doc.components?.schemas?.[name];
    if (!schema) throw new Error(`schema-walker: \$ref çözülemedi: ${node.$ref}`);
    return { name, schema };
  }
  return { name: null, schema: node };
}

function pushObserved(observed: ObservedValues, key: string, value: unknown): void {
  const list = observed.get(key);
  if (list) list.push(value);
  else observed.set(key, [value]);
}

/**
 * FAZ 2d (TYPE-F1 madde 4) — bir alan `MetricPlaceholder` ZARFI mı? Ad
 * regex'inden (`SCALE_FIELD_NAME_PATTERN`) BAĞIMSIZ: `physical_progress`,
 * `margin`, `average_margin` gibi adlar "pct/ratio/share/rate/percent/band"
 * kalıbına UYMAZ ama yine de `MetricPlaceholder` zarfı taşırlar (bkz.
 * `scale-table.ts` innerScale satırları). `$ref` doğrudan ya da `anyOf`/
 * `oneOf` içinde (nullable zarf, ör. `financial_progress?: ... | null`) olabilir.
 */
function refsMetricPlaceholder(node: JsonSchemaNode): boolean {
  if (node.$ref) return node.$ref.endsWith("/MetricPlaceholder");
  const branches = [...(node.anyOf ?? []), ...(node.oneOf ?? [])];
  return branches.some((b) => refsMetricPlaceholder(b));
}

/**
 * `anyOf`/`oneOf` dallarından, gözlenen DEĞERİN tipine en uygun olanı seçer.
 * `null` değer → nullable dal (type: "null" ya da içinde başka özellik olmayan boş şema).
 * Aksi halde: object değer → properties'i olan ilk dal; array değer → items'ı olan ilk dal;
 * primitive değer → type'ı eşleşen ilk dal; hiçbiri uymazsa ilk dal (best-effort).
 */
function pickBranch(branches: JsonSchemaNode[], value: unknown, doc: OpenApiDocForWalk): JsonSchemaNode {
  // 🔴 KRİTİK: dönüş değeri ORİJİNAL (çözülmemiş) dal olmalı, `resolveRef`in
  // ÇÖZÜLMÜŞ şeması DEĞİL. Aksi hâlde `walkSchema` bir sonraki adımda BU
  // düğümü tekrar `resolveRef`e verdiğinde `$ref` zaten kaybolmuş olur ve
  // şema adı (ör. "LandShareCard") yanlışlıkla dış bağlamın adında
  // (ör. "ProjectListItem") KALIR — gözlem yanlış (schema, field) anahtarına
  // yazılır (ölçüldü: `ProjectListItem.our_share_pct` yerine
  // `LandShareCard.our_share_pct` olmalıydı, bkz. TEST-F2 rapor).
  const pairs = branches.map((original) => ({ original, resolved: resolveRef(original, doc).schema }));
  if (value === null) {
    const nullPair = pairs.find((p) => p.resolved.type === "null" || (!p.resolved.properties && !p.resolved.items && !p.resolved.enum));
    return (nullPair ?? pairs[0]).original;
  }
  if (Array.isArray(value)) {
    const arrPair = pairs.find((p) => p.resolved.type === "array" || p.resolved.items);
    if (arrPair) return arrPair.original;
  } else if (typeof value === "object") {
    const objPair = pairs.find((p) => p.resolved.type === "object" || p.resolved.properties || p.resolved.additionalProperties);
    if (objPair) return objPair.original;
  } else {
    const typeName = typeof value === "number" ? "number" : typeof value === "string" ? "string" : typeof value;
    const primPair = pairs.find((p) => {
      const t = p.resolved.type;
      if (Array.isArray(t)) return t.includes(typeName) || (typeName === "number" && t.includes("integer"));
      return t === typeName || (typeName === "number" && t === "integer");
    });
    if (primPair) return primPair.original;
  }
  return pairs[0].original;
}

/**
 * `node` şemasına göre `value` JSON değerini yürür; ölçek-şüpheli alan adları
 * bulundukça `observed` haritasına `${schemaName}.${field}` anahtarıyla ekler.
 * `currentSchemaName`: değerin "ait olduğu" en yakın adlandırılmış component —
 * `$ref` çözüldükçe güncellenir, allOf/anyOf çözümlemesi bunu DEĞİŞTİRMEZ
 * (mixin/varyant hâlâ aynı response şemasının parçasıdır).
 */
export function walkSchema(
  node: JsonSchemaNode,
  value: unknown,
  doc: OpenApiDocForWalk,
  observed: ObservedValues,
  currentSchemaName: string | null,
): void {
  if (value === undefined) return;

  const { name: refName, schema: resolved } = resolveRef(node, doc);
  const schemaName = refName ?? currentSchemaName;

  if (Array.isArray(resolved.oneOf) && resolved.oneOf.length > 0) {
    const branch = pickBranch(resolved.oneOf, value, doc);
    walkSchema(branch, value, doc, observed, schemaName);
    return;
  }
  if (Array.isArray(resolved.anyOf) && resolved.anyOf.length > 0) {
    const branch = pickBranch(resolved.anyOf, value, doc);
    walkSchema(branch, value, doc, observed, schemaName);
    return;
  }
  if (Array.isArray(resolved.allOf) && resolved.allOf.length > 0) {
    for (const sub of resolved.allOf) {
      walkSchema(sub, value, doc, observed, schemaName);
    }
    // allOf, kendi properties'ini de taşıyabilir (openapi mixin deseni).
    if (resolved.properties) {
      walkProperties(resolved, value, doc, observed, schemaName);
    }
    return;
  }

  if (value === null) return; // nullable dal zaten anyOf/oneOf ile ele alındı

  if (resolved.type === "array" || (resolved.items && Array.isArray(value))) {
    if (!Array.isArray(value)) return;
    const itemSchema = resolved.items ?? {};
    for (const item of value) {
      walkSchema(itemSchema, item, doc, observed, schemaName);
    }
    return;
  }

  if (resolved.properties || resolved.additionalProperties) {
    walkProperties(resolved, value, doc, observed, schemaName);
    return;
  }
  // primitive değer: üst çağrının (walkProperties) zaten alan adını kontrol
  // edip observed'e yazması gerekir — burada yapılacak bir şey yok.
}

function walkProperties(
  node: JsonSchemaNode,
  value: unknown,
  doc: OpenApiDocForWalk,
  observed: ObservedValues,
  schemaName: string | null,
): void {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return;
  const obj = value as Record<string, unknown>;

  if (node.properties) {
    for (const [field, fieldSchema] of Object.entries(node.properties)) {
      if (!(field in obj)) continue;
      const fieldValue = obj[field];
      if (schemaName && (SCALE_FIELD_NAME_PATTERN.test(field) || refsMetricPlaceholder(fieldSchema))) {
        pushObserved(observed, `${schemaName}.${field}`, fieldValue);
      }
      walkSchema(fieldSchema, fieldValue, doc, observed, schemaName);
    }
  }
  if (node.additionalProperties && typeof node.additionalProperties === "object") {
    const knownKeys = new Set(Object.keys(node.properties ?? {}));
    for (const [key, fieldValue] of Object.entries(obj)) {
      if (knownKeys.has(key)) continue;
      walkSchema(node.additionalProperties, fieldValue, doc, observed, schemaName);
    }
  }
}

/** Kolaylık sarmalayıcı: yeni bir ObservedValues ile yürür ve onu döner. */
export function walkResponse(node: JsonSchemaNode, value: unknown, doc: OpenApiDocForWalk): ObservedValues {
  const observed: ObservedValues = new Map();
  walkSchema(node, value, doc, observed, resolveRef(node, doc).name);
  return observed;
}
