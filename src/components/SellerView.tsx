import React, { useMemo, useState } from 'react';
import { Store, RotateCcw } from 'lucide-react';
import { cn } from '../lib/utils';
import type { ParsedDocument } from '../lib/parsers/bankParsers';
import {
  calculateCostPrice,
  calculateSalePrice,
  calculateUnitEconomics,
  calculateBreakEven,
  calculateAdROI,
  calculateDiscountImpact,
} from '../lib/sellerCalculators';
import { generateSellerAnalytics } from '../lib/marketplaceAnalytics';

interface SellerViewProps {
  document: ParsedDocument | null;
}

function fmt(v: number): string {
  if (!Number.isFinite(v)) return '—';
  return v.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
}

// ==================== ФОРМА ====================

interface FieldDef { key: string; label: string; suffix: string; }

const COST_FIELDS: FieldDef[] = [
  { key: 'закупка', label: 'Закупочная цена', suffix: '₽' },
  { key: 'логистикаПостав', label: 'Логистика до поставщика', suffix: '₽' },
  { key: 'упаковка', label: 'Упаковка', suffix: '₽' },
  { key: 'таможня', label: 'Таможня', suffix: '%' },
  { key: 'складПостав', label: 'Хранение на складе поставщика', suffix: '%' },
];

const FEE_FIELDS: FieldDef[] = [
  { key: 'комиссияМП', label: 'Комиссия маркетплейса', suffix: '%' },
  { key: 'логистикаМП', label: 'Логистика МП', suffix: '₽' },
  { key: 'оплатаПрож', label: 'Оплата за прож.', suffix: '%' },
  { key: 'возвраты', label: 'Возвраты на ед.', suffix: '₽' },
  { key: 'складМП', label: 'Хранение на МП', suffix: '%' },
  { key: 'штрафы', label: 'Штрафы на ед.', suffix: '₽' },
  { key: 'ставкаРекламы', label: 'Реклама (% от цены)', suffix: '%' },
  { key: 'целеваяМаржа', label: 'Целевая маржа (на себестоимость)', suffix: '%' },
];

const EXTRA_FIELDS: FieldDef[] = [
  { key: 'возвратыПроцент', label: 'Ожидаемые возвраты', suffix: '%' },
  { key: 'стоимостьВозврата', label: 'Стоимость обработки возврата', suffix: '₽' },
  { key: 'фиксированныеРасходы', label: 'Фикс. расходы / месяц', suffix: '₽' },
  { key: 'рекламаБюджет', label: 'Бюджет рекламы / месяц', suffix: '₽' },
  { key: 'cpc', label: 'Стоимость клика (CPC)', suffix: '₽' },
  { key: 'cvr', label: 'Конверсия клик → заказ', suffix: '%' },
  { key: 'скидки', label: 'Скидка / акция', suffix: '%' },
];

// Пример селлера WB (заполнен по умолчанию — редактируется)
const INITIAL: Record<string, string> = {
  закупка: '1500', логистикаПостав: '200', упаковка: '50', таможня: '5', складПостав: '2',
  комиссияМП: '15', логистикаМП: '120', оплатаПрож: '5', возвраты: '80', складМП: '2', штрафы: '0',
  ставкаРекламы: '10', целеваяМаржа: '30',
  возвратыПроцент: '5', стоимостьВозврата: '100', фиксированныеРасходы: '50000',
  рекламаБюджет: '30000', cpc: '15', cvr: '5',
  скидки: '20',
};

function NumField({ def, value, onChange }: { def: FieldDef; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center justify-between gap-2 text-[11px]">
      <span className="text-[var(--text-muted)] truncate" title={def.label}>{def.label}</span>
      <span className="flex items-center gap-1 shrink-0">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-24 bg-[var(--bg)] border border-[var(--border)] rounded-md px-2 py-1 text-[11px] text-right font-mono text-[var(--fg)] outline-none focus:border-violet-500 transition-colors"
        />
        <span className="text-[var(--text-muted)] w-3 text-right">{def.suffix}</span>
      </span>
    </label>
  );
}

