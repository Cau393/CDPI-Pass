import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useLocation, useParams } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, Lock, LockOpen, Save, Trash2 } from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Form } from "@/components/ui/form";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import EventFormFields from "@/components/admin/EventFormFields";
import {
  apiPriceToBrazilianDisplay,
  brazilianPriceToApiString,
  editEventSchema,
  eventDateToFormString,
  parseApiErrorMessage,
  type EditEventFormValues,
} from "@/lib/eventForm";
import type { Event } from "@shared/schema";
import {
  normalizeDescriptionForEditor,
  sanitizeEventDescriptionHtml,
} from "@/lib/eventDescriptionHtml";

function buildPatchFormData(
  values: EditEventFormValues,
  dirty: Partial<Record<keyof EditEventFormValues, boolean | object>>,
): FormData {
  const fd = new FormData();
  if (dirty.title) fd.append("title", values.title.trim());
  if (dirty.description) {
    fd.append("description", sanitizeEventDescriptionHtml(values.description));
  }
  if (dirty.date) fd.append("date", values.date.trim());
  if (dirty.location) fd.append("location", values.location.trim());
  if (dirty.price) fd.append("price", brazilianPriceToApiString(values.price));
  if (dirty.npsType) fd.append("nps_type", values.npsType);
  if (dirty.isFree) fd.append("is_free", String(values.isFree));
  if (dirty.coverImage && values.coverImage?.[0]) {
    fd.append("coverImage", values.coverImage[0]);
  }
  return fd;
}

