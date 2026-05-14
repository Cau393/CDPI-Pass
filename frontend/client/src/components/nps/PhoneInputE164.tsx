import type { ComponentProps } from "react";
import PhoneInput from "react-phone-number-input";
import { cn } from "@/lib/utils";

export interface PhoneInputE164Props {
  id?: string;
  /** E.164 digits only, no leading "+" (e.g. 5511999999999) */
  value: string;
  onChange: (digits: string) => void;
  disabled?: boolean;
  className?: string;
  "aria-invalid"?: boolean;
  placeholder?: string;
  "data-testid"?: string;
}

/** BR-first international phone input; stores digits-only E.164 for API/schemas. */
export function PhoneInputE164({
  id,
  value,
  onChange,
  disabled,
  className,
  "aria-invalid": ariaInvalid,
  placeholder,
  "data-testid": dataTestId,
}: PhoneInputE164Props) {
  const international = value ? `+${value}` : undefined;

  return (
    <PhoneInput
      id={id}
      international
      defaultCountry="BR"
      placeholder={placeholder}
      value={international as ComponentProps<typeof PhoneInput>["value"]}
      onChange={(next) => {
        onChange(next ? next.replace(/^\+/, "") : "");
      }}
      disabled={disabled}
      aria-invalid={ariaInvalid}
      data-testid={dataTestId}
      className={cn(
        "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background",
        "focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
        "[&_.PhoneInputInput]:flex-1 [&_.PhoneInputInput]:border-0 [&_.PhoneInputInput]:bg-transparent [&_.PhoneInputInput]:outline-none [&_.PhoneInputInput]:ring-0",
        "[&_.PhoneInputCountry]:mr-2 [&_.PhoneInputCountryIcon]:rounded-sm",
        disabled && "cursor-not-allowed opacity-50",
        ariaInvalid && "border-destructive",
        className,
      )}
    />
  );
}
