"use client";

import { Check, ChevronDown, type LucideIcon } from "lucide-react";
import {
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
} from "react";

type AssessmentSelectValue = string | number;

export type AssessmentFieldSelectOption<T extends AssessmentSelectValue> = {
  value: T;
  label: string;
  description?: string;
  badge?: string;
  disabled?: boolean;
};

type AssessmentFieldSelectProps<T extends AssessmentSelectValue> = {
  id?: string;
  label: string;
  value: T;
  options: AssessmentFieldSelectOption<T>[];
  icon: LucideIcon;
  onChange: (value: T) => void;
  error?: string;
};

export function AssessmentFieldSelect<T extends AssessmentSelectValue>({
  id,
  label,
  value,
  options,
  icon: Icon,
  onChange,
  error,
}: AssessmentFieldSelectProps<T>) {
  const generatedId = useId();
  const controlId = id ?? `assessment-select-${generatedId}`;
  const shellRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);

  const selectedOption =
    options.find((option) => option.value === value) ?? options[0] ?? null;

  const closeMenu = useEffectEvent(() => {
    setOpen(false);
  });

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!shellRef.current?.contains(event.target as Node)) {
        closeMenu();
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      closeMenu();
      triggerRef.current?.focus();
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={shellRef}
      data-open={open ? "true" : "false"}
      className="assessment-select-shell group"
    >
      <p
        id={`${controlId}-label`}
        className="field-label mb-2 transition-colors group-focus-within:text-emerald-700 dark:group-focus-within:text-emerald-200"
      >
        {label}
      </p>

      {/* Keep the trigger and panel inside one local stacking context so Assessment dropdowns render above neighboring cards without leaking globally. */}
      <button
        ref={triggerRef}
        id={controlId}
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={`${controlId}-listbox`}
        aria-labelledby={`${controlId}-label ${controlId}`}
        onClick={() => {
          setOpen((current) => !current);
        }}
        className={`assessment-select-trigger ${open ? "assessment-select-trigger--open" : ""}`}
      >
        <span className="assessment-select-trigger__icon">
          <Icon className="h-4 w-4" />
        </span>
        <span className="assessment-select-trigger__copy">
          <span className="assessment-select-trigger__label">
            {selectedOption?.label ?? ""}
          </span>
          {selectedOption?.description ? (
            <span className="assessment-select-trigger__description">
              {selectedOption.description}
            </span>
          ) : null}
        </span>
        <ChevronDown
          className={`assessment-select-trigger__chevron h-4 w-4 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open ? (
        <div className="assessment-select-panel">
          <div
            id={`${controlId}-listbox`}
            role="listbox"
            aria-labelledby={`${controlId}-label`}
            className="assessment-select-panel__list side-scrollbar"
          >
            {options.map((option) => {
              const selected = selectedOption?.value === option.value;

              return (
                <button
                  key={String(option.value)}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  disabled={option.disabled}
                  className={`assessment-select-option ${selected ? "assessment-select-option--selected" : ""}`}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                    triggerRef.current?.focus();
                  }}
                >
                  <span className="assessment-select-option__copy">
                    <span className="assessment-select-option__label">
                      {option.label}
                    </span>
                    {option.description ? (
                      <span className="assessment-select-option__description">
                        {option.description}
                      </span>
                    ) : null}
                  </span>
                  <span className="assessment-select-option__meta">
                    {option.badge ? (
                      <span className="assessment-select-option__badge">
                        {option.badge}
                      </span>
                    ) : null}
                    {selected ? (
                      <span className="assessment-select-option__check">
                        <Check className="h-3.5 w-3.5" />
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
    </div>
  );
}