function FieldGroup({ title, fields, f, setF }: {
  title: string;
  fields: FieldDef[];
  f: Record<string, string>;
  setF: (k: string, v: string) => void;
}) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">{title}</div>
      <div className="space-y-1.5">
        {fields.map(fd => <NumField key={fd.key} def={fd} value={f[fd.key]} onChange={(v) => setF(fd.key, v)} />)}
      </div>
    </div>
  );
}

// ==================== РЕЗУЛЬТАТЫ ====================

function StatCard({ label, value, tone }: { label: string; value: string; tone?: 'emerald' | 'rose' | 'violet' }) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3">
      <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">{label}</div>
      <div className={cn(
        "font-mono font-medium text-lg",
        tone === 'emerald' ? 'text-emerald-500' : tone === 'rose' ? 'text-rose-500' : tone === 'violet' ? 'text-violet-500' : 'text-[var(--fg)]'
      )}>{value}</div>
    </div>
  );
}

function Row({ label, value, bold, tone }: { label: string; value: string; bold?: boolean; tone?: 'emerald' | 'rose' }) {
  return (
    <div className={cn("flex justify-between gap-3 text-xs py-1.5 border-b border-[var(--border)] last:border-0", bold && "font-semibold")}>
      <span className={cn(bold ? "text-[var(--fg)]" : "text-[var(--text-muted)]")}>{label}</span>
      <span className={cn(
        "font-mono text-right whitespace-nowrap",
        tone === 'emerald' ? 'text-emerald-500' : tone === 'rose' ? 'text-rose-500' : bold ? 'text-[var(--fg)]' : 'text-[var(--fg)]/80'
      )}>{value}</span>
    </div>
  );
}

