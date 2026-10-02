/**
 * TKL-F5.3 · Adım 2 hatalarının GÖRÜNÜR kümesi (SAF). Yerel doğrulama hataları kullanıcı "ileri" demeden gösterilmez
 * (boş form bağırmasın) — İSTİSNA: kod/grup adı ÇAKIŞMASI (düzenleyicinin açılma sebebi; mesaj onunla birlikte görünür).
 * Sunucu hataları (`locateIssues`) HER ZAMAN görünür ve yerel olanın üstüne yazar.
 */
import { collidingGroupKeys, collidingRowKeys } from "./convert-model";
import type { LocatedIssues } from "./convert-server-errors";
import type { ConvertDraft } from "./convert-types";
import type { GeneralErrors, RowErrors, Step2Errors } from "./convert-validate";

export interface VisibleStep2Errors {
  rows: Readonly<Record<string, RowErrors>>;
  groups: Readonly<Record<string, string>>;
  general: GeneralErrors;
}

function localRows(errors: Step2Errors, draft: ConvertDraft, isShown: boolean): Record<string, RowErrors> {
  if (isShown) return { ...errors.rows };
  const colliding = collidingRowKeys(draft);
  return Object.fromEntries(
    Object.entries(errors.rows).flatMap(([key, found]) => (colliding.has(key) && found.code ? [[key, { code: found.code }] as const] : [])),
  );
}

function localGroups(errors: Step2Errors, draft: ConvertDraft, isShown: boolean): Record<string, string> {
  if (isShown) return { ...errors.groups };
  const colliding = collidingGroupKeys(draft);
  return Object.fromEntries(Object.entries(errors.groups).filter(([key]) => colliding.has(key)));
}

function mergeRows(local: Record<string, RowErrors>, server: LocatedIssues["rows"] | undefined): Record<string, RowErrors> {
  const merged = { ...local };
  Object.entries(server ?? {}).forEach(([key, found]) => {
    merged[key] = { ...merged[key], ...found };
  });
  return merged;
}

export function visibleStep2Errors(
  errors: Step2Errors,
  draft: ConvertDraft,
  isShown: boolean,
  server: LocatedIssues | null,
): VisibleStep2Errors {
  return {
    rows: mergeRows(localRows(errors, draft, isShown), server?.rows),
    groups: { ...localGroups(errors, draft, isShown), ...server?.groups },
    general: isShown ? errors.general : {},
  };
}
