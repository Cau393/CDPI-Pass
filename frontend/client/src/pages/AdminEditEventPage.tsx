import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useLocation, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Save, Trash2 } from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
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

function buildPatchFormData(
  values: EditEventFormValues,
  dirty: Partial<Record<keyof EditEventFormValues, boolean | object>>,
): FormData {
  const fd = new FormData();
  if (dirty.title) fd.append("title", values.title.trim());
  if (dirty.description) fd.append("description", values.description.trim());
  if (dirty.date) fd.append("date", values.date.trim());
  if (dirty.location) fd.append("location", values.location.trim());
  if (dirty.price) fd.append("price", brazilianPriceToApiString(values.price));
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

  const form = useForm<EditEventFormValues>({
    resolver: zodResolver(editEventSchema),
    defaultValues: {
      title: "",
      description: "",
      date: "",
      location: "",
      price: "",
    },
  });

  useEffect(() => {
    if (!event) return;
    form.reset({
      title: event.title,
      description: event.description,
      date: eventDateToFormString(event.date),
      location: event.location,
      price: apiPriceToBrazilianDisplay(event.price),
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
      dirty.price;

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
        description: updated.description,
        date: eventDateToFormString(updated.date),
        location: updated.location,
        price: apiPriceToBrazilianDisplay(updated.price),
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
      setLocation("/admin/events");
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
          <Link href="/admin/events">Voltar à lista</Link>
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
              <Link href="/admin/events">Eventos</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Editar</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Editar evento</h1>
          <p className="text-sm text-muted-foreground">{event.title}</p>
        </div>
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
