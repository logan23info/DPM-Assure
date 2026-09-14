"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AcceptInvitationClient({ organizationId, token }: { organizationId: string; token: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <div>
      <button className="primary-button" disabled={busy || token.length < 32} onClick={async () => {
        setBusy(true); setMessage("");
        try {
          const response = await fetch(`/api/organizations/${organizationId}/accept-invitation`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token }),
          });
          const body = await response.json();
          if (!response.ok) throw new Error(body.message ?? body.error ?? "Invitation acceptance failed");
          setMessage("Invitation accepted. Your organization membership is now active.");
          router.push("/dashboard");
          router.refresh();
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "Invitation acceptance failed");
          setBusy(false);
        }
      }}>{busy ? "Accepting…" : "Accept invitation"}</button>
      {message ? <p className="form-message" role="status">{message}</p> : null}
    </div>
  );
}
