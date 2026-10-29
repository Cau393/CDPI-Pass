import { forwardRef, useImperativeHandle, useState, type ReactNode } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  parseAddressNumber,
  parseCardCcv,
  parseCardExpiry,
  parseCardHolderName,
  parseCardNumber,
  parseHolderCpf,
  parseHolderName,
  parsePostalCode,
  type ParsedCardPayment,
} from "@shared/cardPayment";

/**
 * Inline card form (ADR-017). PCI: the values live only in this component's
 * state and in their own inputs. The order body is read on submit through the
 * ref and never stored elsewhere; there is no <form>, so nothing can be
 * serialized into a URL.
 */

export interface CardPaymentFormHandle {
  /** Validates every field and shows its error: the card part of the order body, or null. */
  read: () => ParsedCardPayment | null;
  clearCvv: () => void;
  clear: () => void;
}

interface CardPaymentFormProps {
  /** The buyer, used as the card holder unless "Outro titular" is ticked. */
  defaultHolder: { name?: string | null; cpf?: string | null };
  /** The total shown in the summary: the installment labels divide it. */
  total: number;
  disabled?: boolean;
}

type Field = "number" | "holderName" | "expiry" | "ccv" | "name" | "cpf" | "postalCode" | "addressNumber";

const ERRORS: Record<Field, string> = {
  number: "Número do cartão inválido.",
  holderName: "Informe o nome impresso no cartão.",
  expiry: "Validade inválida ou vencida.",
  ccv: "CVV inválido.",
  name: "Informe o nome completo do titular.",
  cpf: "CPF do titular inválido.",
  postalCode: "CEP inválido.",
  addressNumber: "Informe o número do endereço.",
};

const TEST_IDS: Record<Field, string> = {
  number: "card-number",
  holderName: "card-holder-name",
  expiry: "card-expiry",
  ccv: "card-ccv",
  name: "card-holder-full-name",
  cpf: "card-holder-cpf",
  postalCode: "card-postal-code",
  addressNumber: "card-address-number",
};

const EMPTY: Record<Field, string> = {
  number: "",
  holderName: "",
  expiry: "",
  ccv: "",
  name: "",
  cpf: "",
  postalCode: "",
  addressNumber: "",
};

const INSTALLMENTS = [1, 2, 3] as const;
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const digits = (value: string, max: number) => value.replace(/\D/g, "").slice(0, max);

/** What each input shows; the state keeps digits only (except names and the address number). */
function display(field: Field, value: string): string {
  switch (field) {
    case "number":
      return value.replace(/(\d{4})(?=\d)/g, "$1 ");
    case "expiry":
      return value.length > 2 ? `${value.slice(0, 2)}/${value.slice(2)}` : value;
    case "postalCode":
      return value.length > 5 ? `${value.slice(0, 5)}-${value.slice(5)}` : value;
    case "cpf":
      return value
        .replace(/(\d{3})(\d)/, "$1.$2")
        .replace(/(\d{3})(\d)/, "$1.$2")
        .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
    default:
      return value;
  }
}

function normalize(field: Field, raw: string): string {
  switch (field) {
    case "number":
      return digits(raw, 19);
    case "expiry":
      return digits(raw, 4);
    case "ccv":
      return digits(raw, 4);
    case "postalCode":
      return digits(raw, 8);
    case "cpf":
      return digits(raw, 11);
    case "addressNumber":
      return raw.slice(0, 10);
    default:
      return raw;
  }
}

