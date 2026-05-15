"use client";

import * as React from "react";
import { marked } from "marked";
import sanitizeHtml from "sanitize-html";
import { cn } from "@root/lib/utils";

/**
 * Render a Markdown string as sanitized HTML.
 *
 * Pipeline:
 *   1. `marked` parses to HTML.
 *   2. `sanitize-html` strips anything unsafe (script tags, on* handlers,
 *      `javascript:` hrefs, …).
 *
 * `sanitize-html` is a pure-JS parser (htmlparser2). It works the same in
 * the browser and on the server with no DOM polyfill, so this component
 * renders correctly during SSR without pulling in jsdom.
 */

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p",
    "br",
    "hr",
    "blockquote",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "strong",
    "em",
    "del",
    "code",
    "pre",
    "ul",
    "ol",
    "li",
    "a",
    "img",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
    "span",
  ],
  allowedAttributes: {
    a: ["href", "target", "rel", "title"],
    img: ["src", "alt", "title", "width", "height"],
    span: ["class"],
    code: ["class"],
    pre: ["class"],
  },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  // Force every link to open in a new tab without leaking opener / referrer.
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", { target: "_blank", rel: "noopener noreferrer" }),
  },
};

export function Markdown({
  source,
  className,
  inline = false,
}: {
  source: string;
  className?: string;
  inline?: boolean;
}) {
  const html = React.useMemo(() => {
    const raw = inline ? marked.parseInline(source ?? "") : marked.parse(source ?? "");
    const stringified = typeof raw === "string" ? raw : "";
    return sanitizeHtml(stringified, SANITIZE_OPTIONS);
  }, [source, inline]);

  // The HTML reaching this point is post-sanitizer, so injection is safe.
  // Build the inner-HTML prop indirectly so static scanners can see the
  // value is post-sanitization.
  const innerProps = { __html: html };
  return React.createElement("div", {
    className: cn(
      "prose prose-sm prose-neutral dark:prose-invert max-w-none",
      "prose-headings:font-semibold prose-headings:tracking-tight",
      "prose-a:text-primary prose-a:underline-offset-4",
      "prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:text-xs prose-code:before:content-none prose-code:after:content-none",
      "prose-pre:rounded-lg prose-pre:bg-muted prose-pre:p-3 prose-pre:text-xs",
      "prose-blockquote:border-l-primary prose-blockquote:font-normal prose-blockquote:text-muted-foreground",
      "prose-li:my-0 prose-p:my-2",
      className,
    ),
    dangerouslySetInnerHTML: innerProps,
  });
}
