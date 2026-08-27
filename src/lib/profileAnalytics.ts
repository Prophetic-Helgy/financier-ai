/**
 * Профильно-зависимая аналитика для разных типов клиентов
 */

import { ParsedDocument } from './parsers/bankParsers';
import { generateIncomeStatement, calculateFinancialRatios, generateCashFlow } from './financialReports';

export type ProfileType = 'personal' | 'family' | 'msb' | 'holding' | 'selfemployed' | 'seller';

// ==================== ФИЗИЧЕСКОЕ ЛИЦО ====================

export interface PersonalPlan {
  monthlyIncome: number;
  monthlyExpense: number;
  netCashflow: number;
  emergencyFundMonths: number; // Сколько месяцев продержится подушка
  recommendedEmergencyFund: number; // Рекомендуемый размер подушки (6 мес расходов)
  debtToIncomeRatio: number; // Отношение платежей по кредитам к доходу
  savingsRate: number; // % сбережений от дохода
}

export function generatePersonalPlan(doc: ParsedDocument): PersonalPlan {
  const transactions = doc.transactions || [];
  
  let monthlyIncome = 0, monthlyExpense = 0;
  
  for (const tx of transactions) {
    if (tx.type === 'income') monthlyIncome += tx.amount;
    else monthlyExpense += tx.amount;
  }

  // Если нет транзакций, используем метрики
  const metrics = doc.extractedMetrics || {};
  if (monthlyIncome === 0 && metrics['Доход']) monthlyIncome = metrics['Доход'];
  if (monthlyExpense === 0 && metrics['Расход']) monthlyExpense = metrics['Расход'];

  const netCashflow = monthlyIncome - monthlyExpense;
  const savingsRate = monthlyIncome > 0 ? ((netCashflow / monthlyIncome) * 100) : 0;
  
  // Подушка безопасности: 6 месяцев расходов
  const recommendedEmergencyFund = monthlyExpense * 6;
  
  // Дефолтные значения если нет данных
  return {
    monthlyIncome,
    monthlyExpense,
    netCashflow,
    emergencyFundMonths: monthlyExpense > 0 ? (recommendedEmergencyFund / monthlyExpense) : 0,
    recommendedEmergencyFund,
    debtToIncomeRatio: 0, // Нужна доп. информация о кредитах
    savingsRate
  };
}

export function generatePersonalAnalytics(doc: ParsedDocument): { title: string; data: any }[] {
  const plan = generatePersonalPlan(doc);
  
  return [
    {
      title: "📊 Личный финансовый план",
      data: {
        label: "Личные финансы",
        income: plan.monthlyIncome,
        expense: plan.monthlyExpense,
        netCashflow: plan.netCashflow,
        savingsRate: `${plan.savingsRate.toFixed(1)}%`
      }
    },
    {
      title: "🛡️ Подушка безопасности (6 мес.)",
      data: {
        label: "Финансовая подушка",
        recommended: plan.recommendedEmergencyFund,
        months: plan.emergencyFundMonths,
        status: plan.savingsRate > 20 ? 'good' : plan.savingsRate > 5 ? 'warning' : 'danger'
      }
    },
    {
      title: "💳 Умное гашение кредитов",
      data: {
        label: "Кредитная стратегия",
        advice: plan.netCashflow > 0 
          ? `При чистом потоке ${plan.netCashflow.toLocaleString('ru-RU')} ₽/мес — рекомендуется досрочное погашение`
          : 'Внимание: расходы превышают доходы. Приоритет — стабилизация',
        rateVsInflation: 'Если ставка по кредиту < 8% при инфляции 10%+ — откладывайте гашение'
      }
    },
    {
      title: "📈 Анализ доходов и расходов",
      data: {
        label: "Транзакции",
        count: doc.transactions.length,
        avgIncome: plan.monthlyIncome > 0 ? Math.round(plan.monthlyIncome / (doc.transactions.filter(t => t.type === 'income').length || 1)) : 0,
        avgExpense: plan.monthlyExpense > 0 ? Math.round(plan.monthlyExpense / (doc.transactions.filter(t => t.type === 'expense').length || 1)) : 0
      }
    },
    {
      title: "🏦 Учет активов",
      data: {
        label: "Активы (вклады, крипта, недвижимость)",
        totalAssets: doc.extractedMetrics ? Object.entries(doc.extractedMetrics)
          .filter(([k]) => /актив|вклад|крипт|недвиж|объект/i.test(k))
          .reduce((s, [, v]) => s + (typeof v === 'number' ? v : 0), 0) 
          : 0
      }
    },
    {
      title: "💰 Инвестиции",
      data: {
        label: "Инвестиционные возможности",
        monthlyInvestable: Math.max(0, plan.netCashflow * 0.3), // 30% от свободного потока
        advice: plan.savingsRate > 15 
          ? 'Рекомендуется инвестировать 20-30% от чистого дохода'
          : 'Сначала сформируйте подушку безопасности, затем инвестируйте'
      }
    }
  ];
}

