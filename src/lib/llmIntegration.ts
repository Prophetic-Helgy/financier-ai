/**
 * Интеграция с локальными LLM через LM Studio API (OpenAI совместимый)
 * По аналогии с Cline: автообнаружение, кэширование настроек, универсальные промпты
 */

export interface LLMConfig {
  endpoint: string;
  model: string;
  apiKey?: string;
}

const DEFAULT_ENDPOINT = "http://127.0.0.1:1234/v1/chat/completions";
const PORTABLE_ENDPOINT = "https://example.com/v1/chat/completions";
const STORAGE_KEY = "llm_config";

/** Check if running in portable (distribution) mode */
export function isPortableMode(): boolean {
  // In portable mode, the endpoint will be the placeholder
  const config = getDefaultConfig();
  return config.endpoint === PORTABLE_ENDPOINT;
}

/** Get placeholder text explaining how to fill the endpoint */
export function getPortablePlaceholder(): string {
  return "https://example.com/v1/chat/completions";
}

/** Get instructions for configuring the LLM endpoint */
export function getEndpointInstructions(): string {
  return `Для подключения к вашей AI-модели:
1. Укажите URL вашего LM Studio сервера
2. Формат: http://<IP-адрес>:1234/v1/chat/completions
3. Пример: http://127.0.0.1:1234/v1/chat/completions`;
}

// Polyfill для Node.js (localStorage недоступен в CLI)
function getStorage(): Map<string, string> {
  if (typeof localStorage !== 'undefined') return localStorage as any;
  return new Map();
}

export function getDefaultConfig(): LLMConfig {
  const storage = getStorage() as any;
  let saved: string | undefined;
  
  try {
    if ('getItem' in storage) saved = storage.getItem(STORAGE_KEY);
    else saved = (storage as Map<string,string>).get(STORAGE_KEY);
  } catch {}
  
  if (saved) {
    try { return JSON.parse(saved); } catch {}
  }
  
  return { endpoint: DEFAULT_ENDPOINT, model: "local-model" };
}

export function saveConfig(config: LLMConfig): void {
  const storage = getStorage() as any;
  try {
    if ('setItem' in storage) storage.setItem(STORAGE_KEY, JSON.stringify({ ...config, timestamp: Date.now() }));
    else (storage as Map<string,string>).set(STORAGE_KEY, JSON.stringify({ ...config, timestamp: Date.now() }));
  } catch {}
}

// ==================== АВТООБНАРУЖЕНИЕ LM STUDIO ====================

export async function detectLocalLLM(): Promise<{ available: boolean; endpoint: string; models?: string[] }> {
  const endpoints = [
    "http://127.0.0.1:1234/v1/models",
    "http://localhost:1234/v1/models",
    "http://0.0.0.0:1234/v1/models",
  ];

  for (const url of endpoints) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      
      const response = await fetch(url, { method: "GET", signal: controller.signal });
      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        const models = data.data?.map((m: any) => m.id) || [];
        
        return { 
          available: true, 
          endpoint: url.replace("/v1/models", "/v1/chat/completions"),
          models 
        };
      }
    } catch {}
  }

  return { available: false, endpoint: DEFAULT_ENDPOINT };
}

// ==================== УНИВЕРСАЛЬНЫЙ ЗАПРОС К LLM ====================

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface LLMResponse {
  text: string;
  tokensUsed?: number;
  error?: string;
}

export async function chatWithLocalLLM(
  config: LLMConfig, 
  messages: ChatMessage[],
  options?: { temperature?: number; maxTokens?: number }
): Promise<LLMResponse> {
  
  const payload = {
    model: config.model || "local-model",
    messages,
    temperature: options?.temperature ?? 0.3,
    max_tokens: options?.maxTokens ?? 4000,
    stream: false,
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);
    
    const response = await fetch(config.endpoint, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        ...(config.apiKey ? { "Authorization": `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      return { 
        text: `Ошибка сервера ${response.status}: ${errorText.substring(0, 200)}`,
        error: `${response.status} ${response.statusText}`
      };
    }

    const data = await response.json();
    
    if (data.choices && data.choices[0] && data.choices[0].message) {
      return { 
        text: data.choices[0].message.content,
        tokensUsed: data.usage?.total_tokens
      };
    }

    return { text: "Нет ответа от модели", error: "Неверная структура ответа" };
  } catch (err: any) {
    let errorMsg = err.message || "Unknown error";
    
    if (err.name === "AbortError") {
      return { text: "", error: "Таймаут (60 сек). Модель перегружена или ответ слишком длинный." };
    }
    
    if (errorMsg.includes("Failed to fetch")) {
      return { 
        text: `⚠️ **Не удалось подключиться к ${config.endpoint}**\n\nLM Studio может быть:\n1. Не запущен — откройте LM Studio и нажмите "Start Server"\n2. Работает на другом порту — проверьте порт в настройках\n3. Блокируется CORS — в LM Studio включите CORS (Settings → Enable CORS)\n\n**Попробуйте:** http://127.0.0.1:1234/v1/chat/completions`,
        error: "connection_failed" 
      };
    }

    return { text: `Ошибка: ${errorMsg}`, error: errorMsg };
  }
}

