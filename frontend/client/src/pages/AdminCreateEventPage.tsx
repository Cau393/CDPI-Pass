import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useLocation } from "wouter";
import { Loader2, Plus } from "lucide-react";
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
import { Form } from "@/components/ui/form";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import EventFormFields from "@/components/admin/EventFormFields";
import {
  brazilianPriceToApiString,
  createEventSchema,
  parseApiErrorMessage,
  type CreateEventFormValues,
} from "@/lib/eventForm";
import type { Event } from "@shared/schema";
import { sanitizeEventDescriptionHtml } from "@/lib/eventDescriptionHtml";

export default function AdminCreateEventPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const form = useForm<CreateEventFormValues>({
    resolver: zodResolver(createEventSchema),
    defaultValues: {
      title: "",
      description: "",
      date: "",
      location: "",
      price: "",
    },
  });

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

  const onSubmit = async (values: CreateEventFormValues) => {
    const formData = new FormData();
    formData.append("title", values.title.trim());
    formData.append("description", sanitizeEventDescriptionHtml(values.description));
    formData.append("date", values.date.trim());
    formData.append("location", values.location.trim());
    formData.append("price", brazilianPriceToApiString(values.price));
    if (values.coverImage?.[0]) {
      formData.append("coverImage", values.coverImage[0]);
    }

    try {
      const res = await apiRequest("POST", "/api/admin/events", formData);
      const newEvent = (await res.json()) as Event;
      toast({
        title: "Evento criado!",
        description: `"${newEvent.title}" foi adicionado com sucesso.`,
      });
      setLocation("/admin/events");
    } catch (err) {
      toast({
        title: "Erro",
        description: parseApiErrorMessage(err),
        variant: "destructive",
      });
    }
  };

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
            <BreadcrumbPage>Criar novo</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Criar novo evento</h1>
        <p className="text-sm text-muted-foreground">
          Adicione um novo evento com uma imagem de capa.
        </p>
      </div>

      <Card className="mx-auto max-w-2xl">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <CardHeader>
              <CardTitle>Detalhes do evento</CardTitle>
              <CardDescription>
                Campos obrigatórios correspondem às restrições do banco de dados.
              </CardDescription>
            </CardHeader>
            <Separator />
            <CardContent className="space-y-6 pt-6">
              <EventFormFields
                form={form}
                fileInputRef={fileInputRef}
                previewUrl={previewUrl}
                coverRequired
                onClearNewCover={() => {
                  form.resetField("coverImage");
                  if (fileInputRef.current) fileInputRef.current.value = "";
                  setPreviewUrl(null);
                }}
              />
            </CardContent>
            <CardFooter className="flex flex-col border-t pt-6">
              <Button type="submit" disabled={form.formState.isSubmitting} className="w-full">
                {form.formState.isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Criando evento...
                  </>
                ) : (
                  <>
                    <Plus className="mr-2 h-4 w-4" />
                    Criar evento
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
