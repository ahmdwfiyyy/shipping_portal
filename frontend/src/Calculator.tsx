import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { Destination, Quote, RatesInfo, Result, Summary } from "./api";
import { api, errorText, num, postJson, rm } from "./api";
import DestinationSearch from "./DestinationSearch";
import QuoteSheet from "./QuoteSheet";
import {
  ArrowIcon,
  Badge,
  Banner,
  Card,
  CheckIcon,
  CourierMark,
  Field,
  FieldLabel,
  HistoryIcon,
  Modal,
  PlusIcon,
  PrinterIcon,
  Spinner,
  TrashIcon,
  inputCls,
  panel,
  redBtn,
  secondaryBtn,
} from "./Ui";
import type { Notice } from "./Ui";

// ---------------------------------------------------------------------------
// Rate calculator: any signed-in user. Compare every service for a shipment of one or more boxes,
// pick one and submit the comparison to the history (admins review it on the dashboard).
// ---------------------------------------------------------------------------
type PieceForm = { id: number; length: string; width: string; height: string; weight: string; quantity: string };
type PieceKey = Exclude<keyof PieceForm, "id">;

const pieceFields: [PieceKey, string, string, string][] = [
  // key, label, unit, step
  ["length", "Length", "m", "0.01"],
  ["width", "Width", "m", "0.01"],
  ["height", "Height", "m", "0.01"],
  ["weight", "Weight per box", "kg", "0.1"],
];

const FUEL_CARRIERS: [string, string][] = [
  ["DHL", "DHL"],
  ["FDX", "FedEx"],
  ["UPS", "UPS"],
];

let nextId = 1;
const emptyPiece = (): PieceForm => ({ id: nextId++, length: "", width: "", height: "", weight: "", quantity: "1" });

/** Same rule as the server: each box is charged on its higher weight, then the boxes are added up. */
function liveSummary(pieces: PieceForm[]) {
  let count = 0;
  let cbm = 0;
  let chargeable = 0;
  for (const p of pieces) {
    const qty = Number(p.quantity) || 0;
    const boxCbm = Number(p.length) * Number(p.width) * Number(p.height);
    count += qty;
    cbm += boxCbm * qty;
    chargeable += Math.max(Number(p.weight) || 0, boxCbm * 200) * qty;
  }
  return { count, cbm, chargeable };
}

