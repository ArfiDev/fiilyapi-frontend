import type { BankAccountResponse } from "@/lib/api/hooks/useBankAccounts";
import { MaskedMark } from "@/components/ui/hidden-mark/HiddenMark";
import { TREASURY_HIDDEN_CATEGORIES } from "@/lib/auth/finance-hidden";
import { useCategoryHidden } from "@/lib/auth/useCategoryHidden";
import { formatCurrency } from "@/lib/format";

import {
  BANK_ACCOUNT_IDENTITY_HINT,
  BANK_ACCOUNT_TYPE_LABELS,
  bankAccountIdentityLine,
  treasuryCardGradientVar,
} from "./treasury-labels";
import "./treasury.css";

export interface BankAccountCardsProps {
  accounts: readonly BankAccountResponse[];
}

/**
 * E9:69-85 · banka/kasa kartı şeridi. Üç sütunlu ızgara (E9:69), her kart
 * degrade zeminli (E9:70/75/80) ve ÜÇ satırlıdır:
 *   1. E9:71/76/81 — `${bank_name} · ${tür etiketi}`, 11px uppercase ls .8px
 *   2. E9:72/77/82 — TÜRETİLMİŞ `balance`, 26px/700 JetBrains Mono
 *   3. E9:73/78/83 — IBAN ya da görünen ad, 12px
 *
 * 🔴 2. satır `opening_balance` DEĞİL `balance`tır: açılış bakiyesi hareketleri
 * içermez, kart "bugünkü para"yı gösterir (`BankAccountResponse` şema notu K2).
 */
export function BankAccountCards({ accounts }: BankAccountCardsProps) {
  const isHidden = useCategoryHidden(TREASURY_HIDDEN_CATEGORIES);
  return (
    <div className="hazine-cards" data-testid="hazine-cards">
      {accounts.map((account, index) => {
        const identity = bankAccountIdentityLine(account, isHidden);
        return (
          <div
            key={account.id}
            className="hazine-card"
            data-testid="hazine-account-card"
            data-account-id={account.id}
            // Degrade SIRAYA göre döner (treasury-labels.ts gerekçesi).
            style={{ background: treasuryCardGradientVar(index) }}
          >
            <div className="hazine-card__label">
              {account.bank_name} · {BANK_ACCOUNT_TYPE_LABELS[account.account_type]}
            </div>
            <div className="hazine-card__balance">
              {formatCurrency(account.balance)}
              <MaskedMark isHidden={isHidden} values={[account.balance]} />
            </div>
            <div
              className="hazine-card__identity"
              {...(identity.isMissing ? { title: BANK_ACCOUNT_IDENTITY_HINT } : {})}
            >
              {identity.text}
            </div>
          </div>
        );
      })}
    </div>
  );
}