export const CardPaymentForm = forwardRef<CardPaymentFormHandle, CardPaymentFormProps>(function CardPaymentForm(
  { defaultHolder, total, disabled = false },
  ref,
) {
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [installments, setInstallments] = useState("1");
  // Without a usable buyer name + CPF the holder fields are always shown.
  const defaultsUsable = parseHolderName(defaultHolder.name) !== null && parseHolderCpf(defaultHolder.cpf) !== null;
  const [otherHolder, setOtherHolder] = useState(false);
  const askHolder = otherHolder || !defaultsUsable;

  useImperativeHandle(ref, () => ({
    read() {
      const number = parseCardNumber(values.number);
      const holderName = parseCardHolderName(values.holderName);
      const expiry = parseCardExpiry(values.expiry.slice(0, 2), values.expiry.slice(2));
      const ccv = parseCardCcv(values.ccv);
      const name = parseHolderName(askHolder ? values.name : defaultHolder.name);
      const cpf = parseHolderCpf(askHolder ? values.cpf : defaultHolder.cpf);
      const postalCode = parsePostalCode(values.postalCode);
      const addressNumber = parseAddressNumber(values.addressNumber);
      const parsed = { number, holderName, expiry, ccv, name, cpf, postalCode, addressNumber };
      const next: Partial<Record<Field, string>> = {};
      for (const field of Object.keys(parsed) as Field[]) {
        if (parsed[field] === null) next[field] = ERRORS[field];
      }
      setErrors(next);
      if (!number || !holderName || !expiry || !ccv || !name || !cpf || !postalCode || !addressNumber) return null;
      return {
        card: { holderName, number, expiryMonth: expiry.month, expiryYear: expiry.year, ccv },
        cardHolder: { name, cpf, postalCode, addressNumber },
        installmentCount: Number(installments) as 1 | 2 | 3,
      };
    },
    clearCvv() {
      setValues((v) => ({ ...v, ccv: "" }));
    },
    clear() {
      setValues(EMPTY);
      setErrors({});
      setInstallments("1");
      setOtherHolder(false);
    },
  }));

  const input = (
    field: Field,
    label: string,
    extra: { autoComplete?: string; inputMode?: "numeric"; placeholder?: string } = {},
  ): ReactNode => {
    const id = TEST_IDS[field];
    const errorId = `${id}-error`;
    return (
      <div className="space-y-2">
        <Label htmlFor={id}>{label}</Label>
        <Input
          id={id}
          className="h-11"
          disabled={disabled}
          value={display(field, values[field])}
          onChange={(e) => {
            const next = normalize(field, e.target.value);
            setValues((v) => ({ ...v, [field]: next }));
            if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }));
          }}
          aria-invalid={Boolean(errors[field])}
          aria-describedby={errors[field] ? errorId : undefined}
          data-testid={`input-${TEST_IDS[field]}`}
          {...extra}
        />
        {errors[field] ? (
          <p id={errorId} className="text-sm font-medium text-destructive" data-testid={`text-${TEST_IDS[field]}-error`}>
            {errors[field]}
          </p>
        ) : null}
      </div>
    );
  };

  return (
    <div className="space-y-4 text-left" data-testid="card-payment-form">
      {input("number", "Número do cartão", { autoComplete: "cc-number", inputMode: "numeric", placeholder: "0000 0000 0000 0000" })}
      {input("holderName", "Nome impresso no cartão", { autoComplete: "cc-name" })}
      <div className="grid grid-cols-2 gap-3">
        {input("expiry", "Validade (MM/AA)", { autoComplete: "cc-exp", inputMode: "numeric", placeholder: "MM/AA" })}
        {input("ccv", "CVV", { autoComplete: "cc-csc", inputMode: "numeric", placeholder: "000" })}
      </div>

      <div className="space-y-2">
        <p id="card-installments-label" className="text-sm font-medium">
          Parcelas
        </p>
        <RadioGroup
          aria-labelledby="card-installments-label"
          value={installments}
          onValueChange={setInstallments}
          disabled={disabled}
        >
          {INSTALLMENTS.map((count) => (
            <Label
              key={count}
              htmlFor={`card-installments-${count}`}
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3 py-2 font-normal"
            >
              <RadioGroupItem
                id={`card-installments-${count}`}
                value={String(count)}
                data-testid={`radio-installments-${count}`}
              />
              <span>{`${count}x de ${money.format(total / count)}`}</span>
            </Label>
          ))}
        </RadioGroup>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {input("postalCode", "CEP", { autoComplete: "postal-code", inputMode: "numeric", placeholder: "00000-000" })}
        {input("addressNumber", "Número")}
      </div>

      {defaultsUsable ? (
        <div className="flex min-h-11 items-center space-x-2">
          <Checkbox
            id="card-other-holder"
            checked={otherHolder}
            disabled={disabled}
            onCheckedChange={(checked) => setOtherHolder(checked === true)}
            data-testid="checkbox-card-other-holder"
          />
          <Label htmlFor="card-other-holder" className="text-sm text-gray-700">
            Outro titular
          </Label>
        </div>
      ) : null}
      {askHolder ? (
        <>
          {input("name", "Nome completo do titular", { autoComplete: "name" })}
          {input("cpf", "CPF do titular", { inputMode: "numeric", placeholder: "000.000.000-00" })}
        </>
      ) : null}
    </div>
  );
});
