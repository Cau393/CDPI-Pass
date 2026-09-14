import type { ReactNode } from "react";
import { useEffect, useLayoutEffect } from "react";
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
  Underline,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function ToolbarButton({
  onClick,
  isActive,
  label,
  icon,
}: {
  onClick: () => void;
  isActive: boolean;
  label: string;
  icon: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn("h-8 px-2", isActive && "bg-accent text-accent-foreground")}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      aria-pressed={isActive}
      aria-label={label}
    >
      {icon}
    </Button>
  );
}

function FormattingToolbar({ editor }: { editor: Editor | null }) {
  if (!editor) return null;
  return (
    <div
      className="flex flex-wrap items-center gap-0.5 rounded-t-md border border-b-0 bg-muted/40 px-2 py-1"
      role="toolbar"
      aria-label="Formatação da mensagem extra"
    >
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        isActive={editor.isActive("bold")}
        label="Negrito"
        icon={<Bold className="h-4 w-4" />}
      />
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        isActive={editor.isActive("italic")}
        label="Itálico"
        icon={<Italic className="h-4 w-4" />}
      />
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        isActive={editor.isActive("underline")}
        label="Sublinhado"
        icon={<Underline className="h-4 w-4" />}
      />
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        isActive={editor.isActive("bulletList")}
        label="Lista"
        icon={<List className="h-4 w-4" />}
      />
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        isActive={editor.isActive("orderedList")}
        label="Lista numerada"
        icon={<ListOrdered className="h-4 w-4" />}
      />
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign("left").run()}
        isActive={editor.isActive({ textAlign: "left" })}
        label="Alinhar à esquerda"
        icon={<AlignLeft className="h-4 w-4" />}
      />
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign("center").run()}
        isActive={editor.isActive({ textAlign: "center" })}
        label="Centralizar"
        icon={<AlignCenter className="h-4 w-4" />}
      />
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign("right").run()}
        isActive={editor.isActive({ textAlign: "right" })}
        label="Alinhar à direita"
        icon={<AlignRight className="h-4 w-4" />}
      />
    </div>
  );
}

export interface ConfirmationEmailEditorProps {
  value: string;
  onChange: (html: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
}

/**
 * TipTap editor matching cortesia/lembrete/comunicado: StarterKit, underline,
 * link, text-align, color. Optional extra copy for the confirmation e-mail.
 */
export default function ConfirmationEmailEditor({
  value,
  onChange,
  onBlur,
  disabled = false,
}: ConfirmationEmailEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      UnderlineExt,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
      }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TextStyle,
      Color,
    ],
    content: value || "<p></p>",
    editable: !disabled,
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none min-h-[120px] px-3 py-2 focus:outline-none",
      },
      handleDOMEvents: {
        blur: () => {
          onBlur?.();
          return false;
        },
      },
    },
    onUpdate: ({ editor: ed }) => {
      if (!ed.isFocused) return;
      onChange(ed.getHTML());
    },
  });

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

  useLayoutEffect(() => {
    if (!editor) return;
    const next = value || "<p></p>";
    if (editor.getHTML() === next) return;
    editor.commands.setContent(next, { emitUpdate: false });
  }, [editor, value]);

  return (
    <div
      data-testid="editor-confirmation-email"
      className={cn(
        "rounded-md border border-input bg-background shadow-sm",
        "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 ring-offset-background",
        disabled && "pointer-events-none opacity-60",
      )}
    >
      <FormattingToolbar editor={editor} />
      <div className="min-h-[140px] overflow-auto rounded-b-md border-t">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
