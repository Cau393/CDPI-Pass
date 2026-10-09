import { useFieldArray, type UseFormReturn } from "react-hook-form";
import { ArrowDown, ArrowUp, Lock, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { RegistrationFormRow } from "@/lib/eventForm";
import {
  REGISTRATION_FIELD_LABEL_MAX,
  REGISTRATION_FORM_MAX_ACTIVE_FIELDS,
  systemFieldsFor,
  type RegistrationFieldType,
  type SystemField,
} from "@shared/eventRegistrationForm";

export type RegistrationFormBuilderValues = {
  modality: "presencial" | "online";
  isFree: boolean;
  registrationForm: RegistrationFormRow[];
};

const TYPE_LABELS: Record<RegistrationFieldType, string> = {
  text: "Texto",
  select: "Lista suspensa",
  radio: "Múltipla escolha",
};

const SYSTEM_FIELD_LABELS: Record<SystemField, string> = {
  document: "Documento (CPF ou passaporte)",
  address: "Endereço",
};

const NEW_QUESTION: RegistrationFormRow = {
  fieldId: null,
  type: "text",
  label: "",
  optionsText: "",
  required: false,
};

/**
 * "Formulário de inscrição" (ADR-016). The locked rows are what the code asks
 * from the event's format and price; the admin edits only the questions below.
 */
export default function RegistrationFormBuilder({
  form,
}: {
  form: UseFormReturn<RegistrationFormBuilderValues>;
}) {
  const { fields, append, remove, swap } = useFieldArray({
    control: form.control,
    name: "registrationForm",
  });
  const modality = form.watch("modality");
  const isFree = form.watch("isFree");
  const lockedFields = systemFieldsFor({ modality, isFree });
  const isFull = fields.length >= REGISTRATION_FORM_MAX_ACTIVE_FIELDS;

  return (
    <section className="space-y-3 md:col-span-2" aria-labelledby="registration-form-title">
      <div className="space-y-1">
        <h3 id="registration-form-title" className="text-sm font-medium leading-none">
          Formulário de inscrição
        </h3>
        <p className="text-sm text-muted-foreground">
          Perguntas feitas ao participante antes de confirmar. Os itens com cadeado são pedidos
          automaticamente pelo formato e preço do evento, só a quem ainda não os informou.
        </p>
      </div>

      {lockedFields.length > 0 ? (
        <ul className="space-y-2">
          {lockedFields.map((systemField) => (
            <li
              key={systemField}
              className="flex min-h-11 items-center gap-3 rounded-md border bg-muted/50 px-3 py-2 text-sm text-muted-foreground"
              data-testid="registration-locked-row"
            >
              <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{SYSTEM_FIELD_LABELS[systemField]}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {fields.length > 0 ? (
        <ol className="space-y-3">
          {fields.map((row, index) => {
            const number = index + 1;
            const type = form.watch(`registrationForm.${index}.type`);
            const isSaved = row.fieldId !== null;
            return (
              <li key={row.id} className="space-y-3 rounded-md border p-3">
                <div className="flex items-start gap-2">
                  <FormField
                    control={form.control}
                    name={`registrationForm.${index}.label`}
                    render={({ field }) => (
                      <FormItem className="flex-1">
                        <FormLabel>Pergunta {number}</FormLabel>
                        <FormControl>
                          <Input
                            className="h-11"
                            maxLength={REGISTRATION_FIELD_LABEL_MAX}
                            autoComplete="off"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="flex shrink-0 gap-1 pt-7">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-11 w-11"
                      aria-label={`Mover pergunta ${number} para cima`}
                      disabled={index === 0}
                      onClick={() => swap(index, index - 1)}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-11 w-11"
                      aria-label={`Mover pergunta ${number} para baixo`}
                      disabled={index === fields.length - 1}
                      onClick={() => swap(index, index + 1)}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-11 w-11 text-destructive"
                      aria-label={`Remover pergunta ${number}`}
                      onClick={() => remove(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name={`registrationForm.${index}.type`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tipo de resposta</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange} disabled={isSaved}>
                          <FormControl>
                            <SelectTrigger className="h-11">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {(Object.keys(TYPE_LABELS) as RegistrationFieldType[]).map((value) => (
                              <SelectItem key={value} value={value}>
                                {TYPE_LABELS[value]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {isSaved ? (
                          <FormDescription>
                            Pergunta salva: para mudar o tipo, remova-a e crie outra.
                          </FormDescription>
                        ) : null}
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={`registrationForm.${index}.required`}
                    render={({ field }) => (
                      <FormItem className="flex min-h-11 items-center gap-3 space-y-0 sm:pt-7">
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                        <FormLabel className="font-normal">Obrigatório</FormLabel>
                      </FormItem>
                    )}
                  />
                </div>

                {type === "text" ? null : (
                  <FormField
                    control={form.control}
                    name={`registrationForm.${index}.optionsText`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Opções (uma por linha)</FormLabel>
                        <FormControl>
                          <Textarea rows={4} {...field} />
                        </FormControl>
                        <FormDescription>De 2 a 50 opções diferentes, até 80 caracteres cada.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </li>
            );
          })}
        </ol>
      ) : null}

      <Button
        type="button"
        variant="outline"
        className="min-h-11"
        disabled={isFull}
        onClick={() => append({ ...NEW_QUESTION })}
      >
        <Plus className="mr-2 h-4 w-4" />
        Adicionar pergunta
      </Button>
      {isFull ? (
        <p className="text-sm text-muted-foreground">
          Limite de {REGISTRATION_FORM_MAX_ACTIVE_FIELDS} perguntas atingido.
        </p>
      ) : null}
    </section>
  );
}
