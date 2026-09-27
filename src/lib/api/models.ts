import type { components, paths } from "./schema";
import type { DeepScale } from "./scale";

export type UserResponse = components["schemas"]["UserResponse"];
export type UserListResponse = components["schemas"]["UserListResponse"];
export type UserCreate = components["schemas"]["UserCreate"];
export type UserUpdate = components["schemas"]["UserUpdate"];
export type UserStatus = components["schemas"]["UserStatus"];
export type RoleResponse = components["schemas"]["RoleResponse"];
export type RoleCreate = components["schemas"]["RoleCreate"];
export type RoleRename = components["schemas"]["RoleRename"];
export type ModuleResponse = components["schemas"]["ModuleResponse"];
export type ModuleGroup = components["schemas"]["ModuleGroup"];
export type ProjectResponse = components["schemas"]["ProjectListItem"];
export type ProjectAccessInput = components["schemas"]["ProjectAccessInput"];
export type ProjectAccessResponse = components["schemas"]["ProjectAccessResponse"];
export type PermissionCell = components["schemas"]["PermissionCell"];
export type PermissionUpdate = components["schemas"]["PermissionUpdate"];
export type PasswordReset = components["schemas"]["PasswordReset"];
export type AccessLevel = components["schemas"]["AccessLevel"];
export type Scope = components["schemas"]["Scope"];
export type CompanyRead = components["schemas"]["CompanyRead"];
export type CompanyUpdate = components["schemas"]["CompanyUpdate"];
export type PreferencesRead = components["schemas"]["PreferencesRead"];
export type PreferencesUpdate = components["schemas"]["PreferencesUpdate"];
export type NotificationPrefItem = components["schemas"]["NotificationPrefItem"];
export type NotificationPrefsUpdate = components["schemas"]["NotificationPrefsUpdate"];
export type AuditAction = components["schemas"]["AuditAction"];
export type AuditActorRead = components["schemas"]["AuditActorRead"];
export type AuditItem = components["schemas"]["AuditItem"];
export type AuditListResponse = components["schemas"]["AuditListResponse"];

/** `/audit-log` sorgu parametreleri (limit/offset dahil). */
export type AuditLogQuery = NonNullable<paths["/audit-log"]["get"]["parameters"]["query"]>;
/** Excel dışa aktarımının sorgu parametreleri (limit/offset YOK). */
export type AuditExportQuery = NonNullable<paths["/audit-log/export.xlsx"]["get"]["parameters"]["query"]>;

// PLN-F1 · Planlama / Kazanılmış Değer (backend `earned_value`, B1 sözleşmesi).
type EvSchema = components["schemas"];
export type EvDisciplineRead = EvSchema["DisciplineRead"];
export type EvDisciplineCreate = EvSchema["DisciplineCreate"];
export type EvDisciplineUpdate = EvSchema["DisciplineUpdate"];
export type EvCatalogItemRead = DeepScale<EvSchema["CatalogItemRead"]>;
export type EvCatalogItemCreate = EvSchema["CatalogItemCreate"];
export type EvCatalogItemUpdate = EvSchema["CatalogItemUpdate"];
export type EvSettingsRead = EvSchema["SettingsRead"];
export type EvSettingsSave = EvSchema["SettingsSave"];
export type EvBudgetView = DeepScale<EvSchema["BudgetView"]>;
export type EvRevisionOut = EvSchema["RevisionOut"];
export type EvRevisionDiffOut = EvSchema["RevisionDiffOut"];
export type EvScheduleOut = EvSchema["ScheduleOut"];
export type EvPreviewOut = DeepScale<EvSchema["PreviewOut"]>;
export type EvSuggestionsOut = EvSchema["SuggestionsOut"];
export type EvFillOut = EvSchema["FillOut"];


// PLN-F2.1 · Saha — günün saat dağıtımı + Gönder kontrolü + gün kilidi
// (backend B2 `earned_value/day_router`, sözleşme main 474f1fa).
export type EvDayView = EvSchema["DayView"];
export type EvDayRow = EvSchema["RowOut"];
export type EvDayCode = EvSchema["CodeOut"];
export type EvDayCell = EvSchema["CellOut"];
export type EvDayTotals = EvSchema["TotalsOut"];
export type EvDayLock = EvSchema["LockOut"];
export type EvDayUnlockInfo = EvSchema["UnlockOut"];
export type EvDayProgress = EvSchema["ProgressOut"];
export type EvLeafProgress = EvSchema["LeafProgressOut"];
export type EvSubmitCheck = EvSchema["SubmitCheckOut"];
export type EvAllocationSave = EvSchema["AllocationSave"];
export type EvAllocationCode = EvSchema["CodeIn"];
export type EvAllocationCell = EvSchema["CellIn"];
export type EvAllocationRowRef = EvSchema["RowRef"];
export type EvPreviousAllocation = EvSchema["PreviousAllocationOut"];
export type EvRowPattern = EvSchema["RowPatternOut"];
export type EvShare = EvSchema["ShareOut"];
export type EvUnlockBody = EvSchema["UnlockBody"];
export type EvCodeNode = EvSchema["CodeNodeOut"];

// PLN-F3.1 · Raporlar (Panel/GİR/QURR) — backend B3 `earned_value` rapor uçları.
// TYPE-F1 SPIKE: DeepScale — `fraction`/`percent` adları otomatik marka'lanır
// (progressBarWidth/formatPercent01 çağrı yerinin akışını ölçmek için).
export type EvPanelReport = DeepScale<EvSchema["PanelReport"]>;
export type EvDailyReport = DeepScale<EvSchema["DailyReport"]>;
export type EvQurrReport = DeepScale<EvSchema["QurrReport"]>;
export type EvQurrRow = DeepScale<EvSchema["QurrRow"]>;
export type EvQurrTotal = EvSchema["QurrTotal"];
export type EvCompositeCard = EvSchema["CompositeCard"];
export type EvWarning = EvSchema["WarningOut"];
export type EvPfBandsOut = EvSchema["PfBandsOut"];
/** "red"|"amber"|"green"|"high" — istemci `PfBand` bunun üstüne "none" ekler. */
export type EvApiPfBand = EvSchema["PfBand"];
export type EvApprovalResult = EvSchema["ApprovalResult"];
export type EvQtyTreeRow = DeepScale<EvSchema["QtyTreeRow"]>;
export type EvKpiPf = EvSchema["KpiPf"];
/** Şema kayıtlı değeri `"own" | "subcon"`dur (sözleşme taslağındaki `"subcontractor"` DEĞİL). */
export type EvContractorType = EvSchema["ContractorType"];