// ==================== СЕМЬЯ ====================

export interface FamilyBudget {
  totalIncome: number;
  totalExpense: number;
  sharedIncome: number;
  personalIncome: number;
  sharedGoals: Array<{ name: string; target: number; current: number }>;
  expenseDistribution: '50/30/20' | 'custom';
}

export function generateFamilyBudget(doc: ParsedDocument): FamilyBudget {
  const transactions = doc.transactions || [];
  
  let sharedIncome = 0, personalIncome = 0;
  for (const tx of transactions) {
    if (tx.type === 'income') sharedIncome += tx.amount; // По умолчанию считаем общим
  }

  return {
    totalIncome: sharedIncome,
    totalExpense: transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0),
    sharedIncome,
    personalIncome,
    sharedGoals: [
      { name: 'Отпуск', target: 200000, current: Math.max(0, (sharedIncome * 0.1)) },
      { name: 'Образование детей', target: 500000, current: Math.max(0, (sharedIncome * 0.15)) },
      { name: 'Авто', target: 1500000, current: Math.max(0, (sharedIncome * 0.2)) }
    ],
    expenseDistribution: '50/30/20' // Правило 50/30/20
  };
}

export function generateFamilyAnalytics(doc: ParsedDocument): { title: string; data: any }[] {
  const budget = generateFamilyBudget(doc);
  
  return [
    {
      title: "👨‍👩‍👧‍👦 Семейный бюджет",
      data: {
        label: "Совместные финансы",
        totalIncome: budget.totalIncome,
        totalExpense: budget.totalExpense,
        netCashflow: budget.totalIncome - budget.totalExpense
      }
    },
    {
      title: "🎯 Семейные цели накоплений",
      data: {
        label: "Цели семьи",
        goals: budget.sharedGoals.map(g => ({ ...g, progress: g.target > 0 ? (g.current / g.target * 100).toFixed(1) : '0' }))
      }
    },
    {
      title: "📊 Мультиаккаунтный доступ",
      data: {
        label: "Мультиаккаунт",
        accounts: doc.fileName.includes(',') || doc.transactions.length > 50 ? 'Обнаружены несколько счетов' : 'Рекомендуется подключить все счета семьи',
        advice: 'Подключите выписки всех членов семьи для полного анализа'
      }
    },
    {
      title: "🏠 Анализ общих и личных выписок",
      data: {
        label: "Анализ выписок",
        transactionCount: doc.transactions.length,
        uniquePayers: new Set(doc.transactions.filter(t => t.payer).map(t => t.payer)).size,
        uniquePayees: new Set(doc.transactions.filter(t => t.payee).map(t => t.payee)).size
      }
    },
    {
      title: "💡 Рекомендации по распределению трат",
      data: {
        label: "Распределение 50/30/20",
        needs: `${(budget.totalIncome * 0.5).toLocaleString('ru-RU')} ₽ — потребности`,
        wants: `${(budget.totalIncome * 0.3).toLocaleString('ru-RU')} ₽ — желания`,
        savings: `${(budget.totalIncome * 0.2).toLocaleString('ru-RU')} ₽ — сбережения`
      }
    },
    {
      title: "📈 Учет всех активов семьи",
      data: {
        label: "Активы семьи",
        realEstate: doc.extractedMetrics ? Object.entries(doc.extractedMetrics)
          .filter(([k]) => /недвиж|квартир|дом|земл/i.test(k))
          .reduce((s, [, v]) => s + (typeof v === 'number' ? v : 0), 0) : 0,
        totalAssets: doc.extractedMetrics ? Object.values(doc.extractedMetrics).reduce((s, v) => s + (typeof v === 'number' ? v : 0), 0) : 0
      }
    }
  ];
}

// ==================== МАЛЫЙ И СРЕДНИЙ БИЗНЕС ====================

