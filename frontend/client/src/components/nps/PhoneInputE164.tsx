import type {
  ClipboardEvent,
  ComponentProps,
  FocusEvent,
  KeyboardEvent,
} from "react";
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

/** Leading "+55" (or "+595") of the formatted value, e.g. "+55 11 98765-4321". */
function callingCodeEnd(value: string): number {
  return value.match(/^\+\d*/)?.[0].length ?? 0;
}

function holdsOnlyCallingCode(input: HTMLInputElement): boolean {
  const end = callingCodeEnd(input.value);
  return end > 1 && end === input.value.trimEnd().length;
}

// Keyboard focus selects the whole value; the first digit typed then replaced
// "+55" and became the calling code ("11…" turned into "+1 1…").
function handleFocus(event: FocusEvent<HTMLInputElement>) {
  const end = event.currentTarget.value.length;
  event.currentTarget.setSelectionRange(end, end);
}

function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  const input = event.currentTarget;
  if (event.key === "+" && holdsOnlyCallingCode(input)) {
    // A foreigner typing "+595…" replaces the default "+55" instead of appending to it.
    input.setSelectionRange(0, input.value.length);
    return;
  }
  const selectionEnd = input.selectionEnd ?? 0;
  if (/^\d$/.test(event.key) && input.selectionStart === 0 && selectionEnd > 0) {
    // A digit typed over a selection that includes the "+" keeps the calling code.
    const codeEnd = callingCodeEnd(input.value);
    input.setSelectionRange(codeEnd, Math.max(selectionEnd, codeEnd));
  }
}

function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
  const pasted = event.clipboardData.getData("text").trim();
  if (pasted.startsWith("+") && holdsOnlyCallingCode(event.currentTarget)) {
    event.currentTarget.setSelectionRange(0, event.currentTarget.value.length);
  }
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
      onFocus={handleFocus}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
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
