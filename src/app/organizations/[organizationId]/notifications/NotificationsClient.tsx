"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function NotificationsClient({organizationId,notifications}:{organizationId:string;notifications:Array<{id:string;event_type:string;title:string;body:string;status:string;created_at:string;read_at:string|null}>}){
 const router=useRouter();const[busy,setBusy]=useState<string|null>(null);const[msg,setMsg]=useState<string|null>(null);
 async function markRead(id:string){setBusy(id);setMsg(null);const r=await fetch(`/api/organizations/${organizationId}/notifications`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"mark_read",notificationId:id})});const b=await r.json();setBusy(null);if(!r.ok){setMsg(b.message??"Unable to update notification");return;}router.refresh();}
 return <section className="workspace-panel"><div className="section-heading"><div><p className="eyebrow">Inbox</p><h2>Operational notifications</h2></div><span className="count-badge">{notifications.filter(n=>n.status!=="READ").length} unread</span></div>{msg&&<p className="form-message">{msg}</p>}{notifications.length===0?<div className="empty-state"><strong>No notifications.</strong><p>Assignments, deadlines, review gates and monitoring events can be surfaced here.</p></div>:<div className="signal-list">{notifications.map(n=><article className="signal-card" key={n.id}><div className="signal-meta"><span className="role-badge">{n.status}</span><span>{new Date(n.created_at).toLocaleString()}</span></div><h3>{n.title}</h3><p>{n.body}</p><small>{n.event_type}</small>{n.status!=="READ"?<button className="secondary-button" disabled={busy===n.id} onClick={()=>void markRead(n.id)}>{busy===n.id?"Saving…":"Mark read"}</button>:null}</article>)}</div>}</section>;
}
