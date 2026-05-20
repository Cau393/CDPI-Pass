import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, FileUp } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { Link } from "wouter";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import type { Event } from "@shared/schema";

function normalizeForSearch(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function eventMatchesQuery(title: string, query: string): boolean {
  const nt = normalizeForSearch(title);
  const nq = normalizeForSearch(query.trim());
  if (!nq) return true;
  const tokens = nq.split(/\s+/).filter(Boolean);
  return tokens.every((t) => nt.includes(t));
}

export default function CertificateTemplateAdminPage({
  embeddedInHub = false,
}: {
  embeddedInHub?: boolean;
} = {}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Event | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const { data: events = [], isLoading } = useQuery<Event[]>({
    queryKey: ["/api/admin/events"],
  });

  const filtered = useMemo(() => {
    return events.filter((e) => eventMatchesQuery(e.title, search));
  }, [events, search]);

  const handleUpload = async () => {
    if (!selected) {
      toast({
        title: "Selecione um evento",
        variant: "destructive",
      });
      return;
    }
    if (!file) {
      toast({
        title: "Selecione um arquivo .docx",
        variant: "destructive",
      });
      return;
    }
    if (!file.name.toLowerCase().endsWith(".docx")) {
      toast({
        title: "Apenas arquivos .docx",
        variant: "destructive",
      });
      return;
    }

    const fd = new FormData();
    fd.append("file", file);

    setUploading(true);
    try {
      const res = await apiRequest(
        "POST",
        `/api/admin/events/${selected.id}/certificate-template`,
        fd,
      );
      const data = (await res.json()) as { event: Event };
      setSelected(data.event);
      setFile(null);
      toast({
        title: "Template enviado",
        description: "O template do certificado foi salvo para este evento.",
      });
    } catch (e) {
      toast({
        title: "Erro ao enviar",
        description: e instanceof Error ? e.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div
      className={
        embeddedInHub ? "mx-auto max-w-2xl px-0 py-2" : "mx-auto max-w-2xl px-4 py-8"
      }
    >
      {!embeddedInHub && (
        <Breadcrumb className="mb-6">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/admin/events?tab=list">Eventos</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Template certificado</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileUp className="h-6 w-6" />
            Enviar template de certificado
          </CardTitle>
          <CardDescription>
            Escolha o evento, envie um arquivo .docx (placeholder {"{nome}"}) e salve no servidor.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>Evento</Label>
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  aria-expanded={open}
                  className="w-full justify-between font-normal"
                  disabled={isLoading}
                >
                  {selected ? selected.title : "Buscar e selecionar evento..."}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[min(100vw-2rem,28rem)] p-0" align="start">
                <Command shouldFilter={false}>
                  <CommandInput
                    placeholder="Buscar por nome (sem acentos ou maiúsculas)..."
                    value={search}
                    onValueChange={setSearch}
                  />
                  <CommandList>
                    <CommandEmpty>
                      {isLoading ? "Carregando..." : "Nenhum evento encontrado."}
                    </CommandEmpty>
                    <CommandGroup>
                      {filtered.map((ev) => (
                        <CommandItem
                          key={ev.id}
                          value={ev.id}
                          onSelect={() => {
                            setSelected(ev);
                            setOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              selected?.id === ev.id ? "opacity-100" : "opacity-0",
                            )}
                          />
                          <span className="truncate">{ev.title}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {selected && (
            <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              {selected.certificateTemplateUrl ? (
                <span>
                  Template atual:{" "}
                  <a
                    href={selected.certificateTemplateUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline break-all"
                  >
                    {selected.certificateTemplateUrl}
                  </a>
                </span>
              ) : (
                <span>Nenhum template cadastrado ainda para este evento.</span>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="docx-file">Arquivo .docx</Label>
            <div className="flex flex-wrap items-center gap-3">
              <input
                id="docx-file"
                type="file"
                accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="sr-only"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <Button type="button" variant="outline" asChild>
                <label htmlFor="docx-file" className="cursor-pointer">
                  Escolher arquivo
                </label>
              </Button>
              <span className="text-sm text-muted-foreground">
                {file ? file.name : "Nenhum arquivo selecionado"}
              </span>
            </div>
          </div>

          <Button
            type="button"
            className="w-full"
            disabled={uploading || !selected || !file}
            onClick={() => void handleUpload()}
          >
            {uploading ? "Enviando..." : "Enviar template"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
