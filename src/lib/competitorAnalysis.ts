/**
 * Комплексный анализ конкурентов financier.ai
 * Дата: 23.04.2026
 *
 * Сегменты приложения:
 * 1. Физлицо — личные финансы
 * 2. Семья — семейный бюджет
 * 3. МСБ — малый и средний бизнес
 * 4. Холдинги — корпоративная аналитика
 * 5. Самозанятый/ИП — налоги и доход
 * 6. Селлер маркетплейсов — WB/Ozon аналитика
 */

// ============================================================
// СЕКЦИЯ 1: КОНКУРЕНТЫ ПО СЕГМЕНТАМ
// ============================================================

export interface CompetitorProfile {
  name: string;
  url: string;
  segment: string[];
  pricing: string;
  keyFeatures: string[];
  strengths: string[];
  weaknesses: string[];
  userReviews: {
    source: string;
    rating: number; // out of 5
    positive: string[];
    negative: string[];
  }[];
  threatLevel: 'low' | 'medium' | 'high' | 'critical';
}

export const COMPETITORS: CompetitorProfile[] = [
  // --- Сегмент: Физлицо / Личные финансы ---
  {
    name: "Дзен-мани (Tinkoff)",
    url: "https://www.tinkoff.ru/invest/",
    segment: ["personal", "family"],
    pricing: "Бесплатно для клиентов Тинькофф, платные функции Invest",
    keyFeatures: [
      "Автоматическая категоризация транзакций",
      "Бюджетирование по категориям",
      "Инвестиционный портфель",
      "Цели накоплений",
      "Подписки и уведомления",
      "Семейный доступ к бюджету"
    ],
    strengths: [
      "Огромная база пользователей (20M+)",
      "Глубокая интеграция с банком",
      "Красивый мобильный UX",
      "AI-рекомендации по расходам"
    ],
    weaknesses: [
      "Привязка к одному банку",
      "Нет анализа документов (PDF, Excel)",
      "Нет экспортных отчетов для налоговой"
    ],
    userReviews: [
      {
        source: "App Store",
        rating: 4.7,
        positive: ["Удобный интерфейс", "Автокатегоризация работает отлично", "Нравится бюджетирование"],
        negative: ["Только для Тинькофф", "Нет выписок в Excel", "Мало аналитики по инвестициям"]
      },
      {
        source: "Otzovik",
        rating: 4.3,
        positive: ["Быстро показывает структуру расходов", "Хорошие графики"],
        negative: ["Нет анализа кредитов", "Не учитывает наличные"]
      }
    ],
    threatLevel: 'high'
  },
  {
    name: "Дельтa (Дельта-финансы)",
    url: "https://delta.app/",
    segment: ["personal"],
    pricing: "Freemium: от 199₽/мес",
    keyFeatures: [
      "Мульtibанковая аналитика",
      "Учет наличных",
      "Планирование бюджета",
      "Категоризация расходов",
      "Отчеты в PDF"
    ],
    strengths: ["Не привязана к банку", "Мультивалютность", "Наличные"],
    weaknesses: ["Маленькая аудитория", "Ограниченная аналитика", "Нет AI"],
    userReviews: [
      {
        source: "Product Hunt",
        rating: 4.1,
        positive: ["Простота", "Мультибанк"],
        negative: ["Мало функций", "Дорого за то что дает"]
      }
    ],
    threatLevel: 'medium'
  },
  {
    name: "CoinKeeper / Family Budget",
    url: "https://coinkeeper.ru/",
    segment: ["personal", "family"],
    pricing: "Бесплатно + Pro 399₽/год",
    keyFeatures: [
      "Ручной ввод транзакций",
      "Категории и подкатегории",
      "Бюджетирование",
      "Графики и диаграммы",
      "Синхронизация между устройствами"
    ],
    strengths: ["Простота", "Кроссплатформенность", "Бесплатная версия"],
    weaknesses: ["Ручной ввод", "Нет импорта выписок", "Нет AI"],
    userReviews: [
      {
        source: "Google Play",
        rating: 4.5,
        positive: ["Простой и понятный", "Хорошие графики"],
        negative: ["Ручной ввод утомляет", "Нет импорта из банка"]
      }
    ],
    threatLevel: 'low'
  },

  // --- Сегмент: МСБ ---
  {
    name: "1С:Бухгалтерия + 1С:Управление торговлей",
    url: "https://v8.1c.ru/edi/",
    segment: ["msb", "holding"],
    pricing: "от 5,800₽/лицензия + обслуживание",
    keyFeatures: [
      "Полный бухучет по РСБУ",
      "ОСВ, баланс, П&L",
      "Управление запасами",
      "Дебиторка/Кредиторка",
      "Налоговая отчетность",
      "Интеграция с банками",
      "Складской учет",
      "Зарплата и кадры"
    ],
    strengths: [
      "Де-факто стандарт в России",
      "Огромная база пользователей",
      "Полный функционал бухучета",
      "Тысячи доработок и плагинов",
      "Интеграция со всем"
    ],
    weaknesses: [
      "Сложный и медленный интерфейс",
      "Дорогое обслуживание",
      "Нет AI-аналитики",
      "Нет визуальных дашбордов",
      "Требует бухгалтера",
      "Нет what-if сценариев"
    ],
    userReviews: [
      {
        source: "Soft.ru",
        rating: 4.0,
        positive: ["Надежная", "Всё умеет", "Принята везде"],
        negative: ["Ужасный UI", "Дорого", "Медленная", "Сложная настройка"]
      },
      {
        source: "VC.ru",
        rating: 3.5,
        positive: ["Работает", "Знают все бухгалтеры"],
        negative: ["10 лет без нормального UI", "Нужен программист 1С", "Нет аналитики"]
      }
    ],
    threatLevel: 'critical'
  },
  {
    name: "Контур.Бухгалтерия",
    url: "https://kontur.ru/buhsoft",
    segment: ["msb", "selfemployed"],
    pricing: "от 1,690₽/мес",
    keyFeatures: [
      "Облачная бухгалтерия",
      "Синхронизация с банками",
      "Примечания к операциям",
      "Акты сверки",
      "Налоговая отчетность (авто)",
      "Справочник контрагентов",
      "ЭДО"
    ],
    strengths: [
      "Облачная (не нужно устанавливать)",
      "Автоотчетность в ФНС",
      "Простой интерфейс",
      "Контрагенты из ЕГРЮЛ",
      "Доступная цена"
    ],
    weaknesses: [
      "Нет глубокой аналитики",
      "Нет бизнес-моделирования",
      "Нет what-if сценариев",
      "Нет AI-рекомендаций",
      "Ограниченная кастомизация"
    ],
    userReviews: [
      {
        source: "Product Hunt",
        rating: 4.2,
        positive: ["Просто", "Облачная", "Автоотчетность"],
        negative: ["Мало аналитики", "Нельзя настроить под себя", "Дорого для ИП"]
      },
      {
        source: "Otzo viк",
        rating: 4.0,
        positive: ["Удобная", "Быстро отправляет отчеты"],
        negative: ["Нет аналитики прибыли", "Плохая поддержка"]
      }
    ],
    threatLevel: 'high'
  },
  {
    name: "Мое Дело (ГК РОСТ)",
    url: "https://moedelo.ru/",
    segment: ["msb", "selfemployed"],
    pricing: "от 1,490₽/мес",
    keyFeatures: [
      "Бухгалтерия для ИП и ООО",
      "Банковские выписки онлайн",
      "Акты и счета",
      "Налоговая отчетность",
      "Кассовые чеки"
    ],
    strengths: ["Простота", "Доступная цена", "Автовыписки"],
    weaknesses: ["Нет аналитики", "Нет AI", "Ограниченный функционал"],
    userReviews: [
      {
        source: "AppStore",
        rating: 3.8,
        positive: ["Простая", "Дешевая"],
        negative: ["Баги", "Плохая поддержка", "Мало функций"]
      }
    ],
    threatLevel: 'medium'
  },
  {
    name: "МойСклад",
    url: "https://www.moysklad.ru/",
    segment: ["msb", "seller"],
    pricing: "Бесплатно до 500 документов, от 1,490₽/мес",
    keyFeatures: [
      "Учет товаров и складов",
      "Документооборот",
      "Интеграция с маркетплейсами",
      "Онлайн-касса",
      "Синхронизация с 1С",
      "Мобильное приложение",
      "Аналитика продаж"
    ],
    strengths: [
      "Отличный UI/UX",
      "Интеграции с WB, Ozon",
      "Складской учет",
      "Масштабируемость",
      "Хорошая документация"
    ],
    weaknesses: [
      "Нет финансовой аналитики (P&L, DCF)",
      "Нет AI-рекомендаций",
      "Нет бизнес-моделирования",
      "Нет what-if сценариев"
    ],
    userReviews: [
      {
        source: "Product Hunt",
        rating: 4.4,
        positive: ["Красивый", "Удобный", "Хорошие интеграции"],
        negative: ["Нет финансовой аналитики", "Дорого на высоких тарифах"]
      }
    ],
    threatLevel: 'high'
  },

  // --- Сегмент: Селлер маркетплейсов ---
  {
    name: "MPStats",
    url: "https://mpstats.ru/",
    segment: ["seller"],
    pricing: "от 3,990₽/мес",
    keyFeatures: [
      "Аналитика рынка WB и Ozon",
      "Подбор товара",
      "Оценка продаж конкурентов",
      "ABC-анализ категорий",
      "Мониторинг цен",
      "SEO для карточек",
      "P&L для селлера",
      "ROI рекламы"
    ],
    strengths: [
      "Лидер рынка аналитики MP",
      "Глубокие данные по нишам",
      "Точные оценки продаж",
      "P&L калькулятор",
      "ABC/XYZ анализ"
    ],
    weaknesses: [
      "Дорого",
      "Только маркетплейсы",
      "Нет интеграции с банками",
      "Нет бухучета"
    ],
    userReviews: [
      {
        source: "VC.ru",
        rating: 4.5,
        positive: ["Точная аналитика", "Лучший для селлеров", "Отличный P&L"],
        negative: ["Дорого", "Только WB/Ozon", "Задержка данных 1-2 дня"]
      }
    ],
    threatLevel: 'high'
  },
  {
    name: "MarketGuru",
    url: "https://marketguru.io/",
    segment: ["seller"],
    pricing: "от 2,990₽/мес",
    keyFeatures: [
      "Аналитика WB и Ozon",
      "Поиск поставщиков",
      "Калькулятор прибыли",
      "Мониторинг конкурентов",
      "Аналитика рекламы"
    ],
    strengths: ["Дешевле MPStats", "Хороший функционал", "Быстрый"],
    weaknesses: ["Меньше данных чем MPStats", "Нет интеграции с финансами"],
    userReviews: [
      {
        source: "YouTube отзывы",
        rating: 4.2,
        positive: ["Доступная цена", "Хорошая аналитика"],
        negative: ["Меньше ниш чем MPStats", "Иногда неточные данные"]
      }
    ],
    threatLevel: 'medium'
  },
  {
    name: "Wizard Analytics",
    url: "https://wizard-analytics.ru/",
    segment: ["seller"],
    pricing: "Бесплатно (бета)",
    keyFeatures: [
      "Автоматическая аналитика WB/Ozon",
      "Сводка продаж",
      "Выкупы",
      "ABC-анализ",
      "P&L",
      "ROI"
    ],
    strengths: ["Бесплатен в бете", "Быстрая настройка", "P&L"],
    weaknesses: ["Молодой продукт", "Ограниченный функционал"],
    userReviews: [
      {
        source: "Сайт",
        rating: 4.6,
        positive: ["Бесплатно", "Простая настройка 3 мин"],
        negative: ["Бета-функционал", "Мало интеграций"]
      }
    ],
    threatLevel: 'medium'
  },
  {
    name: "Seerfar",
    url: "https://seerfar.ru/",
    segment: ["seller"],
    pricing: "от 1,990₽/мес",
    keyFeatures: [
      "Браузерное расширение для WB+Ozon",
      "Аналитика в реальном времени",
      "Калькулятор прибыли",
      "Анализ конкурентов"
    ],
    strengths: ["Дешево", "Расширение браузера", "Два маркетплейса"],
    weaknesses: ["Только расширение", "Нет глубокой аналитики"],
    userReviews: [
      {
        source: "Dzen",
        rating: 4.9,
        positive: ["Удобное расширение", "Дешево"],
        negative: ["Только в браузере", "Нет экспорта"]
      }
    ],
    threatLevel: 'low'
  },

  // --- Сегмент: Холдинги / Корпоративная аналитика ---
  {
    name: "SAP Business One",
    url: "https://www.sap.com/ru/products/business-one.html",
    segment: ["holding", "msb"],
    pricing: "от $2,500/пользователь/год",
    keyFeatures: [
      "ERP-система",
      "Финансовый учет",
      "Управление цепочками поставок",
      "CRM",
      "Производство",
      "МСФО/GAAP",
      "Мультивалютность",
      "BI-дашборды"
    ],
    strengths: [
      "Мировой стандарт ERP",
      "Полный функционал",
      "МСФО/GAAP",
      "Масштабируемость"
    ],
    weaknesses: [
      "Очень дорого",
      "Сложная внедренческая работа",
      "Иностранное ПО (риск для РФ)",
      "Нет AI-аналитики из коробки"
    ],
    userReviews: [
      {
        source: "G2",
        rating: 4.1,
        positive: ["Мощная", "Всё в одном"],
        negative: ["Очень дорого", "Сложная настройка", "Долгое внедрение"]
      }
    ],
    threatLevel: 'medium'
  },
  {
    name: "1С:ERP",
    url: "https://v8.1c.ru/erp/",
    segment: ["holding", "msb"],
    pricing: "от 150,000₽ + внедрение",
    keyFeatures: [
      "ERP для среднего и крупного бизнеса",
      "Бухгалтерский и управленческий учет",
      "Управление производством",
      "Бюджетирование",
      "Ценообразование",
      "Консолидация"
    ],
    strengths: ["Российская ERP", "Полный функционал", "Знакомый интерфейс 1С"],
    weaknesses: ["Очень дорого во внедрении", "Сложно", "Долго"],
    userReviews: [
      {
        source: "CNews",
        rating: 4.0,
        positive: ["Полный функционал ERP", "Российская"],
        negative: ["Внедрение от 6 месяцев", "Очень дорого", "Нужна команда"]
      }
    ],
    threatLevel: 'high'
  },

  // --- Сегмент: AI-аналитика (глобальные) ---
  {
    name: "QuickBooks Online (Intuit)",
    url: "https://quickbooks.intuit.com/",
    segment: ["msb", "personal"],
    pricing: "от $25/мес",
    keyFeatures: [
      "AI-категоризация транзакций",
      "Cash Flow Forecasting",
      "Automated bookkeeping",
      "Invoice tracking",
      "Tax preparation",
      "Profit & Loss",
      "Budget vs Actual",
      "AI Insights"
    ],
    strengths: [
      "Лидер мирового рынка",
      "AI-аналитика мирового уровня",
      "Прогнозирование DCF",
      "Автоматизация 90% бухработы"
    ],
    weaknesses: [
      "Недоступен в РФ",
      "Не поддерживает рубль/РСБУ",
      "Не поддерживает российские банки"
    ],
    userReviews: [
      {
        source: "G2",
        rating: 4.6,
        positive: ["AI-аналитика потрясающая", "Автоматизация", "Прогнозирование"],
        negative: ["Дорого", "Иногда AI ошибается"]
      }
    ],
    threatLevel: 'low'
  },
  {
    name: "Float (Cash Flow Software)",
    url: "https://www.floatsoftware.com/",
    segment: ["msb"],
    pricing: "от £15/мес",
    keyFeatures: [
      "Cash Flow Forecasting",
      "What-if Scenarios",
      "Multi-currency",
      "Bank feeds",
      "Scenario comparison",
      "KPI tracking"
    ],
    strengths: ["Лучший cash flow forecasting", "What-if сценарии", "Простой"],
    weaknesses: ["Недоступен в РФ", "Только cash flow"],
    userReviews: [
      {
        source: "Trustpilot",
        rating: 4.7,
        positive: ["Лучший прогноз ДДС", "What-if сценарии"],
        negative: ["Только cash flow", "Нет бухучета"]
      }
    ],
    threatLevel: 'low'
  },
  {
    name: "SberAnalytics",
    url: "https://sberanalytics.ru/",
    segment: ["holding", "msb"],
    pricing: "Индивидуально",
    keyFeatures: [
      "Big Data аналитика",
      "Конкурентный анализ",
      "Оценка рынков",
      "B2B и B2C исследования",
      "Маркетинговые исследования"
    ],
    strengths: ["Big Data Сбера", "Огромная база данных", "Российский"],
    weaknesses: ["Только для крупного бизнеса", "Очень дорого", "Нет самообслуживания"],
    userReviews: [],
    threatLevel: 'medium'
  }
];


