import { Fragment, type ReactNode } from 'react';
import { DOWNLOADABLE_LANGS, parseMarkdown, type Block, type Inline } from '@/lib/assistant/markdown';

/** Renders an assistant answer. Everything is a React text node or a fixed element: no raw HTML. */
export default function AssistantMarkdown({
  text,
  onDownload,
}: {
  text: string;
  /** Called for a fenced csv/tsv/json/md/txt block's download button. */
  onDownload?: (content: string, ext: string, mime: string) => void;
}) {
  return <div className="space-y-2 break-words">{parseMarkdown(text).map((b, i) => renderBlock(b, i, onDownload))}</div>;
}

function renderInline(nodes: Inline[]): ReactNode[] {
  return nodes.map((n, i) => {
    switch (n.type) {
      case 'text':
        return <Fragment key={i}>{n.text}</Fragment>;
      case 'strong':
        return (
          <strong key={i} className="font-semibold text-slate-900">
            {renderInline(n.children)}
          </strong>
        );
      case 'em':
        return <em key={i}>{renderInline(n.children)}</em>;
      case 'code':
        return (
          <code key={i} className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.8em] text-slate-800">
            {n.text}
          </code>
        );
      case 'link':
        return (
          <a
            key={i}
            href={n.href}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-indigo-600 underline underline-offset-2 hover:text-indigo-500"
          >
            {renderInline(n.children)}
          </a>
        );
    }
  });
}

function renderBlock(
  block: Block,
  key: number,
  onDownload?: (content: string, ext: string, mime: string) => void,
): ReactNode {
  switch (block.type) {
    case 'paragraph':
      return (
        <p key={key}>
          {block.lines.map((line, i) => (
            <Fragment key={i}>
              {i > 0 && <br />}
              {renderInline(line)}
            </Fragment>
          ))}
        </p>
      );
    case 'heading':
      return (
        <p key={key} className="pt-1 font-semibold text-slate-900">
          {renderInline(block.children)}
        </p>
      );
    case 'list': {
      const items = block.items.map((item, i) => <li key={i}>{renderInline(item)}</li>);
      return block.ordered ? (
        <ol key={key} start={block.start} className="list-decimal space-y-1 pl-5">
          {items}
        </ol>
      ) : (
        <ul key={key} className="list-disc space-y-1 pl-5">
          {items}
        </ul>
      );
    }
    case 'code': {
      const download = DOWNLOADABLE_LANGS[block.lang];
      return (
        <div key={key} className="overflow-hidden rounded-md border border-slate-200 bg-slate-50">
          {(block.lang || download) && (
            <div className="flex items-center justify-between border-b border-slate-200 px-2 py-1 text-[11px] text-slate-500">
              <span className="font-mono">{block.lang}</span>
              {download && onDownload && (
                <button
                  type="button"
                  onClick={() => onDownload(block.text, download.ext, download.mime)}
                  className="rounded px-1.5 py-0.5 font-medium text-indigo-600 hover:bg-indigo-50"
                >
                  Download .{download.ext}
                </button>
              )}
            </div>
          )}
          <pre className="overflow-x-auto p-2 font-mono text-xs leading-relaxed text-slate-800">
            <code>{block.text}</code>
          </pre>
        </div>
      );
    }
    case 'table':
      return (
        <div key={key} className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                {block.header.map((cell, i) => (
                  <th key={i} className="py-1 pr-2 font-medium">
                    {renderInline(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r} className="border-b border-slate-100">
                  {row.map((cell, i) => (
                    <td key={i} className="py-1 pr-2 align-top">
                      {renderInline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'rule':
      return <hr key={key} className="border-slate-200" />;
  }
}
