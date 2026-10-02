"use client";

import { CheckIcon } from "@/components/ui/icons";
import { cx } from "@/lib/cx";

import type { ConvertStep } from "./convert-types";
import "./offer-convert.css";

const STEPS: readonly { step: ConvertStep; label: string; sub: string }[] = [
  { step: 1, label: "Proje Bilgileri", sub: "kod, sözleşme, tarih" },
  { step: 2, label: "Kalemleri Gözden Geçir", sub: "miktar ve fiyat" },
  { step: 3, label: "Onay", sub: "oluştur" },
];
const LAST_STEP = 3;

interface ConvertStepperProps {
  step: ConvertStep;
  /** Oluşturma başarılı: üç adım da tamamlanmış görünür. */
  isDone: boolean;
  /** Oluşturma uçuşta: tek uçuş kuralı gereği çubuk kilitli. */
  isLocked: boolean;
  onStep: (step: ConvertStep) => void;
}

/** TDN:75-83 — geri serbest, ileri yalnız önceki adımlar geçerliyse (kapı `useConvertBoard.goTo`). ✓ = `CheckIcon`. */
export function ConvertStepper({ step, isDone, isLocked, onStep }: ConvertStepperProps) {
  return (
    <nav className="convert-stepper" aria-label="Dönüştürme adımları">
      {STEPS.map((entry) => {
        const isCurrent = entry.step === step && !isDone;
        const isPast = entry.step < step || isDone;
        return (
          <StepperItem key={entry.step} {...entry} isCurrent={isCurrent} isPast={isPast} isLocked={isLocked || isDone} onStep={onStep} />
        );
      })}
    </nav>
  );
}

interface StepperItemProps {
  step: ConvertStep;
  label: string;
  sub: string;
  isCurrent: boolean;
  isPast: boolean;
  isLocked: boolean;
  onStep: (step: ConvertStep) => void;
}

function StepperItem({ step, label, sub, isCurrent, isPast, isLocked, onStep }: StepperItemProps) {
  return (
    <>
      <button
        type="button"
        disabled={isLocked}
        aria-current={isCurrent ? "step" : undefined}
        className={cx("convert-stepper__item", isCurrent && "convert-stepper__item--current", isPast && "convert-stepper__item--done")}
        onClick={() => onStep(step)}
      >
        <span className="convert-stepper__circle" aria-hidden="true">
          {isPast ? <CheckIcon width={12} height={12} /> : step}
        </span>
        <span className="convert-stepper__text">
          <span className="convert-stepper__label">{label}</span>
          <span className="convert-stepper__sub">{sub}</span>
        </span>
      </button>
      {step < LAST_STEP && <span className={cx("convert-stepper__line", isPast && "convert-stepper__line--done")} aria-hidden="true" />}
    </>
  );
}
