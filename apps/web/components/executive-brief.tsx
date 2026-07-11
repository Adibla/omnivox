"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type ExecutiveBriefProps = {
  markdown: string;
};

function safeHref(href: string | undefined): string | undefined {
  if (!href) {
    return undefined;
  }
  const t = href.trim();
  if (/^https?:\/\//i.test(t)) {
    return t;
  }
  return undefined;
}

export function ExecutiveBrief({ markdown }: ExecutiveBriefProps) {
  return (
    <div className="ui-panel-quiet bg-card p-5">
      <div className="prose prose-sm max-w-none prose-slate prose-headings:font-sans prose-headings:text-foreground prose-p:text-foreground/90 prose-a:text-primary prose-strong:text-foreground prose-li:my-2 prose-li:text-foreground/90 prose-li:marker:text-primary/80 dark:prose-invert">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            a: ({ href, children }) => {
              const s = safeHref(href);
              if (!s) {
                return <span>{children}</span>;
              }
              return (
                <a href={s} target="_blank" rel="noopener noreferrer">
                  {children}
                </a>
              );
            },
          }}
        >
          {markdown}
        </ReactMarkdown>
      </div>
    </div>
  );
}
