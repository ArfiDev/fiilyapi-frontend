import type { components, paths } from "./schema";
import type { DeepScale, WithPlainProgressPct } from "./scale";

export type UserResponse = DeepScale<components["schemas"]["UserResponse"]>;
export type UserListResponse = DeepScale<components["schemas"]["UserListResponse"]>;
export type UserCreate = DeepScale<components["schemas"]["UserCreate"]>;
export type UserUpdate = DeepScale<components["schemas"]["UserUpdate"]>;
export type UserStatus = components["schemas"]["UserStatus"];
export type RoleResponse = DeepScale<components["schemas"]["RoleResponse"]>;
export type RoleCreate = DeepScale<components["schemas"]["RoleCreate"]>;
export type RoleRename = DeepScale<components["schemas"]["RoleRename"]>;
export type ModuleResponse = DeepScale<components["schemas"]["ModuleResponse"]>;
export type ModuleGroup = DeepScale<components["schemas"]["ModuleGroup"]>;
export type ProjectResponse = WithPlainProgressPct<DeepScale<components["schemas"]["ProjectListItem"]>>;
export type ProjectAccessInput = DeepScale<components["schemas"]["ProjectAccessInput"]>;
export type ProjectAccessResponse = DeepScale<components["schemas"]["ProjectAccessResponse"]>;
export type UserDisciplinesInput = DeepScale<components["schemas"]["UserDisciplinesInput"]>;
export type UserDisciplinesRead = DeepScale<components["schemas"]["UserDisciplinesRead"]>;
export type PermissionCell = DeepScale<components["schemas"]["PermissionCell"]>;
export type PermissionUpdate = DeepScale<components["schemas"]["PermissionUpdate"]>;
export type PasswordReset = DeepScale<components["schemas"]["PasswordReset"]>;
export type AccessLevel = components["schemas"]["AccessLevel"];
export type Scope = components["schemas"]["Scope"];
export type CompanyRead = DeepScale<components["schemas"]["CompanyRead"]>;
export type CompanyUpdate = DeepScale<components["schemas"]["CompanyUpdate"]>;
export type PreferencesRead = DeepScale<components["schemas"]["PreferencesRead"]>;
export type PreferencesUpdate = DeepScale<components["schemas"]["PreferencesUpdate"]>;
export type NotificationPrefItem = DeepScale<components["schemas"]["NotificationPrefItem"]>;
export type NotificationPrefsUpdate = DeepScale<components["schemas"]["NotificationPrefsUpdate"]>;
export type AuditAction = components["schemas"]["AuditAction"];
export type AuditActorRead = DeepScale<components["schemas"]["AuditActorRead"]>;
export type AuditItem = DeepScale<components["schemas"]["AuditItem"]>;
export type AuditListResponse = DeepScale<components["schemas"]["AuditListResponse"]>;

/** `/audit-log` sorgu parametreleri (limit/offset dahil). */
export type AuditLogQuery = NonNullable<paths["/audit-log"]["get"]["parameters"]["query"]>;
/** Excel dışa aktarımının sorgu parametreleri (limit/offset YOK). */
export type AuditExportQuery = NonNullable<paths["/audit-log/export.xlsx"]["get"]["parameters"]["query"]>;

// PLN-F1 · Planlama / Kazanılmış Değer (backend `earned_value`, B1 sözleşmesi).
type EvSchema = components["schemas"];
export type EvDisciplineRead = DeepScale<EvSchema["DisciplineRead"]>;
export type EvDisciplineCreate = DeepScale<EvSchema["DisciplineCreate"]>;
export type EvDisciplineUpdate = DeepScale<EvSchema["DisciplineUpdate"]>;
export type EvCatalogItemRead = DeepScale<EvSchema["CatalogItemRead"]>;
export type EvCatalogItemCreate = DeepScale<EvSchema["CatalogItemCreate"]>;
export type EvCatalogItemUpdate = DeepScale<EvSchema["CatalogItemUpdate"]>;
export type EvSettingsRead = DeepScale<EvSchema["SettingsRead"]>;
export type EvSettingsSave = DeepScale<EvSchema["SettingsSave"]>;
export type EvBudgetView = DeepScale<EvSchema["BudgetView"]>;
export type EvRevisionOut = DeepScale<EvSchema["RevisionOut"]>;
export type EvRevisionDiffOut = DeepScale<EvSchema["RevisionDiffOut"]>;
export type EvScheduleOut = DeepScale<EvSchema["ScheduleOut"]>;
export type EvPreviewOut = DeepScale<EvSchema["PreviewOut"]>;
export type EvSuggestionsOut = DeepScale<EvSchema["SuggestionsOut"]>;
export type EvFillOut = DeepScale<EvSchema["FillOut"]>;


