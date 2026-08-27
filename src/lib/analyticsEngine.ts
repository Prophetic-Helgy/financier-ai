import { ParsedTransaction, ParsedDocument } from "./parsers/bankParsers";

export function runHeuristicAnalysis(doc: ParsedDocument): string {
  const transactions = doc.transactions;

  if (transactions.length === 0) {
     let res = "### ✨ Шаблонный Анализ невозможен (Нет линейных транзакций)\n\n";

     if (doc.extractedMetrics && Object.keys(doc.extractedMetrics).length > 0) {
        res += "Однако мы автоматически составили структуру найденных параметров:\n\n";
        const keys = Object.keys(doc.extractedMetrics);
        keys.forEach(k => {
           res += `- **${k}**: ${doc.extractedMetrics![k].toLocaleString('ru-RU')} ₽\n`;
        });
        res += "\n> Шаблоны могут показать эти метрики на графиках, но для связных выводов по ОСВ / Балансу мы рекомендуем использовать Нейросеть (LM Studio) кнопкой ниже.";
        return res;
     }

     if (doc.rawText && doc.rawText.length > 0) {
        res += "В файле обнаружен неструктурированный текст или форма бухгалтерской отчетности, которая не подается классическому парсингу.\n\n";
        res += "**Рекомендация:** Для анализа таких документов (ОСВ, Баланс, Договоры) воспользуйтесь вкладкой **Нейросеть (LM Studio)**, которая способна читать сырой текст и свободные формы отчетов.";
     } else {
        res += "Нет данных для анализа.";
     }
     return res;
  }

  const income = transactions.filter(t => t.type === 'income').reduce((s,t) => s+t.amount, 0);
  const expense = transactions.filter(t => t.type === 'expense').reduce((s,t) => s+t.amount, 0);
  const net = income - expense;

  let result = "### ✨ Структурный (Шаблонный) Анализ\n\n";
  result += `**Оборот:** Доходы: ${income.toLocaleString('ru-RU')} ₽ | Расходы: ${expense.toLocaleString('ru-RU')} ₽\n\n`;

  if (net > 0) {
    result += `✅ **Денежный поток (профицит):** +${net.toLocaleString('ru-RU')} ₽.\n\n`;
    result += `**Рекомендации:**\n`;
    result += `1. **Подушка безопасности:** У вас образовался профицит бюджета. Рекомендуется перевести 20-30% от свободного денежного потока в ликвидные инструменты (накопительные счета, ОФЗ).\n`;
    if (net > 100000) {
      result += `2. **Инвестиции:** Свободный капитал достаточно велик. Рассмотрите диверсификацию в акции широкого рынка или фонды (ETF) для защиты от инфляции.\n`;
    }
  } else if (net < 0) {
    result += `⚠️ **Кассовый разрыв (дефицит):** ${net.toLocaleString('ru-RU')} ₽.\n\n`;
    result += `**Рекомендации:**\n`;
    result += `1. **Аудит издержек:** Расходы превышают доходы. Необходим строгий контроль. Заморозьте все необязательные капитальные затраты.\n`;
    result += `2. **Кредитная нагрузка:** Если дефицит закрывается кредитными картами, рассмотрите рефинансирование долга в потребительский кредит по меньшей ставке.\n`;
  } else {
     result += `⚖️ **Нейтральный денежный поток.** Вы тратите всё, что зарабатываете. Риск потери покупательной способности из-за инфляции.\n`;
  }

  // Find largest expense
  const expenses = transactions.filter(t => t.type === 'expense').sort((a,b) => b.amount - a.amount);
  if (expenses.length > 0) {
     result += `\n**Ключевая зона оттока капитала:** Самая крупная транзакция составила **${expenses[0].amount.toLocaleString('ru-RU')} ₽** (${expenses[0].payee || expenses[0].purpose}). Проверьте, можно ли снизить эту статью расходов в следующем периоде.\n`;
  }

  return result;
}

