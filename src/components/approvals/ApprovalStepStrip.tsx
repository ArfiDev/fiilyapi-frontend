import { Fragment } from "react";

import { cx } from "@/lib/cx";
import { CheckIcon } from "@/components/ui/icons";
import type { ApprovalStepRead } from "@/lib/api/hooks/useApprovals";

import {
  approvalRoleLabel,
  approvalStepNote,
  approvalStepState,
  type ApprovalStepState,
} from "./approval-labels";

export interface ApprovalStepStripProps {
  steps: readonly ApprovalStepRead[];
  currentStepNo: number;
  /** Kalemin `can_decide`ı — sıradaki adımın benim olup olmadığı. */
  canDecide: boolean;
}

/**
 * Onay Kutusu adım şeridi — mockup `Onay Kutusu.dc.html:129-135` (`:164-170`,
 * `:222-224` aynı kalıbın iki tekrarı). Adımlar arasında 20x1px ayırıcı (`:131`).
 *
 * 🔴 GLİF YASAĞI (`fonts.css`in 63 `unicode-range` parçası tarandı):
 *   · `✓` (U+2713) KAPSANMIYOR → `CheckIcon`
 *   · `●` (U+25CF) / `○` (U+25CB) KAPSANMIYOR → CSS daire (`.ok-step__dot`)
 * Kapsanmayan glif sistem yedeğine düşer ve `ubuntu-latest`teki kare oynar.
 *
 * Durum TÜRETMESİ burada YAPILMAZ, `approvalStepState`ten okunur (tek kaynak).
 */
export function ApprovalStepStrip({ steps, currentStepNo, canDecide }: ApprovalStepStripProps) {
  return (
    <div className="ok-steps" data-testid="ok-steps">
      {steps.map((step, index) => {
        const state = approvalStepState({ step, currentStepNo, canDecide });
        const note = approvalStepNote(state);
        return (
          <Fragment key={step.step_no}>
            {index > 0 && <span className="ok-step-divider" aria-hidden="true" />}
            <span
              className={cx("ok-step", `ok-step--${state}`)}
              data-testid="ok-step"
              data-state={state}
            >
              <StepMarker state={state} />
              {approvalRoleLabel(step.approval_role)}
              {note !== null && <span className="ok-step__note">{note}</span>}
            </span>
          </Fragment>
        );
      })}
    </div>
  );
}

/** `:130` `✓` · `:133`/`:170` `●` · `:135` `○` — üçü de glifsiz. */
function StepMarker({ state }: { state: ApprovalStepState }) {
  if (state === "decided") {
    return <CheckIcon className="ok-step__icon" width="1em" height="1em" />;
  }
  return (
    <span
      className={cx("ok-step__dot", state === "upcoming" && "ok-step__dot--hollow")}
      aria-hidden="true"
    />
  );
}
