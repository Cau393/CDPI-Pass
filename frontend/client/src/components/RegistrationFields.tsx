import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  REGISTRATION_TEXT_ANSWER_MAX,
  type RegistrationField,
} from "@shared/eventRegistrationForm";

/**
 * An event's custom questions (ADR-016), as answered by the attendee.
 * Archived questions are never shown. Required is announced with
 * aria-required only: native `required` would let the browser block the host
 * form before its own validation shows the inline errors.
 */
export function RegistrationFields({
  fields,
  values,
  errors = {},
  onChange,
  idPrefix = "registration-field",
}: {
  fields: readonly RegistrationField[];
  values: Readonly<Record<string, string>>;
  errors?: Readonly<Record<string, string | undefined>>;
  onChange: (fieldId: string, value: string) => void;
  idPrefix?: string;
}) {
  return (
    <div className="space-y-4">
      {fields
        .filter((field) => !field.archived)
        .map((field, index) => {
          const id = `${idPrefix}-${index}`;
          const labelId = `${id}-label`;
          const errorId = `${id}-error`;
          const error = errors[field.id];
          const value = values[field.id] ?? "";
          const describedBy = error ? errorId : undefined;
          const label = (
            <>
              {field.label}
              {field.required ? (
                <span aria-hidden="true" className="text-destructive">
                  {" "}
                  *
                </span>
              ) : null}
            </>
          );

          return (
            <div key={field.id} className="space-y-2">
              {field.type === "radio" ? (
                <>
                  <Label id={labelId}>{label}</Label>
                  <RadioGroup
                    aria-labelledby={labelId}
                    aria-describedby={describedBy}
                    aria-invalid={Boolean(error)}
                    aria-required={field.required}
                    value={value}
                    onValueChange={(next) => onChange(field.id, next)}
                  >
                    {field.options.map((option, optionIndex) => (
                      <Label
                        key={option}
                        htmlFor={`${id}-option-${optionIndex}`}
                        className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3 py-2 font-normal"
                      >
                        <RadioGroupItem id={`${id}-option-${optionIndex}`} value={option} />
                        <span>{option}</span>
                      </Label>
                    ))}
                  </RadioGroup>
                </>
              ) : (
                <Label htmlFor={id}>{label}</Label>
              )}
              {field.type === "text" ? (
                <Input
                  id={id}
                  value={value}
                  onChange={(e) => onChange(field.id, e.target.value)}
                  maxLength={REGISTRATION_TEXT_ANSWER_MAX}
                  aria-required={field.required}
                  aria-invalid={Boolean(error)}
                  aria-describedby={describedBy}
                  className="h-11"
                />
              ) : null}
              {field.type === "select" ? (
                <Select value={value} onValueChange={(next) => onChange(field.id, next)}>
                  <SelectTrigger
                    id={id}
                    aria-required={field.required}
                    aria-invalid={Boolean(error)}
                    aria-describedby={describedBy}
                    className="h-11"
                  >
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {field.options.map((option) => (
                      <SelectItem key={option} value={option} className="min-h-11">
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
              {error ? (
                <p id={errorId} className="text-sm font-medium text-destructive">
                  {error}
                </p>
              ) : null}
            </div>
          );
        })}
    </div>
  );
}
