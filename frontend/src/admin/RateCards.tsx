import { useCallback, useEffect, useState } from "react";
import type { DragEvent } from "react";
import type { Destination } from "../api";
import { api, carrierName, download, errorText, fmtDate, fmtDateTime, isoDay, num, rm } from "../api";
import DestinationSearch from "../DestinationSearch";
import {
  AlertIcon,
  Badge,
  Banner,
  Card,
  CheckIcon,
  CourierMark,
  DownloadIcon,
  EmptyState,
  Field,
  Spinner,
  UploadIcon,
  inputCls,
  redBtn,
  secondaryBtn,
  smallBtn,
} from "../Ui";
import type { Notice } from "../Ui";

type RateCardRow = {
  id: number;
  filename: string;
  note: string;
  effective_date: string;
  uploaded_at: string;
  uploaded_by: string;
  countries: number;
  mapping_rows: number;
  rate_rows: number;
  is_active: boolean;
};
type Warning = { level: "error" | "warning"; message: string };
type Preview = {
  filename: string;
  countries: number;
  services: string[];
  mapping_rows: number;
  rate_rows: number;
  warnings: Warning[];
  changes: {
    countries_added: string[];
    countries_removed: string[];
    prices_changed: number;
    prices_up: number;
    prices_down: number;
    average_change_pct: number;
    rows_added: number;
    rows_removed: number;
  } | null;
};
type ServiceTable = {
  service: string;
  service_key: string;
  carrier: string;
  zone: string;
  scope: string;
  rows: { type: "per_shipment" | "per_kg"; from: number; to: number; rate: number }[];
};

// ---------------------------------------------------------------------------
// Admin: rate card in use, upload with preview, version history (roll back) and a price viewer
// ---------------------------------------------------------------------------
export default function RateCards({ onChanged }: { onChanged: () => void }) {
  const [cards, setCards] = useState<RateCardRow[]>([]);
  const [warnings, setWarnings] = useState<Warning[]>([]);
  const [notice, setNotice] = useState<Notice>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    api<{ rate_cards: RateCardRow[] }>("/api/admin/rate-cards")
      .then((d) => setCards(d.rate_cards))
      .catch((err) => setNotice({ type: "error", text: errorText(err) }));
    api<{ warnings: Warning[] }>("/api/admin/rate-card/health")
      .then((d) => setWarnings(d.warnings))
      .catch(() => setWarnings([]));
  }, [version]);

  const changed = (message: string) => {
    setNotice({ type: "success", text: message });
    setVersion((v) => v + 1);
    onChanged();
  };

  const active = cards.find((c) => c.is_active);

  return (
    <div className="space-y-6">
      <Banner notice={notice} />
      <CurrentCard card={active} warnings={warnings} />
      <UploadCard onUploaded={changed} />
      <VersionsCard cards={cards} onActivated={changed} onError={(text) => setNotice({ type: "error", text })} />
      <ViewerCard version={version} />
    </div>
  );
}

