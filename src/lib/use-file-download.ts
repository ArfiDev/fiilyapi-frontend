"use client";

import { useCallback, useState } from "react";

import { backendErrorMessage } from "@/lib/api/error-message";

export interface FileDownloadState {
  /** İndirme uçuyor — tetikleyiciler kilitli. */
  isBusy: boolean;
  /** Son başarılı indirmenin bildirimi (`Excel indiriliyor · ad`). */
  notice: string | null;
  /** Son başarısız indirmenin metni (`BackendError.detail` ya da yedek). */
  error: string | null;
  /** Tek uçuş: uçuşta ikinci çağrı yok sayılır. */
  start: (run: () => Promise<string>) => Promise<void>;
}

const FALLBACK_ERROR = "Excel dosyası indirilemedi. Lütfen yeniden deneyin.";

/** TKL-F4.3 · ikili indirme istemcisini (dosya adı döndürür) uçuş/bildirim/hata durumuyla sarar. */
export function useFileDownload(): FileDownloadState {
  const [isBusy, setIsBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(
    async (run: () => Promise<string>) => {
      if (isBusy) return;
      setIsBusy(true);
      setNotice(null);
      setError(null);
      try {
        setNotice(`Excel indiriliyor · ${await run()}`);
      } catch (caught) {
        setError(backendErrorMessage(caught, FALLBACK_ERROR));
      } finally {
        setIsBusy(false);
      }
    },
    [isBusy],
  );

  return { isBusy, notice, error, start };
}
