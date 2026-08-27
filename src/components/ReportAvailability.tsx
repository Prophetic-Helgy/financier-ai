import React from 'react';
import { ParsedDocument } from '../lib/parsers/bankParsers';
import { ProfileType } from '../lib/profileAnalytics';
import { ShieldCheck, AlertCircle, FileText, BrainCircuit, Calculator, TrendingUpDown, Briefcase, HandCoins, LayoutDashboard, LineChart, FileSpreadsheet, Sparkles, TrendingUp, Wallet, ArrowRightLeft, PiggyBank, ShoppingCart, Megaphone, Package, Truck, Star } from 'lucide-react';

interface ReportAvailabilityProps {
  documents: ParsedDocument[];
  profile?: ProfileType;
}

function assessDataAvailability(docs: ParsedDocument[]): Record<string, boolean> {
  const available: Record<string, boolean> = {};
  
  let hasTransactions = false;
  let hasOSV = false;
  let hasBalance = false;

  for (const doc of docs) {
    if (doc.transactions.length > 0) hasTransactions = true;
    if (doc.docType === 'osv') hasOSV = true;
    else if (doc.docType === 'balance_sheet') hasBalance = true;
  }

  available['has_transactions'] = hasTransactions;
  available['has_osv'] = hasOSV || docs.some(d => d.docType === 'osv');
  available['has_balance'] = hasBalance || docs.some(d => d.docType === 'balance_sheet');
  available['has_any_doc'] = docs.length > 0;

  return available;
}

interface ReportSpec {
  id: string;
  name: string;
  icon: React.ReactNode;
  description: string;
  requiredData: { key: string; label: string }[];
  category: 'стандартные' | 'управленческие' | 'аналитические' | 'для инвесторов';
  profiles?: ProfileType[];
}

