import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api, errorText, fmtDateTime, postJson } from "../api";
import { Banner, Card, EmptyState, Field, Pager, Spinner, inputCls, redBtn } from "../Ui";
import type { Notice } from "../Ui";

type SettingsData = { fuel: Record<"DHL" | "FDX" | "UPS", number>; card_max_age_months: number };
const CARRIERS: ["DHL" | "FDX" | "UPS", string][] = [
  ["DHL", "DHL"],
  ["FDX", "FedEx"],
  ["UPS", "UPS"],
];

// ---------------------------------------------------------------------------
// Admin: fuel surcharges and the rate card age warning
// ---------------------------------------------------------------------------
export default function Settings() {
  const [form, setForm] = useState<{ fuel: Record<string, string>; age: string } | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);

  const fill = (d: SettingsData) =>
    setForm({
      fuel: Object.fromEntries(CARRIERS.map(([c]) => [c, String(d.fuel[c] ?? 0)])),
      age: String(d.card_max_age_months),
    });

  useEffect(() => {
    api<SettingsData>("/api/admin/settings")
      .then(fill)
      .catch((err) => setNotice({ type: "error", text: errorText(err) }));
  }, []);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!form) return;
    setBusy(true);
    setNotice(null);
    try {
      const data = await postJson<SettingsData>(
        "/api/admin/settings",
        {
          fuel: Object.fromEntries(Object.entries(form.fuel).map(([c, v]) => [c, Number(v) || 0])),
          card_max_age_months: Number(form.age),
        },
        "PUT",
      );
      fill(data);
      setNotice({ type: "success", text: "Settings saved. New comparisons use them straight away." });
    } catch (err) {
      setNotice({ type: "error", text: errorText(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card eyebrow="Admin" title="Settings">
      <Banner notice={notice} />
      {!form ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <form onSubmit={save} className="space-y-8">
          <div>
            <h3 className="text-base font-extrabold text-brand-navy">Default fuel surcharge</h3>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              Carriers add a fuel surcharge that changes monthly. These percentages pre-fill the Rate Calculator for everyone; staff can
              still change them for a single comparison, and each quotation records the percentage actually used. Use 0 if the rate card
              already includes it.
            </p>
            <div className="mt-4 grid max-w-xl grid-cols-3 gap-4">
              {CARRIERS.map(([code, name]) => (
                <Field key={code} label={name}>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      required
                      value={form.fuel[code]}
                      onChange={(e) => setForm({ ...form, fuel: { ...form.fuel, [code]: e.target.value } })}
                      className={`${inputCls} pr-9`}
                    />
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">%</span>
                  </div>
                </Field>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-base font-extrabold text-brand-navy">Rate card age warning</h3>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              Carrier tariffs usually change once a year. The dashboard warns when the rate card in use is older than this.
            </p>
            <div className="mt-4 max-w-[220px]">
              <Field label="Warn after">
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    max="60"
                    step="1"
                    required
                    value={form.age}
                    onChange={(e) => setForm({ ...form, age: e.target.value })}
                    className={`${inputCls} pr-20`}
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">months</span>
                </div>
              </Field>
            </div>
          </div>

          <div className="flex justify-end border-t border-slate-100 pt-6">
            <button type="submit" disabled={busy} className={redBtn}>
              {busy && <Spinner />}
              Save settings
            </button>
          </div>
        </form>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Admin: who did what, newest first
// ---------------------------------------------------------------------------
type Entry = { id: number; at: string; username: string; action: string; detail: string };

const ACTIONS: Record<string, string> = {
  login: "Signed in",
  password_changed: "Changed their password",
  quote_submitted: "Submitted a quote",
  user_created: "Created an account",
  user_updated: "Updated an account",
  rate_card_uploaded: "Uploaded a rate card",
  rate_card_activated: "Switched rate card",
  settings_updated: "Changed settings",
  history_exported: "Exported the history",
};

export function ActivityLog() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: Entry[]; page: number; pages: number } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ items: Entry[]; page: number; pages: number }>(`/api/admin/activity?page=${page}`)
      .then(setData)
      .catch((err) => setError(errorText(err)));
  }, [page]);

  return (
    <Card eyebrow="Admin" title="Activity log" description="Sign-ins, quotes, rate card changes and account changes, newest first.">
      <Banner notice={error ? { type: "error", text: error } : null} />
      {data && data.items.length === 0 ? (
        <EmptyState title="Nothing recorded yet" />
      ) : (
        <ol className="divide-y divide-blue-50 rounded-xl border border-blue-50">
          {data?.items.map((a) => (
            <li key={a.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-baseline sm:gap-4">
              <span className="w-40 shrink-0 text-xs tabular-nums text-slate-400">{fmtDateTime(a.at)}</span>
              <span className="text-sm text-slate-700">
                <strong className="text-slate-900">{a.username}</strong> {(ACTIONS[a.action] ?? a.action).toLowerCase()}
                {a.detail && <span className="text-slate-500"> - {a.detail}</span>}
              </span>
            </li>
          ))}
        </ol>
      )}
      {data && <Pager page={data.page} pages={data.pages} onPage={setPage} />}
    </Card>
  );
}
