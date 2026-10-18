import type { Quote } from "./api";
import { carrierName, fmtDateTime, num, rm } from "./api";
import carsemLogo from "./assets/carsem-logo.png";

// ---------------------------------------------------------------------------
// Printable quotation. Shown in a Modal; "Print / Save as PDF" prints just this sheet
// (see the @media print rules in index.css).
// ---------------------------------------------------------------------------
export default function QuoteSheet({ quote }: { quote: Quote }) {
  const selected = quote.results.find((r) => r.courier === quote.selected_service);
  const fuelUsed = quote.results.some((r) => r.fuel_pct > 0);

  return (
    <article className="quote-sheet text-sm text-slate-800">
      {/* Letterhead */}
      <header className="flex items-start justify-between gap-4 border-b-2 border-brand-navy pb-4">
        <div className="flex items-center gap-3">
          <img src={carsemLogo} alt="Carsem" className="h-12 w-12 object-contain" />
          <div>
            <p className="text-lg font-extrabold tracking-[-0.02em] text-brand-navy">CARSEM SHIPPING PORTAL</p>
            <p className="text-xs text-slate-500">International courier rate quotation</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Quotation</p>
          <p className="text-base font-extrabold text-brand-navy">{quote.reference_no}</p>
          <p className="text-xs text-slate-500">{fmtDateTime(quote.created_at)}</p>
        </div>
      </header>

      {/* Details */}
      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        {[
          ["Destination", quote.destination],
          ["Prepared by", quote.staff_name],
          ["Customer reference", quote.customer_ref || "—"],
          ["Pieces", String(quote.total_pieces)],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
            <dd className="mt-0.5 font-bold text-slate-800">{value}</dd>
          </div>
        ))}
      </dl>

      {/* Pieces */}
      <h3 className="mt-6 text-xs font-extrabold uppercase tracking-wide text-brand-navy">Shipment</h3>
      <table className="mt-2 w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-400">
            <th className="py-2 pr-2 font-semibold">Box</th>
            <th className="py-2 pr-2 font-semibold">L × W × H (m)</th>
            <th className="py-2 pr-2 text-right font-semibold">Weight (kg)</th>
            <th className="py-2 pr-2 text-right font-semibold">Qty</th>
            <th className="py-2 text-right font-semibold">CBM (m³)</th>
          </tr>
        </thead>
        <tbody>
          {quote.pieces.map((p, i) => (
            <tr key={i} className="border-b border-slate-100">
              <td className="py-2 pr-2">{i + 1}</td>
              <td className="py-2 pr-2 tabular-nums">
                {num(p.length, 3)} × {num(p.width, 3)} × {num(p.height, 3)}
              </td>
              <td className="py-2 pr-2 text-right tabular-nums">{num(p.weight)}</td>
              <td className="py-2 pr-2 text-right tabular-nums">{p.quantity}</td>
              <td className="py-2 text-right tabular-nums">{num(p.length * p.width * p.height * p.quantity, 4)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-3 grid grid-cols-2 gap-3 rounded-xl bg-brand-ice px-4 py-3 sm:grid-cols-4">
        {[
          ["Total CBM", `${num(quote.cbm, 4)} m³`],
          ["Actual weight", `${num(quote.actual_weight)} kg`],
          ["Volumetric weight", `${num(quote.volumetric_weight)} kg`],
          ["Chargeable Weight", `${num(quote.chargeable_weight)} kg`],
        ].map(([label, value]) => (
          <div key={label}>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
            <p className="font-extrabold text-brand-navy tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      {/* Comparison */}
      <h3 className="mt-6 text-xs font-extrabold uppercase tracking-wide text-brand-navy">Rate comparison</h3>
      <table className="mt-2 w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-400">
            <th className="py-2 pr-2 font-semibold">Service</th>
            <th className="py-2 pr-2 font-semibold">Zone</th>
            <th className="py-2 pr-2 text-right font-semibold">Billed (kg)</th>
            {fuelUsed && <th className="py-2 pr-2 text-right font-semibold">Fuel</th>}
            <th className="py-2 text-right font-semibold">Total</th>
          </tr>
        </thead>
        <tbody>
          {quote.results.map((r) => {
            const isSelected = r.courier === quote.selected_service;
            return (
              <tr key={r.service_key} className={`border-b border-slate-100 ${isSelected ? "bg-brand-ice font-bold text-brand-navy" : ""}`}>
                <td className="py-2 pr-2">
                  {r.courier}
                  {isSelected && <span className="ml-2 rounded bg-brand-red px-1.5 py-0.5 text-[10px] font-extrabold uppercase text-white">Selected</span>}
                  {r.is_cheapest && !isSelected && <span className="ml-2 text-[10px] font-extrabold uppercase text-emerald-700">Lowest</span>}
                </td>
                <td className="py-2 pr-2">{r.zone_code}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{num(r.billed_weight)}</td>
                {fuelUsed && <td className="py-2 pr-2 text-right tabular-nums">{r.fuel_pct ? `${num(r.fuel_pct)}%` : "—"}</td>}
                <td className="py-2 text-right tabular-nums">{rm(r.total_cost)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Selected total */}
      {selected && (
        <div className="mt-4 flex items-center justify-between gap-4 rounded-xl bg-brand-navy px-5 py-4 text-white">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-100">Selected service</p>
            <p className="font-extrabold">
              {selected.courier} <span className="font-medium text-blue-100">({carrierName(selected.carrier)})</span>
            </p>
          </div>
          <p className="text-2xl font-extrabold tabular-nums">{rm(selected.total_cost)}</p>
        </div>
      )}

      {quote.remarks && (
        <div className="mt-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Remarks</p>
          <p className="mt-1 whitespace-pre-line">{quote.remarks}</p>
        </div>
      )}

      <footer className="mt-6 border-t border-slate-200 pt-3 text-[11px] leading-5 text-slate-400">
        Prices in Malaysian Ringgit (MYR) from the carrier rate card in use on the quotation date
        {fuelUsed ? ", including the fuel surcharge shown" : ""}. Duties, taxes, remote-area and other carrier
        surcharges are not included. Chargeable weight is the higher of actual and volumetric weight (CBM × 200) for each box.
      </footer>
    </article>
  );
}
