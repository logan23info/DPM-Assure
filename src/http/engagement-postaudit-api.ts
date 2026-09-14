import type { AuthorizedTenantTransaction } from "@/auth/authorize";
import { archiveEngagement, createChangeEvent, createMonitoringProgram, reassessChange, recordMonitoringCheck } from "@/domain/engagement/postaudit-service";

export async function executePostAuditAction(tx:AuthorizedTenantTransaction,body:Record<string,unknown>){switch(body.action){case"archive":return archiveEngagement(tx,body);case"create_program":return createMonitoringProgram(tx,body);case"record_check":return recordMonitoringCheck(tx,body);case"create_change":return createChangeEvent(tx,body);case"reassess":return reassessChange(tx,body);default:throw new Error("Unsupported post-audit action");}}