function Card({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden", className)}>
      <div className="px-4 py-2.5 border-b border-[var(--border)] bg-[var(--surface-inner)]/50">
        <h3 className="font-semibold text-sm text-[var(--fg)]">{title}</h3>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

const BE_MULTIPLIERS = ['0.8×', '0.9×', '1.0×', '1.1×', '1.2×', '1.3×', '1.4×', '1.5×'];

// ==================== ВКЛАДКА ====================

/**
 * Вкладка «Селлер» (профиль маркетплейсов):
 * unit-экономика, калькулятор цены, точка безубыточности, ROI рекламы, влияние скидок.
 * Расчёты — синхронные, пересчитываются при каждом изменении поля.
 * При загруженных выписках — аналитика по маркетплейсам (marketplaceAnalytics).
 */
export function SellerView({ document }: SellerViewProps) {
  const [f, setFState] = useState<Record<string, string>>(INITIAL);
  const setF = (k: string, v: string) => setFState(prev => ({ ...prev, [k]: v }));
  const n = (k: string) => { const v = parseFloat(f[k].replace(',', '.')); return Number.isFinite(v) ? v : 0; };

  const calc = useMemo(() => {
    const cost = calculateCostPrice({
      закупочнаяЦена: n('закупка'),
      логистикаПоставщику: n('логистикаПостав'),
      упаковка: n('упаковка'),
      таможня: n('таможня'),
      хранилище: n('складПостав'),
    });

    const sale = calculateSalePrice(
      cost.итогоСебестоимость,
      {
        комиссияМП: n('комиссияМП'),
        логистикаМП: n('логистикаМП'),
        оплатаПрож: n('оплатаПрож'),
        возвраты: n('возвраты'),
        хранилищеМП: n('складМП'),
        реклама: 0,
        штрафы: n('штрафы'),
      },
      {
        целеваяМаржа: n('целеваяМаржа'),
        скидки: 0,
        акции: 0,
        ставкаРекламы: n('ставкаРекламы'),
      }
    );

    const ok = sale.продажнаяЦена > 0;
    const переменныеДоли = n('комиссияМП') + n('оплатаПрож') + n('складМП') + n('ставкаРекламы');

    const unit = ok ? calculateUnitEconomics({
      продажнаяЦена: sale.продажнаяЦена,
      себестоимость: cost.итогоСебестоимость,
      комиссияМП: n('комиссияМП'),
      логистикаМП: n('логистикаМП'),
      рекламаНаЕдиницу: sale.реклама,
      возвратыПроцент: n('возвратыПроцент') / 100,
      стоимостьВозврата: n('стоимостьВозврата'),
    }) : null;

    const be = ok ? calculateBreakEven({
      фиксированныеРасходы: n('фиксированныеРасходы'),
      ценаЕдиницы: sale.продажнаяЦена,
      переменныеРасходыНаЕдиницу: cost.итогоСебестоимость + n('логистикаМП') + sale.комиссияМП + sale.реклама,
    }) : null;

    const roi = ok ? calculateAdROI({
      бюджетНаРекламу: n('рекламаБюджет'),
      стоимостьКлика: n('cpc'),
      конверсияВЗаказ: n('cvr'),
      среднийЧек: sale.продажнаяЦена,
      маржинальность: sale.рентабельность,
    }) : null;

    const disc = ok ? calculateDiscountImpact({
      текущаяЦена: sale.продажнаяЦена,
      себестоимость: cost.итогоСебестоимость,
      скидкиПроцент: n('скидки'),
      ростОбъема: 0,
    }) : null;

    return { cost, sale, ok, переменныеДоли, unit, be, roi, disc };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f]);

  const analytics = useMemo(() => {
    if (!document || !document.transactions || document.transactions.length === 0) return null;
    return generateSellerAnalytics(document);
  }, [document]);

  const profitTone = calc.sale.прибыль >= 0 ? 'emerald' as const : 'rose' as const;

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-xl font-semibold text-[var(--fg)] flex items-center gap-2">
            <Store className="w-5 h-5 text-violet-500" /> Селлер
          </h2>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Unit-экономика, калькулятор цены, безубыточность, ROI рекламы и влияние скидок.
            Расчёт обновляется при каждом изменении поля.
          </p>
        </div>

        <div className="grid lg:grid-cols-[340px_1fr] gap-4 items-start">
          {/* Form */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden lg:sticky lg:top-0">
            <div className="px-4 py-2.5 border-b border-[var(--border)] bg-[var(--surface-inner)]/50 flex items-center justify-between">
              <h3 className="font-semibold text-sm text-[var(--fg)]">Вводные данные</h3>
              <button
                onClick={() => setFState(INITIAL)}
                className="flex items-center gap-1 text-[10px] text-[var(--text-muted)] hover:text-[var(--fg)] transition-colors"
                title="Вернуть пример значений"
              >
                <RotateCcw className="w-3 h-3" /> Пример
              </button>
            </div>
            <div className="p-4 space-y-4">
              <FieldGroup title="Себестоимость товара" fields={COST_FIELDS} f={f} setF={setF} />
              <div className="border-t border-[var(--border)]" />
              <FieldGroup title="Маркетплейс (WB / Ozon)" fields={FEE_FIELDS} f={f} setF={setF} />
              <div className="border-t border-[var(--border)]" />
              <FieldGroup title="Возвраты, расходы, реклама, скидки" fields={EXTRA_FIELDS} f={f} setF={setF} />
            </div>
          </div>

          {/* Results */}
          <div className="space-y-4 min-w-0">
            {!calc.ok && (
              <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3 text-xs text-rose-400">
                Переменные доли (комиссия + оплата прож. + хранение + реклама) = {fmt(calc.переменныеДоли)}% ≥ 100% —
                цена при таком раскладе не сходится. Уменьшите доли.
              </div>
            )}

            {/* Stat cards */}
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
              <StatCard label="Продажная цена" value={calc.ok ? fmt(calc.sale.продажнаяЦена) + ' ₽' : '—'} tone="violet" />
              <StatCard label="Себестоимость" value={fmt(calc.cost.итогоСебестоимость) + ' ₽'} />
              <StatCard
                label="Прибыль на ед."
                value={calc.ok ? (calc.sale.прибыль >= 0 ? '+' : '') + fmt(calc.sale.прибыль) + ' ₽' : '—'}
                tone={profitTone}
              />
              <StatCard label="Рентабельность" value={calc.ok ? fmt(calc.sale.рентабельность) + ' %' : '—'} tone={profitTone} />
            </div>

            {/* Price breakdown */}
            <Card title="Цена: из чего складывается">
              <Row label="Себестоимость товара" value={fmt(calc.sale.себестоимость) + ' ₽'} />
              <Row label={`Комиссия МП (${n('комиссияМП')}%)`} value={fmt(calc.sale.комиссияМП) + ' ₽'} />
              <Row label="Логистика МП" value={fmt(calc.sale.логистикаМП) + ' ₽'} />
              <Row label={`Оплата за прож. (${n('оплатаПрож')}%)`} value={fmt(calc.sale.оплатаПрож) + ' ₽'} />
              <Row label={`Хранение на МП (${n('складМП')}%)`} value={fmt(calc.sale.хранениеМП) + ' ₽'} />
              <Row label={`Реклама (${n('ставкаРекламы')}%)`} value={fmt(calc.sale.реклама) + ' ₽'} />
              <Row label="Возвраты на ед." value={fmt(calc.sale.возвраты) + ' ₽'} />
              <Row label="Штрафы на ед." value={fmt(calc.sale.штрафы) + ' ₽'} />
              <Row label="Итого расходы на ед." value={fmt(calc.sale.итогоРасходы) + ' ₽'} bold />
              <Row label="Продажная цена" value={calc.ok ? fmt(calc.sale.продажнаяЦена) + ' ₽' : '—'} bold />
              <Row
                label="Прибыль на ед."
                value={calc.ok ? (calc.sale.прибыль >= 0 ? '+' : '') + fmt(calc.sale.прибыль) + ' ₽' : '—'}
                bold tone={profitTone}
              />
            </Card>

            {calc.ok && calc.unit && (
              <div className="grid xl:grid-cols-2 gap-4">
                {/* Cost structure */}
                <Card title="Структура себестоимости">
                  {calc.cost.себестоимостьСтруктура.map(r => (
                    <Row key={r.название} label={r.название} value={`${fmt(r.сумма)} ₽ · ${fmt(r.доля)}%`} />
                  ))}
                  <Row label="Итого" value={fmt(calc.cost.итогоСебестоимость) + ' ₽'} bold />
                </Card>

                {/* Unit economics */}
                <Card title="Unit-экономика (с учётом возвратов)">
                  <Row label="Доход на ед. (после возвратов)" value={"+" + fmt(calc.unit.доходНаЕдиницу) + ' ₽'} tone="emerald" />
                  <Row label="Расходы на ед." value={"−" + fmt(calc.unit.расходыНаЕдиницу) + ' ₽'} tone="rose" />
                  <Row
                    label="Прибыль на ед."
                    value={(calc.unit.прибыльНаЕдиницу >= 0 ? '+' : '') + fmt(calc.unit.прибыльНаЕдиницу) + ' ₽'}
                    bold tone={calc.unit.прибыльНаЕдиницу >= 0 ? 'emerald' : 'rose'}
                  />
                  <Row label="Рентабельность" value={fmt(calc.unit.рентабельностьUnit) + ' %'} bold />
                </Card>
              </div>
            )}

            {calc.ok && calc.be && (
              <div className="grid xl:grid-cols-2 gap-4">
                {/* Break even */}
                <Card title="Точка безубыточности (месяц)">
                  {Number.isFinite(calc.be.точкаБезубыточностиШтук) ? (
                    <>
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <div>
                          <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Объём</div>
                          <div className="font-mono font-medium text-lg text-[var(--fg)]">
                            {fmt(calc.be.точкаБезубыточностиШтук)} шт
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Выручка</div>
                          <div className="font-mono font-medium text-lg text-[var(--fg)]">
                            {fmt(calc.be.точкаБезубыточностиРубли)} ₽
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-4 gap-1.5">
                        {calc.be.прибыльЗаМесяц.map((p, i) => (
                          <div
                            key={i}
                            className={cn(
                              "rounded-md px-1 py-1.5 text-center border",
                              BE_MULTIPLIERS[i] === '1.0×' ? 'border-violet-500/50 bg-violet-500/10' : 'border-[var(--border)] bg-[var(--surface-inner)]/50'
                            )}
                          >
                            <div className="text-[9px] text-[var(--text-muted)]">{BE_MULTIPLIERS[i]}</div>
                            <div className={cn("text-[10px] font-mono", p >= 0 ? 'text-emerald-500' : 'text-rose-500')}>
                              {p >= 0 ? '+' : ''}{fmt(p)}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="text-[10px] text-[var(--text-muted)] mt-2">
                        Прибыль при объёме от 0.8× до 1.5× точки безубыточности
                      </div>
                    </>
                  ) : (
                    <div className="text-xs text-rose-400">
                      Маржинальная прибыль на единицу ≤ 0 — точка безубыточности не достигается.
                    </div>
                  )}
                </Card>

                {/* Ad ROI */}
                {calc.roi && (
                  <Card title="ROI / ROMI рекламы">
                    <div className="grid grid-cols-2 gap-x-6">
                      <Row label="Показы (примерные)" value={fmt(calc.roi.показыПримерные)} />
                      <Row label="Клики" value={fmt(calc.roi.клики)} />
                      <Row label="Заказы" value={fmt(calc.roi.заказы)} />
                      <Row label="Средний чек (AOV)" value={fmt(calc.roi.AOV) + ' ₽'} />
                      <Row label="Выручка от рекламы" value={fmt(calc.roi.выручкаОтРекламы) + ' ₽'} />
                      <Row label="Валовая прибыль" value={fmt(calc.roi.валоваяПрибыль) + ' ₽'} />
                      <Row label="CPA (заказ)" value={fmt(calc.roi.CPA) + ' ₽'} />
                      <Row
                        label="ROMI"
                        value={fmt(calc.roi.ROMI) + ' %'}
                        bold tone={calc.roi.ROMI >= 0 ? 'emerald' : 'rose'}
                      />
                    </div>
                  </Card>
                )}
              </div>
            )}

            {calc.ok && calc.disc && (
              <Card title="Влияние скидки / акции">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-1">
                  <Row label="Цена со скидкой" value={fmt(calc.disc.новаяЦена) + ' ₽'} bold />
                  <Row label="Прибыль на ед. (было)" value={fmt(calc.disc.текущаяПрибыльНаЕд) + ' ₽'} />
                  <Row
                    label="Прибыль на ед. (станет)"
                    value={(calc.disc.новаяПрибыльНаЕд >= 0 ? '+' : '') + fmt(calc.disc.новаяПрибыльНаЕд) + ' ₽'}
                    tone={calc.disc.новаяПрибыльНаЕд >= calc.disc.текущаяПрибыльНаЕд ? 'emerald' : 'rose'}
                  />
                  <Row
                    label="Нужен рост объёма"
                    value={(calc.disc.необходимоеУвеличениеОбъема >= 0 ? '+' : '') + fmt(calc.disc.необходимоеУвеличениеОбъема) + ' %'}
                    bold
                  />
                  <Row label="Маржинальность со скидкой" value={fmt(calc.disc.итоговаяМаржинальность) + ' %'} />
                </div>
              </Card>
            )}
          </div>
        </div>

        {/* Analytics from loaded statements */}
        {analytics && (
          <section>
            <div className="mb-3">
              <h3 className="text-base font-semibold text-[var(--fg)]">Аналитика загруженных выписок</h3>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Платформы определяются по контрагентам и назначению платежей (WB, Ozon, Я.Маркет, СберМаркет, Авито);
                комиссии — оценка по типовым ставкам.
              </p>
            </div>
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
              {analytics.map((s, i) => (
                <div key={i} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-[var(--border)] bg-[var(--surface-inner)]/50">
                    <h4 className="font-semibold text-xs text-[var(--fg)]">{s.title}</h4>
                  </div>
                  <div className="p-4">
                    {Object.entries(s.data).map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-3 text-xs py-1 border-b border-[var(--border)] last:border-0">
                        <span className="text-[var(--text-muted)]">{k}</span>
                        <span className="text-[var(--fg)] font-mono text-right truncate max-w-[60%]">{typeof v === 'number' ? fmt(v) : v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
