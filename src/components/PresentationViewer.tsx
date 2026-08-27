import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { ChevronLeft, ChevronRight, Presentation as PresentationIcon } from 'lucide-react';
import { cn } from '../lib/utils';

interface PresentationViewerProps {
  markdown: string;
}

export function PresentationViewer({ markdown }: PresentationViewerProps) {
  const slides = markdown.split('---').map(s => s.trim()).filter(s => s.length > 0);
  const [currentSlide, setCurrentSlide] = useState(0);

  if (slides.length === 0) {
     return <div className="p-8 text-center text-[var(--text-muted)]">Нет данных для презентации</div>;
  }

  const handleNext = () => {
    if (currentSlide < slides.length - 1) setCurrentSlide(prev => prev + 1);
  };

  const handlePrev = () => {
    if (currentSlide > 0) setCurrentSlide(prev => prev - 1);
  };

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-xl overflow-hidden flex flex-col h-[550px]">
       {/* Top Bar */}
       <div className="bg-[var(--surface-inner)] border-b border-[var(--border)] px-4 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-2 text-[var(--text-muted)]">
             <PresentationIcon className="w-5 h-5" />
             <span className="text-sm font-medium">Отчет для руководства</span>
          </div>
          <div className="text-sm font-mono text-[var(--text-muted)]">
             Слайд {currentSlide + 1} из {slides.length}
          </div>
       </div>

       {/* Slide Content */}
       <div className="flex-1 overflow-y-auto p-10 flex items-center justify-center relative">
          <div className="max-w-3xl w-full mx-auto">
             <div className={cn(
                 "prose dark:prose-invert prose-lg max-w-none slide-content",
                 "prose-h1:text-4xl prose-h1:font-light prose-h1:mb-2 prose-h1:text-indigo-500",
                 "prose-h2:text-xl prose-h2:text-[var(--text-muted)] prose-h2:font-medium prose-h2:uppercase prose-h2:tracking-wide prose-h2:mb-8",
                 "prose-p:text-lg prose-p:leading-relaxed prose-p:text-[var(--fg)]",
                 "prose-ul:text-lg prose-ul:my-6",
                 "prose-li:my-2 prose-strong:text-[var(--fg)]",
                 "prose-blockquote:border-l-4 prose-blockquote:border-indigo-500 prose-blockquote:bg-[var(--surface-inner)] prose-blockquote:py-2 prose-blockquote:px-4 prose-blockquote:rounded-r-lg prose-blockquote:text-indigo-400 prose-blockquote:not-italic"
             )}>
                <ReactMarkdown>{slides[currentSlide]}</ReactMarkdown>
             </div>
          </div>
       </div>

       {/* Controls */}
       <div className="bg-[var(--surface-inner)] border-t border-[var(--border)] px-4 py-4 flex items-center justify-between">
          <button 
             onClick={handlePrev} 
             disabled={currentSlide === 0}
             className="px-4 py-2 flex items-center rounded-lg hover:bg-[var(--bg)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium text-[var(--fg)]"
          >
             <ChevronLeft className="w-4 h-4 mr-1" /> Назад
          </button>
          
          <div className="flex space-x-1">
             {slides.map((_, idx) => (
                <div 
                   key={idx} 
                   className={cn("h-1.5 rounded-full transition-all", idx === currentSlide ? "w-8 bg-indigo-500" : "w-1.5 bg-[var(--border)]")}
                />
             ))}
          </div>

          <button 
             onClick={handleNext} 
             disabled={currentSlide === slides.length - 1}
             className="px-4 py-2 flex items-center rounded-lg hover:bg-[var(--bg)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium text-[var(--fg)]"
          >
             Вперед <ChevronRight className="w-4 h-4 ml-1" />
          </button>
       </div>
    </div>
  );
}