// ============================================================
// СЕКЦИЯ 2: АНАЛИЗ ОТЗЫВОВ ПО ПЛОЩАДКАМ
// ============================================================

export interface ReviewInsight {
  platform: string;
  commonComplaints: string[];
  commonPraises: string[];
  featureRequests: string[];
}

export const REVIEW_INSIGHTS: ReviewInsight[] = [
  {
    platform: "VC.ru",
    commonComplaints: [
      "1С — ужасный UI, 10 лет без изменений",
      "Контур — нет аналитики прибыли",
      "МойСклад — нет финансовой аналитики",
      "MPStats — дорого и задержка данных",
      "Все решения — слишком сложные для малого бизнеса"
    ],
    commonPraises: [
      "МойСклад — лучший UI среди российских решений",
      "Контур — простота облачной бухгалтерии",
      "MPStats — точная аналитика для селлеров"
    ],
    featureRequests: [
      "AI-аналитика как в QuickBooks",
      "Простые дашборды для CEO",
      "What-if сценарии",
      "Прогнозирование DCF",
      "Консолидация нескольких компаний"
    ]
  },
  {
    platform: "Otzoвик / AppStore",
    commonComplaints: [
      "Плохая техническая поддержка у всех",
      "Дорого за то, что дают",
      "Баги в обновлениях",
      "Нет импорта выписок из разных банков"
    ],
    commonPraises: [
      "Простота использования",
      "Облачный доступ",
      "Автоотчетность"
    ],
    featureRequests: [
      "Импорт выписок из любых банков (PDF, Excel)",
      "AI-рекомендации",
      "Экспорт красивых отчетов для инвесторов"
    ]
  },
  {
    platform: "Soft.ru",
    commonComplaints: [
      "Сложность настройки",
      "Отсутствие интеграций между модулями",
      "Дорогое обслуживание"
    ],
    commonPraises: [
      "Надежность 1С",
      "Полнота функционала"
    ],
    featureRequests: [
      "Современный UI",
      "AI-помощник",
      "Визуальные дашборды"
    ]
  }
];


