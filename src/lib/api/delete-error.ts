import { BackendError } from "@/lib/api/unwrap";

/** Silme isteğinin hata sınıfları — pencere her sınıf için ayrı davranır. */
export type DeleteFailureReason =
  | "preview_stale"
  | "preview_required"
  | "financial_pending"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "unknown";

export interface DeleteFailure {
  reason: DeleteFailureReason;
  message: string;
}

export const DELETE_FORBIDDEN_MESSAGE = "Bu işlemi yalnızca Sistem Yöneticisi yapabilir.";
export const DELETE_STALE_MESSAGE = "Bağlı kayıtlar değişti, listeyi yeniden gözden geçirin.";
export const DELETE_NOT_FOUND_MESSAGE = "Kayıt bulunamadı; başka biri silmiş olabilir.";
const DELETE_UNKNOWN_MESSAGE = "Silinemedi. Lütfen tekrar deneyin.";
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const HTTP_PRECONDITION_REQUIRED = 428;

/**
 * Gövdeden `code` (metin) ve `detail` (metin) okur. Gövde dış veridir; `code`
 * şemada yalnız `preview_*` değerlerini tanır ama backend `financial_pending`
 * gibi yenilerini şemadan ÖNCE ekleyebilir — bu yüzden `string` olarak okunur.
 */
function readBody(body: unknown): { code: string | null; detail: string | null } {
  if (!body || typeof body !== "object") return { code: null, detail: null };
  const { code, detail } = body as { code?: unknown; detail?: unknown };
  return {
    code: typeof code === "string" ? code : null,
    detail: typeof detail === "string" && detail.trim() !== "" ? detail : null,
  };
}

/** DELETE hatasını pencerenin dallandığı sınıfa çevirir. */
export function classifyDeleteError(err: unknown): DeleteFailure {
  if (!(err instanceof BackendError)) return { reason: "unknown", message: DELETE_UNKNOWN_MESSAGE };
  const { code, detail } = readBody(err.body);

  if (err.status === HTTP_FORBIDDEN) return { reason: "forbidden", message: DELETE_FORBIDDEN_MESSAGE };
  if (err.status === HTTP_NOT_FOUND) return { reason: "not_found", message: DELETE_NOT_FOUND_MESSAGE };
  if (err.status === HTTP_PRECONDITION_REQUIRED && code === "preview_required") {
    return { reason: "preview_required", message: DELETE_STALE_MESSAGE };
  }
  if (err.status === HTTP_CONFLICT) {
    if (code === "preview_stale") return { reason: "preview_stale", message: DELETE_STALE_MESSAGE };
    if (code === "financial_pending") {
      return { reason: "financial_pending", message: detail ?? DELETE_UNKNOWN_MESSAGE };
    }
    return { reason: "conflict", message: detail ?? DELETE_UNKNOWN_MESSAGE };
  }
  return { reason: "unknown", message: DELETE_UNKNOWN_MESSAGE };
}
