import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { Event } from "@shared/schema";

function normalizeForSearch(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function eventTitleMatchesQuery(title: string, query: string): boolean {
  const nt = normalizeForSearch(title);
  const nq = normalizeForSearch(query.trim());
  if (!nq) return true;
  const tokens = nq.split(/\s+/).filter(Boolean);
  return tokens.every((t) => nt.includes(t));
}

function formatEventLabel(ev: Event): string {
  const d =
    ev.date instanceof Date ? ev.date : new Date(ev.date as string | number);
  const dateStr = Number.isNaN(d.getTime())
    ? ""
    : new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(d);
  return dateStr ? `${ev.title} — ${dateStr}` : ev.title;
}

export interface EventSelectorProps {
  value: string | null;
  onSelect: (event: Event) => void;
  placeholder?: string;
  /** Applied to the trigger button */
  triggerClassName?: string;
  disabled?: boolean;
}

export function formatEventSelectorLabel(ev: Event): string {
  return formatEventLabel(ev);
}

export default function EventSelector({
  value,
  onSelect,
  placeholder = "Selecione um evento...",
  triggerClassName,
  disabled = false,
}: EventSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data: events = [], isLoading } = useQuery<Event[]>({
    queryKey: ["/api/admin/events"],
  });

  const filteredEvents = useMemo(() => {
    return events.filter((e) => eventTitleMatchesQuery(e.title, search));
  }, [events, search]);

  const selectedEvent = useMemo(
    () => events.find((e) => e.id === value) ?? null,
    [events, value],
  );

  if (isLoading) {
    return (
      <Skeleton className={cn("h-9 w-full max-w-xl", triggerClassName)} />
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full max-w-xl justify-between font-normal",
            triggerClassName,
          )}
          disabled={disabled}
        >
          {selectedEvent ? formatEventLabel(selectedEvent) : placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[min(100vw-2rem,36rem)] p-0"
        align="start"
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Buscar evento..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>
              {isLoading ? "Carregando..." : "Nenhum evento encontrado."}
            </CommandEmpty>
            <CommandGroup className="max-h-[220px] overflow-y-auto">
              {filteredEvents.map((ev) => (
                <CommandItem
                  key={ev.id}
                  value={ev.id}
                  onSelect={() => {
                    onSelect(ev);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === ev.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="truncate">{formatEventLabel(ev)}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
