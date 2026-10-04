"use client";

import { Fragment, useId } from "react";
import { ChevronDownIcon, ChevronRightIcon } from "@/components/ui/icons";
import type { PageLevel } from "@/lib/api/models";
import { cx } from "@/lib/cx";
import { PageLevelSegment } from "./PageLevelSegment";
import { PageRow } from "./PageRow";
import type { AccessDraft } from "./page-access-draft";
import { levelDistribution, type PageSection } from "./page-access-derive";

interface PageGroupSectionProps {
  section: PageSection;
  draft: AccessDraft;
  baseline: AccessDraft;
  isOpen: boolean;
  readOnly: boolean;
  onToggle: (group: string) => void;
  onLevelChange: (key: string, level: PageLevel) => void;
  onApproveChange: (key: string, approve: boolean) => void;
  onGroupLevelChange: (keys: readonly string[], level: PageLevel) => void;
}

export function PageGroupSection({
  section,
  draft,
  baseline,
  isOpen,
  readOnly,
  onToggle,
  onLevelChange,
  onApproveChange,
  onGroupLevelChange,
}: PageGroupSectionProps) {
  const bodyId = useId();
  const counts = levelDistribution(section.pages, draft);
  const keys = section.pages.map((page) => page.key);
  const Chevron = isOpen ? ChevronDownIcon : ChevronRightIcon;
  return (
    <section className="page-group" aria-label={section.name}>
      <div className={cx("page-group__head", isOpen && "page-group__head--open")}>
        <button
          type="button"
          className="page-group__toggle"
          aria-expanded={isOpen}
          aria-controls={bodyId}
          onClick={() => onToggle(section.group)}
        >
          <Chevron className="page-group__chevron" />
          <span className="page-group__name">{section.name}</span>
          <span className="page-group__count">{section.pages.length} sayfa</span>
          <span className="page-group__dist">
            {counts.map((item) => (
              <span key={item.level} className="page-group__dist-item">
                <span className={cx("page-group__dot", `page-group__dot--${item.level}`)} aria-hidden="true" />
                {item.count} {item.label}
              </span>
            ))}
          </span>
        </button>
        <span className="page-group__all">
          tümü:
          <PageLevelSegment
            size="group"
            value={null}
            disabled={readOnly}
            aria-label={`${section.name} grubunun tümü`}
            onChange={(level) => onGroupLevelChange(keys, level)}
          />
        </span>
      </div>
      {isOpen && (
        <div id={bodyId}>
          {section.subsections.map((sub) => (
            <Fragment key={sub.title ?? "_"}>
              {sub.title !== null && <div className="page-group__subtitle">{sub.title}</div>}
              <ul className="page-rows">
                {sub.pages.map((page) => (
                  <PageRow
                    key={page.key}
                    page={page}
                    grant={draft.pages[page.key] ?? { level: "none", approve: false }}
                    saved={baseline.pages[page.key]}
                    readOnly={readOnly}
                    onLevelChange={onLevelChange}
                    onApproveChange={onApproveChange}
                  />
                ))}
              </ul>
            </Fragment>
          ))}
        </div>
      )}
    </section>
  );
}
