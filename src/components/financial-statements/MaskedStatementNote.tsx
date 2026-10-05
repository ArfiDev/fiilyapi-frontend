"use client";

import { HiddenMark } from "@/components/ui/hidden-mark/HiddenMark";
import { ACCOUNTING_HIDDEN_CATEGORIES } from "@/lib/auth/finance-hidden";
import { shouldShowHiddenMark } from "@/lib/auth/masked-values";
import { useCategoryHidden } from "@/lib/auth/useCategoryHidden";

/**
 * IZN-F4b.2 — mali tablolarda (başlıksız sütun) TEK kilit notu. Kategori gizli VE tablodaki değerlerden
 * en az biri `null` ise basılır; hücreler `—` kalır. Her satıra kilit basılmaz.
 */
export function MaskedStatementNote({
  values,
}: {
  values: readonly (string | null | undefined)[];
}) {
  const isHidden = useCategoryHidden(ACCOUNTING_HIDDEN_CATEGORIES);
  if (!shouldShowHiddenMark(isHidden, values)) return null;
  return (
    <p className="fs-notice" data-testid="fs-masked-note">
      <HiddenMark withText />
    </p>
  );
}
