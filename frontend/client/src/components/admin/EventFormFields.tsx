import type { MutableRefObject } from "react";
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
import { cn } from "@/lib/utils";
import EventDescriptionEditor from "@/components/admin/EventDescriptionEditor";
import {
  dateToApiLocalString,
  HOUR_OPTIONS,
  MINUTE_OPTIONS,
  parseApiLocalDateTime,
} from "@/lib/eventForm";

type EventFormShape = {
  title: string;
  description: string;
  date: string;
  location: string;
  price: string;
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
            <FormItem>
              <FormLabel>Preço</FormLabel>
              <FormControl>
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder="0,00"
                  autoComplete="off"
                  className="tabular-nums"
                  {...field}
                  value={field.value ?? ""}
                />
              </FormControl>
              <FormDescription>Reais · vírgula nos centavos (ex.: 1.234,56)</FormDescription>
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
                <Input placeholder="Local ou endereço" {...field} value={field.value ?? ""} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

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