export default function Calculator() {
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [destination, setDestination] = useState("");
  const [pieces, setPieces] = useState<PieceForm[]>(() => [emptyPiece()]);
  const [results, setResults] = useState<Result[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [customerRef, setCustomerRef] = useState("");
  const [remarks, setRemarks] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitNotice, setSubmitNotice] = useState<Notice>(null);
  const [savedQuote, setSavedQuote] = useState<Quote | null>(null);
  const [showQuote, setShowQuote] = useState(false);
  const [formKey, setFormKey] = useState(0);

  // Fuel surcharge % per carrier: pre-filled with the admin's default, adjustable per comparison
  const [defaultFuel, setDefaultFuel] = useState<Record<string, number>>({});
  const [fuel, setFuel] = useState<Record<string, string>>({ DHL: "0", FDX: "0", UPS: "0" });

  useEffect(() => {
    api<{ destinations: Destination[] }>("/api/destinations")
      .then((d) => setDestinations(d.destinations))
      .catch((err) => setError(errorText(err)));
    api<RatesInfo>("/api/rates-info")
      .then((info) => {
        setDefaultFuel(info.fuel);
        setFuel(Object.fromEntries(FUEL_CARRIERS.map(([c]) => [c, String(info.fuel[c] ?? 0)])));
      })
      .catch(() => undefined);
  }, []);

  const fuelChanged = FUEL_CARRIERS.some(([c]) => Number(fuel[c]) !== (defaultFuel[c] ?? 0));

  // Any change to the shipment makes the shown prices out of date
  const resetResults = () => {
    setResults(null);
    setSummary(null);
    setSubmitNotice(null);
    setSavedQuote(null);
  };

  const updatePiece = (id: number, key: PieceKey, value: string) => {
    setPieces((list) => list.map((p) => (p.id === id ? { ...p, [key]: value } : p)));
    resetResults();
  };

  const live = liveSummary(pieces);

  const shipment = () => ({
    destination,
    pieces: pieces.map((p) => ({
      length: Number(p.length),
      width: Number(p.width),
      height: Number(p.height),
      weight: Number(p.weight),
      quantity: Number(p.quantity) || 1,
    })),
    fuel: Object.fromEntries(FUEL_CARRIERS.map(([c]) => [c, Number(fuel[c]) || 0])),
  });

  const compare = async (event: FormEvent) => {
    event.preventDefault();
    if (!destination) {
      setError("Please choose a destination from the list.");
      return;
    }
    setError("");
    setLoading(true);
    resetResults();
    try {
      const data = await postJson<{ results: Result[]; summary: Summary }>("/api/calculate", shipment());
      setResults(data.results);
      setSummary(data.summary);
      setSelected(data.results[0].service_key);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitNotice(null);
    setSubmitting(true);
    try {
      const quote = await postJson<Quote>("/api/quotes", {
        ...shipment(),
        service_key: selected,
        customer_ref: customerRef,
        remarks,
      });
      setSavedQuote(quote);
      setSubmitNotice({ type: "success", text: `Saved to history as ${quote.reference_no}.` });
      setCustomerRef("");
      setRemarks("");
    } catch (err) {
      setSubmitNotice({ type: "error", text: errorText(err) });
    } finally {
      setSubmitting(false);
    }
  };

  const startNew = () => {
    setDestination("");
    setPieces([emptyPiece()]);
    setFormKey((k) => k + 1);
    resetResults();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const chosen = results?.find((r) => r.service_key === selected);

  return (
    <div className="space-y-6">
      {/* ---------- Shipment form ---------- */}
      <Card
        eyebrow="Shipment details"
        title="Compare shipping rates"
        description="Enter the destination and each box to find the best available courier rate."
        bodyClassName=""
      >
        <form onSubmit={compare} className="p-5 sm:p-7">
          <Banner notice={error ? { type: "error", text: error } : null} />

          <FieldLabel>Destination</FieldLabel>
          <DestinationSearch
            key={formKey} // remounted (cleared) only by "Start a new comparison"
            options={destinations}
            value={destination}
            onChange={(name) => {
              setDestination(name);
              resetResults();
            }}
          />

          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-700">Boxes</span>
              <span className="text-xs text-slate-400">Sizes in metres · weight per box in kg</span>
            </div>

            {/* Column headings on wider screens */}
            <div className="hidden grid-cols-[repeat(4,minmax(0,1fr))_88px_44px] gap-3 px-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400 sm:grid">
              {pieceFields.map(([key, label, unit]) => (
                <span key={key}>
                  {label} ({unit})
                </span>
              ))}
              <span>Qty</span>
              <span />
            </div>

            <div className="space-y-3">
              {pieces.map((p, index) => (
                <div
                  key={p.id}
                  className="grid grid-cols-2 gap-3 rounded-xl border border-blue-50 bg-brand-ice/30 p-3 sm:grid-cols-[repeat(4,minmax(0,1fr))_88px_44px] sm:border-0 sm:bg-transparent sm:p-0"
                >
                  <p className="col-span-2 text-xs font-bold text-slate-500 sm:hidden">Box {index + 1}</p>
                  {pieceFields.map(([key, label, unit, step]) => (
                    <label key={key} className="block">
                      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400 sm:hidden">
                        {label}
                      </span>
                      <div className="relative">
                        <input
                          type="number"
                          min={step}
                          step={step}
                          required
                          aria-label={`Box ${index + 1} ${label.toLowerCase()} in ${unit}`}
                          value={p[key]}
                          onChange={(e) => updatePiece(p.id, key, e.target.value)}
                          className={`${inputCls} pr-10`}
                        />
                        <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">{unit}</span>
                      </div>
                    </label>
                  ))}
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400 sm:hidden">Qty</span>
                    <input
                      type="number"
                      min="1"
                      max="999"
                      step="1"
                      required
                      aria-label={`Box ${index + 1} quantity`}
                      value={p.quantity}
                      onChange={(e) => updatePiece(p.id, "quantity", e.target.value)}
                      className={inputCls}
                    />
                  </label>
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={() => {
                        setPieces((list) => list.filter((x) => x.id !== p.id));
                        resetResults();
                      }}
                      disabled={pieces.length === 1}
                      aria-label={`Remove box ${index + 1}`}
                      className="grid h-12 w-full place-items-center rounded-xl text-slate-400 transition hover:bg-red-50 hover:text-brand-red disabled:invisible"
                    >
                      <TrashIcon className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {pieces.length < 50 && (
              <button
                type="button"
                onClick={() => {
                  setPieces((list) => [...list, emptyPiece()]);
                  resetResults();
                }}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-bold text-brand-blue hover:bg-brand-ice"
              >
                <PlusIcon className="h-4 w-4" />
                Add another box
              </button>
            )}
          </div>

          {/* ---------- Fuel surcharge for this comparison ---------- */}
          <div className="mt-6 rounded-xl border border-blue-50 bg-brand-ice/40 p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <span className="text-sm font-semibold text-slate-700">Fuel surcharge</span>
                <p className="mt-0.5 text-xs text-slate-500">
                  Added on top of each carrier's price. Pre-filled with the current default - change it if this month's carrier rate is different.
                </p>
              </div>
              {fuelChanged && (
                <button
                  type="button"
                  onClick={() => {
                    setFuel(Object.fromEntries(FUEL_CARRIERS.map(([c]) => [c, String(defaultFuel[c] ?? 0)])));
                    resetResults();
                  }}
                  className="rounded-lg px-2 py-1 text-xs font-bold text-brand-blue hover:bg-white"
                >
                  Reset to default
                </button>
              )}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-3 sm:max-w-xl">
              {FUEL_CARRIERS.map(([code, name]) => (
                <label key={code} className="block">
                  <span className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    {name}
                    {Number(fuel[code]) !== (defaultFuel[code] ?? 0) && (
                      <span className="normal-case tracking-normal text-brand-red">(default {num(defaultFuel[code] ?? 0)}%)</span>
                    )}
                  </span>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      required
                      aria-label={`${name} fuel surcharge in percent`}
                      value={fuel[code]}
                      onChange={(e) => {
                        setFuel((f) => ({ ...f, [code]: e.target.value }));
                        resetResults();
                      }}
                      className={`${inputCls} bg-white pr-9`}
                    />
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">%</span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="mt-7 flex flex-col gap-4 border-t border-slate-100 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-500">
              <span>
                Boxes <strong className="text-slate-800">{live.count}</strong>
              </span>
              <span className="h-4 w-px bg-slate-200" />
              <span>
                CBM <strong className="text-slate-800">{live.cbm.toFixed(3)} m³</strong>
              </span>
              <span className="h-4 w-px bg-slate-200" />
              <span>
                Chargeable Weight <strong className="text-slate-800">{live.chargeable.toFixed(1)} kg</strong>
              </span>
            </div>

            <button type="submit" disabled={loading} className={redBtn}>
              {loading ? (
                <>
                  <Spinner />
                  Comparing...
                </>
              ) : (
                <>
                  Compare rates
                  <ArrowIcon />
                </>
              )}
            </button>
          </div>
        </form>
      </Card>

      {/* ---------- Results ---------- */}
      {results && summary && (
        <section className={`${panel} animate-[fadein_0.4s_ease-out]`}>
          <div className="flex flex-col gap-2 border-b border-blue-50 bg-gradient-to-r from-brand-navy to-brand-blue px-5 py-5 text-white sm:flex-row sm:items-center sm:justify-between sm:px-7">
            <div>
              <h2 className="text-lg font-extrabold tracking-[-0.01em]">Available rates</h2>
              <p className="mt-0.5 text-sm text-blue-100">
                {results.length} service{results.length === 1 ? "" : "s"} to {destination} · {summary.pieces} box
                {summary.pieces === 1 ? "" : "es"} · charged at {num(summary.chargeable_weight)} kg
              </p>
            </div>
            <p className="w-fit rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-blue-50 ring-1 ring-white/15">
              All prices in MYR
            </p>
          </div>

          <div className="space-y-3 p-4 sm:p-6" role="radiogroup" aria-label="Choose a service">
            {results.map((rate) => {
              const isSelected = selected === rate.service_key;
              return (
                <button
                  key={rate.service_key}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => {
                    setSelected(rate.service_key);
                    setSubmitNotice(null);
                    setSavedQuote(null);
                  }}
                  className={`grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 rounded-xl border p-4 text-left transition-all sm:grid-cols-[auto_1.45fr_0.6fr_0.85fr_auto] sm:gap-5 sm:px-5 ${
                    isSelected
                      ? "border-brand-blue bg-brand-ice shadow-[0_6px_18px_rgba(11,60,145,0.12)] ring-1 ring-brand-blue/10"
                      : "border-slate-200 hover:-translate-y-0.5 hover:border-blue-200 hover:bg-brand-ice/40 hover:shadow-md"
                  }`}
                >
                  <CourierMark name={rate.courier} />

                  <span>
                    <span className="flex flex-wrap items-center gap-2 font-bold text-slate-900">
                      {rate.courier}
                      {rate.is_cheapest && <Badge tone="red">Best rate</Badge>}
                      {rate.container === "Pal" && <Badge>Pallet freight</Badge>}
                    </span>
                    <span className="mt-1 block text-xs text-slate-500">
                      {rate.rate_type === "per_kg"
                        ? `RM ${rate.rate_per_kg?.toFixed(2)}/kg × ${rate.billed_weight} kg`
                        : `Shipment rate for ${rate.billed_weight} kg`}
                      {rate.fuel_pct > 0 && ` · incl. ${num(rate.fuel_pct)}% fuel (${rm(rate.fuel_surcharge)})`}
                    </span>
                  </span>

                  <span className="hidden text-sm text-slate-600 sm:block">
                    <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Zone</span>
                    {rate.zone_code}
                  </span>

                  <span className="hidden text-sm text-slate-600 sm:block">
                    <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Billed</span>
                    {num(rate.billed_weight)} kg
                  </span>

                  <span className="text-right">
                    <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Total</span>
                    <span className="text-lg font-extrabold tabular-nums text-brand-navy">{rm(rate.total_cost)}</span>
                  </span>
                </button>
              );
            })}
          </div>

          {/* ---------- Submit to history ---------- */}
          {chosen && (
            <form onSubmit={submit} className="border-t border-blue-50 bg-brand-ice/60 px-5 py-6 sm:px-7">
              <div className="mb-4 flex items-center gap-2 text-sm">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-brand-red text-white">
                  <CheckIcon className="h-3 w-3" />
                </span>
                <span className="text-slate-500">Selected:</span>
                <strong className="text-slate-800">{chosen.courier}</strong>
                <span className="text-slate-500">· {rm(chosen.total_cost)}</span>
              </div>

              <Banner notice={submitNotice} />

              {savedQuote ? (
                <div className="flex flex-col gap-3 sm:flex-row">
                  <button type="button" className={redBtn} onClick={() => setShowQuote(true)}>
                    <PrinterIcon className="h-4 w-4" />
                    View / print quotation
                  </button>
                  <button type="button" className={`${secondaryBtn} h-12`} onClick={startNew}>
                    Start a new comparison
                  </button>
                </div>
              ) : (
                <>
                  <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
                    <Field label="Customer reference (optional)" hint="e.g. PO number or shipment ID">
                      <input value={customerRef} maxLength={100} onChange={(e) => setCustomerRef(e.target.value)} className={inputCls} />
                    </Field>
                    <Field label="Remarks (optional)">
                      <textarea
                        value={remarks}
                        maxLength={1000}
                        rows={2}
                        onChange={(e) => setRemarks(e.target.value)}
                        className={`${inputCls} h-auto min-h-12 py-3`}
                      />
                    </Field>
                  </div>
                  <div className="mt-5 flex justify-end">
                    <button type="submit" disabled={submitting} className={redBtn}>
                      {submitting ? (
                        <>
                          <Spinner />
                          Submitting...
                        </>
                      ) : (
                        <>
                          <HistoryIcon className="h-4 w-4" />
                          Submit to history
                        </>
                      )}
                    </button>
                  </div>
                </>
              )}
            </form>
          )}
        </section>
      )}

      {showQuote && savedQuote && (
        <Modal
          title={`Quotation ${savedQuote.reference_no}`}
          wide
          onClose={() => setShowQuote(false)}
          actions={
            <button type="button" className={secondaryBtn} onClick={() => window.print()}>
              <PrinterIcon className="h-4 w-4" />
              Print / Save as PDF
            </button>
          }
        >
          <QuoteSheet quote={savedQuote} />
        </Modal>
      )}
    </div>
  );
}
