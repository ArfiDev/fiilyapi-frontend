"use client";

import { HiddenMark } from "@/components/ui/hidden-mark/HiddenMark";
import { useCategoryHidden } from "@/lib/auth/useCategoryHidden";
import { EMPTY_CELL } from "@/lib/format";

/**
 * IZN-F4b.2 — fatura taraf adı. `null` (rol için gizli) → `—` (+ `satis_alici` gizliyse kilit ipucu);
 * dolu ad OLDUĞU GİBİ basılır (FE kendi gizleme kararı vermez).
 */
export function InvoicePartyName({ name }: { name: string | null }) {
  const isHidden = useCategoryHidden("satis_alici");
  if (name !== null) return <>{name}</>;
  return (
    <>
      {EMPTY_CELL}
      {isHidden && <HiddenMark />}
    </>
  );
}
