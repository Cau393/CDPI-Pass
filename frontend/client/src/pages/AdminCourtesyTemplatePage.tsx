import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import UnderlineExt from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  List,
  ListOrdered,
  Loader2,
  Redo,
  Save,
  Underline,
  Undo,
} from "lucide-react";
import EventSelector from "@/components/admin/EventSelector";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import type { Event } from "@shared/schema";

const DYNAMIC_VARIABLES = [
  {
    tag: "{nome}",
    label: "Nome completo",
    description: "Nome do destinatário conforme a planilha CSV",
    example: "Maria Clara Santos",
  },
  {
    tag: "{evento}",
    label: "Nome do evento",
    description: "Título do evento selecionado",
    example: "Workshop Indústria 5.0",
  },
  {
    tag: "{data}",
    label: "Data do evento",
    description: "Data formatada como DD/MM/AAAA",
    example: "15/11/2024",
  },
  {
    tag: "{link}",
    label: "Link da cortesia",
    description: "URL única de resgate do ingresso",
    example: "https://...",
  },
] as const;

function ToolbarButton({
  onClick,
  isActive = false,
  disabled = false,
  tooltip,
  icon,
}: {
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
  tooltip: string;
  icon: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            "h-8 w-8",
            isActive && "bg-accent text-accent-foreground",
          )}
          onClick={onClick}
          disabled={disabled}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

function EditorToolbar({ editor }: { editor: Editor | null }) {
  if (!editor) return null;

  return (
    <div className="flex flex-wrap items-center gap-1 rounded-t-md border-b bg-muted/30 p-2">
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        isActive={editor.isActive("bold")}
        tooltip="Negrito (Ctrl+B)"
        icon={<Bold className="h-4 w-4" />}
      />
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        isActive={editor.isActive("italic")}
        tooltip="Itálico (Ctrl+I)"
        icon={<Italic className="h-4 w-4" />}
      />
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        isActive={editor.isActive("underline")}
        tooltip="Sublinhado (Ctrl+U)"
        icon={<Underline className="h-4 w-4" />}
      />

      <Separator orientation="vertical" className="mx-1 h-6" />

      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign("left").run()}
        isActive={editor.isActive({ textAlign: "left" })}
        tooltip="Alinhar à esquerda"
        icon={<AlignLeft className="h-4 w-4" />}
      />
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign("center").run()}
        isActive={editor.isActive({ textAlign: "center" })}
        tooltip="Centralizar"
        icon={<AlignCenter className="h-4 w-4" />}
      />
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign("right").run()}
        isActive={editor.isActive({ textAlign: "right" })}
        tooltip="Alinhar à direita"
        icon={<AlignRight className="h-4 w-4" />}
      />

      <Separator orientation="vertical" className="mx-1 h-6" />

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        isActive={editor.isActive("bulletList")}
        tooltip="Lista com marcadores"
        icon={<List className="h-4 w-4" />}
      />
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        isActive={editor.isActive("orderedList")}
        tooltip="Lista numerada"
        icon={<ListOrdered className="h-4 w-4" />}
      />

      <Separator orientation="vertical" className="mx-1 h-6" />

      <ToolbarButton
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        tooltip="Desfazer (Ctrl+Z)"
        icon={<Undo className="h-4 w-4" />}
      />
      <ToolbarButton
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        tooltip="Refazer (Ctrl+Y)"
        icon={<Redo className="h-4 w-4" />}
      />
    </div>
  );
}