export default function AdminEditEventPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [salesDialogOpen, setSalesDialogOpen] = useState(false);

  const {
    data: event,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["/api/admin/events", id],
    enabled: Boolean(id),
    queryFn: async (): Promise<Event> => {
      const res = await apiRequest("GET", `/api/admin/events/${id}`);
      return res.json() as Promise<Event>;
    },
  });

  const { data: printSettings, isLoading: printSettingsLoading } = useQuery<{
    isEnabled: boolean;
  }>({
    queryKey: ["/api/admin/events", id, "print-settings"],
    enabled: Boolean(id),
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/admin/events/${id}/print-settings`);
      return res.json() as Promise<{ isEnabled: boolean }>;
    },
  });

  const updatePrintSettings = useMutation({
    mutationFn: async (isEnabled: boolean) => {
      const res = await apiRequest("PATCH", `/api/admin/events/${id}/print-settings`, {
        isEnabled,
      });
      return res.json() as Promise<{ isEnabled: boolean }>;
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({
        queryKey: ["/api/admin/events", id, "print-settings"],
      });
      toast({
        title: "Impressão",
        description: data.isEnabled
          ? "Impressão automática ativada para este evento."
          : "Impressão automática desativada para este evento.",
      });
    },
    onError: (err) => {
      toast({
        title: "Erro ao salvar",
        description: parseApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  const updateSalesClosed = useMutation({
    mutationFn: async (salesClosed: boolean) => {
      // Sent as its own PATCH so closing sales never depends on the main form
      // being valid or dirty.
      const fd = new FormData();
      fd.append("sales_closed", String(salesClosed));
      const res = await apiRequest("PATCH", `/api/admin/events/${id}`, fd);
      return res.json() as Promise<Event>;
    },
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: ["/api/admin/events", id] });
      void queryClient.invalidateQueries({ queryKey: ["admin-events-paginated"] });
      toast({
        title: updated.salesClosed ? "Vendas encerradas" : "Vendas reabertas",
        description: updated.salesClosed
          ? "Novas compras e inscrições estão bloqueadas. O resgate de cortesia continua funcionando."
          : "O evento voltou a aceitar novas compras e inscrições.",
      });
    },
    onError: (err) => {
      toast({
        title: "Erro ao salvar",
        description: parseApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  const form = useForm<EditEventFormValues>({
    resolver: zodResolver(editEventSchema),
    defaultValues: {
      title: "",
      description: "",
      date: "",
      location: "",
      price: "",
      npsType: "cdpi_event",
      isFree: false,
    },
  });

  useEffect(() => {
    if (!event) return;
    const normalizedDescription = normalizeDescriptionForEditor(
      event.description ?? "",
    );
    form.reset({
      title: event.title,
      description: normalizedDescription,
      date: eventDateToFormString(event.date),
      location: event.location,
      price: apiPriceToBrazilianDisplay(event.price),
      npsType: event.npsType ?? "cdpi_event",
      isFree: event.isFree ?? false,
    });
  }, [event, form]);

  const coverImageValue = form.watch("coverImage");

  useEffect(() => {
    if (coverImageValue && coverImageValue[0] instanceof File) {
      const objectUrl = URL.createObjectURL(coverImageValue[0]);
      setPreviewUrl(objectUrl);
      return () => URL.revokeObjectURL(objectUrl);
    }
    setPreviewUrl(null);
    return undefined;
  }, [coverImageValue]);

  const onSubmit = async (values: EditEventFormValues) => {
    if (!id) return;
    const dirty = form.formState.dirtyFields;
    const hasNewCover = Boolean(dirty.coverImage && values.coverImage?.[0]);
    const hasTextDirty =
      dirty.title ||
      dirty.description ||
      dirty.date ||
      dirty.location ||
      dirty.price ||
      dirty.npsType ||
      dirty.isFree;

    if (!hasTextDirty && !hasNewCover) {
      toast({
        title: "Nada para salvar",
        description: "Altere algum campo ou escolha uma nova capa.",
      });
      return;
    }

    const formData = buildPatchFormData(values, dirty);

    try {
      const res = await apiRequest("PATCH", `/api/admin/events/${id}`, formData);
      const updated = (await res.json()) as Event;
      toast({
        title: "Evento atualizado",
        description: `"${updated.title}" foi salvo.`,
      });
      form.reset({
        title: updated.title,
        description: normalizeDescriptionForEditor(updated.description ?? ""),
        date: eventDateToFormString(updated.date),
        location: updated.location,
        price: apiPriceToBrazilianDisplay(updated.price),
        npsType: updated.npsType ?? "cdpi_event",
        isFree: updated.isFree ?? false,
        coverImage: undefined,
      });
      if (fileInputRef.current) fileInputRef.current.value = "";
      await queryClient.invalidateQueries({ queryKey: ["admin-events-paginated"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/events", id] });
    } catch (err) {
      toast({
        title: "Erro",
        description: parseApiErrorMessage(err),
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    setDeleting(true);
    try {
      await apiRequest("DELETE", `/api/admin/events/${id}`);
      toast({ title: "Evento excluído", description: "O evento e registros vinculados foram removidos." });
      await queryClient.invalidateQueries({ queryKey: ["admin-events-paginated"] });
      setDeleteOpen(false);
      setLocation("/admin/events?tab=list");
    } catch (err) {
      toast({
        title: "Erro ao excluir",
        description: parseApiErrorMessage(err),
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  const canSave =
    form.formState.isDirty ||
    (coverImageValue instanceof FileList && coverImageValue.length > 0);

  if (!id) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Evento inválido.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError || !event) {
    return (
      <div className="p-6">
        <p className="text-sm text-destructive">Evento não encontrado ou erro ao carregar.</p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/admin/events?tab=list">Voltar à lista</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Breadcrumb className="mb-4">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/admin/events?tab=list">Eventos</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Editar</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Editar evento</h1>
          <p className="text-sm text-muted-foreground">{event.title}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {event.isFree && (
              <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                Evento Grátis
              </Badge>
            )}
            {event.salesClosed && (
              <Badge variant="destructive" data-testid="badge-sales-closed">
                Vendas encerradas
              </Badge>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch sm:gap-3">
          <Card className="w-full min-w-0 sm:min-w-[280px]">
            <CardHeader className="space-y-3 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <Label htmlFor="print-auto-switch" className="text-base">
                    Impressão no credenciamento
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Enfileirar etiqueta após check-in (terminal WebUSB)
                  </p>
                </div>
                {printSettingsLoading || !id ? (
                  <Skeleton className="h-6 w-11 shrink-0 rounded-full" />
                ) : (
                  <Switch
                    id="print-auto-switch"
                    checked={printSettings?.isEnabled ?? false}
                    disabled={updatePrintSettings.isPending}
                    onCheckedChange={(c) => {
                      updatePrintSettings.mutate(c);
                    }}
                  />
                )}
              </div>
            </CardHeader>
          </Card>

          <AlertDialog open={salesDialogOpen} onOpenChange={setSalesDialogOpen}>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant={event.salesClosed ? "outline" : "secondary"}
                size="sm"
                disabled={updateSalesClosed.isPending}
                data-testid="button-toggle-sales"
              >
                {updateSalesClosed.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : event.salesClosed ? (
                  <LockOpen className="mr-2 h-4 w-4" />
                ) : (
                  <Lock className="mr-2 h-4 w-4" />
                )}
                {event.salesClosed ? "Reabrir Vendas" : "Encerrar Vendas"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {event.salesClosed ? "Reabrir as vendas?" : "Encerrar as vendas?"}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {event.salesClosed ? (
                    <>
                      O evento voltará a aceitar novas compras e inscrições.
                    </>
                  ) : (
                    <>
                      Novas compras e inscrições serão bloqueadas. O evento continua
                      ativo e visível, e o <strong>resgate de cortesia continua
                      funcionando</strong>. Você pode reabrir a qualquer momento.
                    </>
                  )}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={updateSalesClosed.isPending}>
                  Cancelar
                </AlertDialogCancel>
                <AlertDialogAction
                  disabled={updateSalesClosed.isPending}
                  onClick={(e) => {
                    e.preventDefault();
                    updateSalesClosed.mutate(!event.salesClosed, {
                      onSettled: () => setSalesDialogOpen(false),
                    });
                  }}
                >
                  {event.salesClosed ? "Reabrir vendas" : "Encerrar vendas"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogTrigger asChild>
            <Button type="button" variant="destructive" size="sm">
              <Trash2 className="mr-2 h-4 w-4" />
              Excluir
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir este evento?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta ação não pode ser desfeita. Pedidos, cortesias e certificados ligados a este
                evento serão apagados permanentemente.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={deleting}
                onClick={(e) => {
                  e.preventDefault();
                  void handleDelete();
                }}
              >
                {deleting ? "Excluindo…" : "Excluir definitivamente"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        </div>
      </div>

      <Card className="mx-auto max-w-2xl">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <CardHeader>
              <CardTitle>Detalhes</CardTitle>
              <CardDescription>
                Apenas os campos alterados são enviados ao salvar. A capa só muda se você escolher
                outra imagem.
              </CardDescription>
            </CardHeader>
            <Separator />
            <CardContent className="space-y-6 pt-6">
              <EventFormFields
                form={form}
                fileInputRef={fileInputRef}
                previewUrl={previewUrl}
                coverRequired={false}
                existingImageUrl={event.imageUrl}
                onClearNewCover={() => {
                  form.resetField("coverImage");
                  if (fileInputRef.current) fileInputRef.current.value = "";
                  setPreviewUrl(null);
                }}
              />
            </CardContent>
            <CardFooter className="flex flex-col border-t pt-6">
              <Button
                type="submit"
                disabled={form.formState.isSubmitting || !canSave}
                className="w-full"
              >
                {form.formState.isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Salvar alterações
                  </>
                )}
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>
    </div>
  );
}