export function generateHeuristicPresentation(doc: ParsedDocument): string {
  const transactions = doc.transactions;

  if (transactions.length === 0) {
     if (doc.extractedMetrics && Object.keys(doc.extractedMetrics).length > 0) {
        const metrics = doc.extractedMetrics;
        const manualAssets = metrics['Стоимость Активов (вручную)'] || 0;
        
        let md = `# Управленческий Отчет
## Структурный разбор ${doc.docType.toUpperCase()}
---
# Выписанные Показатели
## Данные из баланса и ОСВ

${Object.keys(metrics).filter(k => k !== 'Стоимость Активов (вручную)').map(k => `* **${k}:** ${metrics[k].toLocaleString('ru-RU')} ₽`).join('\n')}

${manualAssets > 0 ? `\n> **Учтенный капитал (через ручной ввод):** ${manualAssets.toLocaleString('ru-RU')} ₽` : ''}

---
# Офлайн Режим — Ограничение
## Требуется аналитика ИИ

К сожалению, офлайн шаблоны не могут точно понять всю глубину бухгалтерского баланса или Оборотно-сальдовой ведомости (ОСВ) без транзакций. 
Для получения глубокой финансовой презентации по этому отчету, **воспользуйтесь кнопкой «Запустить AI Аудит»** внизу дашборда.
`;
        return md;
     }

     return `# Документ: ${doc.docType.toUpperCase()}
---
## Невозможно построить стандартную презентацию
В этом документе не найдены чистые транзакции (возможно, это ОСВ или Баланс), и мы не смогли автоматически выделить маркеры для офлайн-режима.
Рекомендуется использовать ИИ-аналитику для расшифровки сырого текста.
`;
  }

  const OPEX_KEYWORDS = ['аренда', 'маркетинг', 'реклам', 'услуг', 'связь', 'комисси', 'банк', 'офис', 'интернет', 'зарплата', 'зп', 'фонд'];
  const COGS_KEYWORDS = ['постав', 'материал', 'товар', 'закупка', 'логист', 'достав'];
  const TAX_KEYWORDS = ['налог', 'ндс', 'усн', 'фнс', 'страхов', 'взнос', 'пошлин', 'пенс'];
  const CAPEX_KEYWORDS = ['оборудован', 'техник', 'инвест', 'акции', 'брокер', 'мебель'];
  const FINANCING_INCOME_KEYWORDS = ['кредит', 'займ'];
  const FINANCING_EXPENSE_KEYWORDS = ['гашение', 'погашение кредита', 'дивиденд'];

  let revenue = 0, cogs = 0, opex = 0, taxes = 0;
  let capex = 0, financingIn = 0, financingOut = 0;

  transactions.forEach(tx => {
     const text = ((tx.purpose || '') + ' ' + (tx.payee || tx.payer || '')).toLowerCase();
     if (tx.type === 'income') {
         if (FINANCING_INCOME_KEYWORDS.some(k => text.includes(k))) financingIn += tx.amount;
         else revenue += tx.amount;
     } else {
         if (TAX_KEYWORDS.some(k => text.includes(k))) taxes += tx.amount;
         else if (COGS_KEYWORDS.some(k => text.includes(k))) cogs += tx.amount;
         else if (CAPEX_KEYWORDS.some(k => text.includes(k))) capex += tx.amount;
         else if (FINANCING_EXPENSE_KEYWORDS.some(k => text.includes(k))) financingOut += tx.amount;
         else opex += tx.amount;
     }
  });

  const grossProfit = revenue - cogs;
  const ebitda = grossProfit - opex;
  const netProfit = ebitda - taxes;
  const operatingCF = revenue - cogs - opex - taxes;

  const revenueStr = revenue.toLocaleString('ru-RU');
  const ebitdaStr = ebitda.toLocaleString('ru-RU');
  const netProfitStr = netProfit.toLocaleString('ru-RU');
  const ebitdaMargin = revenue > 0 ? ((ebitda/revenue)*100).toFixed(1) : '0';

  const expenses = transactions.filter(t => t.type === 'expense').sort((a,b) => b.amount - a.amount);
  const topExpenses = expenses.slice(0, 3).map(t => `- **${t.amount.toLocaleString('ru-RU')} ₽** — ${t.payee || t.purpose}`).join('\n');

  return `# Финансовый Отчет CFO
## Эвристическая сводка по загруженным данным
---
# ОПиУ (Отчет обо прибылях и убытках)
## Ключевые показатели рентабельности

* **Выручка (Опер. поступления):** ${revenueStr} ₽ 
* **Себестоимость (COGS):** -${cogs.toLocaleString('ru-RU')} ₽ 
* **Валовая Прибыль:** ${grossProfit.toLocaleString('ru-RU')} ₽ 
* **Опер. Расходы (OPEX):** -${opex.toLocaleString('ru-RU')} ₽ 
* **EBITDA:** ${ebitdaStr} ₽ (Маржа: ${ebitdaMargin}%)
* **Налоги:** -${taxes.toLocaleString('ru-RU')} ₽ 
* **Чистая Прибыль:** **${netProfitStr} ₽**

> Модель оценивает, что чистая прибыль составляет примерно ${netProfit > 0 ? '+' : ''}${netProfitStr} рублей ("наличным" методом).
---
# ДДС (Отчет о движении денежных средств)
## Структура ликвидности

1. **Операционный поток (CFO):** ${operatingCF.toLocaleString('ru-RU')} ₽ 
   *(Обеспечивает базу бизнеса)*
2. **Инвестиционный поток (CFI):** -${capex.toLocaleString('ru-RU')} ₽ 
   *(Покупка оборудования, активов)*
3. **Финансовый поток (CFF):** ${(financingIn - financingOut).toLocaleString('ru-RU')} ₽ 
   *(Кредиты и их погашение)*

---
# Анализ Операционных Костов
## Топ-3 оттока капитала

Мы проанализировали структуру ваших списаний и выделили ключевых контрагентов:

${topExpenses}

---
# Резюме Стейкхолдерам
## Стратегический вектор

${netProfit > 0 ? "✅ **Бизнес показывает рентабельность.**\nВажнейшая задача на следующий период — контроль OPEX, чтобы рентабельность по EBITDA не снижалась при масштабировании." : "⚠️ **Убыточность операционной модели.**\nБизнес сжигает капитал. Срочно необходим глубокий аудит себестоимости и сокращение дискреционных операционных затрат (Офис, Маркетинг, Представительские)."}

> Отчет сгенерирован автоматически из ${transactions.length} транзакций.
`;
}