export default function AdminCourtesyTemplatePage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const { data: eventForEditor, isFetching: isFetchingTemplate } = useQuery({
    queryKey: ["/api/admin/events", selectedEvent?.id, "courtesy-detail"],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/admin/events/${selectedEvent!.id}`,
      );
      return res.json() as Promise<Event>;
    },
    enabled: !!selectedEvent?.id,
  });

  const editor = useEditor({
    extensions: [
      StarterKit,
      UnderlineExt,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          rel: "noopener noreferrer",
          target: "_blank",
        },
      }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TextStyle,
      Color,
    ],
    content: "",
    editorProps: {
      attributes: {
        class:
          "prose prose-sm max-w-none focus:outline-none min-h-[320px] p-4",
      },
    },
    onUpdate: () => {
      setIsDirty(true);
    },
  });

  useEffect(() => {
    if (!editor) return;
    if (!selectedEvent) {
      editor.commands.clearContent(false);
      setIsDirty(false);
      return;
    }
    if (!eventForEditor || eventForEditor.id !== selectedEvent.id) return;
    const html = eventForEditor.courtesyTemplate ?? "";
    editor.commands.setContent(html || "<p></p>", { emitUpdate: false });
    setIsDirty(false);
  }, [editor, selectedEvent, eventForEditor]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const handleSave = async () => {
    if (!editor || !selectedEvent) return;
    setIsSaving(true);
    try {
      let template = editor.getHTML();
      const stripped = template.replace(/\s/g, "");
      if (stripped === "<p></p>" || stripped === "") {
        template = "";
      }

      await apiRequest(
        "PATCH",
        `/api/admin/events/${selectedEvent.id}/courtesy-template`,
        { template },
      );
      setIsDirty(false);
      await queryClient.invalidateQueries({
        queryKey: ["/api/admin/events", selectedEvent.id, "courtesy-detail"],
      });
      toast({
        title: "Template salvo",
        description: "As alterações foram salvas com sucesso.",
      });
    } catch (err) {
      toast({
        title: "Erro ao salvar",
        description:
          err instanceof Error ? err.message : "Algo deu errado. Tente de novo.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <TooltipProvider>
      <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
        <div>
          <p className="text-sm text-muted-foreground">
            Admin / Template e-mail cortesia
          </p>
          <h1 className="text-2xl font-bold tracking-tight">
            Template de e-mail de cortesia
          </h1>
        </div>

        <div className="space-y-2">
          <Label>Evento</Label>
          <EventSelector
            value={selectedEvent?.id ?? null}
            onSelect={setSelectedEvent}
          />
        </div>

        {!selectedEvent ? (
          <div className="flex min-h-[320px] items-center justify-center rounded-lg border border-dashed p-8 text-center text-muted-foreground">
            Selecione um evento acima para carregar ou criar o template.
          </div>
        ) : isFetchingTemplate && !eventForEditor ? (
          <div className="flex min-h-[320px] items-center justify-center rounded-lg border border-dashed p-8 text-center text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : (
          <div className="flex flex-col gap-6 md:flex-row md:items-start">
            <div className="min-w-0 flex-1 space-y-4">
              <Card>
                <CardHeader className="pb-0">
                  <CardTitle className="text-base">Corpo do e-mail</CardTitle>
                  <CardDescription>
                    Cole do Word ou digite aqui. Use o painel ao lado para
                    copiar variáveis dinâmicas.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <EditorToolbar editor={editor} />
                  <EditorContent
                    editor={editor}
                    className="rounded-b-md border focus-within:ring-2 focus-within:ring-ring"
                  />
                </CardContent>
              </Card>

              <div className="flex items-center justify-between pt-2">
                <p className="text-sm text-muted-foreground">
                  {isDirty ? "Alterações não salvas" : "Tudo salvo"}
                </p>
                <Button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={isSaving || !isDirty}
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Salvar template
                    </>
                  )}
                </Button>
              </div>
            </div>

            <div className="w-full shrink-0 md:w-80">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Variáveis dinâmicas</CardTitle>
                  <CardDescription>
                    Clique em uma variável para copiar e cole no texto onde
                    quiser.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {DYNAMIC_VARIABLES.map((v) => (
                    <button
                      key={v.tag}
                      type="button"
                      className="w-full space-y-1 rounded-md border p-3 text-left transition-colors hover:bg-muted/50"
                      onClick={() => {
                        void navigator.clipboard.writeText(v.tag);
                        toast({
                          title: `Copiado ${v.tag}`,
                          description: "Cole no editor no ponto desejado.",
                        });
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono text-primary">
                          {v.tag}
                        </code>
                        <span className="text-xs font-medium text-foreground">
                          {v.label}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {v.description}
                      </p>
                      <p className="text-xs italic text-muted-foreground">
                        ex.:{" "}
                        <span className="text-foreground">{v.example}</span>
                      </p>
                    </button>
                  ))}

                  <Separator />

                  <p className="text-xs text-muted-foreground">
                    Na hora do envio, cada variável é trocada pelos dados reais.
                    Variáveis desconhecidas permanecem no texto.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
