import type { ReactNode } from "react";
import { useEffect, useLayoutEffect } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import UnderlineExt from "@tiptap/extension-underline";
import { Bold, Italic, Underline } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { normalizeDescriptionForEditor } from "@/lib/eventDescriptionHtml";

function ToolbarToggle({
  editor,
  onClick,
  isActive,
  label,
  shortcut,
  icon,
}: {
  editor: Editor;
  onClick: () => void;
  isActive: boolean;
  label: string;
  shortcut: string;
  icon: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            "h-9 gap-1.5 px-3 font-normal",
            isActive && "bg-accent text-accent-foreground",
          )}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onClick()}
          aria-pressed={isActive}
          aria-label={label}
        >
          {icon}
          <span className="hidden sm:inline">{label}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-[220px]">
        <p className="font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{shortcut}</p>
        <p className="text-xs text-muted-foreground">
          Clique de novo para remover o estilo na seleção.
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

function FormattingToolbar({ editor }: { editor: Editor | null }) {
  if (!editor) return null;
  return (
    <div
      className="flex flex-wrap items-center gap-1 rounded-t-md border border-b-0 bg-muted/40 px-2 py-1.5"
      role="toolbar"
      aria-label="Formatação da descrição"
    >
      <ToolbarToggle
        editor={editor}
        onClick={() => editor.chain().focus().toggleBold().run()}
        isActive={editor.isActive("bold")}
        label="Negrito"
        shortcut="Atalho: Ctrl+B ou ⌘B"
        icon={<Bold className="h-4 w-4" strokeWidth={2.5} />}
      />
      <ToolbarToggle
        editor={editor}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        isActive={editor.isActive("italic")}
        label="Itálico"
        shortcut="Atalho: Ctrl+I ou ⌘I"
        icon={<Italic className="h-4 w-4" />}
      />
      <ToolbarToggle
        editor={editor}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        isActive={editor.isActive("underline")}
        label="Sublinhado"
        shortcut="Atalho: Ctrl+U ou ⌘U"
        icon={<Underline className="h-4 w-4" />}
      />
    </div>
  );
}

export interface EventDescriptionEditorProps {
  id?: string;
  value: string;
  onChange: (html: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
  "aria-invalid"?: boolean;
}

/**
 * Rich description shared by criar/editar evento: negrito, itálico e sublinhado (estilo Word).
 */
export default function EventDescriptionEditor({
  id,
  value,
  onChange,
  onBlur,
  disabled = false,
  "aria-invalid": ariaInvalid,
}: EventDescriptionEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        bulletList: false,
        orderedList: false,
        listItem: false,
        listKeymap: false,
        heading: false,
        blockquote: false,
        codeBlock: false,
        code: false,
        horizontalRule: false,
        strike: false,
        underline: false,
      }),
      UnderlineExt,
    ],
    content: normalizeDescriptionForEditor(value),
    editable: !disabled,
    editorProps: {
      attributes: {
        ...(id ? { id } : {}),
        "aria-label": "Descrição do evento",
        "aria-invalid": ariaInvalid ? "true" : "false",
        class: cn(
          "prose prose-sm max-w-none min-h-[140px] px-3 py-2.5 focus:outline-none",
          "text-foreground [&_p]:my-0.5 [&_p]:leading-[1.3] [&_p:first-child]:mt-0 [&_p:last-child]:mb-0",
          "[&_br]:block [&_br]:mb-[0.65em]",
        ),
      },
      handleDOMEvents: {
        blur: () => {
          onBlur?.();
          return false;
        },
      },
    },
    onUpdate: ({ editor: ed }) => {
      // Ignore non-user updates during mount/hydration that can overwrite RHF reset value.
      if (!ed.isFocused) return;
      onChange(ed.getHTML());
    },
  });

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

  useLayoutEffect(() => {
    if (!editor) return;
    const next = normalizeDescriptionForEditor(value);
    const cur = editor.getHTML();
    if (cur === next) return;
    editor.commands.setContent(next, { emitUpdate: false });
  }, [editor, value]);

  return (
    <TooltipProvider delayDuration={400}>
      <div
        className={cn(
          "rounded-md border border-input bg-background shadow-sm transition-[color,box-shadow]",
          "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 ring-offset-background",
          disabled && "pointer-events-none opacity-60",
        )}
      >
        <FormattingToolbar editor={editor} />
        <div className="h-56 min-h-[180px] max-h-[70vh] resize-y overflow-auto rounded-b-md border-t bg-background">
          <EditorContent editor={editor} className="h-full" />
        </div>
      </div>
    </TooltipProvider>
  );
}