const REPORT_SPECS: ReportSpec[] = [
  // === ФИЗИЧЕСКОЕ ЛИЦО ===
  {
    id: 'personal_income', name: 'Анализ доходов и расходов',
    icon: <LineChart className="w-4 h-4" />, description: 'Категоризация транзакций, визуализация структуры доходов/расходов',
    requiredData: [{ key: 'has_transactions', label: 'Банковские выписки' }], category: 'аналитические', profiles: ['personal']
  },
  {
    id: 'personal_budget', name: 'Личный бюджет (50/30/20)',
    icon: <FileSpreadsheet className="w-4 h-4" />, description: 'Потребности 50%, желания 30%, сбережения 20%',
    requiredData: [{ key: 'has_transactions', label: 'Банковские выписки' }], category: 'управленческие', profiles: ['personal']
  },
  {
    id: 'personal_emergency', name: 'Финансовая подушка (6 мес)',
    icon: <Wallet className="w-4 h-4" />, description: 'Расчет подушки безопасности на 6 месяцев жизни',
    requiredData: [{ key: 'has_transactions', label: 'Банковские выписки' }], category: 'управленческие', profiles: ['personal']
  },
  {
    id: 'personal_debt', name: 'Умное гашение кредитов',
    icon: <ArrowRightLeft className="w-4 h-4" />, description: 'Ставка vs инфляция — стратегия досрочного погашения',
    requiredData: [{ key: 'has_transactions', label: 'Банковские выписки' }], category: 'аналитические', profiles: ['personal']
  },
  {
    id: 'personal_invest', name: 'Инвестиции и сбережения',
    icon: <TrendingUp className="w-4 h-4" />, description: 'Акции, вклады, крипта — учет и рекомендации',
    requiredData: [{ key: 'has_transactions', label: 'Банковские выписки' }], category: 'аналитические', profiles: ['personal']
  },
  {
    id: 'personal_tax', name: 'Отчеты из ФНС (3-НДФЛ)',
    icon: <FileText className="w-4 h-4" />, description: 'Декларации 3-НДФЛ, выписки из ФНС',
    requiredData: [{ key: 'has_transactions', label: 'Выписки из ФНС' }], category: 'стандартные', profiles: ['personal']
  },
  {
    id: 'personal_assets', name: 'Учет активов',
    icon: <Briefcase className="w-4 h-4" />, description: 'Недвижимость, авто, вклады, ценные бумаги',
    requiredData: [], category: 'аналитические', profiles: ['personal']
  },

  // === СЕМЬЯ ===
  {
    id: 'family_budget', name: 'Совместный бюджет семьи',
    icon: <FileSpreadsheet className="w-4 h-4" />, description: 'Общие и личные доходы, распределение расходов',
    requiredData: [{ key: 'has_transactions', label: 'Выписки всех членов семьи' }], category: 'управленческие', profiles: ['family']
  },
  {
    id: 'family_goals', name: 'Планирование семейных целей',
    icon: <TrendingUp className="w-4 h-4" />, description: 'Отпуск, образование, авто — прогресс по целям',
    requiredData: [{ key: 'has_transactions', label: 'Банковские выписки' }], category: 'управленческие', profiles: ['family']
  },
  {
    id: 'family_multiaccount', name: 'Мультиаккаунтный доступ',
    icon: <HandCoins className="w-4 h-4" />, description: 'Все счета семьи в одном месте',
    requiredData: [{ key: 'has_transactions', label: 'Выписки из разных банков' }], category: 'стандартные', profiles: ['family']
  },
  {
    id: 'family_expense', name: 'Рекомендации по расходам',
    icon: <Calculator className="w-4 h-4" />, description: 'Правило 50/30/20 для семейного бюджета',
    requiredData: [{ key: 'has_transactions', label: 'Банковские выписки' }], category: 'аналитические', profiles: ['family']
  },
  {
    id: 'family_assets', name: 'Учет активов семьи',
    icon: <Briefcase className="w-4 h-4" />, description: 'Недвижимость, инвестиции, накопления',
    requiredData: [], category: 'аналитические', profiles: ['family']
  },

  // === МАЛЫЙ И СРЕДНИЙ БИЗНЕС ===
  {
    id: 'pnl', name: 'ОПиУ (Отчет о прибылях и убытках)',
    icon: <LineChart className="w-4 h-4" />, description: 'Выручка, себестоимость, валовая и чистая прибыль',
    requiredData: [{ key: 'has_transactions', label: 'Выписки/транзакции' }, { key: 'has_osv', label: 'ОСВ (сч. 90, 91)' }], category: 'стандартные', profiles: ['msb']
  },
  {
    id: 'balance', name: 'Бухгалтерский баланс (Форма 1)',
    icon: <Briefcase className="w-4 h-4" />, description: 'Активы и пассивы по плану счетов РСБУ',
    requiredData: [{ key: 'has_osv', label: 'ОСВ (все счета)' }], category: 'стандартные', profiles: ['msb']
  },
  {
    id: 'cashflow', name: 'ДДС (Cash Flow Statement)',
    icon: <HandCoins className="w-4 h-4" />, description: 'Операционный, инвестиционный и финансовый потоки',
    requiredData: [{ key: 'has_transactions', label: 'Выписки/транзакции' }, { key: 'has_osv', label: 'ОСВ (сч. 50, 51)' }], category: 'стандартные', profiles: ['msb']
  },
  {
    id: 'budget', name: 'Бюджет vs Факт',
    icon: <FileSpreadsheet className="w-4 h-4" />, description: 'Сравнение плановых и фактических расходов',
    requiredData: [{ key: 'has_transactions', label: 'Выписки/транзакции' }, { key: 'has_osv', label: 'ОСВ (сч. 20, 26)' }], category: 'управленческие', profiles: ['msb']
  },
  {
    id: 'costing', name: 'Себестоимость продукции/услуг',
    icon: <Calculator className="w-4 h-4" />, description: 'Прямые материалы, зарплата и накладные расходы',
    requiredData: [{ key: 'has_transactions', label: 'Выписки/транзакции' }, { key: 'has_osv', label: 'ОСВ (сч. 20, 41)' }], category: 'управленческие', profiles: ['msb']
  },
  {
    id: 'forecast', name: 'Прогноз ДДС на 6 месяцев',
    icon: <TrendingUp className="w-4 h-4" />, description: 'Помесячный прогноз поступлений, списаний и остатков',
    requiredData: [{ key: 'has_transactions', label: 'Выписки (мин. 2 месяца)' }], category: 'управленческие', profiles: ['msb']
  },
  {
    id: 'ratios', name: 'Финансовые коэффициенты',
    icon: <Calculator className="w-4 h-4" />, description: 'Current Ratio, ROE, EBITDA Margin, Net Margin',
    requiredData: [{ key: 'has_transactions', label: 'Выписки/транзакции' }, { key: 'has_osv', label: 'ОСВ (сч. 62, 60, 51)' }], category: 'аналитические', profiles: ['msb']
  },
  {
    id: 'kpi', name: 'KPI Дашборд',
    icon: <TrendingUpDown className="w-4 h-4" />, description: 'DSO, DPO, маржинальность, ликвидность',
    requiredData: [{ key: 'has_transactions', label: 'Выписки/транзакции' }, { key: 'has_osv', label: 'ОСВ' }], category: 'аналитические', profiles: ['msb']
  },
  {
    id: 'scenarios', name: 'What-If Сценарии',
    icon: <Sparkles className="w-4 h-4" />, description: 'Оптимистичный, базовый, пессимистичный сценарии',
    requiredData: [{ key: 'has_transactions', label: 'Выписки/транзакции' }], category: 'аналитические', profiles: ['msb']
  },
  {
    id: 'business_plan', name: 'Бизнес-план под кредит/соцконтракт',
    icon: <FileText className="w-4 h-4" />, description: 'Финансовая модель для банка',
    requiredData: [{ key: 'has_osv', label: 'ОСВ / Баланс' }, { key: 'has_transactions', label: 'Выписки' }], category: 'для инвесторов', profiles: ['msb']
  },
  {
    id: 'slides', name: 'Слайды презентации (ОПиУ)',
    icon: <LayoutDashboard className="w-4 h-4" />, description: '6 слайдов: титульный → метрики → коэффициенты → ДДС → баланс → риски',
    requiredData: [{ key: 'has_transactions', label: 'Выписки' }, { key: 'has_osv', label: 'ОСВ' }], category: 'для инвесторов', profiles: ['msb']
  },
  {
    id: 'ai_audit', name: 'AI Аудит через LLM',
    icon: <BrainCircuit className="w-4 h-4" />, description: 'Глубокий анализ локальной нейросетью',
    requiredData: [{ key: 'has_transactions', label: 'Выписки' }, { key: 'has_osv', label: 'ОСВ / Баланс' }], category: 'для инвесторов', profiles: ['msb']
  },

  // === ХОЛДИНГ ===
  {
    id: 'holding_consolidated', name: 'Консолидированная аналитика ГК',
    icon: <LayoutDashboard className="w-4 h-4" />, description: 'Мультипредприятие: выручка, прибыль, активы всей группы',
    requiredData: [{ key: 'has_osv', label: 'ОСВ всех дочерних' }, { key: 'has_balance', label: 'Балансы' }], category: 'стандартные', profiles: ['holding']
  },
  {
    id: 'holding_msfo', name: 'Отчетность по МСФО (IFRS)',
    icon: <LineChart className="w-4 h-4" />, description: 'Конвертация РСБУ → МСФО: IFRS standards',
    requiredData: [{ key: 'has_osv', label: 'ОСВ / Баланс' }], category: 'стандартные', profiles: ['holding']
  },
  {
    id: 'holding_currency', name: 'Мультивалютный учет',
    icon: <ArrowRightLeft className="w-4 h-4" />, description: 'USD, EUR, CNY — конвертация по курсу ЦБ',
    requiredData: [{ key: 'has_transactions', label: 'Выписки в валюте' }], category: 'аналитические', profiles: ['holding']
  },
  {
    id: 'holding_audit', name: 'Аудит корпораций',
    icon: <BrainCircuit className="w-4 h-4" />, description: 'Проверка финансовой дисциплины, коэффициенты левериджа',
    requiredData: [{ key: 'has_osv', label: 'ОСВ (все счета)' }, { key: 'has_balance', label: 'Баланс' }], category: 'аналитические', profiles: ['holding']
  },
  {
    id: 'holding_transfer', name: 'Трансфертное ценообразование',
    icon: <Calculator className="w-4 h-4" />, description: 'Анализ сделок между связанными сторонами',
    requiredData: [{ key: 'has_transactions', label: 'Выписки всех компаний' }], category: 'аналитические', profiles: ['holding']
  },
  {
    id: 'holding_pitch', name: 'Питч-деки для инвесторов',
    icon: <TrendingUp className="w-4 h-4" />, description: 'Инвестиционные презентации: выручка, рентабельность, рост',
    requiredData: [{ key: 'has_osv', label: 'ОСВ / Баланс' }, { key: 'has_transactions', label: 'Выписки' }], category: 'для инвесторов', profiles: ['holding']
  },
  {
    id: 'holding_consolidation', name: 'Консолидация МСФО / GAAP',
    icon: <FileSpreadsheet className="w-4 h-4" />, description: 'Единая отчетность по стандартам МСФО / US GAAP',
    requiredData: [{ key: 'has_balance', label: 'Балансы всех дочерних' }, { key: 'has_osv', label: 'ОСВ всех дочерних' }], category: 'стандартные', profiles: ['holding']
  },

  // === САМОЗАНЯТЫЙ / ИП ===
  {
    id: 'se_income', name: 'Анализ доходов самозанятого',
    icon: <LineChart className="w-4 h-4" />, description: 'Выручка по дням/месяцам, динамика доходов',
    requiredData: [{ key: 'has_transactions', label: 'Банковские выписки' }], category: 'стандартные', profiles: ['selfemployed']
  },
  {
    id: 'se_tax', name: 'Расчет налога НПД (4%/6%)',
    icon: <FileText className="w-4 h-4" />, description: 'Налог на профессиональный доход — автоматический расчет',
    requiredData: [{ key: 'has_transactions', label: 'Выписки / Данные из "Мой Налог"' }], category: 'стандартные', profiles: ['selfemployed']
  },
  {
    id: 'se_expense', name: 'Учет расходов и вычетов',
    icon: <Calculator className="w-4 h-4" />, description: 'Категоризация трат, оптимизация расходов',
    requiredData: [{ key: 'has_transactions', label: 'Банковские выписки' }], category: 'управленческие', profiles: ['selfemployed']
  },
  {
    id: 'se_report', name: 'Отчет для ФНС (Мой Налог)',
    icon: <FileSpreadsheet className="w-4 h-4" />, description: 'Экспорт данных для подачи в ФНС',
    requiredData: [{ key: 'has_transactions', label: 'Выписки / Данные доходов' }], category: 'стандартные', profiles: ['selfemployed']
  },
  {
    id: 'se_profit', name: 'Чистая прибыль и рентабельность',
    icon: <TrendingUp className="w-4 h-4" />, description: 'Выручка минус налоги и расходы',
    requiredData: [{ key: 'has_transactions', label: 'Выписки' }], category: 'аналитические', profiles: ['selfemployed']
  },
  {
    id: 'se_forecast', name: 'Прогноз доходов на 3 месяца',
    icon: <Sparkles className="w-4 h-4" />, description: 'Сезонность и тренды доходов',
    requiredData: [{ key: 'has_transactions', label: 'Выписки (мин. 3 месяца)' }], category: 'аналитические', profiles: ['selfemployed']
  },

  // === СЕЛЛЕР МАРКЕТПЛЕЙСОВ ===
  {
    id: 'seller_unit', name: 'Unit-экономика товара',
    icon: <Package className="w-4 h-4" />, description: 'Себестоимость, маржа, ROI по каждому SKU',
    requiredData: [{ key: 'has_any_doc', label: 'Данные о товарах' }], category: 'стандартные', profiles: ['seller']
  },
  {
    id: 'seller_price', name: 'Калькулятор цены',
    icon: <Calculator className="w-4 h-4" />, description: 'Цена с учетом комиссий WB/Ozon, логистики, налогов',
    requiredData: [{ key: 'has_any_doc', label: 'Данные о товарах' }], category: 'управленческие', profiles: ['seller']
  },
  {
    id: 'seller_roi', name: 'ROI рекламы',
    icon: <Megaphone className="w-4 h-4" />, description: 'Эффективность рекламных кампаний WB/Ozon',
    requiredData: [{ key: 'has_transactions', label: 'Выписки / Данные рекламы' }], category: 'аналитические', profiles: ['seller']
  },
  {
    id: 'seller_sales', name: 'Динамика продаж',
    icon: <LineChart className="w-4 h-4" />, description: 'Помесячная аналитика продаж по маркетплейсам',
    requiredData: [{ key: 'has_transactions', label: 'Выписки / Данные продаж' }], category: 'стандартные', profiles: ['seller']
  },
  {
    id: 'seller_fbo', name: 'FBO/FBS логистика',
    icon: <Truck className="w-4 h-4" />, description: 'Расходы на хранение и доставку FBO/FBS',
    requiredData: [{ key: 'has_transactions', label: 'Выписки маркетплейсов' }], category: 'управленческие', profiles: ['seller']
  },
  {
    id: 'seller_profit', name: 'Чистая прибыль по товарам',
    icon: <TrendingUp className="w-4 h-4" />, description: 'Profit по каждому SKU после всех комиссий',
    requiredData: [{ key: 'has_transactions', label: 'Выписки / Данные продаж' }], category: 'аналитические', profiles: ['seller']
  },
  {
    id: 'seller_review', name: 'Аналитика отзывов',
    icon: <Star className="w-4 h-4" />, description: 'Рейтинг и sentiment-анализ отзывов покупателей',
    requiredData: [{ key: 'has_any_doc', label: 'Данные отзывов' }], category: 'аналитические', profiles: ['seller']
  },
];