export function generateMSBAnalytics(doc: ParsedDocument): { title: string; data: any }[] {
  const metrics = doc.extractedMetrics || {};
  const transactions = doc.transactions || [];
  
  return [
    {
      title: "📑 Анализ ОСВ и РСБУ",
      data: {
        label: "Бухгалтерская отчетность",
        osvAccounts: Object.keys(metrics).length,
        balanceSheet: metrics['Внеоборотные активы'] || 0,
        currentAssets: metrics['Оборотные активы'] || 0,
        liabilities: (metrics['Долгосрочные обязательства'] || 0) + (metrics['Краткосрочные обязательства'] || 0),
        equity: metrics['Капитал и резервы'] || 0
      }
    },
    {
      title: "💰 Кэшфлоу и Cash Flow",
      data: {
        label: "Движение денежных средств",
        totalIncome: transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0),
        totalExpense: transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0),
        netCashflow: transactions.reduce((s, t) => s + (t.type === 'income' ? t.amount : -t.amount), 0),
        txCount: transactions.length
      }
    },
    {
      title: "📋 Бизнес-план под соцконтракт/кредит",
      data: {
        label: "Бизнес-план",
        revenue: metrics['Выручка'] || 0,
        profit: metrics['Прибыль'] || 0,
        taxBase: metrics['База'] || 0,
        advice: doc.docType === 'osv' 
          ? 'ОСВ найдена — можно построить финансовую модель для банка'
          : 'Рекомендуется загрузить ОСВ и баланс для полного бизнес-плана'
      }
    },
    {
      title: "📊 Финансовая модель",
      data: {
        label: "Финмодель",
        ratios: doc.transactions.length > 0 ? calculateFinancialRatios(doc) : [],
        cashFlow: generateCashFlow(doc),
        incomeStatement: generateIncomeStatement(doc)
      }
    },
    {
      title: "🏢 Корпоративные вложения и депозиты",
      data: {
        label: "Корпоративные финансы",
        deposits: metrics['Депозиты'] || 0,
        corporateExpenses: transactions.filter(t => t.type === 'expense' && /банк|вклад|депозит/i.test(t.purpose)).length,
        advice: 'Анализируйте эффективность корпоративных депозитов vs оборотные средства'
      }
    },
    {
      title: "📈 Чистый поток и рентабельность",
      data: {
        label: "Чистый поток",
        netFlow: transactions.reduce((s, t) => s + (t.type === 'income' ? t.amount : -t.amount), 0),
        revenuePerTransaction: transactions.length > 0 
          ? Math.round(transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0) / transactions.length)
          : 0
      }
    },
    {
      title: "🤖 AI Анализ",
      data: {
        label: "AI-рекомендации для бизнеса",
        insights: [
          doc.docType === 'osv' ? 'Обнаружена ОСВ — можно рассчитать коэффициенты ликвидности' : 'Загрузите ОСВ для углубленного анализа',
          transactions.length > 20 ? `Найдено ${transactions.length} операций — достаточно данных для прогнозирования` : 'Рекомендуется больше данных для точных прогнозов',
          metrics['Прибыль'] && metrics['Прибыль'] > 0 
            ? 'Компания прибыльна — можно планировать рост'
            : 'Внимание: убыточная деятельность требует пересмотра стратегии'
        ]
      }
    },
    {
      title: "📄 Парсинг выписок 1С и CSV",
      data: {
        label: "Импорт данных",
        supportedFormats: ['1С Клиент-Банк (.txt)', 'CSV', 'Excel (.xls/.xlsx)', 'PDF (декларации)'],
        status: transactions.length > 0 ? `Успешно импортировано ${transactions.length} операций` : 'Нет данных для импорта'
      }
    }
  ];
}

// ==================== ХОЛДИНГ / КОНСОЛИДАЦИЯ ====================

