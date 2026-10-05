"use client";

import { useState } from "react";

import { Modal } from "@/components/settings/Modal";
import { Button, Checkbox } from "@/components/ui";
import { CheckIcon, inlineSymbolProps } from "@/components/ui/icons";
import { backendErrorMessage } from "@/lib/api/error-message";
import { useTrialBalance } from "@/lib/api/hooks/useTrialBalance";

import { periodEntryCountText, periodRowLabel, type PeriodRow } from "./period-closing";

interface PeriodCloseConfirmModalProps {
  row: PeriodRow;
  isPending: boolean;
  errorText: string | null;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * DK:239-284 — "Dönemi Kapat" tıklanınca çıkan onay adımı. Mockup'ın ÇİZDİĞİ
 * referans diyalog burada GERÇEK bir bileşen olur (K8: geri alınamaz eylem
 * için onay istenir; mockup'ın kendisi de bir onay adımı çiziyor — kararı
 * İCAT ETMEYE gerek yok, birebir kopyalanır).
 *
 * 🔴 DK:274 onay kutucuğu işaretlenmeden "Dönemi Kapat" AKTİFLEŞMEZ
 * (DK:284 alt notu) — tıklar tıklamaz koşmayı önleyen ikinci bir kapı.
 *
 * 🔴 "Mizan Durumu" (DK:262-265) `GET /trial-balance` çağıran AYRI bir
 * sorgudur (`useTrialBalance` — hâlihazırda MZ ekranının kullandığı hook,
 * ikinci bir kopyası YAZILMAZ). Bu sorgu YALNIZ diyalog AÇIKKEN mount edilir.
 */
export function PeriodCloseConfirmModal({
  row,
  isPending,
  errorText,
  onConfirm,
  onClose,
}: PeriodCloseConfirmModalProps) {
  const [acknowledged, setAcknowledged] = useState(false);
  const trialBalanceQuery = useTrialBalance(row.year, row.month);
  const entryCount = periodEntryCountText(row.item);

  return (
    <Modal
      title={`${periodRowLabel(row)} Kapatılsın mı?`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isPending}>
            Vazgeç
          </Button>
          <Button
            variant="primary"
            onClick={onConfirm}
            disabled={!acknowledged || isPending}
            data-testid="dkap-confirm-close"
          >
            Dönemi Kapat
          </Button>
        </>
      }
    >
      {/* DK:242 — mockup'ta BAŞLIĞIN ALTINDA düz metindir (kutu/kenarlık
          YOK); `.mu-notice` burada KULLANILMAZ — o sınıf kendi kenarlığını/
          zeminini taşır ve metni bir giriş alanı gibi göstererek DK:242'nin
          "yalnız soluk bir alt yazı" niyetini bozardı. */}
      <p className="dkap-confirm-subtitle" data-testid="dkap-confirm-subtitle">
        Bu işlem geri alınamaz
      </p>

      {/* DK:248-256 — kapattıktan sonra ne olacağı. */}
      <div className="mu-notice mu-notice--warning">
        Kapattıktan sonra bu döneme:
        <br />• Yeni fiş <strong>girilemez</strong>
        <br />• Mevcut fişler <strong>değiştirilemez</strong> ve silinemez
        <br />• Geri açma yalnız <strong>Sistem Yöneticisi</strong> tarafından yapılabilir
      </div>

      {/* DK:257-267 — Fiş Sayısı + Mizan Durumu. */}
      <div className="dkap-confirm-grid">
        <div className="dkap-confirm-cell" data-testid="dkap-confirm-entry-count">
          <div className="dkap-confirm-cell__label">Fiş Sayısı</div>
          <div className="dkap-confirm-cell__value is-mono">{entryCount}</div>
        </div>
        <div
          className="dkap-confirm-cell dkap-confirm-cell--success"
          data-testid="dkap-confirm-balance"
        >
          <div className="dkap-confirm-cell__label">Mizan Durumu</div>
          <div className="dkap-confirm-cell__value">
            {trialBalanceQuery.data === undefined ? (
              "Yükleniyor…"
            ) : trialBalanceQuery.data.totals.closing_debit === null ||
              trialBalanceQuery.data.totals.closing_credit === null ? (
              // IZN-F4b.2 — kapanış toplamları rol için gizli: denge doğrulanamaz, "Dengede değil" DENMEZ.
              "Doğrulanamıyor"
            ) : trialBalanceQuery.data.is_balanced ? (
              <>
                <CheckIcon {...inlineSymbolProps} /> Dengede
              </>
            ) : (
              "Dengede değil"
            )}
          </div>
        </div>
      </div>

      {/* DK:268-273 — onay kutucuğu. */}
      <Checkbox
        label="Dönemin kapatılmasının geri alınamaz olduğunu ve tüm kayıtların kontrol edildiğini onaylıyorum"
        checked={acknowledged}
        onChange={(event) => setAcknowledged(event.target.checked)}
        data-testid="dkap-confirm-ack"
      />

      {errorText !== null && (
        <p className="mu-notice mu-notice--danger" data-testid="dkap-confirm-error">
          {errorText}
        </p>
      )}
    </Modal>
  );
}

export function periodCloseErrorText(err: unknown): string {
  return backendErrorMessage(err, "Dönem kapatılamadı.");
}
