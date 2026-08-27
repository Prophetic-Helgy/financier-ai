import React from "react";
import ReactMarkdown from 'react-markdown';
import { cn } from "../lib/utils";

interface PresentationViewProps {
  markdown: string;
}

export function PresentationView({ markdown }: PresentationViewProps) {
  // Parse markdown by '---' to create distinct slide cards
  const slideContents = markdown.split('---').map(s => s.trim()).filter(s => s.length > 0);

  return (
    <div className="flex-1 overflow-y-auto bg-[var(--bg)] p-4 sm:p-8 space-y-16 pb-24 scroll-smooth">
      <div className="max-w-4xl mx-auto space-y-16">
        {slideContents.map((slideMarkdown, idx) => (
          <div 
            key={idx} 
            className={cn(
               "relative rounded-3xl overflow-hidden min-h-[40vh] flex flex-col justify-center p-8 sm:p-16 transition-all duration-500",
               idx === 0 
                 ? "bg-gradient-to-br from-indigo-900/40 via-[var(--surface-inner)] to-[var(--surface)] border border-indigo-500/20 shadow-[0_0_50px_rgba(99,102,241,0.1)]"
                 : "bg-[var(--surface)] border border-[var(--border)] shadow-xl shadow-black/5"
            )}
          >
            {/* Gamma-like decorative glow */}
            {idx === 0 && (
               <div className="absolute top-0 right-0 -mt-20 -mr-20 w-64 h-64 bg-indigo-500/20 blur-3xl rounded-full pointer-events-none" />
            )}
            
            <div className={cn(
              "markdown-body prose dark:prose-invert max-w-none w-full",
              // Gamma-like large typography for slides
              "prose-h1:text-4xl sm:prose-h1:text-6xl prose-h1:font-bold prose-h1:tracking-tight prose-h1:mb-6",
              "prose-h2:text-2xl sm:prose-h2:text-3xl prose-h2:font-semibold prose-h2:mt-2 prose-h2:text-[var(--text-muted)]",
              "prose-p:text-lg sm:prose-p:text-xl prose-p:leading-relaxed prose-p:text-[var(--text-muted)]",
              "prose-li:text-lg prose-ul:my-6 prose-li:my-2",
              "prose-blockquote:border-l-4 prose-blockquote:border-indigo-500 prose-blockquote:bg-indigo-500/5 prose-blockquote:p-4 prose-blockquote:rounded-r-lg prose-blockquote:not-italic prose-blockquote:text-lg"
            )}>
              <ReactMarkdown>{slideMarkdown}</ReactMarkdown>
            </div>

            {/* Slide number */}
            <div className="absolute bottom-6 right-8 text-xs font-mono text-[var(--text-muted)] opacity-50">
               {idx + 1} / {slideContents.length}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