export function generateHoldingAnalytics(doc: ParsedDocument): { title: string; data: any }[] {
  const metrics = doc.extractedMetrics || {};
  const transactions = doc.transactions || [];
  return [
    {
      title: "🏛️ Консолидированная аналитика ГК",
      data: {
        label: "Группа компаний",
        entities: doc.fileName.includes(',') ? 'Обнаружена консолидация нескольких юрлиц' : 'Рекомендуется загрузить данные всех дочерних предприятий',
        totalAssets: metrics['Внеоборотные активы'] || 0,
        consolidatedRevenue: metrics['Выручка'] || 0
      }
    },
    {
      title: "🌍 Международная отчетность (МСФО)",
      data: {
        label: "МСФО / IFRS",
        currencySupport: 'USD, EUR, CNY',
        conversionNote: 'Мультивалютный учет доступен — конвертация по курсу ЦБ на дату операции',
        status: doc.extractedMetrics ? 'Данные для МСФО-конвертации обнаружены' : 'Загрузите балансы дочерних компаний'
      }
    },
    {
      title: "💱 Мультивалютный учет (USD, EUR, CNY)",
      data: {
        label: "Валюты",
        supportedCurrencies: ['RUB', 'USD', 'EUR', 'CNY'],
        fxGainLoss: metrics['Курсовые разницы'] || 0,
        forexRevenue: transactions?.filter(t => /usd|eur|cny|долл|евро/i.test(t.purpose))?.length || 0
      }
    },
    {
      title: "🔍 Аудит и диагностика корпораций",
      data: {
        label: "Аудит ГК",
        riskFactors: [
          metrics['Долгосрочные обязательства'] && metrics['Капитал и резервы']
            ? `Коэффициент левериджа: ${(metrics['Долгосрочные обязательства'] / metrics['Капитал и резервы']).toFixed(2)}`
            : 'Недостаточно данных для расчета',
          doc.docType === 'osv' ? 'ОСВ доступна — проверка корректности проводок' : 'Загрузите расшифровки ОСВ для аудита'
        ]
      }
    },
    {
      title: "📊 Трансфертное ценообразование",
      data: {
        label: "ТЦП",
        intercompanyTransactions: 0, // Нужна доп. логика консолидации
        armLengthNote: 'Для корректного ТЦП требуется загрузка данных по всем связанным сторонам',
        complianceRisk: metrics['Налог'] ? `База для ТЦП: ${metrics['Налог'].toLocaleString('ru-RU')}` : 'Нет данных'
      }
    },
    {
      title: "🚀 Питч-деки для инвесторов",
      data: {
        label: "Инвестиционный питч",
        revenueGrowth: metrics['Выручка'] ? `Выручка: ${metrics['Выручка'].toLocaleString('ru-RU')} ₽` : 'Нет данных',
        profitMargin: metrics['Прибыль'] && metrics['Выручка'] 
          ? `${((metrics['Прибыль'] / metrics['Выручка']) * 100).toFixed(1)}% рентабельность`
          : 'Недостаточно данных для расчета',
        recommendation: doc.docType === 'osv' || doc.docType === 'balance_sheet' 
          ? 'Достаточно финансовой отчетности для подготовки питч-дека'
          : 'Загрузите финансовую отчетность для генерации питч-дека'
      }
    },
    {
      title: "📈 Консолидация МСФО / GAAP",
      data: {
        label: "МСФО / US GAAP",
        standards: ['МСФО (IFRS)', 'US GAAP', 'РСБУ'],
        consolidationStatus: doc.docType === 'balance_sheet' 
          ? 'Баланс обнаружен — можно консолидировать по МСФО'
          : 'Загрузите балансы всех дочерних предприятий для консолидации'
      }
    }
  ];
}

// ==================== ГЛАВНАЯ ФУНКЦИЯ ====================

export function getProfileAnalytics(profile: ProfileType, doc: ParsedDocument): { title: string; data: any }[] {
  switch (profile) {
    case 'personal':
      return generatePersonalAnalytics(doc);
    case 'family':
      return generateFamilyAnalytics(doc);
    case 'msb':
      return generateMSBAnalytics(doc);
    case 'holding':
      return generateHoldingAnalytics(doc);
    default:
      return [];
  }
}

