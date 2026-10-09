import type { ChangeEvent } from "react";
import type { FieldErrors, FieldValues, Path, PathValue, UseFormReturn } from "react-hook-form";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type DocumentShape = {
  isForeigner?: boolean | null;
  cpf?: string | null;
  foreignDocument?: string | null;
};

/**
 * CPF, or "Sou estrangeiro" swapping it for the passport (ADR-014). Shared by
 * signup and the inscription dialog; the caller's schema validates it with
 * `refineAccountDocument`.
 */
export function DocumentFields<T extends FieldValues & DocumentShape>({
  form,
}: {
  form: UseFormReturn<T>;
}) {
  const isForeigner = form.watch("isForeigner" as Path<T>) === true;
  const errors = form.formState.errors as FieldErrors<DocumentShape>;
  const setField = (name: keyof DocumentShape, value: unknown, shouldValidate = false) =>
    form.setValue(name as Path<T>, value as PathValue<T, Path<T>>, { shouldValidate });

  const handleCpfChange = (e: ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, "");
    value = value.replace(/(\d{3})(\d)/, "$1.$2");
    value = value.replace(/(\d{3})(\d)/, "$1.$2");
    value = value.replace(/(\d{3})(\d{1,2})$/, "$1-$2");
    setField("cpf", value);
  };

  return (
    <>
      <div className="flex min-h-11 items-center space-x-2">
        <Checkbox
          id="isForeigner"
          checked={isForeigner}
          onCheckedChange={(checked) => {
            const next = checked === true;
            setField("isForeigner", next, true);
            if (next) {
              setField("cpf", "");
            } else {
              setField("foreignDocument", "");
            }
          }}
          data-testid="checkbox-foreigner"
        />
        <Label htmlFor="isForeigner" className="text-sm text-gray-700">
          Sou estrangeiro / I'm a foreign visitor
        </Label>
      </div>

      {isForeigner ? (
        <div>
          <Label htmlFor="foreignDocument" className="mb-2 block text-sm font-medium text-gray-700">
            Passaporte / Passport
          </Label>
          <Input
            id="foreignDocument"
            type="text"
            placeholder="AB1234567"
            {...form.register("foreignDocument" as Path<T>)}
            onChange={(e) => {
              const value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 32);
              setField("foreignDocument", value, true);
            }}
            maxLength={32}
            className="h-11 w-full"
            data-testid="input-foreign-document"
          />
          {errors.foreignDocument && (
            <p className="mt-1 text-sm text-red-600" data-testid="text-foreign-document-error">
              {errors.foreignDocument.message}
            </p>
          )}
        </div>
      ) : (
        <div>
          <Label htmlFor="cpf" className="mb-2 block text-sm font-medium text-gray-700">
            CPF
          </Label>
          <Input
            id="cpf"
            type="text"
            placeholder="000.000.000-00"
            {...form.register("cpf" as Path<T>)}
            onChange={handleCpfChange}
            maxLength={14}
            className="h-11 w-full"
            data-testid="input-cpf"
          />
          {errors.cpf && (
            <p className="mt-1 text-sm text-red-600" data-testid="text-cpf-error">
              {errors.cpf.message}
            </p>
          )}
        </div>
      )}
    </>
  );
}
