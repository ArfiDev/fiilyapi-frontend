"use client";

import { useCallback, useMemo, useState } from "react";
import type { HiddenCategory, PageLevel, RolePagesResponse } from "@/lib/api/models";
import {
  countChanges,
  draftFromResponse,
  withApprove,
  withGroupLevel,
  withHiddenToggled,
  withLevel,
  type AccessDraft,
} from "./page-access-draft";

interface Edit {
  /** Taslağın türetildiği taban; taban değişince (rol değişimi, kayıt sonrası yeni sunucu verisi) düzenleme düşer. */
  readonly source: AccessDraft;
  readonly draft: AccessDraft;
}

/**
 * Seçili rolün düzenlenebilir taslağı. Taban = sunucu verisi; düzenleme tabana BAĞLIDIR: taban nesnesi
 * değiştiği an (başka rol, kayıttan dönen yeni veri) eski düzenleme kendiliğinden geçersiz olur — efekt yok.
 */
export function usePageAccessDraft(serverData: RolePagesResponse | undefined) {
  const baseline = useMemo(() => (serverData ? draftFromResponse(serverData) : null), [serverData]);
  const [edit, setEdit] = useState<Edit | null>(null);

  const draft = baseline && edit && edit.source === baseline ? edit.draft : baseline;

  const apply = useCallback(
    (transform: (current: AccessDraft) => AccessDraft) => {
      if (!baseline) return;
      setEdit((previous) => {
        const current = previous && previous.source === baseline ? previous.draft : baseline;
        return { source: baseline, draft: transform(current) };
      });
    },
    [baseline],
  );

  const changeCount = baseline && draft ? countChanges(baseline, draft) : 0;

  return {
    baseline,
    draft,
    changeCount,
    isDirty: changeCount > 0,
    setLevel: (key: string, level: PageLevel) => apply((current) => withLevel(current, key, level)),
    setApprove: (key: string, approve: boolean) => apply((current) => withApprove(current, key, approve)),
    setGroupLevel: (keys: readonly string[], level: PageLevel) =>
      apply((current) => withGroupLevel(current, keys, level)),
    toggleHidden: (category: HiddenCategory) => apply((current) => withHiddenToggled(current, category)),
    reset: () => setEdit(null),
  };
}

export type PageAccessEditor = ReturnType<typeof usePageAccessDraft>;
