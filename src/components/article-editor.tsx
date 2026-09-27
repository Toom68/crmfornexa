"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useState } from "react";
import { saveArticleEdit } from "@/lib/actions/article";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Bold, Italic, List, ListOrdered, Heading2, Heading3, Quote, Undo, Redo,
} from "lucide-react";
import { cn } from "@/lib/utils";

export function ArticleEditor({
  articleId,
  title: initialTitle,
  contentHtml,
  editable,
}: {
  articleId: string;
  title: string;
  contentHtml: string;
  editable: boolean;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const editor = useEditor({
    extensions: [StarterKit],
    content: contentHtml,
    editable,
    immediatelyRender: false,
    onUpdate: () => setSaved(false),
    editorProps: {
      attributes: {
        class:
          "prose prose-neutral max-w-none min-h-[400px] rounded-md border bg-background px-5 py-4 text-sm focus:outline-none",
      },
    },
  });

  async function save() {
    if (!editor) return;
    setSaving(true);
    try {
      await saveArticleEdit(articleId, title, editor.getHTML(), editor.getJSON());
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  const btn = (active: boolean) =>
    cn("rounded p-1.5 hover:bg-muted", active && "bg-muted text-foreground");

  return (
    <div className="space-y-3">
      <Input
        value={title}
        onChange={(e) => { setTitle(e.target.value); setSaved(false); }}
        className="text-base font-medium"
        disabled={!editable}
      />
      {editable && editor && (
        <div className="flex items-center gap-0.5 rounded-md border bg-muted/40 p-1">
          <button type="button" className={btn(editor.isActive("bold"))} onClick={() => editor.chain().focus().toggleBold().run()}><Bold className="h-4 w-4" /></button>
          <button type="button" className={btn(editor.isActive("italic"))} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic className="h-4 w-4" /></button>
          <button type="button" className={btn(editor.isActive("heading", { level: 2 }))} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 className="h-4 w-4" /></button>
          <button type="button" className={btn(editor.isActive("heading", { level: 3 }))} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}><Heading3 className="h-4 w-4" /></button>
          <button type="button" className={btn(editor.isActive("bulletList"))} onClick={() => editor.chain().focus().toggleBulletList().run()}><List className="h-4 w-4" /></button>
          <button type="button" className={btn(editor.isActive("orderedList"))} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered className="h-4 w-4" /></button>
          <button type="button" className={btn(editor.isActive("blockquote"))} onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote className="h-4 w-4" /></button>
          <span className="mx-1 h-4 w-px bg-border" />
          <button type="button" className={btn(false)} onClick={() => editor.chain().focus().undo().run()}><Undo className="h-4 w-4" /></button>
          <button type="button" className={btn(false)} onClick={() => editor.chain().focus().redo().run()}><Redo className="h-4 w-4" /></button>
        </div>
      )}
      <EditorContent editor={editor} />
      {editable && (
        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save new version"}</Button>
          {saved && <span className="text-sm text-green-600">Saved as a new version</span>}
          <span className="text-xs text-muted-foreground">Edits are saved as new versions — AI output never overwrites your work.</span>
        </div>
      )}
    </div>
  );
}
