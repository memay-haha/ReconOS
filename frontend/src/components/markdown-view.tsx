import type { ReactElement, ReactNode } from 'react';

import { type Block, type Inline, parseMarkdown } from '@/lib/markdown';

const HEADING_CLASS = 'font-headline-md text-headline-md text-fg';
const TEXT_CLASS = 'font-body-default text-body-default text-fg';
const CODE_INLINE =
  'rounded-sm border border-border bg-surface-2 px-1 font-body-code text-body-code text-fg';
const CODE_BLOCK =
  'max-h-96 overflow-auto whitespace-pre-wrap break-all rounded-sm border border-border bg-surface-2 p-space-sm font-body-code text-body-code text-fg';

function inlines(parts: readonly Inline[]): ReactNode[] {
  return parts.map((part, index) => {
    switch (part.kind) {
      case 'text':
        return <span key={index}>{part.text}</span>;
      case 'code':
        return (
          <code key={index} className={CODE_INLINE}>
            {part.text}
          </code>
        );
      case 'strong':
        return <strong key={index}>{inlines(part.children)}</strong>;
      case 'em':
        return <em key={index}>{inlines(part.children)}</em>;
      case 'link':
        return (
          <a
            key={index}
            href={part.href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="text-primary underline"
          >
            {inlines(part.children)}
          </a>
        );
    }
  });
}

function blocks(items: readonly Block[]): ReactNode[] {
  return items.map((block, index) => {
    switch (block.kind) {
      case 'heading': {
        const Tag = `h${Math.min(block.level + 1, 6)}` as 'h2';
        return (
          <Tag key={index} className={HEADING_CLASS}>
            {inlines(block.children)}
          </Tag>
        );
      }
      case 'paragraph':
        return (
          <p key={index} className={TEXT_CLASS}>
            {inlines(block.children)}
          </p>
        );
      case 'code':
        return (
          <pre key={index} className={CODE_BLOCK}>
            {block.text}
          </pre>
        );
      case 'list': {
        const items = block.items.map((item, n) => <li key={n}>{inlines(item)}</li>);
        return block.ordered ? (
          <ol key={index} className={`list-decimal pl-6 ${TEXT_CLASS}`}>
            {items}
          </ol>
        ) : (
          <ul key={index} className={`list-disc pl-6 ${TEXT_CLASS}`}>
            {items}
          </ul>
        );
      }
      case 'quote':
        return (
          <blockquote key={index} className="border-l-2 border-border-strong pl-space-sm">
            {blocks(block.children)}
          </blockquote>
        );
      case 'rule':
        return <hr key={index} className="border-border" />;
    }
  });
}

/** Markdown rendered as React text nodes only: no HTML from the source ever reaches the DOM.
 * Headings start one level below the page's own `h1`. */
export function MarkdownView({ source }: { readonly source: string }): ReactElement {
  return <div className="flex flex-col gap-space-sm">{blocks(parseMarkdown(source))}</div>;
}