export async function runLocalLLMPresentation(
  doc: ParsedDocument, 
  endpoint: string, 
  slideCount: number = 5,
  slideTopics: string[] = []
): Promise<string> {
  if (!endpoint) return "❌ Ошибка: Не указан URL локальной модели.";
  if (!doc.rawText && doc.transactions.length === 0) return "Нет данных для контекста нейросети.";

  let contextString = "";
  if (doc.transactions.length > 0) {
     const sample = doc.transactions.slice(0, 50);
     contextString = `Выписка по операциям:\n${JSON.stringify(sample)}`;
  } else {
     const text = doc.rawText.substring(0, 8000); // Send up to ~4k tokens
     contextString = `Данные документа (${doc.docType}):\n\`\`\`\n${text}\n\`\`\``;
  }

  // Build slide topics instruction
  let topicsInstruction = "";
  if (slideTopics && slideTopics.length > 0) {
    const numberedTopics = slideTopics.map((t, i) => `${i + 1}. ${t}`).join('\n');
    topicsInstruction = `\n\n**Обязательная структура слайдов (темы):**\n${numberedTopics}`;
  }

  const payload = {
    model: "local-model",
    messages: [
      { 
        role: "system", 
        content: `Ты — AI-Презентатор (в стиле Gamma.app/Pitch), формирующий элегантный отчет для инвесторов.
Правила:
1. Выдай презентацию строго в Markdown формате.
2. Используй разделитель '---' между слайдами. Не используй его для других целей.
3. Первый слайд сделай крутым Title (Титульным слайдом) с одним главным заголовком (Один #).
4. Во втором слайде выдели главные метрики или выводы.
5. Обязательно дай 1-2 слайда с детальным разбором рисков и точек роста.
6. Вёрстка слайдов должна быть красивой, используй жирный шрифт, маркеры и цитаты.
7. Создай ровно ${slideCount} слайдов.${topicsInstruction}
Отвечай строго на русском без прелюдий. Не обрывай ответ на полуслове — допиши все слайды до конца.` 
      },
      { role: "user", content: contextString }
    ],
    temperature: 0.3,
    max_tokens: 4000,
  };

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return data.choices[0].message.content;
  } catch (err: any) {
    if (err.message.includes('Failed to fetch') && (endpoint.includes('192.168') || endpoint.includes('10.'))) {
        return `❌ **Сбой генерации презентации (ИИ): Браузер заблокировал запрос.**\n\nМодель недоступна. Из-за политики безопасности браузера (Mixed Content), сайт, работающий по \`https://\`, не может отправить запрос на локальный IP-адрес (\`${endpoint}\`).\n\n**КАК ИСПРАВИТЬ:** В настройках замените \`192.168.x.x\` на \`127.0.0.1\` или \`localhost\`, например: \`http://127.0.0.1:1234/v1/chat/completions\`.`;
    }
    return `❌ **Сбой генерации презентации (ИИ):**\n\nМодель недоступна. ${err.message}`;
  }
}

