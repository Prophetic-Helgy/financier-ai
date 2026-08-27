import { Briefcase, Users, User, Building2, Store, ShoppingCart } from "lucide-react";
import React from "react";
import { cn } from "../lib/utils";

interface PricingCardProps {
  mode: string;
  title: string;
  description: string;
  icon: React.ElementType;
  features: string[];
  hoverBorderClass: string;
  iconBgClass: string;
  iconColorClass: string;
  dotClass: string;
  statLabel: string;
  statValue: React.ReactNode;
  isSpecial?: boolean;
  onClick: (mode: string) => void;
}

function ModeCard({ mode, title, description, icon: Icon, features, hoverBorderClass, iconBgClass, iconColorClass, dotClass, statLabel, statValue, isSpecial, onClick }: PricingCardProps) {
  return (
    <div 
      onClick={() => onClick(mode)}
      className={cn(
        "bg-[var(--surface)] border border-[var(--border)] p-6 rounded-xl transition-colors cursor-pointer group flex flex-col hover:shadow-xl",
        hoverBorderClass,
        isSpecial && "border-indigo-500/40 bg-indigo-500/5 shadow-lg shadow-indigo-500/10"
      )}
    >
      <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center mb-4 transition-colors", iconBgClass)}>
        <Icon className={cn("h-6 w-6", iconColorClass)} />
      </div>
      
      <h2 className="text-xl font-semibold text-[var(--fg)] mb-2">{title}</h2>
      
      <p className="text-[var(--text-muted)] text-xs mb-6 h-12">
        {description}
      </p>

      <ul className="text-xs space-y-2 text-[var(--text-muted)] mb-8 flex-1">
        {features.map((feature, idx) => (
          <li key={idx} className="flex items-start">
            <span className={cn("w-1.5 h-1.5 rounded-full mr-2 flex-shrink-0 mt-1", dotClass)}></span>
            <span className="leading-tight">{feature}</span>
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-4 border-t border-[var(--border)]">
        <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">{statLabel}</div>
        <div className={cn("text-lg font-mono", iconColorClass)}>{statValue}</div>
      </div>
    </div>
  );
}

export function Home({ onSelectMode }: { onSelectMode: (mode: string) => void }) {
  return (
    <div className="flex-1 p-8 flex flex-col w-full max-w-[1400px] mx-auto h-full">
      <div className="mb-8">
        <h1 className="text-3xl font-light text-[var(--fg)] mb-2">
          Умное управление финансами
        </h1>
        <p className="text-[var(--text-muted)] text-sm max-w-3xl">
          Выберите подходящий профиль, чтобы получить доступ к аналитике, автоматическому импорту выписок и AI-рекомендациям. Все расчеты учитывают текущую инфляцию и курсы валют ЦБ РФ.
        </p>
      </div>

        {/* Кабинеты в порядке: Физ лицо → Семья → Самозанятые/ИП → Селлеры → МСБ → Холдинги */}
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-8 w-full">
          {/* 1. Физическое лицо */}
          <ModeCard 
            mode="personal"
            onClick={onSelectMode}
            title="Физлицо"
            description="Личный финансовый план, аналитика доходов и расходов, создание подушки."
            icon={User}
            hoverBorderClass="hover:border-emerald-500/50"
            iconBgClass="bg-emerald-500/10 group-hover:bg-emerald-500/20"
            iconColorClass="text-emerald-500"
            dotClass="bg-emerald-500"
            statLabel="Инвестиции"
            statValue={<>Акции, Вклады, Крипта</>}
            features={[
              "Анализ банковских выписок",
              "Загрузка отчетов из ФНС",
              "Умное гашение кредитов (ставка vs инфляция)",
              "Расчет финансовой подушки (6 мес)",
              "Учет активов (вклады, крипта, недвижимость)"
            ]}
          />
          {/* 2. Семья */}
          <ModeCard 
            mode="family"
            onClick={onSelectMode}
            title="Семья"
            description="Совместный бюджет, распределение затрат и общие цели накоплений."
            icon={Users}
            hoverBorderClass="hover:border-cyan-500/50"
            iconBgClass="bg-cyan-500/10 group-hover:bg-cyan-500/20"
            iconColorClass="text-cyan-500"
            dotClass="bg-cyan-500"
            statLabel="Общий бюджет"
            statValue="Консолидация"
            features={[
              "Мультиаккаунтный доступ",
              "Анализ общих и личных выписок",
              "Планирование семейных целей",
              "Учет всех активов семьи (в т.ч. недвижимость)",
              "Рекомендации по распределению трат"
            ]}
          />
          {/* 3. Самозанятые / ИП */}
          <ModeCard 
            mode="selfemployed"
            onClick={onSelectMode}
            title="Самозанятый / ИП"
            description="Аналитика доходов и расходов, расчет налогов НПД/УСН, рекомендации по оптимизации."
            icon={Store}
            hoverBorderClass="hover:border-amber-500/50"
            iconBgClass="bg-amber-500/10 group-hover:bg-amber-500/20"
            iconColorClass="text-amber-500"
            dotClass="bg-amber-500"
            statLabel="Налоги"
            statValue="НПД / УСН / Патент"
            features={[
              "Анализ выписок и категоризация",
              "Расчет НПД 4%/6% и УСН 6%/15%",
              "Проверка лимита 2.4 млн/год",
              "Структура доходов по источникам",
              "Рекомендации по налогообложению"
            ]}
          />
          {/* 4. Селлеры маркетплейсов */}
          <ModeCard 
            mode="seller"
            onClick={onSelectMode}
            title="Селлер маркетплейсов"
            description="Unit-экономика, калькулятор цен, ROI рекламы, точки безубыточности WB/Ozon."
            icon={ShoppingCart}
            hoverBorderClass="hover:border-violet-500/50"
            iconBgClass="bg-violet-500/10 group-hover:bg-violet-500/20"
            iconColorClass="text-violet-500"
            dotClass="bg-violet-500"
            statLabel="Платформы"
            statValue="WB / Ozon / Яндекс"
            features={[
              "Калькулятор себестоимости и цены",
              "Unit-экономика товара",
              "Точка безубыточности",
              "ROI/ROMI внутренней рекламы",
              "Аналитика по WB, Ozon, Яндекс.Маркет"
            ]}
          />
          {/* 5. Малый и средний бизнес */}
          <ModeCard 
            mode="msb"
            onClick={onSelectMode}
            title="МСБ"
            description="Анализ ОСВ, кэшфлоу, построение финмоделей и разработка бизнес-планов."
            icon={Briefcase}
            hoverBorderClass="hover:border-indigo-400/50"
            iconBgClass="bg-indigo-500/10 group-hover:bg-indigo-500/20"
            iconColorClass="text-indigo-400"
            dotClass="bg-indigo-400"
            statLabel="Чистый поток"
            statValue="AI Анализ"
            features={[
              "Парсинг выписок 1С и CSV",
              "Анализ отчетности (РСБУ)",
              "Бизнес-план под соцконтракт/кредит",
              "Финансовая модель и Cash Flow",
              "Учет корпоративных вложений и депозитов"
            ]}
          />
          {/* 6. Холдинги */}
          <ModeCard 
            mode="holding"
            onClick={onSelectMode}
            title="Холдинги"
            description="Глубокая консолидация, аудит дочерних предприятий, трансфертное ценообразование."
            icon={Building2}
            hoverBorderClass="hover:border-rose-400/50"
            iconBgClass="bg-rose-500/20"
            iconColorClass="text-rose-400"
            dotClass="bg-rose-400"
            isSpecial={true}
            statLabel="Консолидация"
            statValue="МСФО / GAAP"
            features={[
              "Консолидированная аналитика ГК",
              "Международная отчетность (МСФО)",
              "Мультивалютный учет (USD, EUR, CNY)",
              "Аудит и диагностика корпораций",
              "Питч-деки для институциональных инвесторов"
            ]}
          />
        </div>
    </div>
  );
}
