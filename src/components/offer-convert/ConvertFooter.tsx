"use client";

import { Button } from "@/components/ui";
import { CheckIcon } from "@/components/ui/icons";
import { cx } from "@/lib/cx";

import type { ConvertStep } from "./convert-types";
import "./offer-convert.css";

interface ConvertFooterProps {
  step: ConvertStep;
  /** Şeridin not parçası ("Proje ve sözleşme kimliği" …). */
  note: string;
  isBusy: boolean;
  isDone: boolean;
  onBack: () => void;
  onNext: () => void;
  onCreate: () => void;
}

const LAST_STEP = 3;
const NEXT_LABELS: Readonly<Record<1 | 2, string>> = { 1: "Kalemlere geç →", 2: "Onaya geç →" };

/** TDN:173-181 — yapışkan alt şerit. Uçuşta TÜM şerit kilitli (tek uçuş); başarıda "✓ Oluşturuldu" kalıcı pasif, Geri GİZLİ. */
export function ConvertFooter({ step, note, isBusy, isDone, onBack, onNext, onCreate }: ConvertFooterProps) {
  return (
    <div className="convert-footer" data-testid="convert-footer">
      <span className="convert-footer__note">
        Adım <b className="convert-footer__step">{step}</b> / 3 · {note}
      </span>
      <div className="convert-footer__actions">
        {step > 1 && !isDone && (
          <Button variant="secondary" disabled={isBusy} onClick={onBack}>
            ← Geri
          </Button>
        )}
        {step < LAST_STEP && <Button onClick={onNext}>{NEXT_LABELS[step as 1 | 2]}</Button>}
        {step === LAST_STEP && <CreateButton isBusy={isBusy} isDone={isDone} onCreate={onCreate} />}
      </div>
    </div>
  );
}

function CreateButton({ isBusy, isDone, onCreate }: Pick<ConvertFooterProps, "isBusy" | "isDone" | "onCreate">) {
  return (
    <Button
      variant={isDone ? "success" : "primary"}
      className={cx("convert-footer__create", isDone && "convert-footer__create--done")}
      disabled={isBusy || isDone}
      onClick={onCreate}
    >
      {isBusy && <span className="convert-spinner" aria-hidden="true" />}
      {isDone && <CheckIcon width={12} height={12} aria-hidden="true" />}
      {isDone ? "Oluşturuldu" : isBusy ? "Oluşturuluyor…" : "Projeyi ve Sözleşmeyi Oluştur"}
    </Button>
  );
}
