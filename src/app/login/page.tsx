import Link from "next/link";

import { getCurrentUserContext } from "@/auth/current-user-context";
import { SignInForm } from "./SignInForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const current = await getCurrentUserContext();

  return (
    <main className="shell">
      <section className="hero auth-card">
        <p className="eyebrow">DPM-Assure</p>
        <h1>{current ? "You are already signed in" : "Secure passwordless sign-in"}</h1>
        <p className="lede">
          Authentication uses a single-use email link and a server-side session. Browser-supplied user or organization headers are never trusted.
        </p>
        {current ? (
          <div className="auth-actions">
            <Link className="primary-link" href="/dashboard">Open dashboard</Link>
            <form action="/api/auth/logout" method="post">
              <button className="secondary-button" type="submit">Sign out</button>
            </form>
          </div>
        ) : (
          <SignInForm />
        )}
      </section>
    </main>
  );
}
