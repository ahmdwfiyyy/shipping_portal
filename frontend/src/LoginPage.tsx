import { useState } from "react";
import type { FormEvent } from "react";
import { errorText, postJson } from "./api";
import carsemLogo from "./assets/carsem-logo.png";
import { ArrowIcon, Banner, Field, Modal, Spinner, TopBar, inputCls, panel, redBtn } from "./Ui";
import type { Notice } from "./Ui";

// ---------------------------------------------------------------------------
// Login page (opened from the landing page, or after a session expires)
// ---------------------------------------------------------------------------
export default function LoginPage({
  onSignIn,
  onBack,
  notice,
}: {
  onSignIn: (token: string) => void;
  onBack: () => void;
  notice: Notice;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const data = await postJson<{ token: string }>("/api/login", { username, password });
      onSignIn(data.token);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  return (
    <div className="brand-grid relative flex min-h-screen items-center justify-center overflow-hidden bg-brand-navy px-4 py-10">
      <div className="brand-ribbon pointer-events-none absolute -right-16 -top-32 h-80 w-96 opacity-80" />
      <div className="pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full border-[40px] border-white/5" />
      <div className="pointer-events-none absolute -bottom-20 right-24 h-44 w-44 rounded-full bg-brand-red/20 blur-2xl" />
      <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-brand-red via-white to-brand-bright" />

      <div className="relative w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-3 text-white">
          <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-2xl bg-white shadow-[0_6px_16px_rgba(0,0,0,0.25)] ring-2 ring-white/20">
            <img src={carsemLogo} alt="Carsem" draggable={false} className="h-10 w-10 select-none object-contain" />
          </div>
          <div>
            <p className="text-xl font-extrabold tracking-[-0.02em]">Shipping Rate Portal</p>
            <p className="text-xs font-medium tracking-wide text-blue-100">International delivery from Malaysia</p>
          </div>
        </div>

        <section className={panel}>
          <TopBar />
          <div className="border-b border-blue-50 bg-gradient-to-r from-white to-brand-ice px-6 py-6">
            <div className="mb-1 flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.14em] text-brand-red">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-red" />
              Secure access
            </div>
            <h1 className="text-2xl font-extrabold tracking-[-0.02em] text-brand-navy">Welcome back</h1>
            <p className="mt-1 text-sm text-slate-500">Sign in with your account to compare courier rates.</p>
          </div>

          <form onSubmit={submit} className="space-y-5 p-6">
            <Banner notice={error ? { type: "error", text: error } : notice} />

            <Field label="Username">
              <input
                required
                autoFocus
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className={inputCls}
              />
            </Field>

            <Field label="Password">
              <div className="relative">
                <input
                  type={show ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${inputCls} pr-20`}
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-xs font-bold text-brand-blue hover:text-brand-red"
                >
                  {show ? "Hide" : "Show"}
                </button>
              </div>
            </Field>

            <button type="submit" disabled={busy} className={`${redBtn} w-full`}>
              {busy ? (
                <>
                  <Spinner />
                  Signing in...
                </>
              ) : (
                <>
                  Sign in
                  <ArrowIcon />
                </>
              )}
            </button>
          </form>
        </section>

        <div className="mt-5 text-center text-xs text-blue-100">
          <p>No account yet, or forgot your password? Ask your administrator.</p>
          <button type="button" onClick={onBack} className="mt-3 font-bold text-white underline-offset-4 hover:underline">
            ← Back to home
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Change your own password (any signed-in user)
// ---------------------------------------------------------------------------
export function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (next !== confirm) {
      setNotice({ type: "error", text: "The new passwords do not match." });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      await postJson("/api/me/password", { current_password: current, new_password: next });
      setNotice({ type: "success", text: "Your password has been changed." });
      setDone(true);
    } catch (err) {
      setNotice({ type: "error", text: errorText(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Change password" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Banner notice={notice} />
        {!done && (
          <>
            <Field label="Current password">
              <input type="password" required autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className={inputCls} />
            </Field>
            <Field label="New password" hint="At least 8 characters">
              <input type="password" required minLength={8} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Confirm new password">
              <input type="password" required minLength={8} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputCls} />
            </Field>
          </>
        )}
        <div className="flex justify-end pt-2">
          {done ? (
            <button type="button" className={redBtn} onClick={onClose}>
              Done
            </button>
          ) : (
            <button type="submit" disabled={busy} className={redBtn}>
              {busy ? <Spinner /> : null}
              Update password
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}
