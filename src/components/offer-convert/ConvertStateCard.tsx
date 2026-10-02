import Link from "next/link";

import { cx } from "@/lib/cx";
import type { ReactNode } from "react";

import "./offer-convert.css";

interface ConvertStateCardProps {
  title?: string;
  /** Gövde metni (düz metin ya da öğe). */
  children?: ReactNode;
  links: readonly { href: string; label: string; primary?: boolean }[];
}

/** Erişim durumu kartı: "zaten dönüştürüldü" / "kazanılmadı" / "bulunamadı" (plan §1 'Erişim durumları'). */
export function ConvertStateCard({ title, children, links }: ConvertStateCardProps) {
  return (
    <div className="convert-state">
      {title !== undefined && <p className="convert-state__title">{title}</p>}
      {children !== undefined && <p className="convert-state__body">{children}</p>}
      <div className="convert-state__actions">
        {links.map((link) => (
          <Link key={link.href} href={link.href} className={cx("btn", link.primary ? "btn--primary" : "btn--secondary", "btn--md")}>
            {link.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
