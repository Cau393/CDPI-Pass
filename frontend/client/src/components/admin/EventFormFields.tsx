import { useState, type MutableRefObject } from "react";
import type { FieldValues, Path, UseFormReturn } from "react-hook-form";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar as CalendarIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import EventDescriptionEditor from "@/components/admin/EventDescriptionEditor";
import ConfirmationEmailEditor from "@/components/admin/ConfirmationEmailEditor";
import {
  dateToApiLocalString,
  HOUR_OPTIONS,
  MINUTE_OPTIONS,
  parseApiLocalDateTime,
} from "@/lib/eventForm";
import {
  INTEREST_AREA_MAX_LABELS,
  tryAddInterestArea,
} from "@shared/interestAreas";

type EventFormShape = {
  title: string;
  description: string;
  date: string;
  location: string;
  price: string;
  npsType: "cdpi_event" | "cdpi_apoiando";
  isFree: boolean;
  modality: "presencial" | "online";
  meetingUrl?: string;
  meetingPassword?: string;
  whatsappGroupUrl?: string;
  confirmationEmailHtml?: string;
  courtesyLimit?: string;
  interestAreas?: string[];
  coverImage?: FileList;
};

interface EventFormFieldsProps<T extends FieldValues & EventFormShape> {
  form: UseFormReturn<T>;
  fileInputRef: MutableRefObject<HTMLInputElement | null>;
  previewUrl: string | null;
  coverRequired: boolean;
  /** When set, shown if there is no new file preview (edit mode). */
  existingImageUrl?: string | null;
  onClearNewCover: () => void;
}

