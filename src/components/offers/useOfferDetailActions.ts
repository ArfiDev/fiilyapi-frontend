import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { backendErrorMessage } from "@/lib/api/error-message";
import { OFFERS_QUERY_KEY, OFFER_QUERY_KEY } from "@/lib/api/hooks/offer-query-keys";
import {
  useCreateOfferRevision,
  useOfferTransition,
  type OfferLoseBody,
  type OfferTransitionAction,
} from "@/lib/api/hooks/useOfferMutations";
import { BackendError, isForbidden } from "@/lib/api/unwrap";

/** 409 = durum makinesi çatışması (başkası aynı anda geçirmiş / revizyon artık taslak değil). */
const CONFLICT_STATUS = 409;

interface UseOfferDetailActionsArgs {
  offerId: string;
  /** Görüntülenen (= geçişin uygulanacağı SON) revizyon. */
  revNo: number;
  validityDays: number;
  /** Kapsayıcının toast'ı (görünüm yeniden kurulsa da kalır). */
  onToast: (text: string) => void;
  /** Yeni revizyon açılınca o revizyona geç (`?rev=`). */
  onRevisionOpened: (revNo: number) => void;
}

/** Durum geçişleri + yeni revizyon: tek uçuş, 409'da metin AYNEN + detay ve liste tazelenir. */
export function useOfferDetailActions(args: UseOfferDetailActionsArgs) {
  const { offerId, revNo, validityDays, onToast, onRevisionOpened } = args;
  const queryClient = useQueryClient();
  const transitions: Record<OfferTransitionAction, ReturnType<typeof useOfferTransition>> = {
    send: useOfferTransition(offerId, revNo, "send"),
    win: useOfferTransition(offerId, revNo, "win"),
    lose: useOfferTransition(offerId, revNo, "lose"),
    withdraw: useOfferTransition(offerId, revNo, "withdraw"),
  };
  const createRevision = useCreateOfferRevision();

  const [error, setError] = useState<string | null>(null);
  const [isDenied, setIsDenied] = useState(false);

  const isBusy =
    createRevision.isPending || Object.values(transitions).some((transition) => transition.isPending);

  /** 409 sonrası ekran gerçek duruma otursun: detay (+ revizyonlar) ve liste. */
  function refreshAfterConflict(): void {
    void queryClient.invalidateQueries({ queryKey: [OFFER_QUERY_KEY, offerId] });
    void queryClient.invalidateQueries({ queryKey: [OFFERS_QUERY_KEY] });
  }

  /** Hata bildirimi: 403 → erişim yok ekranı; diğerleri sunucu metniyle (409'da ayrıca tazeleme). */
  function fail(err: unknown, fallback: string): void {
    if (isForbidden(err)) {
      setIsDenied(true);
      return;
    }
    setError(backendErrorMessage(err, fallback));
    if (err instanceof BackendError && err.status === CONFLICT_STATUS) refreshAfterConflict();
  }

  function run(action: OfferTransitionAction, body: OfferLoseBody | undefined, toast: string, fallback: string, onDone: () => void) {
    setError(null);
    transitions[action].mutate(body, {
      onSuccess: () => {
        onDone();
        onToast(toast);
      },
      onError: (err) => fail(err, fallback),
    });
  }

  return {
    isBusy,
    isDenied,
    error,
    clearError: () => setError(null),
    refreshAfterConflict,
    reportError: fail,
    send: (onDone: () => void) =>
      run("send", undefined, `Gönderildi olarak işaretlendi · geçerlilik ${validityDays} gün`, "Gönderildi işaretlenemedi.", onDone),
    // K-F3-2: mockup toast'u KALIR (dönüştürme F5'te gelir).
    win: (onDone: () => void) =>
      run("win", undefined, "Kazanıldı · projeye dönüştürme adımı açılacak", "Kazanıldı işaretlenemedi.", onDone),
    lose: (body: OfferLoseBody | undefined, onDone: () => void) =>
      run("lose", body, "Kaybedildi olarak işaretlendi", "Kaybedildi işaretlenemedi.", onDone),
    withdraw: (onDone: () => void) =>
      run("withdraw", undefined, "Vazgeçildi olarak işaretlendi", "Vazgeçildi işaretlenemedi.", onDone),
    // `mutateAsync` (mutate() geri çağrısı DEĞİL): başarı tazelemesi detayın `latest_rev_no`sunu ilerletir; URL'de
    // `rev` yoksa görünüm yeni güncel revizyonun anahtarıyla YENİDEN KURULUR ve gözlemcisi sökülen `mutate()`
    // geri çağrıları hiç çalışmaz (yönlendirme + toast sönerdi — TKL-F3.8 e2e). Söz gözlemciden bağımsız çözülür;
    // `onToast`/`onRevisionOpened` yeniden kurulmayan kapsayıcıya (`OfferDetailContent`) bağlıdır.
    newRevision: () => {
      setError(null);
      void createRevision.mutateAsync({ offerId }).then(
        (revision) => {
          onToast(`Rev.${revision.rev_no} oluşturuldu · Rev.${revNo} salt okunur`);
          onRevisionOpened(revision.rev_no);
        },
        (err: unknown) => fail(err, "Yeni revizyon açılamadı."),
      );
    },
  };
}
