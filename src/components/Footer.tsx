import React, { useEffect, useState } from "react";
import { fetchMacroEconomics, MacroEconomics, NumericData } from "../lib/cbrService";
import { ArrowUpRight, ArrowDownRight, ArrowRight } from "lucide-react";

const getTrendIcon = (trend: 'up' | 'down' | 'flat') => {
  if (trend === 'up') return <ArrowUpRight className="inline w-3 h-3 text-emerald-500 ml-0.5" />;
  if (trend === 'down') return <ArrowDownRight className="inline w-3 h-3 text-rose-500 ml-0.5" />;
  return <ArrowRight className="inline w-3 h-3 text-slate-500 ml-0.5" />; // flat
};

const TickerItem = ({ label, data, format = 'n', prefix = '', postfix = '', href }: { label: string, data?: NumericData, format?: 'n' | 'c' | 'p', prefix?: string, postfix?: string, href?: string }) => {
  if (!data) return null;
  let valStr = '';
  if (format === 'n') {
     valStr = data.value.toLocaleString('en-US', {maximumFractionDigits: 0});
  } else if (format === 'c') {
     valStr = data.value.toFixed(2);
  } else if (format === 'p') {
     valStr = data.value.toFixed(4);
  }

  const content = (
    <span className="flex items-center whitespace-nowrap cursor-pointer hover:underline underline-offset-4">
      {label} {prefix}{valStr}{postfix} {getTrendIcon(data.trend)}
    </span>
  );

  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="hover:opacity-80 transition-opacity">
        {content}
      </a>
    );
  }
  return content;
};

export function Footer() {
  const [macro, setMacro] = useState<MacroEconomics | null>(null);

  useEffect(() => {
    fetchMacroEconomics().then(setMacro);
  }, []);

  const TickerContent = () => (
    <>
      {/* Crypto */}
      <span className="text-orange-500 font-medium flex items-center">
        <TickerItem label="BTC" data={macro?.cryptoRates?.BTC} prefix="$" href="https://www.binance.com/en/trade/BTC_USDT" />
      </span>
      <span className="text-violet-500 font-medium flex items-center">
        <TickerItem label="ETH" data={macro?.cryptoRates?.ETH} prefix="$" href="https://www.binance.com/en/trade/ETH_USDT" />
      </span>
      
      {/* Major Fiat */}
      <TickerItem label="$" data={macro?.currencyRates?.USD} format="c" postfix="₽" href="https://cbr.ru/currency_base/daily/" />
      <TickerItem label="€" data={macro?.currencyRates?.EUR} format="c" postfix="₽" href="https://cbr.ru/currency_base/daily/" />
      <TickerItem label="¥" data={macro?.currencyRates?.CNY} format="c" postfix="₽" href="https://cbr.ru/currency_base/daily/" />
      <TickerItem label="₣" data={macro?.currencyRates?.CHF} format="c" postfix="₽" href="https://cbr.ru/currency_base/daily/" />
      <TickerItem label="¥(JPY)" data={macro?.currencyRates?.JPY} format="p" postfix="₽" href="https://cbr.ru/currency_base/daily/" />
      
      {/* Regional Fiat */}
      <TickerItem label="₺" data={macro?.currencyRates?.TRY} format="c" postfix="₽" href="https://cbr.ru/currency_base/daily/" />
      <TickerItem label="₸" data={macro?.currencyRates?.KZT} format="p" postfix="₽" href="https://cbr.ru/currency_base/daily/" />
      <TickerItem label="د.إ" data={macro?.currencyRates?.AED} format="c" postfix="₽" href="https://cbr.ru/currency_base/daily/" />
      <TickerItem label="฿" data={macro?.currencyRates?.THB} format="c" postfix="₽" href="https://cbr.ru/currency_base/daily/" />
      <TickerItem label="₫" data={macro?.currencyRates?.VND} format="p" postfix="₽" href="https://cbr.ru/currency_base/daily/" />

      {/* Indices */}
      <span className="text-sky-500 border-l border-[var(--border)] pl-6 flex items-center space-x-6">
        <TickerItem label="S&P500:" data={macro?.indices?.S_AND_P_500} href="https://finance.yahoo.com/quote/^GSPC" />
        <TickerItem label="DJI:" data={macro?.indices?.DOW_JONES} href="https://finance.yahoo.com/quote/^DJI" />
        <TickerItem label="RUT:" data={macro?.indices?.RUSSELL_2000} href="https://finance.yahoo.com/quote/^RUT" />
        <TickerItem label="N225:" data={macro?.indices?.NIKKEI_225} href="https://finance.yahoo.com/quote/^N225" />
      </span>

      {/* Economy */}
      <span className="ml-6 pl-6 border-l border-[var(--border)] text-rose-500 font-medium tracking-widest flex items-center space-x-6">
        <TickerItem label="ИНФЛЯЦИЯ:" data={macro?.inflationRate} format="c" postfix="%" href="https://cbr.ru/hd_base/infl/" />
        <span className="text-amber-500">
          <TickerItem label="КЛЮЧЕВАЯ СТАВКА ЦБ:" data={macro?.keyRate} format="c" postfix="%" href="https://cbr.ru/hd_base/KeyRate/" />
        </span>
      </span>
    </>
  );

  return (
    <footer className="bg-[var(--surface-inner)] border-t border-[var(--border)] py-2 flex items-center text-[10px] text-[var(--text-muted)] font-mono z-50 overflow-hidden relative h-8 flex-shrink-0">
      <div className="flex items-center px-4 bg-[var(--surface-inner)] z-10 whitespace-nowrap h-full">
        <span className="w-2 h-2 flex-shrink-0 rounded-full bg-emerald-500 mr-2 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>
        <span className="hidden sm:inline">Связь: OK</span>
      </div>
      
      <div className="flex-1 overflow-hidden relative h-full flex items-center border-l border-[var(--border)] ml-2 shadow-[inset_10px_0_10px_-10px_rgba(0,0,0,0.5)] pointer-events-auto">
        {macro ? (
          <div className="flex animate-[ticker_60s_linear_infinite] whitespace-nowrap hover:[animation-play-state:paused]">
            <div className="flex items-center space-x-6 text-[var(--text-muted)] px-6">
               <TickerContent />
            </div>
            
            {/* Duplicate for seamless scrolling loop */}
            <div className="flex items-center space-x-6 text-[var(--text-muted)] px-6" aria-hidden="true">
               <TickerContent />
            </div>
          </div>
        ) : (
          <div className="flex items-center text-[var(--text-muted)] px-4">Синхронизация с биржами...</div>
        )}
      </div>

      <style>{`
        @keyframes ticker {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </footer>
  );
}