// PLN-F2.1 · Saha — günün saat dağıtımı + Gönder kontrolü + gün kilidi
// (backend B2 `earned_value/day_router`, sözleşme main 474f1fa).
export type EvDayView = DeepScale<EvSchema["DayView"]>;
export type EvDayRow = DeepScale<EvSchema["RowOut"]>;
export type EvDayCode = DeepScale<EvSchema["CodeOut"]>;
export type EvDayCell = DeepScale<EvSchema["CellOut"]>;
export type EvDayTotals = DeepScale<EvSchema["TotalsOut"]>;
export type EvDayLock = DeepScale<EvSchema["LockOut"]>;
export type EvDayUnlockInfo = DeepScale<EvSchema["UnlockOut"]>;
export type EvDayProgress = DeepScale<EvSchema["ProgressOut"]>;
export type EvLeafProgress = DeepScale<EvSchema["LeafProgressOut"]>;
export type EvSubmitCheck = DeepScale<EvSchema["SubmitCheckOut"]>;
export type EvAllocationSave = DeepScale<EvSchema["AllocationSave"]>;
export type EvAllocationCode = DeepScale<EvSchema["CodeIn"]>;
export type EvAllocationCell = DeepScale<EvSchema["CellIn"]>;
export type EvAllocationRowRef = DeepScale<EvSchema["RowRef"]>;
export type EvPreviousAllocation = DeepScale<EvSchema["PreviousAllocationOut"]>;
export type EvRowPattern = DeepScale<EvSchema["RowPatternOut"]>;
export type EvShare = DeepScale<EvSchema["ShareOut"]>;
export type EvUnlockBody = DeepScale<EvSchema["UnlockBody"]>;
export type EvCodeNode = DeepScale<EvSchema["CodeNodeOut"]>;

// PLN-F3.1 · Raporlar (Panel/GİR/QURR) — backend B3 `earned_value` rapor uçları.
// TYPE-F1 SPIKE: DeepScale — `fraction`/`percent` adları otomatik marka'lanır
// (progressBarWidth/formatPercent01 çağrı yerinin akışını ölçmek için).
export type EvPanelReport = DeepScale<EvSchema["PanelReport"]>;
export type EvDailyReport = DeepScale<EvSchema["DailyReport"]>;
export type EvQurrReport = DeepScale<EvSchema["QurrReport"]>;
export type EvQurrRow = DeepScale<EvSchema["QurrRow"]>;
export type EvQurrTotal = DeepScale<EvSchema["QurrTotal"]>;
export type EvCompositeCard = DeepScale<EvSchema["CompositeCard"]>;
export type EvWarning = DeepScale<EvSchema["WarningOut"]>;
export type EvPfBandsOut = DeepScale<EvSchema["PfBandsOut"]>;
/** "red"|"amber"|"green"|"high" — istemci `PfBand` bunun üstüne "none" ekler. */
export type EvApiPfBand = EvSchema["PfBand"];
export type EvApprovalResult = DeepScale<EvSchema["ApprovalResult"]>;
export type EvQtyTreeRow = DeepScale<EvSchema["QtyTreeRow"]>;
export type EvKpiPf = DeepScale<EvSchema["KpiPf"]>;
/** Şema kayıtlı değeri `"own" | "subcon"`dur (sözleşme taslağındaki `"subcontractor"` DEĞİL). */
export type EvContractorType = EvSchema["ContractorType"];
