import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import {
  Document, HeadingLevel, Packer, Paragraph, TextRun,
} from "docx";

/** Convert our stored article HTML into a clean .docx buffer. */
export async function htmlToDocx(title: string, html: string): Promise<Buffer> {
  const $ = cheerio.load(`<body>${html}</body>`);
  const children: Paragraph[] = [
    new Paragraph({ text: title, heading: HeadingLevel.TITLE, spacing: { after: 300 } }),
  ];

  function runs(node: Element): TextRun[] {
    const out: TextRun[] = [];
    $(node)
      .contents()
      .each((_, el) => {
        if (el.type === "text") {
          out.push(new TextRun({ text: (el as unknown as { data: string }).data }));
        } else if (el.type === "tag") {
          const tag = (el as Element).name;
          const text = $(el).text();
          if (!text.trim()) return;
          out.push(
            new TextRun({
              text,
              bold: tag === "strong" || tag === "b",
              italics: tag === "em" || tag === "i",
            }),
          );
        }
      });
    return out.length ? out : [new TextRun({ text: $(node).text() })];
  }

  $("body").children().each((_, el) => {
    const tag = (el as Element).name;
    if (tag === "h1") children.push(new Paragraph({ children: runs(el), heading: HeadingLevel.HEADING_1, spacing: { before: 320, after: 160 } }));
    else if (tag === "h2") children.push(new Paragraph({ children: runs(el), heading: HeadingLevel.HEADING_2, spacing: { before: 280, after: 140 } }));
    else if (tag === "h3") children.push(new Paragraph({ children: runs(el), heading: HeadingLevel.HEADING_3, spacing: { before: 240, after: 120 } }));
    else if (tag === "li") children.push(new Paragraph({ children: runs(el), bullet: { level: 0 } }));
    else if (tag === "blockquote") children.push(new Paragraph({ children: [new TextRun({ text: $(el).text(), italics: true })], indent: { left: 480 } }));
    else if (tag === "ul" || tag === "ol") {
      $(el).find("> li").each((_, li) => {
        children.push(new Paragraph({ children: runs(li), bullet: { level: 0 } }));
      });
    } else if (tag === "p" || tag === "div" || tag === "section") {
      const text = $(el).text().trim();
      if (text) children.push(new Paragraph({ children: runs(el), spacing: { after: 160 } }));
    }
  });

  const doc = new Document({ sections: [{ children }] });
  return Buffer.from(await Packer.toBuffer(doc));
}

export function htmlToStandalonePage(title: string, html: string): string {
  return `<!doctype html>
<html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>body{font-family:Georgia,'Times New Roman',serif;max-width:680px;margin:40px auto;padding:0 20px;line-height:1.7;color:#1a1a1a}h1,h2,h3{font-family:system-ui,sans-serif;line-height:1.25}h1{font-size:1.9rem}blockquote{border-left:3px solid #ddd;margin:0;padding-left:1em;color:#555}img{max-width:100%}a{color:#0a58ca}</style>
</head><body>${html}</body></html>`;
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