// ==================== СТРИММИНГ (как в Cline) ====================

export async function chatWithLocalLLMStream(
  config: LLMConfig,
  messages: ChatMessage[],
  onChunk: (chunk: string) => void,
  options?: { temperature?: number; maxTokens?: number }
): Promise<{ done: boolean; error?: string }> {

  const payload = {
    model: config.model || "local-model",
    messages,
    temperature: options?.temperature ?? 0.3,
    max_tokens: options?.maxTokens ?? 4000,
    stream: true,
  };

  try {
    const response = await fetch(config.endpoint, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        ...(config.apiKey ? { "Authorization": `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      return { done: false, error: `HTTP ${response.status}` };
    }

    const reader = response.body?.getReader();
    if (!reader) return { done: false, error: "Нет stream" };

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      
      // Парсим SSE события
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const dataStr = line.slice(6);
          if (dataStr === "[DONE]") return { done: true };
          
          try {
            const json = JSON.parse(dataStr);
            const content = json.choices?.[0]?.delta?.content;
            if (content) onChunk(content);
          } catch {}
        }
      }
    }

    // Обработка оставшегося буфера
    if (buffer.startsWith("data: ")) {
      try {
        const json = JSON.parse(buffer.slice(6));
        const content = json.choices?.[0]?.delta?.content;
        if (content) onChunk(content);
      } catch {}
    }

    return { done: true };
  } catch (err: any) {
    return { done: false, error: err.message || "Connection failed" };
  }
}

// ==================== ПРОМПТЫ ДЛЯ ФИНАНСОВОГО АНАЛИЗА ====================

export function getFinancialAnalysisPrompt(docType: string, dataSummary: string): ChatMessage[] {
  return [
    {
      role: "system",
      content: `Ты — AI-Финансовый Директор (CFO) с опытом аудита. Твоя задача — проанализировать финансовый документ и дать профессиональную оценку.

Правила:
1. Отвечай строго на русском языке в формате Markdown
2. Используй **жирный** для ключевых метрик, >- цитаты для выводов
3. Структура анализа:
   - 📊 **Сводка**: что это за документ и основные цифры
   - 🔍 **Детальный разбор**: ключевые показатели и тренды
   - ⚠️ **Риски**: на что обратить внимание
   - 💡 **Рекомендации**: 3-5 конкретных шагов
4. Если данных недостаточно — укажи это явно
5. Не выдумывай цифры, работай только с предоставленными данными`
    },
    {
      role: "user",
      content: `Документ: ${docType}\n\nДанные:\n${dataSummary}`
    }
  ];
}

export function getPersonalFinancePrompt(doc: any): ChatMessage[] {
  return [
    {
      role: "system",
      content: `Ты — персональный финансовый консультант. Анализируй личные финансы клиента и давай советы по оптимизации бюджета, накоплениям, инвестициям и гашению кредитов.`
    },
    {
      role: "user", 
      content: `Финансовые данные клиента:\n${JSON.stringify(doc, null, 2)}`
    }
  ];
}

export function getBusinessPlanPrompt(metrics: Record<string, number>): ChatMessage[] {
  return [
    {
      role: "system",
      content: `Ты — консультант по бизнес-планированию. Помоги составить бизнес-план для подачи на соцконтраст или получения кредита в банке.`
    },
    {
      role: "user",
      content: `Финансовые метрики:\n${JSON.stringify(metrics, null, 2)}`
    }
  ];
}

export function getPitchDeckPrompt(docType: string, metrics: any): ChatMessage[] {
  return [
    {
      role: "system", 
      content: `Ты — AI-Презентатор (в стиле Gamma.app). Создай элегантную питч-дек презентацию для инвесторов или банков в формате Markdown.

Правила:
1. Разделитель '---' между слайдами
2. Первый слайд — титульный с одним # заголовком
3. Максимум 5-6 слайдов
4. Используй жирный шрифт, маркеры и цитаты`
    },
    {
      role: "user",
      content: `Финансовые данные для презентации:\n${JSON.stringify(metrics, null, 2)}`
    }
  ];
}