export function ReportAvailability({ documents, profile = 'msb' }: ReportAvailabilityProps) {
  const dataAvail = assessDataAvailability(documents);
  
  const filteredReports = REPORT_SPECS.filter(r => {
    if (!r.profiles) return true;
    return r.profiles.includes(profile);
  });
  
  const categories = ['стандартные', 'управленческие', 'аналитические', 'для инвесторов'] as const;

  function isReportAvailable(report: ReportSpec): boolean {
    return report.requiredData.every(d => dataAvail[d.key]);
  }

  function getAvailableCount(report: ReportSpec): number {
    return report.requiredData.filter(d => dataAvail[d.key]).length;
  }

  const totalReports = filteredReports.length;
  const fullyAvailable = filteredReports.filter(r => isReportAvailable(r)).length;

  const profileLabels: Record<ProfileType, string> = {
    personal: 'Физическое лицо',
    family: 'Семья',
    msb: 'Малый и средний бизнес',
    holding: 'Холдинг / Консолидация',
    selfemployed: 'Самозанятый / ИП',
    seller: 'Селлер маркетплейсов',
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[var(--bg)] space-y-6 scroll-smooth h-full p-4">
      <div>
        <h2 className="text-2xl font-light text-[var(--fg)] tracking-tight mb-1">Доступность отчетов</h2>
        <p className="text-[var(--text-muted)] text-sm mt-1">Каждый отчет требует определенных данных. Зеленые ✓ — загружены, красные ✗ — отсутствуют.</p>
        
        <div className="mt-4 flex items-center gap-4">
          <div className={`px-4 py-2 rounded-lg text-sm font-medium ${fullyAvailable === totalReports ? 'bg-emerald-500/10 text-emerald-600' : fullyAvailable > 0 ? 'bg-amber-500/10 text-amber-600' : 'bg-rose-500/10 text-rose-600'}`}>
            {fullyAvailable} из {totalReports} отчетов полностью доступны
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="px-3 py-1 rounded-full text-xs font-medium bg-indigo-500/10 text-indigo-600 border border-indigo-500/20">
          Профиль: {profileLabels[profile]}
        </span>
        <span className="text-xs text-[var(--text-muted)]">
          Показаны отчеты, релевантные для выбранного типа клиента
        </span>
      </div>

      {categories.map(cat => {
        const reports = filteredReports.filter(r => r.category === cat);
        if (reports.length === 0) return null;
        return (
          <div key={cat}>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3">{cat}</h3>
            <div className="space-y-3">
              {reports.map(report => {
                const available = isReportAvailable(report);
                const count = getAvailableCount(report);

                return (
                  <div key={report.id} className={`bg-[var(--surface)] border rounded-xl p-5 transition-all ${available ? 'border-emerald-500/30 shadow-sm' : 'border-rose-500/20 opacity-75 hover:opacity-100'}`}>
                    <div className="flex items-start gap-4">
                      <div className={`p-2 rounded-lg shrink-0 ${available ? 'bg-emerald-500/10 text-emerald-600' : 'bg-[var(--surface-inner)] text-[var(--text-muted)]'}`}>
                        {report.icon}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className={`font-semibold text-sm ${available ? 'text-[var(--fg)]' : 'text-[var(--text-muted)]'}`}>
                            {report.name}
                          </h4>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${available ? 'bg-emerald-500/10 text-emerald-600' : 'bg-rose-500/10 text-rose-600'}`}>
                            {available ? '✓ Доступен' : '✗ Недостаточно данных'}
                          </span>
                        </div>
                        
                        <p className="text-xs text-[var(--text-muted)] mb-3">{report.description}</p>

                        <div className="flex flex-wrap gap-2">
                          {report.requiredData.map(d => {
                            const has = dataAvail[d.key];
                            return (
                              <span key={d.key} className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${has ? 'bg-emerald-500/10 text-emerald-600' : 'bg-rose-500/10 text-rose-600'}`}>
                                {has ? <ShieldCheck className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                                {d.label}
                              </span>
                            );
                          })}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className={`text-lg font-mono ${count === report.requiredData.length ? 'text-emerald-500' : count > 0 ? 'text-amber-500' : 'text-rose-500'}`}>
                          {count}/{report.requiredData.length}
                        </div>
                        <div className="w-24 h-1.5 bg-[var(--surface-inner)] rounded-full mt-2 overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all ${count === report.requiredData.length ? 'bg-emerald-500' : count > 0 ? 'bg-amber-500' : 'bg-transparent'}`}
                            style={{ width: `${(count / report.requiredData.length) * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {fullyAvailable < totalReports && (
        <div className="bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 rounded-xl p-5">
          <div className="flex items-start gap-3">
            <ArrowRightLeft className="w-5 h-5 text-indigo-500 mt-0.5 shrink-0" />
            <div>
              <h4 className="font-semibold text-sm text-[var(--fg)] mb-1">Что загрузить для полного доступа?</h4>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                Загрузите выписки из банка (формат 1С Клиент-Банк .txt или Excel) и ОСВ по счетам РСБУ. 
                Чем больше данных предоставлено, тем полнее будут отчеты.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}