export default function EventFormFields<T extends FieldValues & EventFormShape>({
  form,
  fileInputRef,
  previewUrl,
  coverRequired,
  existingImageUrl,
  onClearNewCover,
}: EventFormFieldsProps<T>) {
  const control = form.control;
  // A free event has no price to set, so the field is faded out and forced to 0.
  // This is presentation only: the server recomputes free-vs-paid from the DB.
  const isFree = Boolean(form.watch("isFree" as Path<T>));
  const modality = (form.watch("modality" as Path<T>) as string) || "presencial";
  const isOnline = modality === "online";
  const interestAreas =
    (form.watch("interestAreas" as Path<T>) as string[] | undefined) ?? [];
  const [interestDraft, setInterestDraft] = useState("");
  const [interestError, setInterestError] = useState<string | null>(null);
  const interestListFull = interestAreas.length >= INTEREST_AREA_MAX_LABELS;

  const addInterestArea = () => {
    const result = tryAddInterestArea(interestAreas, interestDraft);
    if (!result.ok) {
      setInterestError(result.error);
      return;
    }
    form.setValue("interestAreas" as Path<T>, result.value as never, {
      shouldDirty: true,
      shouldValidate: true,
    });
    setInterestDraft("");
    setInterestError(null);
  };

  const removeInterestArea = (index: number) => {
    form.setValue(
      "interestAreas" as Path<T>,
      interestAreas.filter((_, i) => i !== index) as never,
      { shouldDirty: true, shouldValidate: true },
    );
  };

  return (
    <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FormField
          control={control}
          name={"title" as Path<T>}
          render={({ field }) => (
            <FormItem className="md:col-span-2">
              <FormLabel>Título</FormLabel>
              <FormControl>
                <Input placeholder="Nome do evento" {...field} value={field.value ?? ""} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name={"date" as Path<T>}
          render={({ field }) => {
            const selectedDate = field.value?.trim()
              ? parseApiLocalDateTime(field.value)
              : undefined;
            const hasValue = selectedDate !== undefined;
            const hour = hasValue ? selectedDate.getHours() : 9;
            const minute = hasValue ? selectedDate.getMinutes() : 0;

            const commit = (d: Date) => {
              field.onChange(dateToApiLocalString(d));
            };

            return (
              <FormItem className="flex flex-col">
                <FormLabel>Data e hora</FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        type="button"
                        variant="outline"
                        className={cn(
                          "w-full justify-start pl-3 text-left font-normal",
                          !hasValue && "text-muted-foreground",
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4 shrink-0 opacity-70" />
                        <span className="tabular-nums">
                          {hasValue
                            ? format(selectedDate, "dd/MM/yyyy HH:mm", { locale: ptBR })
                            : "Selecione no calendário"}
                        </span>
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      defaultMonth={selectedDate ?? new Date()}
                      onSelect={(day) => {
                        if (!day) return;
                        const next = new Date(day);
                        if (hasValue) {
                          next.setHours(
                            selectedDate.getHours(),
                            selectedDate.getMinutes(),
                            0,
                            0,
                          );
                        } else {
                          next.setHours(9, 0, 0, 0);
                        }
                        commit(next);
                      }}
                      initialFocus
                    />
                    <div className="flex gap-3 border-t p-3">
                      <div className="flex flex-1 flex-col gap-1.5">
                        <span className="text-xs font-medium text-muted-foreground">Hora (24 h)</span>
                        <Select
                          value={String(hour)}
                          onValueChange={(v) => {
                            if (!selectedDate) return;
                            const d = new Date(selectedDate);
                            d.setHours(Number(v), d.getMinutes(), 0, 0);
                            commit(d);
                          }}
                          disabled={!hasValue}
                        >
                          <SelectTrigger className="tabular-nums">
                            <SelectValue placeholder="--" />
                          </SelectTrigger>
                          <SelectContent>
                            {HOUR_OPTIONS.map((h) => (
                              <SelectItem key={h} value={String(h)}>
                                {String(h).padStart(2, "0")}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex flex-1 flex-col gap-1.5">
                        <span className="text-xs font-medium text-muted-foreground">Minuto</span>
                        <Select
                          value={String(minute)}
                          onValueChange={(v) => {
                            if (!selectedDate) return;
                            const d = new Date(selectedDate);
                            d.setHours(d.getHours(), Number(v), 0, 0);
                            commit(d);
                          }}
                          disabled={!hasValue}
                        >
                          <SelectTrigger className="tabular-nums">
                            <SelectValue placeholder="--" />
                          </SelectTrigger>
                          <SelectContent>
                            {MINUTE_OPTIONS.map((m) => (
                              <SelectItem key={m} value={String(m)}>
                                {String(m).padStart(2, "0")}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
                <FormDescription>
                  Escolha o dia no calendário e ajuste hora e minuto (formato brasileiro).
                </FormDescription>
                <FormMessage />
              </FormItem>
            );
          }}
        />
        <FormField
          control={control}
          name={"price" as Path<T>}
          render={({ field }) => (
            <FormItem
              aria-disabled={isFree}
              className={cn(
                isFree && "pointer-events-none opacity-50",
              )}
            >
              <FormLabel>Preço</FormLabel>
              <FormControl>
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder="0,00"
                  autoComplete="off"
                  className="tabular-nums"
                  data-testid="input-event-price"
                  {...field}
                  disabled={isFree}
                  value={isFree ? "0,00" : (field.value ?? "")}
                />
              </FormControl>
              <FormDescription>
                {isFree
                  ? "Evento gratuito: o preço fica fixo em R$ 0,00."
                  : "Reais · vírgula nos centavos (ex.: 1.234,56)"}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name={"courtesyLimit" as Path<T>}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Limite total de cortesias</FormLabel>
              <FormControl>
                <Input
                  type="text"
                  inputMode="numeric"
                  placeholder="Sem limite"
                  autoComplete="off"
                  className="tabular-nums"
                  data-testid="input-courtesy-limit"
                  {...field}
                  value={field.value ?? ""}
                />
              </FormControl>
              <FormDescription>
                Opcional. Em branco não há teto. Ao atingir o número, todos os
                links de cortesia são desativados e só podem ser religados
                depois que o limite for aumentado.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="input-interest-area">Área de Interesse</Label>
          <p className="text-sm text-muted-foreground">
            Opcional. Se você adicionar opções, o participante terá que escolher uma antes de confirmar.
          </p>
          <div className="flex gap-2">
            <Input
              id="input-interest-area"
              value={interestDraft}
              onChange={(e) => setInterestDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                if (!interestListFull) addInterestArea();
              }}
              disabled={interestListFull}
              autoComplete="off"
              data-testid="input-interest-area"
            />
            <Button
              type="button"
              variant="outline"
              onClick={addInterestArea}
              disabled={interestListFull}
              data-testid="button-add-interest-area"
            >
              Adicionar
            </Button>
          </div>
          {interestError ? (
            <p role="alert" className="text-sm text-destructive">
              {interestError}
            </p>
          ) : null}
          {interestAreas.length > 0 ? (
            <ul className="space-y-2">
              {interestAreas.map((label, index) => (
                <li
                  key={`${label}-${index}`}
                  className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
                  data-testid="interest-area-row"
                >
                  <span>{label}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Remover ${label}`}
                    onClick={() => removeInterestArea(index)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <FormField
          control={control}
          name={"modality" as Path<T>}
          render={({ field }) => (
            <FormItem className="md:col-span-2">
              <FormLabel>Formato do evento</FormLabel>
              <FormDescription>
                Eventos presenciais enviam o QR Code do ingresso. Eventos online
                enviam o link da reunião por e-mail e não geram ingresso.
              </FormDescription>
              <FormControl>
                <RadioGroup
                  onValueChange={(value) => {
                    field.onChange(value);
                    if (value === "presencial") {
                      form.setValue("meetingUrl" as Path<T>, "" as never, {
                        shouldDirty: true,
                        shouldValidate: true,
                      });
                      form.setValue("meetingPassword" as Path<T>, "" as never, {
                        shouldDirty: true,
                        shouldValidate: true,
                      });
                      form.setValue("whatsappGroupUrl" as Path<T>, "" as never, {
                        shouldDirty: true,
                        shouldValidate: true,
                      });
                    }
                  }}
                  value={field.value ?? "presencial"}
                  className="grid gap-3 pt-2 sm:grid-cols-2"
                >
                  <div className="flex items-center space-x-2 rounded-lg border p-3">
                    <RadioGroupItem value="presencial" id="modality-presencial" />
                    <Label
                      htmlFor="modality-presencial"
                      className="cursor-pointer font-normal leading-snug"
                    >
                      Presencial
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2 rounded-lg border p-3">
                    <RadioGroupItem value="online" id="modality-online" />
                    <Label
                      htmlFor="modality-online"
                      className="cursor-pointer font-normal leading-snug"
                    >
                      Online
                    </Label>
                  </div>
                </RadioGroup>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name={"location" as Path<T>}
          render={({ field }) => (
            <FormItem className="md:col-span-2">
              <FormLabel>Local</FormLabel>
              <FormControl>
                <Input
                  placeholder={
                    isOnline
                      ? "Plataforma (ex.: Zoom, Google Meet)"
                      : "Local ou endereço"
                  }
                  {...field}
                  value={field.value ?? ""}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {isOnline ? (
          <>
          <FormField
            control={control}
            name={"meetingUrl" as Path<T>}
            render={({ field }) => (
              <FormItem className="md:col-span-2">
                <FormLabel>Link da reunião</FormLabel>
                <FormControl>
                  <Input
                    type="url"
                    inputMode="url"
                    placeholder="https://..."
                    data-testid="input-meeting-url"
                    {...field}
                    value={field.value ?? ""}
                  />
                </FormControl>
                <FormDescription>
                  Enviado no e-mail de confirmação e mostrado em Meus Ingressos
                  após a inscrição. Não aparece na página pública do evento.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name={"meetingPassword" as Path<T>}
            render={({ field }) => (
              <FormItem className="md:col-span-2">
                <FormLabel>Senha para a Reunião</FormLabel>
                <FormControl>
                  <Input
                    type="text"
                    autoComplete="off"
                    placeholder="Opcional"
                    data-testid="input-meeting-password"
                    {...field}
                    value={field.value ?? ""}
                  />
                </FormControl>
                <FormDescription>
                  Opcional. Enviada no e-mail de confirmação e mostrada em Meus
                  Ingressos após a confirmação. Não aparece na página pública do
                  evento.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name={"whatsappGroupUrl" as Path<T>}
            render={({ field }) => (
              <FormItem className="md:col-span-2">
                <FormLabel>Link do grupo no WhatsApp</FormLabel>
                <FormControl>
                  <Input
                    type="url"
                    inputMode="url"
                    placeholder="https://chat.whatsapp.com/..."
                    data-testid="input-whatsapp-group-url"
                    {...field}
                    value={field.value ?? ""}
                  />
                </FormControl>
                <FormDescription>
                  Opcional. Abre em nova aba após inscrição gratuita; no perfil
                  após pagamento. Não aparece na página pública.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </>
        ) : null}
      </div>

      <FormField
        control={control}
        name={"confirmationEmailHtml" as Path<T>}
        render={({ field }) => (
          <FormItem>
            <FormLabel>Mensagem extra no e-mail de confirmação</FormLabel>
            <FormControl>
              <ConfirmationEmailEditor
                value={field.value ?? ""}
                onChange={field.onChange}
                onBlur={field.onBlur}
              />
            </FormControl>
            <FormDescription>
              Opcional. Se preenchida, entra no e-mail de confirmação. Vazia
              mantém o modelo padrão.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name={"isFree" as Path<T>}
        render={({ field }) => (
          <FormItem className="flex flex-row items-start justify-between gap-4 rounded-lg border p-4">
            <div className="space-y-1">
              <FormLabel htmlFor="event-is-free" className="text-base">
                Evento Grátis
              </FormLabel>
              <FormDescription>
                Inscrição gratuita: sem preço, sem taxa de conveniência de R$ 5,00 e sem
                etapa de pagamento. O participante confirma e recebe o QR (presencial)
                ou o link de acesso (online) por e-mail.
              </FormDescription>
            </div>
            <FormControl>
              <Switch
                id="event-is-free"
                data-testid="switch-event-is-free"
                checked={Boolean(field.value)}
                onCheckedChange={(checked) => {
                  field.onChange(checked);
                  // Keep the visible price consistent with the switch. The
                  // server pins it to 0 regardless, this is just for the form.
                  if (checked) {
                    form.setValue("price" as Path<T>, "0,00" as never, {
                      shouldDirty: true,
                      shouldValidate: true,
                    });
                  }
                }}
              />
            </FormControl>
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name={"npsType" as Path<T>}
        render={({ field }) => (
          <FormItem className="md:col-span-2">
            <FormLabel>Tipo de pesquisa (certificado)</FormLabel>
            <FormDescription>
              Define qual formulário de satisfação aparece ao gerar o certificado deste evento.
            </FormDescription>
            <FormControl>
              <RadioGroup
                onValueChange={field.onChange}
                value={field.value ?? "cdpi_event"}
                className="grid gap-3 pt-2 sm:grid-cols-2"
              >
                <div className="flex items-center space-x-2 rounded-lg border p-3">
                  <RadioGroupItem value="cdpi_event" id="nps-cdpi-event" />
                  <Label htmlFor="nps-cdpi-event" className="cursor-pointer font-normal leading-snug">
                    Evento CDPI
                  </Label>
                </div>
                <div className="flex items-center space-x-2 rounded-lg border p-3">
                  <RadioGroupItem value="cdpi_apoiando" id="nps-apoiando" />
                  <Label htmlFor="nps-apoiando" className="cursor-pointer font-normal leading-snug">
                    Evento de Terceiros
                  </Label>
                </div>
              </RadioGroup>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name={"description" as Path<T>}
        render={({ field, fieldState }) => (
          <FormItem>
            <FormLabel>Descrição</FormLabel>
            <FormControl>
              <EventDescriptionEditor
                id={field.name}
                value={field.value ?? ""}
                onChange={field.onChange}
                onBlur={field.onBlur}
                disabled={form.formState.disabled}
                aria-invalid={fieldState.invalid}
              />
            </FormControl>
            <FormDescription>
              Use <strong>Negrito</strong>, <em>Itálico</em> e <span className="underline">Sublinhado</span> na
              barra acima. Selecione o texto e clique no estilo para aplicar ou remover.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name={"coverImage" as Path<T>}
        render={({ field: { onChange, onBlur, name, ref } }) => (
          <FormItem>
            <FormLabel>Imagem de capa{coverRequired ? "" : " (opcional)"}</FormLabel>
            <FormControl>
              <Input
                ref={(el) => {
                  ref(el);
                  fileInputRef.current = el;
                }}
                name={name}
                onBlur={onBlur}
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp"
                onChange={(e) => onChange(e.target.files)}
              />
            </FormControl>
            <FormDescription>JPEG, PNG, ou WebP · Máximo 5MB</FormDescription>
            <FormMessage />
            {previewUrl && (
              <div className="relative mt-3 h-48 w-full overflow-hidden rounded-lg border border-border">
                <img src={previewUrl} alt="Pré-visualização da capa" className="h-full w-full object-cover" />
                <button
                  type="button"
                  className="absolute right-2 top-2 rounded-full bg-background/80 p-1 hover:bg-background"
                  onClick={onClearNewCover}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
            {!previewUrl && existingImageUrl ? (
              <div className="relative mt-3 h-48 w-full overflow-hidden rounded-lg border border-border">
                <img
                  src={existingImageUrl}
                  alt="Capa atual"
                  className="h-full w-full object-cover"
                />
              </div>
            ) : null}
          </FormItem>
        )}
      />
    </>
  );
}