// ============================================================
// СЕКЦИЯ 3: GAP-АНАЛИЗ — чего НЕ ХВАТАЕТ конкурентам
// ============================================================

export const GAP_ANALYSIS = {
 无人满足: [
    {
      gap: "Единая платформа для ВСЕХ сегментов (физлицо → холдинг)",
      description: "Ни один конкурент не покрывает весь спектр от личных финансов до консолидации холдингов",
      opportunity: "financier.ai уже имеет 6 профилей — это уникальное преимущество"
    },
    {
      gap: "AI-аналитика + парсинг документов (PDF, Excel, OSV)",
      description: "Конкуренты либо имеют AI (QuickBooks), либо парсинг (1С), но не оба",
      opportunity: "financier.ai парсит PDF, Excel, OSV + использует LLM — уникальное combo"
    },
    {
      gap: "What-if сценарии + Cash Flow Forecasting в российском ПО",
      description: "Float и Pulse делают это отлично, но недоступны в РФ",
      opportunity: "Уже реализовано в competitorFeatures.ts — нужно вывести на UI"
    },
    {
      gap: "Мульти-профильная аналитика",
      description: "Селлер может быть также ИП — ни один продукт не объединяет эти роли",
      opportunity: "financier.ai позволяет переключаться между профилями"
    }
  ],
  слабые_месты_конкурентов: [
    {
      competitor: "1С",
      weakness: "Ужасный UI/UX, нет AI, нет визуальных дашбордов",
      ourAdvantage: "Современный UI, AI-презентации, RichAnalytics"
    },
    {
      competitor: "Контур",
      weakness: "Только бухучет, нет аналитики и рекомендаций",
      ourAdvantage: "Полная аналитика + AI-рекомендации + what-if"
    },
    {
      competitor: "МойСклад",
      weakness: "Нет финансовой аналитики (P&L, DCF, KPI)",
      ourAdvantage: "Полная финансовая аналитика + OSV парсинг"
    },
    {
      competitor: "MPStats",
      weakness: "Только маркетплейсы, нет интеграции с банками",
      ourAdvantage: "Маркетплейсы + банковские выписки + OSV"
    },
    {
      competitor: "Дзен-мани",
      weakness: "Привязка к Тинькофф, нет документооборота",
      ourAdvantage: "Мультибанк, импорт любых документов"
    }
  ]
};


