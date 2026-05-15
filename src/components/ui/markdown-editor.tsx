"use client";

import * as React from "react";
import {
  Bold,
  Code,
  Eye,
  Italic,
  Link2,
  List,
  ListOrdered,
  Pencil,
  Quote,
  SplitSquareHorizontal,
} from "lucide-react";
import { Button } from "@root/components/ui/button";
import { Textarea } from "@root/components/ui/textarea";
import { Markdown } from "@root/components/ui/markdown";
import { cn } from "@root/lib/utils";
import { Tabs, TabsList, TabsTrigger } from "@root/components/ui/tabs";

/**
 * Markdown editor with split preview.
 *
 * Three view modes:
 *   • Write     — full-width source editor
 *   • Preview   — full-width rendered output
 *   • Split     — side-by-side
 *
 * The toolbar wraps the current text-area selection in markdown syntax.
 * Selection-preserving wraps make heavy use of the textarea's
 * `selectionStart` / `selectionEnd` so undo history stays clean.
 */
export interface MarkdownEditorProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
  /** Initial view: "write" (default) | "preview" | "split". */
  defaultView?: ViewMode;
}

type ViewMode = "write" | "preview" | "split";

export function MarkdownEditor({
  value,
  onChange,
  placeholder = "Write your notification… markdown supported",
  rows = 10,
  className,
  defaultView = "write",
}: MarkdownEditorProps) {
  const [view, setView] = React.useState<ViewMode>(defaultView);
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);

  function wrapSelection(prefix: string, suffix = prefix, placeholderText = "") {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const selected = value.slice(start, end) || placeholderText;
    const next = value.slice(0, start) + prefix + selected + suffix + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      const cursor = start + prefix.length + selected.length;
      el.setSelectionRange(cursor, cursor);
    });
  }

  function prefixLines(prefix: string) {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const before = value.slice(0, start);
    const sel = value.slice(start, end) || "item";
    const after = value.slice(end);
    const lines = sel.split("\n");
    const prefixed = lines.map((line) => `${prefix}${line}`).join("\n");
    onChange(before + prefixed + after);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start, start + prefixed.length);
    });
  }

  function insertLink() {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const sel = value.slice(start, end) || "link text";
    const url = window.prompt("URL", "https://");
    if (!url) return;
    const inserted = `[${sel}](${url})`;
    onChange(value.slice(0, start) + inserted + value.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + inserted.length, start + inserted.length);
    });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    const isMod = e.metaKey || e.ctrlKey;
    if (!isMod) return;
    if (e.key === "b") {
      e.preventDefault();
      wrapSelection("**", "**", "bold");
    } else if (e.key === "i") {
      e.preventDefault();
      wrapSelection("_", "_", "italic");
    } else if (e.key === "k") {
      e.preventDefault();
      insertLink();
    }
  }

  return (
    <div className={cn("flex flex-col gap-2 rounded-md border bg-card", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b p-2">
        <div className="flex flex-wrap items-center gap-0.5">
          <ToolButton onClick={() => wrapSelection("**", "**", "bold")} title="Bold (⌘B)">
            <Bold className="size-3.5" />
          </ToolButton>
          <ToolButton onClick={() => wrapSelection("_", "_", "italic")} title="Italic (⌘I)">
            <Italic className="size-3.5" />
          </ToolButton>
          <ToolButton onClick={() => insertLink()} title="Link (⌘K)">
            <Link2 className="size-3.5" />
          </ToolButton>
          <ToolButton onClick={() => wrapSelection("`", "`", "code")} title="Inline code">
            <Code className="size-3.5" />
          </ToolButton>
          <Divider />
          <ToolButton onClick={() => prefixLines("- ")} title="Bulleted list">
            <List className="size-3.5" />
          </ToolButton>
          <ToolButton onClick={() => prefixLines("1. ")} title="Numbered list">
            <ListOrdered className="size-3.5" />
          </ToolButton>
          <ToolButton onClick={() => prefixLines("> ")} title="Quote">
            <Quote className="size-3.5" />
          </ToolButton>
          <Divider />
          <ToolButton onClick={() => prefixLines("# ")} title="Heading 1">
            <span className="text-[10px] font-bold">H1</span>
          </ToolButton>
          <ToolButton onClick={() => prefixLines("## ")} title="Heading 2">
            <span className="text-[10px] font-bold">H2</span>
          </ToolButton>
        </div>
        <Tabs value={view} onValueChange={(v) => setView(v as ViewMode)}>
          <TabsList>
            <TabsTrigger value="write" className="text-xs">
              <Pencil className="size-3" /> Write
            </TabsTrigger>
            <TabsTrigger value="split" className="text-xs">
              <SplitSquareHorizontal className="size-3" /> Split
            </TabsTrigger>
            <TabsTrigger value="preview" className="text-xs">
              <Eye className="size-3" /> Preview
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div
        className={cn(
          "grid gap-0",
          view === "split" ? "md:grid-cols-2" : "grid-cols-1",
        )}
      >
        {view !== "preview" ? (
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            rows={rows}
            className={cn(
              "border-0 rounded-none font-mono text-sm leading-relaxed shadow-none focus-visible:ring-0 resize-none",
              view === "split" && "md:border-r",
            )}
          />
        ) : null}
        {view !== "write" ? (
          <div
            className={cn(
              "min-h-[10rem] overflow-auto p-4",
              view === "preview" ? "" : "border-t md:border-t-0",
            )}
          >
            {value.trim() ? (
              <Markdown source={value} />
            ) : (
              <p className="text-xs text-muted-foreground">Nothing to preview yet.</p>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ToolButton({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-7"
      onClick={onClick}
      title={title}
      aria-label={title}
    >
      {children}
    </Button>
  );
}

function Divider() {
  return <span className="mx-1 h-4 w-px bg-border" />;
}
