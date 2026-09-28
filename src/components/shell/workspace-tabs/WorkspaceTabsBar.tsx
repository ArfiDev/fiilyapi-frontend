"use client";

/**
 * SEKME-F1.4a · üst çubuktaki çalışma sekmeleri YUVASI.
 *
 * Yalnız bağlar: `useWorkspaceTabsController`ın durumunu/eylemlerini şeride
 * (`WorkspaceTabsStrip`, F1.4b) iletir ve kaydedilmemiş veri onayını basar.
 * Topbar'da logo ile eylemler arasındadır; yuva `flex:1; min-width:0`
 * (topbar.css `.topbar-tabs`) — şerit daralır/kayar, zil+avatarı ezmez.
 */
import { UnsavedTabGuardModal } from "./UnsavedTabGuardModal";
import { useWorkspaceTabsController } from "./useWorkspaceTabsController";
import { WorkspaceTabsStrip } from "./WorkspaceTabsStrip";

export function WorkspaceTabsBar() {
  const tabs = useWorkspaceTabsController();

  return (
    <div className="topbar-tabs">
      <WorkspaceTabsStrip
        tabs={tabs.state.tabs}
        activeId={tabs.state.activeId}
        onSelect={tabs.selectTab}
        onClose={tabs.closeTab}
        onCloseOthers={tabs.closeOthers}
        onCloseRight={tabs.closeRight}
        onCloseAll={tabs.closeAll}
        onReorder={tabs.reorderTab}
      />
      <UnsavedTabGuardModal
        isOpen={tabs.guard.isOpen}
        labels={tabs.guard.labels}
        onCancel={tabs.guard.cancel}
        onDiscard={tabs.guard.confirm}
      />
    </div>
  );
}
