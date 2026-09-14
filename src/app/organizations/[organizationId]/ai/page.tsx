import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUserContext } from "@/auth/current-user-context";
import { withAuthorizedTenantTransaction } from "@/auth/authorize";
import { hasPermission, permissions } from "@/auth/rbac";
import { listAiGenerations } from "@/domain/ai/service";
import { AiAssistantClient } from "./AiAssistantClient";

export const dynamic="force-dynamic";type PageProps={params:Promise<{organizationId:string}>};
export default async function AiPage({params}:PageProps){const{organizationId}=await params;const current=await getCurrentUserContext();if(!current)redirect("/login");const membership=current.memberships.find(m=>m.organizationId===organizationId);if(!membership)redirect("/dashboard");if(!hasPermission(membership.role,permissions.aiUse))redirect("/dashboard");const generations=await withAuthorizedTenantTransaction({principal:current.principal,organizationId,requestId:crypto.randomUUID(),permission:permissions.aiUse},tx=>listAiGenerations(tx));return <main className="dashboard-shell"><Link className="back-link" href="/dashboard">← Dashboard</Link><header className="dashboard-header"><div><p className="eyebrow">{membership.organizationName}</p><h1>AI assistance</h1><p className="lede compact">Source-grounded drafting and extraction with mandatory human review boundaries.</p></div><span className="role-badge">ADVISORY ONLY</span></header><AiAssistantClient organizationId={organizationId} generations={generations as any[]} canReview={hasPermission(membership.role,permissions.aiReview)} canPublish={hasPermission(membership.role,permissions.aiPublish)}/></main>;}