export async function runLocalLLMAnalysis(doc: ParsedDocument, endpoint: string): Promise<string> {
  if (!endpoint) {
    return "❌ Ошибка: Не указан URL локальной модели.";
  }
  
  if (!doc.rawText && doc.transactions.length === 0) return "Нет данных для контекста нейросети.";

  let contextString = "";

  if (doc.transactions.length > 0) {
     const sample = doc.transactions.slice(0, 50);
     contextString = `Выписка по операциям:\n${JSON.stringify(sample)}`;
  } else {
     // Provide raw text for things like Balance Sheets or OSV
     const text = doc.rawText.substring(0, 8000); // Send up to ~4k tokens
     contextString = `Текст финансового документа (${doc.docType}):\n\`\`\`\n${text}\n\`\`\``;
  }
  
  const payload = {
    model: "local-model",
    messages: [
      { 
        role: "system", 
        content: "Ты — высококвалифицированный финансовый директор (CFO), аудитор и главный бухгалтер. Проанализируй этот финансовый документ (это может быть выписка, ОСВ, Баланс или договор), найди закономерности, укажи на риски и дай 3 профессиональных совета. Отвечай строго на русском языке в формате Markdown с выделением главного жирным шрифтом." 
      },
      { 
        role: "user", 
        content: contextString 
      }
    ],
    temperature: 0.4,
    max_tokens: 1500,
  };

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
       throw new Error(`Сервер ответил статусом: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return "### 🤖 Ответ Нейро-Аналитика (LM Studio)\n\n" + data.choices[0].message.content;
  } catch (err: any) {
    if (err.message.includes('Failed to fetch') && (endpoint.includes('192.168') || endpoint.includes('10.'))) {
        return `❌ **Сбой аналитики (ИИ): Браузер заблокировал запрос.**\n\nИз-за политики безопасности браузера (Mixed Content), сайт, работающий по \`https://\`, не может отправить запрос на локальный IP-адрес сети (\`${endpoint}\`).\n\n**КАК ИСПРАВИТЬ:** В настройках LM Studio URL замените \`192.168.x.x\` на \`127.0.0.1\` или \`localhost\`, например: \`http://127.0.0.1:1234/v1/chat/completions\`. Иначе браузер откажется посылать данные.`;
    }
    return `❌ **Ошибка подключения к локальной модели (LM Studio):**\n\nНе удалось установить соединение с ${endpoint}.\n\n**ЧЕКЛИСТ ПРОВЕРКИ:**\n1. Убедитесь, что **LM Studio** запущен.\n2. Включите **CORS**.\n3. Убедитесь, что в поле URL указана модель или \`model: local-model\` поддерживается сервером.\n\n*Системная ошибка:* \`${err.message}\``;
  }
}
