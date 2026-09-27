"use client";

import { useState } from "react";

export function CopyArticleButton({ html }: { html: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        // Copy rich text so it pastes with formatting into Word/Docs/CMS.
        const blobHtml = new Blob([html], { type: "text/html" });
        const blobText = new Blob([html.replace(/<[^>]*>/g, " ")], { type: "text/plain" });
        await navigator.clipboard.write([new ClipboardItem({ "text/html": blobHtml, "text/plain": blobText })]);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="rounded-md border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-100"
    >
      {copied ? "Copied!" : "Copy formatted text"}
    </button>
  );
}