// Список доступных отчетов для каждого профиля
export const profileReportList: Record<ProfileType, Array<{ id: string; title: string; icon: string; desc: string }>> = {
  personal: [
    { id: 'personal_plan', title: 'Личный финансовый план', icon: '📊', desc: 'Доходы, расходы, накопления' },
    { id: 'bank_analysis', title: 'Анализ банковских выписок', icon: '🏦', desc: 'Категоризация транзакций' },
    { id: 'tax_reports', title: 'Загрузка отчетов из ФНС', icon: '📄', desc: 'Декларации 3-НДФЛ, УСН' },
    { id: 'debt_payoff', title: 'Умное гашение кредитов', icon: '💳', desc: 'Ставка vs инфляция' },
    { id: 'emergency_fund', title: 'Расчет финансовой подушки (6 мес)', icon: '🛡️', desc: 'Защита от непредвиденных расходов' },
    { id: 'assets', title: 'Учет активов', icon: '🏠', desc: 'Вклады, крипта, недвижимость' },
    { id: 'investments', title: 'Инвестиции', icon: '💰', desc: 'Акции, Вклады, Крипта' }
  ],
  family: [
    { id: 'joint_budget', title: 'Совместный бюджет', icon: '👨‍👩‍👧', desc: 'Распределение затрат и цели' },
    { id: 'multi_account', title: 'Мультиаккаунтный доступ', icon: '🔐', desc: 'Все счета семьи в одном месте' },
    { id: 'family_goals', title: 'Планирование семейных целей', icon: '🎯', desc: 'Отпуск, образование, авто' },
    { id: 'family_assets', title: 'Учет всех активов семьи', icon: '🏠', desc: 'Недвижимость и инвестиции' },
    { id: 'expense_recommendations', title: 'Рекомендации по распределению трат', icon: '💡', desc: 'Правило 50/30/20' }
  ],
  msb: [
    { id: 'osv_analysis', title: 'Анализ ОСВ, кэшфлоу', icon: '📑', desc: 'РСБУ отчетность' },
    { id: 'financial_modeling', title: 'Построение финмоделей', icon: '📊', desc: 'Финансовое моделирование' },
    { id: 'business_plan', title: 'Бизнес-план под соцконтракт/кредит', icon: '📋', desc: 'Для банка и гос. программ' },
    { id: 'cash_flow', title: 'Финансовая модель и Cash Flow', icon: '💰', desc: 'Прогноз денежных потоков' },
    { id: 'corporate_investments', title: 'Корпоративные вложения и депозиты', icon: '🏢', desc: 'Управление корп. финансами' },
    { id: 'net_cashflow', title: 'Чистый поток', icon: '📈', desc: 'Анализ денежного потока' },
    { id: 'ai_analysis', title: 'AI Анализ', icon: '🤖', desc: 'Интеллектуальные рекомендации' }
  ],
  holding: [
    { id: 'consolidated_analytics', title: 'Консолидированная аналитика ГК', icon: '🏛️', desc: 'Мультипредприятие анализ' },
    { id: 'msif_report', title: 'Международная отчетность (МСФО)', icon: '🌍', desc: 'IFRS / US GAAP' },
    { id: 'multi_currency', title: 'Мультивалютный учет (USD, EUR, CNY)', icon: '💱', desc: 'Конвертация и хеджирование' },
    { id: 'corporate_audit', title: 'Аудит и диагностика корпораций', icon: '🔍', desc: 'Проверка финансовой дисциплины' },
    { id: 'investor_pitch', title: 'Питч-деки для инвесторов', icon: '🚀', desc: 'Инвестиционные презентации' },
    { id: 'consolidation_msfo', title: 'Консолидация МСФО / GAAP', icon: '📈', desc: 'Единая отчетность по стандартам' }
  ],
  selfemployed: [
    { id: 'se_income', title: 'Анализ доходов самозанятого', icon: '📊', desc: 'Выручка по дням/месяцам, динамика' },
    { id: 'se_tax', title: 'Расчет налога НПД (4%/6%)', icon: '🧾', desc: 'Налог на профессиональный доход' },
    { id: 'se_expense', title: 'Учет расходов и вычетов', icon: '📉', desc: 'Категоризация трат, оптимизация' },
    { id: 'se_report', title: 'Отчет для ФНС (Мой Налог)', icon: '📋', desc: 'Экспорт данных из приложения "Мой Налог"' },
    { id: 'se_profit', title: 'Чистая прибыль и рентабельность', icon: '💰', desc: 'Выручка минус налоги и расходы' },
    { id: 'se_forecast', title: 'Прогноз доходов на 3 месяца', icon: '📈', desc: 'Сезонность и тренды' }
  ],
  seller: [
    { id: 'seller_unit', title: 'Unit-экономика товара', icon: '📦', desc: 'Себестоимость, маржа, ROI' },
    { id: 'seller_price', title: 'Калькулятор цены', icon: '🏷️', desc: 'Цена с учетом комиссий WB/Ozon' },
    { id: 'seller_roi', title: 'ROI рекламы', icon: '📢', desc: 'Эффективность рекламных кампаний' },
    { id: 'seller_sales', title: 'Динамика продаж', icon: '📊', desc: 'Помесячная аналитика продаж' },
    { id: 'seller_fbo', title: 'FBO/FBS логистика', icon: '🚚', desc: 'Расходы на хранение и доставку' },
    { id: 'seller_profit', title: 'Чистая прибыль по товарам', icon: '💰', desc: 'Позиция Profit по каждому SKU' },
    { id: 'seller_review', title: 'Аналитика отзывов', icon: '⭐', desc: 'Рейтинг и sentiment-анализ' }
  ]
};
