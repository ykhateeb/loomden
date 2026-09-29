// Text inputs of the design system.
import { type InputHTMLAttributes, type ReactNode, useId } from "react";
import { cx } from "./base";

/** The search box: an icon on the left, an optional key hint on the right. */
export function SearchInput({ icon, hint, className, ...props }: InputHTMLAttributes<HTMLInputElement> & { icon?: ReactNode; hint?: ReactNode }) {
  return (
    <label className={cx("flex h-[34px] items-center gap-2 rounded-md border border-line bg-panel px-2.5 text-base text-muted focus-within:border-accent-line", className)}>
      {icon}
      <input {...props} className="min-w-0 flex-1 bg-transparent text-fg outline-none" />
      {hint}
    </label>
  );
}

/** A labelled text field, as in the rename and provider dialogs. */
export function TextField({ label, hint, className, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; hint?: ReactNode }) {
  const id = useId();
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-xs font-medium text-muted">{label}</label>
      <div className="flex h-9 items-center gap-2 rounded-md border border-line2 bg-field px-3 text-body text-fg focus-within:border-accent focus-within:shadow-focus">
        <input id={id} {...props} className="min-w-0 flex-1 bg-transparent outline-none" />
      </div>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  );
}
