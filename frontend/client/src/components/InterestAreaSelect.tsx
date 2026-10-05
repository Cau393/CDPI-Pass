import { Label } from "@/components/ui/label";

export const BUYER_INTEREST_AREA_LABEL =
  "Qual área motivou sua inscrição e desperta maior interesse?";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function InterestAreaSelect({
  options,
  value,
  onChange,
  id = "interest-area",
  showLabel = true,
}: {
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
  id?: string;
  showLabel?: boolean;
}) {
  return (
    <div className="space-y-2">
      {showLabel ? (
        <Label htmlFor={id}>{BUYER_INTEREST_AREA_LABEL}</Label>
      ) : null}
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger
          id={id}
          aria-label={showLabel ? undefined : BUYER_INTEREST_AREA_LABEL}
          data-testid="select-interest-area"
        >
          <SelectValue placeholder="Selecione" />
        </SelectTrigger>
        <SelectContent>
          {options.map((label) => (
            <SelectItem key={label} value={label}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