// ============================================================
// СЕКЦИЯ 4: ПЛАН УЛУЧШЕНИЯ (Roadmap)
// ============================================================

export interface RoadmapItem {
  id: string;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  title: string;
  description: string;
  competitorInspiration: string;
  estimatedEffort: 'small' | 'medium' | 'large';
  status: 'planned' | 'in_progress' | 'done';
  dependencies?: string[];
}

export const ROADMAP: RoadmapItem[] = [
  // P0 — КРИТИЧЕСКИЕ
  {
    id: "R001",
    priority: 'P0',
    title: "Вывести конкурентные фичи на UI (Dashboard)",
    description: "competitorFeatures.ts содержит 9 мощных модулей (Budget vs Actual, Cost Accounting, What-If, Cash Flow Forecast, KPI Dashboard и др.), но они не отображаются в UI. Нужно создать табы/секции в RichAnalyticsReport для каждого модуля.",
    competitorInspiration: "QuickBooks (AI Insights), Float (Cash Flow), SAP B1 (Costing)",
    estimatedEffort: 'large',
    status: 'planned'
  },
  {
    id: "R002",
    priority: 'P0',
    title: "Интерактивный KPI-Дашборд",
    description: "Создать визуальный дашборд с KPI-карточками (выручка, маржа, DSO, DPO, ликвидность) с цветовой индикацией (зеленый/желтый/красный) и трендами. Данные из generateKPIDashboard().",
    competitorInspiration: "QuickBooks Dashboard, Kontur.Metrica",
    estimatedEffort: 'medium',
    status: 'planned'
  },
  {
    id: "R003",
    priority: 'P0',
    title: "What-If Сценарии с визуализацией",
    description: "Добавить интерактивную панель what-if сценариев: ползунки для изменения выручки/расходов, мгновенный пересчет прибыли. 4 предустановленных сценария + пользовательский.",
    competitorInspiration: "Float, Pulse",
    estimatedEffort: 'medium',
    status: 'planned'
  },
  {
    id: "R004",
    priority: 'P0',
    title: "Прогнозирование Cash Flow на 6-12 месяцев",
    description: "Визуализация прогноза ДДС с графиками, цветовой индикацией дефицита ликвидности, рекомендациями по пополнению.",
    competitorInspiration: "Float, Pulse, QuickBooks",
    estimatedEffort: 'medium',
    status: 'planned'
  },
  
  // P1 — ВАЖНЫЕ
  {
    id: "R005",
    priority: 'P1',
    title: "AI-рекомендации с приоритетами",
    description: "Вывести generateRecommendations() на UI в виде карточек с приоритетами (high/medium/low), категориями и потенциальным влиянием. Добавить кнопку 'Принять рекомендацию'.",
    competitorInspiration: "QuickBooks Live Bookkeeping, Xero Adviser",
    estimatedEffort: 'medium',
    status: 'planned'
  },
  {
    id: "R006",
    priority: 'P1',
    title: "Budget vs Actual с редактируемым бюджетом",
    description: "Пользователь может задать плановые значения по категориям, система показывает отклонения с цветовой индикацией. Данные сохраняются в localStorage.",
    competitorInspiration: "1С:Бюджетирование, Float",
    estimatedEffort: 'medium',
    status: 'planned'
  },
  {
    id: "R007",
    priority: 'P1',
    title: "Сравнение периодов (MoM, YoY)",
    description: "График сравнения выручки/расходов по месяцам с процентом роста/падения. Автоматическое выявление аномалий.",
    competitorInspiration: "QuickBooks, 1С",
    estimatedEffort: 'small',
    status: 'planned'
  },
  {
    id: "R008",
    priority: 'P1',
    title: "Мультивалютные позиции с актуальными курсами ЦБ",
    description: "Отображение валютных позиций с курсами ЦБ РФ (интегрировать cbrService.ts), автоматический пересчет в рубли.",
    competitorInspiration: "SAP B1, QuickBooks",
    estimatedEffort: 'small',
    status: 'planned'
  },
  {
    id: "R009",
    priority: 'P1',
    title: "Экспорт отчетов в PDF/Excel с брендингом",
    description: "Красивые отчеты для показа инвесторам/банкам: P&L, Cash Flow, Balance Sheet, KPI Dashboard. Форматы: PDF (для презентации) и Excel (для дальнейшей работы).",
    competitorInspiration: "QuickBooks Reports, Xero",
    estimatedEffort: 'medium',
    status: 'planned'
  },

  // P2 — ЖЕЛАТЕЛЬНЫЕ
  {
    id: "R010",
    priority: 'P2',
    title: "Себестоимость (Cost Accounting) по продуктам",
    description: "Расчет себестоимости с разбивкой на материалы, труд, накладные. Интеграция с данными ОСВ (счета 20, 25, 26, 41).",
    competitorInspiration: "SAP B1, 1С:УПП",
    estimatedEffort: 'medium',
    status: 'planned'
  },
  {
    id: "R011",
    priority: 'P2',
    title: "Умная категоризация транзакций (ML)",
    description: "Автоматическая категоризация на основе ML: анализ назначения платежа, контрагента, суммы. Обучение на действиях пользователя.",
    competitorInspiration: "QuickBooks Auto-Categorization, Tinkoff",
    estimatedEffort: 'large',
    status: 'planned'
  },
  {
    id: "R012",
    priority: 'P2',
    title: "Мониторинг контрагентов (риск-анализ)",
    description: "Проверка контрагентов по ЕГРЮЛ/ЕГРИП: признаки мошенничества, суды, долги, блокировки. Интеграция с API ФНС.",
    competitorInspiration: "Контур.Фокус, СПАРК",
    estimatedEffort: 'large',
    status: 'planned'
  },
  {
    id: "R013",
    priority: 'P2',
    title: "Автоматический импорт банковских выписок",
    description: "Подключение к API банков (Сбер, Тинькофф, Альфа) для автоматической загрузки выписок. Fintech-интеграции.",
    competitorInspiration: "QuickBooks Bank Feeds, Plaid",
    estimatedEffort: 'large',
    status: 'planned'
  },
  {
    id: "R014",
    priority: 'P2',
    title: "Финансовая подушка и планирование",
    description: "Калькулятор финансовой подушки (6 месяцев расходов), план накоплений, цели с прогресс-барами.",
    competitorInspiration: "Дзен-мани, CoinKeeper",
    estimatedEffort: 'small',
    status: 'planned'
  },

  // P3 — BONUS
  {
    id: "R015",
    priority: 'P3',
    title: "Мобильное приложение (PWA)",
    description: "Progressive Web App с push-уведомлениями, offline-режимом, сканированием чеков.",
    competitorInspiration: "Все конкуренты имеют мобильные приложения",
    estimatedEffort: 'large',
    status: 'planned'
  },
  {
    id: "R016",
    priority: 'P3',
    title: "Командный доступ и роли",
    description: "Мультипользовательский доступ с ролями: CEO (только просмотр), Бухгалтер (полный доступ), Аналитик (редактирование).",
    competitorInspiration: "1С, SAP B1",
    estimatedEffort: 'medium',
    status: 'planned'
  },
  {
    id: "R017",
    priority: 'P3',
    title: "API для интеграций",
    description: "REST API для интеграции с 1С, МойСклад, CRM, маркетплейсами.",
    competitorInspiration: "МойСклад API, QuickBooks API",
    estimatedEffort: 'large',
    status: 'planned'
  }
];


// ============================================================
// СЕКЦИЯ 5: ПРИОРИТЕТИЗИРОВАННЫЙ СПИСОК ДЛЯ РЕАЛИЗАЦИИ
// ============================================================

export function getPrioritizedTasks(): RoadmapItem[] {
  return ROADMAP.sort((a, b) => {
    const priorityOrder: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });
}

export function getCompetitorsBySegment(segment: string): CompetitorProfile[] {
  return COMPETITORS.filter(c => c.segment.includes(segment));
}

export function getTopThreats(): CompetitorProfile[] {
  return COMPETITORS.filter(c => c.threatLevel === 'critical' || c.threatLevel === 'high')
    .sort((a, b) => {
      const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
      return order[a.threatLevel] - order[b.threatLevel];
    });
}