// ---------------------------------------------------------------------------
function CurrentCard({ card, warnings }: { card?: RateCardRow; warnings: Warning[] }) {
  const [showAll, setShowAll] = useState(false);
  if (!card) {
    return (
      <Card eyebrow="Rate card" title="No rate card in use">
        <EmptyState title="Upload a rate card below to start quoting" />
      </Card>
    );
  }
  const shown = showAll ? warnings : warnings.slice(0, 4);

  return (
    <Card eyebrow="Rate card" title="Rate card in use" description={card.note || undefined}>
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          ["File", card.filename],
          ["Effective from", fmtDate(card.effective_date)],
          ["Uploaded by", `${card.uploaded_by} · ${fmtDate(card.uploaded_at)}`],
          ["Contents", `${card.countries} countries · ${num(card.rate_rows, 0)} prices`],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
            <dd className="mt-0.5 break-words font-bold text-slate-800">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-6">
        <h3 className="flex items-center gap-2 text-sm font-extrabold text-brand-navy">
          Data check
          {warnings.length === 0 ? <Badge tone="green">No issues</Badge> : <Badge tone="amber">{warnings.length} to review</Badge>}
        </h3>
        {warnings.length > 0 && (
          <>
            <ul className="mt-3 space-y-2">
              {shown.map((w, i) => (
                <li
                  key={i}
                  className={`flex gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm ${
                    w.level === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-900"
                  }`}
                >
                  <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
                  {w.message}
                </li>
              ))}
            </ul>
            {warnings.length > 4 && (
              <button type="button" className="mt-2 text-sm font-bold text-brand-blue hover:text-brand-red" onClick={() => setShowAll((v) => !v)}>
                {showAll ? "Show fewer" : `Show all ${warnings.length}`}
              </button>
            )}
            <p className="mt-2 text-xs text-slate-400">These are worth fixing in the Excel file, but they do not stop quoting.</p>
          </>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
function UploadCard({ onUploaded }: { onUploaded: (message: string) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [effective, setEffective] = useState(isoDay());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const reset = () => {
    setFile(null);
    setPreview(null);
    setNote("");
    setEffective(isoDay());
  };

  const pick = async (next?: File) => {
    if (!next) return;
    if (!/\.(xlsx|xls)$/i.test(next.name)) {
      setNotice({ type: "error", text: "Please choose an Excel file (.xlsx or .xls)." });
      return;
    }
    setNotice(null);
    setFile(next);
    setPreview(null);
    setBusy(true);
    try {
      const body = new FormData();
      body.append("file", next);
      setPreview(await api<Preview>("/api/admin/rate-cards/preview", { method: "POST", body }));
    } catch (err) {
      setNotice({ type: "error", text: errorText(err) });
      setFile(null);
    } finally {
      setBusy(false);
    }
  };

  const upload = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("note", note);
      body.append("effective_date", effective);
      const data = await api<{ message: string }>("/api/admin/rate-cards", { method: "POST", body });
      reset();
      onUploaded(data.message);
    } catch (err) {
      setNotice({ type: "error", text: errorText(err) });
    } finally {
      setBusy(false);
    }
  };

  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragging(false);
    pick(e.dataTransfer.files[0]);
  };

  const c = preview?.changes;

  return (
    <Card
      eyebrow="Update"
      title="Upload a new rate card"
      description={
        <>
          Excel file with the sheets <strong>COUNTRY MAPPING</strong> and <strong>MASTER RATE</strong>. You will see what changes before anything is replaced.
        </>
      }
    >
      <Banner notice={notice} />

      {!preview ? (
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`flex min-h-48 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-5 text-center transition ${
            dragging ? "border-brand-blue bg-blue-50" : "border-blue-200 bg-brand-ice/50 hover:border-brand-blue hover:bg-blue-50/60"
          }`}
        >
          <input type="file" accept=".xlsx,.xls" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
          <span className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-brand-blue text-white shadow-sm">
            {busy ? <Spinner /> : <UploadIcon className="h-7 w-7" />}
          </span>
          <span className="font-bold text-slate-800">{busy ? `Checking ${file?.name}…` : "Drop the rate card here"}</span>
          <span className="mt-2 text-sm text-slate-500">or click to browse · Excel .xlsx or .xls, up to 4 MB</span>
        </label>
      ) : (
        <div className="space-y-5">
          <div className="flex items-center gap-3 rounded-xl border border-blue-100 bg-brand-ice/60 px-4 py-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-100 text-emerald-700">
              <CheckIcon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="truncate font-bold text-slate-800">{preview.filename}</p>
              <p className="text-sm text-slate-500">
                {preview.countries} countries · {preview.services.length} services · {num(preview.rate_rows, 0)} prices
              </p>
            </div>
          </div>

          {c && (
            <div>
              <h3 className="text-sm font-extrabold text-brand-navy">Compared with the rate card in use</h3>
              <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ["Prices changed", num(c.prices_changed, 0)],
                  ["Went up / down", `${num(c.prices_up, 0)} / ${num(c.prices_down, 0)}`],
                  ["Average change", `${c.average_change_pct > 0 ? "+" : ""}${num(c.average_change_pct)}%`],
                  ["Price rows added / removed", `${num(c.rows_added, 0)} / ${num(c.rows_removed, 0)}`],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-blue-50 px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
                    <p className="mt-0.5 text-lg font-extrabold tabular-nums text-brand-navy">{value}</p>
                  </div>
                ))}
              </div>
              {(c.countries_added.length > 0 || c.countries_removed.length > 0) && (
                <p className="mt-3 text-sm text-slate-600">
                  {c.countries_added.length > 0 && (
                    <>
                      <strong>New destinations:</strong> {c.countries_added.join(", ")}.{" "}
                    </>
                  )}
                  {c.countries_removed.length > 0 && (
                    <span className="text-red-700">
                      <strong>Removed destinations:</strong> {c.countries_removed.join(", ")}.
                    </span>
                  )}
                </p>
              )}
            </div>
          )}

          {preview.warnings.length > 0 && (
            <p className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <AlertIcon className="h-4 w-4 shrink-0" />
              The data check found {preview.warnings.length} thing{preview.warnings.length === 1 ? "" : "s"} to review. You can still upload; they will be listed on this page.
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
            <Field label="Effective from" hint="Used for the 'rates may be out of date' warning">
              <input type="date" required value={effective} onChange={(e) => setEffective(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Note (optional)">
              <input value={note} maxLength={255} onChange={(e) => setNote(e.target.value)} placeholder="e.g. 2027 tariff from carriers" className={inputCls} />
            </Field>
          </div>

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button type="button" className={`${secondaryBtn} h-12`} onClick={reset} disabled={busy}>
              Cancel
            </button>
            <button type="button" className={redBtn} onClick={upload} disabled={busy}>
              {busy ? <Spinner /> : <UploadIcon className="h-4 w-4" />}
              Upload and use this rate card
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
function VersionsCard({
  cards,
  onActivated,
  onError,
}: {
  cards: RateCardRow[];
  onActivated: (message: string) => void;
  onError: (text: string) => void;
}) {
  const [busyId, setBusyId] = useState<number | null>(null);

  const activate = async (card: RateCardRow) => {
    if (!window.confirm(`Switch back to "${card.filename}" (uploaded ${fmtDate(card.uploaded_at)})? New quotes will use these prices.`)) return;
    setBusyId(card.id);
    try {
      const data = await api<{ message: string }>(`/api/admin/rate-cards/${card.id}/activate`, { method: "POST" });
      onActivated(data.message);
    } catch (err) {
      onError(errorText(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card eyebrow="Versions" title="Rate card history" description="Every upload is kept. Switch back to an earlier version if an upload was wrong.">
      <div className="overflow-x-auto rounded-xl border border-blue-50">
        <table className="w-full min-w-[720px] border-collapse text-left text-sm">
          <thead className="bg-brand-ice text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">File</th>
              <th className="px-4 py-3 font-semibold">Effective</th>
              <th className="px-4 py-3 font-semibold">Uploaded</th>
              <th className="px-4 py-3 text-right font-semibold">Prices</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {cards.map((c) => (
              <tr key={c.id} className="border-t border-blue-50">
                <td className="px-4 py-3">
                  <span className="block font-semibold text-slate-800">{c.filename}</span>
                  {c.note && <span className="block text-xs text-slate-400">{c.note}</span>}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">{fmtDate(c.effective_date)}</td>
                <td className="px-4 py-3 text-slate-600">
                  <span className="block whitespace-nowrap">{fmtDateTime(c.uploaded_at)}</span>
                  <span className="block text-xs text-slate-400">{c.uploaded_by}</span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-600">{num(c.rate_rows, 0)}</td>
                <td className="px-4 py-3">{c.is_active ? <Badge tone="green">In use</Badge> : <Badge>Previous</Badge>}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <div className="inline-flex gap-2">
                    <button
                      type="button"
                      className={smallBtn}
                      onClick={() => download(`/api/admin/rate-cards/${c.id}/download`, c.filename).catch((e) => onError(errorText(e)))}
                    >
                      <DownloadIcon className="h-3.5 w-3.5" />
                      Download
                    </button>
                    {!c.is_active && (
                      <button type="button" className={smallBtn} disabled={busyId !== null} onClick={() => activate(c)}>
                        {busyId === c.id ? <Spinner className="border-brand-blue/30 border-t-brand-blue" /> : null}
                        Use this version
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
function ViewerCard({ version }: { version: number }) {
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [country, setCountry] = useState("");
  const [services, setServices] = useState<ServiceTable[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ destinations: Destination[] }>("/api/destinations")
      .then((d) => setDestinations(d.destinations))
      .catch((err) => setError(errorText(err)));
  }, [version]);

  const load = useCallback(async (name: string) => {
    setCountry(name);
    setServices(null);
    if (!name) return;
    try {
      const data = await api<{ services: ServiceTable[] }>(`/api/admin/rate-card/country?name=${encodeURIComponent(name)}`);
      setServices(data.services);
      setError("");
    } catch (err) {
      setError(errorText(err));
    }
  }, []);

  useEffect(() => {
    if (country) load(country);
    // reload the tables when a different rate card is put in use
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  return (
    <Card eyebrow="Browse" title="Rate card viewer" description="Pick a country to see every service that delivers there and its full price table.">
      <Banner notice={error ? { type: "error", text: error } : null} />
      <div className="max-w-md">
        <DestinationSearch options={destinations} value={country} onChange={load} required={false} />
      </div>

      {services && (
        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          {services.map((s) => {
            const flat = s.rows.filter((r) => r.type === "per_shipment");
            const perKg = s.rows.filter((r) => r.type === "per_kg");
            return (
              <div key={s.service_key} className="overflow-hidden rounded-xl border border-blue-100">
                <div className="flex items-center gap-3 border-b border-blue-50 bg-brand-ice/60 px-4 py-3">
                  <CourierMark name={s.service} size="h-9 w-9" />
                  <div className="min-w-0">
                    <p className="truncate font-bold text-slate-800">{s.service}</p>
                    <p className="text-xs text-slate-500">
                      {carrierName(s.carrier)} · Zone {s.zone}
                      {s.scope !== "GENERIC" && ` · ${s.scope} price list`}
                    </p>
                  </div>
                </div>
                {s.rows.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-red-700">No prices found for this zone.</p>
                ) : (
                  <div className="max-h-80 overflow-y-auto">
                    <table className="w-full border-collapse text-left text-sm">
                      <thead className="sticky top-0 bg-white text-[11px] uppercase tracking-wide text-slate-400">
                        <tr>
                          <th className="px-4 py-2 font-semibold">Weight</th>
                          <th className="px-4 py-2 text-right font-semibold">Price</th>
                        </tr>
                      </thead>
                      <tbody>
                        {flat.map((r) => (
                          <tr key={`s${r.to}`} className="border-t border-slate-50">
                            <td className="px-4 py-1.5 tabular-nums text-slate-600">up to {num(r.to)} kg</td>
                            <td className="px-4 py-1.5 text-right tabular-nums font-semibold text-slate-800">{rm(r.rate)}</td>
                          </tr>
                        ))}
                        {perKg.map((r) => (
                          <tr key={`k${r.from}`} className="border-t border-slate-50 bg-brand-ice/40">
                            <td className="px-4 py-1.5 tabular-nums text-slate-600">
                              {num(r.from)}–{r.to >= 99999 ? "∞" : num(r.to)} kg
                            </td>
                            <td className="px-4 py-1.5 text-right tabular-nums font-semibold text-slate-800">{rm(r.rate)} / kg</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
