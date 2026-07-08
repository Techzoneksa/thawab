import { type ReactNode, forwardRef } from "react";
import { cn } from "@/lib/utils";

export interface FormFieldProps {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  className?: string;
  children: ReactNode;
  htmlFor?: string;
}

export function FormField({ label, required, error, hint, className, children, htmlFor }: FormFieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label
        htmlFor={htmlFor}
        className="flex items-center gap-1 text-xs font-semibold text-foreground"
      >
        <span>{label}</span>
        {required && <span className="text-destructive">*</span>}
        {hint && <span className="text-muted-foreground font-normal ms-1">({hint})</span>}
      </label>
      {children}
      {error && (
        <p className="text-xs text-destructive font-medium flex items-start gap-1">
          <span className="leading-none mt-0.5">⚠</span>
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}

const baseInputClass =
  "w-full rounded-lg border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring min-h-[40px] placeholder:text-muted-foreground/60 disabled:opacity-60 disabled:cursor-not-allowed";

export interface FormInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const FormInput = forwardRef<HTMLInputElement, FormInputProps>(function FormInput(
  { className, invalid, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        baseInputClass,
        invalid && "border-destructive focus:ring-destructive/30",
        className,
      )}
      {...rest}
    />
  );
});

export interface FormTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const FormTextarea = forwardRef<HTMLTextAreaElement, FormTextareaProps>(function FormTextarea(
  { className, invalid, rows = 3, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(
        baseInputClass,
        "min-h-[80px] py-2 resize-y",
        invalid && "border-destructive focus:ring-destructive/30",
        className,
      )}
      {...rest}
    />
  );
});

export interface FormSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
  children: ReactNode;
}

export const FormSelect = forwardRef<HTMLSelectElement, FormSelectProps>(function FormSelect(
  { className, invalid, children, ...rest },
  ref,
) {
  return (
    <select
      ref={ref}
      className={cn(
        baseInputClass,
        "appearance-none bg-no-repeat bg-[length:14px] bg-[left_0.65rem_center]",
        invalid && "border-destructive focus:ring-destructive/30",
        className,
      )}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E\")",
        paddingLeft: "2rem",
      }}
      {...rest}
    >
      {children}
    </select>
  );
});

export interface FormSegmentedProps<T extends string> {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}

export function FormSegmented<T extends string>({
  value,
  options,
  onChange,
  disabled,
  className,
  ariaLabel,
}: FormSegmentedProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex w-full rounded-lg border bg-muted/40 p-1 gap-1",
        disabled && "opacity-60 cursor-not-allowed",
        className,
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            className={cn(
              "flex-1 inline-flex items-center justify-center rounded-md px-2 py-2 text-xs sm:text-sm font-semibold transition-colors min-h-[36px]",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-background/50",
              disabled && "cursor-not-allowed",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export interface FormGridProps {
  children: ReactNode;
  cols?: 1 | 2 | 3 | 4;
  className?: string;
}

export function FormGrid({ children, cols = 2, className }: FormGridProps) {
  const colMap = {
    1: "grid-cols-1",
    2: "grid-cols-1 sm:grid-cols-2",
    3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
    4: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
  };
  return <div className={cn("grid gap-3 lg:gap-4", colMap[cols], className)}>{children}</div>;
}

export interface FormSectionProps {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

export function FormSection({ title, description, children, className }: FormSectionProps) {
  return (
    <section className={cn("rounded-xl border bg-card shadow-card p-4 sm:p-5 space-y-4", className)}>
      {(title || description) && (
        <header className="border-b pb-3 -mx-4 sm:-mx-5 px-4 sm:px-5">
          {title && <h3 className="text-sm sm:text-base font-bold">{title}</h3>}
          {description && (
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          )}
        </header>
      )}
      <div className="space-y-4">{children}</div>
    </section>
  );
}

export interface FormRowProps {
  children: ReactNode;
  className?: string;
}

export function FormRow({ children, className }: FormRowProps) {
  return <div className={cn("grid gap-3 lg:gap-4 grid-cols-1 sm:grid-cols-2", className)}>{children}</div>;
}

export function FormSummaryLine({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  tone?: "default" | "success" | "warning" | "destructive";
}) {
  const toneMap = {
    default: "text-foreground",
    success: "text-success",
    warning: "text-warning",
    destructive: "text-destructive",
  };
  return (
    <div className="flex items-center justify-between py-2 border-b last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={cn("text-sm font-bold tabular-nums", toneMap[tone])}>{value}</span>
    </div>
  );
}
