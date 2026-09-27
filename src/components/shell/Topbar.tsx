"use client";

import Image from "next/image";
import { BellIcon } from "@/components/ui/icons";
import { initials } from "@/lib/shell/initials";
import { useSession } from "./SessionProvider";
import { WorkspaceTabsBar } from "./workspace-tabs/WorkspaceTabsBar";
import "./topbar.css";

export default function Topbar() {
  const { me } = useSession();
  const avatar = me ? initials(me.full_name) : "";

  return (
    <header className="topbar">
      <div className="topbar-logo">
        <Image
          src="/logo-fiil-yapi.png"
          alt="FİİL YAPI İNŞAAT MİMARLIK SAN. TİC. A.Ş."
          width={135}
          height={36}
          priority
          unoptimized
          className="topbar-logo__image"
        />
      </div>

      {/* F-KIRINTI → SEKME-F1.2: kırıntı burada YAŞAMAZ artık — KARARLAR §1.10
          ile kabuk düzeyinde `<main class="app-content">`in üstüne indi
          (`PageBreadcrumb`, `AppShell.tsx`). SEKME-F1.4a: boşalan yer çalışma
          sekmeleri şeridinin yuvası (`.topbar-tabs`, `flex:1; min-width:0`). */}
      <WorkspaceTabsBar />

      <div className="topbar-actions">
        <button type="button" className="topbar-bell" aria-label="Bildirimler">
          <BellIcon width={18} height={18} />
        </button>
        <span className="topbar-avatar" aria-hidden="true">{avatar}</span>
      </div>
    </header>
  );
}
