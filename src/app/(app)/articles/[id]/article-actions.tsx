"use client";

import { useState } from "react";
import { ensurePrivateLink } from "@/lib/actions/article";
import { Button } from "@/components/ui/button";
import { Link2, Copy, Check } from "lucide-react";

export function NewLinkButton({ articleId, disabled }: { articleId: string; disabled?: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant="secondary"
        disabled={disabled || busy}
        onClick={async () => {
          setBusy(true);
          try {
            setUrl(await ensurePrivateLink(articleId));
          } finally {
            setBusy(false);
          }
        }}
      >
        <Link2 className="mr-1.5 h-3.5 w-3.5" />New link
      </Button>
      {url && <CopyButton text={url} />}
    </div>
  );
}

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      title={text}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </Button>
  );
}
