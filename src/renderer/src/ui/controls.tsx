import type { ReactNode } from "react";
import { cx } from "./base";
import { Icon } from "./Icon";

export function Segmented<T extends string>(props: { label: string; value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={props.label} className="inline-flex gap-0.5 rounded-[9px] border border-line bg-panel p-[3px]">
      {props.options.map((o) => {
        const on = o.value === props.value;
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={on}
            onClick={() => props.onChange(o.value)}
            className={cx("rounded-[6px] px-2.5 py-[3px] text-sm font-medium", on ? "bg-raised text-fg shadow-[0_1px_2px_rgba(0,0,0,.3)]" : "text-sub hover:text-fg")}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Switch({ label, on, onChange }: { label: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={cx(
        "relative h-[15px] w-[26px] shrink-0 rounded-full after:absolute after:top-0.5 after:size-[11px] after:rounded-full after:transition-[left]",
        on ? "bg-accent after:left-[13px] after:bg-bg" : "bg-line2 after:left-0.5 after:bg-[#8a95a4]",
      )}
    />
  );
}

export function Checkbox({ label, on, onChange }: { label: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      role="checkbox"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={cx("inline-flex size-4 shrink-0 items-center justify-center rounded-xs border-[1.5px]", on ? "border-accent bg-accent text-ink" : "border-line2")}
    >
      {on && <Icon name="check" size={11} />}
    </button>
  );
}
