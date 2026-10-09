"use client";

import { useActionState } from "react";
import { login } from "@/app/admin/actions";

export function LoginForm({ usingDefault }: { usingDefault: boolean }) {
  const [state, action, pending] = useActionState(login, { error: "" } as {
    error?: string;
  });

  return (
    <form action={action}>
      <label className="field" htmlFor="admin-password">
        <span className="label">Owner password</span>
        <input
          id="admin-password"
          type="password"
          name="password"
          className="input"
          required
          autoFocus
          autoComplete="current-password"
        />
      </label>

      {state?.error && <p className="a-error">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="btn btn-primary"
        style={{ width: "100%", marginTop: "1rem" }}
      >
        {pending ? "Signing in" : "Sign in"}
      </button>

      {usingDefault && (
        <p className="a-flag" style={{ marginTop: "1.25rem" }}>
          No password has been set yet, so the development password{" "}
          <strong>merry-admin</strong> is in use. Set ADMIN_PASSWORD in your
          environment before this dashboard goes online.
        </p>
      )}
    </form>
  );
}
