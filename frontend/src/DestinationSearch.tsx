import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { Destination } from "./api";
import { SearchIcon, inputCls } from "./Ui";

// ---------------------------------------------------------------------------
// Destination search box: type to filter, arrow keys + Enter to pick
// ---------------------------------------------------------------------------
export default function DestinationSearch({
  options,
  value,
  onChange,
  required = true,
}: {
  options: Destination[];
  value: string;
  onChange: (name: string) => void;
  required?: boolean;
}) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  // Countries starting with the search text come first, then any that contain it
  const q = query.trim().toLowerCase();
  const matches = q
    ? [
        ...options.filter((o) => o.name.toLowerCase().startsWith(q)),
        ...options.filter((o) => !o.name.toLowerCase().startsWith(q) && o.name.toLowerCase().includes(q)),
      ]
    : options;

  useEffect(() => {
    listRef.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const pick = (name: string) => {
    setQuery(name);
    onChange(name);
    setOpen(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (matches.length ? (i + step + matches.length) % matches.length : 0));
    } else if (e.key === "Enter" && open && matches[active]) {
      e.preventDefault(); // pick the highlighted country instead of submitting the form
      pick(matches[active].name);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
      <input
        type="text"
        required={required}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && matches[active] ? `${listId}-${active}` : undefined}
        autoComplete="off"
        placeholder={options.length ? `Search ${options.length} countries…` : "Search countries…"}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
          // Only a name picked from the list counts, unless the text matches one exactly
          const exact = options.find((o) => o.name.toLowerCase() === e.target.value.trim().toLowerCase());
          onChange(exact ? exact.name : "");
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        className={`${inputCls} pl-11`}
      />

      {open && (
        <ul
          id={listId}
          role="listbox"
          ref={listRef}
          className="absolute z-20 mt-2 max-h-72 w-full overflow-y-auto rounded-xl border border-blue-100 bg-white py-1.5 shadow-[0_12px_35px_rgba(7,27,85,0.15)]"
        >
          {matches.length === 0 ? (
            <li className="px-4 py-3 text-sm text-slate-500">No country matches "{query.trim()}"</li>
          ) : (
            matches.map((o, i) => (
              <li
                key={o.name}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={o.name === value}
                // mousedown fires before the input's blur, so the click is not lost
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(o.name);
                }}
                onMouseEnter={() => setActive(i)}
                className={`flex cursor-pointer items-center justify-between gap-3 px-4 py-2.5 text-sm ${
                  i === active ? "bg-brand-ice text-brand-navy" : "text-slate-700"
                }`}
              >
                <span className={o.name === value ? "font-bold" : "font-medium"}>{o.name}</span>
                <span className="shrink-0 text-xs text-slate-400">
                  {o.services} service{o.services === 1 ? "" : "s"}
                </span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
