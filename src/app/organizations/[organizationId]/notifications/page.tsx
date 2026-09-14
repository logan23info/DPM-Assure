import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUserContext } from "@/auth/current-user-context";
import { withAuthorizedTenantTransaction } from "@/auth/authorize";
import { permissions } from "@/auth/rbac";
import { listMyNotifications } from "@/domain/notifications/service";
import { NotificationsClient } from "./NotificationsClient";

export const dynamic="force-dynamic";
type PageProps={params:Promise<{organizationId:string}>};
export default async function NotificationsPage({params}:PageProps){const{organizationId}=await params;const current=await getCurrentUserContext();if(!current)redirect("/login");const membership=current.memberships.find(m=>m.organizationId===organizationId);if(!membership)redirect("/dashboard");const notifications=await withAuthorizedTenantTransaction({principal:current.principal,organizationId,requestId:crypto.randomUUID(),permission:permissions.organizationRead},tx=>listMyNotifications(tx));return <main className="dashboard-shell"><Link className="back-link" href="/dashboard">← Dashboard</Link><header className="dashboard-header"><div><p className="eyebrow">{membership.organizationName}</p><h1>Notifications</h1><p className="lede compact">Tenant-scoped operational alerts and workflow activity addressed to you.</p></div><span className="role-badge">{membership.role.replaceAll("_"," ")}</span></header><NotificationsClient organizationId={organizationId} notifications={notifications}/></main>;}
