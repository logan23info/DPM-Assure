"use client";

import { FormEvent, useState } from "react";

export function SignInForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "sent" | "error">("idle");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");

    try {
      const response = await fetch("/api/auth/magic-link/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) throw new Error("Unable to request sign-in link");
      setStatus("sent");
    } catch {
      setStatus("error");
    }
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      <label htmlFor="email">Work email</label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        required
        maxLength={320}
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        disabled={status === "submitting" || status === "sent"}
      />
      <button type="submit" disabled={status === "submitting" || status === "sent"}>
        {status === "submitting" ? "Sending…" : status === "sent" ? "Link sent" : "Email me a secure sign-in link"}
      </button>
      {status === "sent" ? (
        <p className="form-message" role="status">
          If your account exists, a one-time sign-in link has been sent. Check your email.
        </p>
      ) : null}
      {status === "error" ? (
        <p className="form-message error" role="alert">
          The sign-in request could not be completed. Please try again.
        </p>
      ) : null}
    </form>
  );
}
