/**
 * Калькуляторы для селлеров маркетплейсов
 */

export interface CostPriceParams {
  закупочнаяЦена: number;
  логистикаПоставщику: number;
  упаковка: number;
  таможня: number;
  хранилище: number;
}

export interface MarketplaceFees {
  комиссияМП: number;
  логистикаМП: number;
  оплатаПрож: number;
  возвраты: number;
  хранилищеМП: number;
  реклама: number;
  штрафы: number;
}

export interface SalePriceParams {
  целеваяМаржа: number;
  скидки: number;
  акции: number;
  ставкаРекламы?: number;
  реклама?: number;
}

// ==================== КАЛЬКУЛЯТОР СЕБЕСТОИМОСТИ ====================

export function calculateCostPrice(params: CostPriceParams): {
  закупка: number;
  логистикаПоставщику: number;
  упаковка: number;
  таможня: number;
  хранилище: number;
  итогоСебестоимость: number;
  себестоимостьСтруктура: { название: string; сумма: number; доля: number }[];
} {
  const закупка = params.закупочнаяЦена || 0;
  const логистикаПоставщику = params.логистикаПоставщику || 0;
  const упаковка = params.упаковка || 0;
  const таможня = Math.round(закупка * (params.таможня / 100) * 100) / 100;
  const хранилище = Math.round(закупка * (params.хранилище / 100) * 100) / 100;
  const итогоСебестоимость = Math.round((закупка + логистикаПоставщику + упаковка + таможня + хранилище) * 100) / 100;

  return {
    закупка,
    логистикаПоставщику,
    упаковка,
    таможня,
    хранилище,
    итогоСебестоимость,
    себестоимостьСтруктура: [
      { название: 'Закупочная цена', сумма: закупка, доля: закупка > 0 && итогоСебестоимость > 0 ? (закупка / итогоСебестоимость * 100) : 0 },
      { название: 'Логистика до поставщика', сумма: логистикаПоставщику, доля: логистикаПоставщику > 0 && итогоСебестоимость > 0 ? (логистикаПоставщику / итогоСебестоимость * 100) : 0 },
      { название: 'Упаковка', сумма: упаковка, доля: упаковка > 0 && итогоСебестоимость > 0 ? (упаковка / итогоСебестоимость * 100) : 0 },
      { название: 'Таможенная пошлина', сумма: таможня, доля: таможня > 0 && итогоСебестоимость > 0 ? (таможня / итогоСебестоимость * 100) : 0 },
      { название: 'Хранение на складе поставщика', сумма: хранилище, доля: хранилище > 0 && итогоСебестоимость > 0 ? (хранилище / итогоСебестоимость * 100) : 0 },
    ]
  };
}

// ==================== КАЛЬКУЛЯТОР ПРОДАЖНОЙ ЦЕНЫ ====================

export function calculateSalePrice(
  costPrice: number,
  marketplaceFees: MarketplaceFees,
  saleParams: SalePriceParams
): {
  себестоимость: number;
  комиссияМП: number;
  логистикаМП: number;
  оплатаПрож: number;
  возвраты: number;
  хранениеМП: number;
  реклама: number;
  штрафы: number;
  итогоРасходы: number;
  продажнаяЦена: number;
  прибыль: number;
  рентабельность: number;
} {
  const комиссияДоля = marketplaceFees.комиссияМП / 100;
  const оплатаПрожДоля = marketplaceFees.оплатаПрож / 100;
  const хранениеДоля = marketplaceFees.хранилищеМП / 100;
  const рекламаValue = (saleParams.реклама || saleParams.ставкаРекламы || 0);
  const рекламаДоля = рекламаValue / 100;

  const фиксРасходы = costPrice + marketplaceFees.логистикаМП + marketplaceFees.возвраты + marketplaceFees.штрафы;
  const маржаКоэффициент = 1 + (saleParams.целеваяМаржа || 0) / 100;
  const переменныеДоли = комиссияДоля + оплатаПрожДоля + хранениеДоля + рекламаДоля;

  // Цена = фикс. расходы × (1 + маржа) / (1 − переменные доли),
  // прибыль при такой цене = фикс. расходы × целевая маржа
  let продажнаяЦена: number;
  if (переменныеДоли >= 1) {
    продажнаяЦена = 0;
  } else {
    продажнаяЦена = Math.ceil(фиксРасходы * маржаКоэффициент / (1 - переменныеДоли));
  }

  const комиссияМПSum = Math.round(продажнаяЦена * marketplaceFees.комиссияМП / 100 * 100) / 100;
  const оплатаПрожSum = Math.round(продажнаяЦена * marketplaceFees.оплатаПрож / 100 * 100) / 100;
  const хранениеMPSSum = Math.round(продажнаяЦена * marketplaceFees.хранилищеМП / 100 * 100) / 100;
  const рекламаSum = Math.round(продажнаяЦена * рекламаValue / 100 * 100) / 100;

  const итогоРасходы = Math.round((costPrice + marketplaceFees.логистикаМП + комиссияМПSum + оплатаПрожSum +
                       marketplaceFees.возвраты + хранениеMPSSum + рекламаSum + marketplaceFees.штрафы) * 100) / 100;
  const прибыль = Math.round((продажнаяЦена - итогоРасходы) * 100) / 100;
  const рентабельность = продажнаяЦена > 0 ? (прибыль / продажнаяЦена * 100) : 0;

  return {
    себестоимость: costPrice,
    комиссияМП: комиссияМПSum,
    логистикаМП: marketplaceFees.логистикаМП,
    оплатаПрож: оплатаПрожSum,
    возвраты: marketplaceFees.возвраты,
    хранениеМП: хранениеMPSSum,
    реклама: рекламаSum,
    штрафы: marketplaceFees.штрафы,
    итогоРасходы,
    продажнаяЦена,
    прибыль,
    рентабельность: Math.round(рентабельность * 100) / 100,
  };
}

// ==================== UNIT-ЭКОНОМИКА ТОВАРА ====================

export function calculateUnitEconomics(params: {
  продажнаяЦена: number;
  себестоимость: number;
  комиссияМП: number;
  логистикаМП: number;
  рекламаНаЕдиницу: number;
  возвратыПроцент: number;
  стоимостьВозврата: number;
}): {
  доходНаЕдиницу: number;
  чистыйДоходСУчетомВозвратов: number;
  расходыНаЕдиницу: number;
  прибыльНаЕдиницу: number;
  рентабельностьUnit: number;
  breakdown: { название: string; сумма: number }[];
} {
  const { продажнаяЦена, себестоимость, комиссияМП, логистикаМП, рекламаНаЕдиницу, возвратыПроцент, стоимостьВозврата } = params;
  const доходНаЕдиницу = Math.round(продажнаяЦена * (1 - возвратыПроцент) * 100) / 100;
  const комиссияСумма = Math.round(продажнаяЦена * комиссияМП / 100 * 100) / 100;
  const расходыВозвратов = Math.round(стоимостьВозврата * возвратыПроцент * 100) / 100;
  const расходыНаЕдиницу = Math.round((себестоимость + логистикаМП + комиссияСумма + рекламаНаЕдиницу + расходыВозвратов) * 100) / 100;
  const прибыльНаЕдиницу = Math.round((доходНаЕдиницу - расходыНаЕдиницу) * 100) / 100;
  const рентабельностьUnit = доходНаЕдиницу > 0 ? (прибыльНаЕдиницу / доходНаЕдиницу * 100) : 0;

  return {
    доходНаЕдиницу,
    чистыйДоходСУчетомВозвратов: Math.round((продажнаяЦена - стоимостьВозврата * возвратыПроцент) * 100) / 100,
    расходыНаЕдиницу,
    прибыльНаЕдиницу,
    рентабельностьUnit: Math.round(рентабельностьUnit * 100) / 100,
    breakdown: [
      { название: 'Продажная цена', сумма: продажнаяЦена },
      { название: 'Себестоимость товара', сумма: -себестоимость },
      { название: 'Комиссия МП', сумма: -комиссияСумма },
      { название: 'Логистика МП', сумма: -логистикаМП },
      { название: 'Реклама на ед.', сумма: -рекламаНаЕдиницу },
      { название: 'Ожид. убыток от возвратов', сумма: -расходыВозвратов },
      { название: 'Прибыль на единицу', сумма: прибыльНаЕдиницу },
    ]
  };
}

// ==================== ТОЧКА БЕЗУБЫТОЧНОСТИ ====================

export function calculateBreakEven(params: {
  фиксированныеРасходы: number;
  ценаЕдиницы: number;
  переменныеРасходыНаЕдиницу: number;
}): {
  точкаБезубыточностиШтук: number;
  точкаБезубыточностиРубли: number;
  прибыльЗаМесяц: number[];
} {
  const маржинальнаяПрибыльНаЕдиницу = params.ценаЕдиницы - params.переменныеРасходыНаЕдиницу;

  if (маржинальнаяПрибыльНаЕдиницу <= 0) {
    return { точкаБезубыточностиШтук: Infinity, точкаБезубыточностиРубли: Infinity, прибыльЗаМесяц: [] };
  }

  const тбШтук = Math.ceil(params.фиксированныеРасходы / маржинальнаяПрибыльНаЕдиницу);
  const тбРубли = тбШтук * params.ценаЕдиницы;

  const прибыльЗаМесяц: number[] = [];
  for (let multiplier = 0.8; multiplier <= 1.5; multiplier += 0.1) {
    const units = Math.round(тбШтук * multiplier);
    прибыльЗаМесяц.push(Math.round((units * маржинальнаяПрибыльНаЕдиницу - params.фиксированныеРасходы) * 100) / 100);
  }

  return { точкаБезубыточностиШтук: тбШтук, точкаБезубыточностиРубли: Math.round(тбРубли), прибыльЗаМесяц };
}

// ==================== ROI / ROMI РЕКЛАМЫ ====================

export function calculateAdROI(params: {
  бюджетНаРекламу: number;
  стоимостьКлика: number;
  конверсияВЗаказ: number;
  среднийЧек: number;
  маржинальность: number;
}): {
  показыПримерные: number;
  клики: number;
  заказы: number;
  выручкаОтРекламы: number;
  валоваяПрибыль: number;
  ROMI: number;
  CPA: number;
  AOV: number;
} {
  const клики = params.бюджетНаРекламу / Math.max(0.01, params.стоимостьКлика);
  const заказы = Math.round(клики * params.конверсияВЗаказ / 100 * 100) / 100;
  const выручкаОтРекламы = Math.round(заказы * params.среднийЧек * 100) / 100;
  const валоваяПрибыль = Math.round(выручкаОтРекламы * params.маржинальность / 100 * 100) / 100;
  const ROMI = params.бюджетНаРекламу > 0 ? ((валоваяПрибыль - params.бюджетНаРекламу) / params.бюджетНаРекламу * 100) : 0;
  const CPA = заказы > 0 ? Math.round(params.бюджетНаРекламу / заказы) : 0;
  const показыПримерные = Math.round(клики / 0.02);

  return {
    показыПримерные,
    клики: Math.round(клики),
    заказы,
    выручкаОтРекламы,
    валоваяПрибыль,
    ROMI: Math.round(ROMI * 100) / 100,
    CPA,
    AOV: params.среднийЧек,
  };
}

// ==================== КАЛЬКУЛЯТОР СКИДОК И АКЦИЙ ====================

export function calculateDiscountImpact(params: {
  текущаяЦена: number;
  себестоимость: number;
  скидкиПроцент: number;
  ростОбъема: number;
}): {
  текущаяПрибыльНаЕд: number;
  новаяЦена: number;
  новаяПрибыльНаЕд: number;
  изменениеПрибылиНаЕд: number;
  необходимоеУвеличениеОбъема: number;
  итоговаяМаржинальность: number;
} {
  const текущаяПрибыль = params.текущаяЦена - params.себестоимость;
  const новаяЦена = Math.round(params.текущаяЦена * (1 - params.скидкиПроцент / 100));
  const новаяПрибыльНаЕд = новаяЦена - params.себестоимость;
  const необходимыйКоэффициентОбъема = текущаяПрибыль > 0 ? (текущаяПрибыль / Math.max(0.01, новаяПрибыльНаЕд)) : Infinity;
  const необходимоеУвеличениеОбъема = (необходимыйКоэффициентОбъема - 1) * 100;

  return {
    текущаяПрибыльНаЕд: Math.round(текущаяПрибыль * 100) / 100,
    новаяЦена,
    новаяПрибыльНаЕд: Math.round(новаяПрибыльНаЕд * 100) / 100,
    изменениеПрибылиНаЕд: Math.round((новаяПрибыльНаЕд - текущаяПрибыль) * 100) / 100,
    необходимоеУвеличениеОбъема: Math.round(необходимоеУвеличениеОбъема),
    итоговаяМаржинальность: новаяЦена > 0 ? (новаяПрибыльНаЕд / новаяЦена * 100) : 0,
  };
}

// ==================== КАЛЬКУЛЯТОР МАРЖИ ПО ТОВАРАМ ====================

export function calculateProductMargin(params: {
  закупочнаяЦена: number;
  продажнаяЦена: number;
  комиссияМП: number;
  логистикаМП: number;
}): {
  закупка: number;
  комиссия: number;
  логистика: number;
  валоваяПрибыль: number;
  маржаПроцент: number;
  наценкаПроцент: number;
} {
  const комиссия = Math.round(params.продажнаяЦена * params.комиссияМП / 100 * 100) / 100;
  const валоваяПрибыль = Math.round((params.продажнаяЦена - params.закупочнаяЦена - комиссия - params.логистикаМП) * 100) / 100;
  const маржаПроцент = params.продажнаяЦена > 0 ? (валоваяПрибыль / params.продажнаяЦена * 100) : 0;
  const наценкаПроцент = params.закупочнаяЦена > 0 ? ((params.продажнаяЦена - params.закупочнаяЦена) / params.закупочнаяЦена * 100) : 0;

  return {
    закупка: Math.round(params.закупочнаяЦена * 100) / 100,
    комиссия,
    логистика: Math.round(params.логистикаМП * 100) / 100,
    валоваяПрибыль,
    маржаПроцент: Math.round(маржаПроцент * 100) / 100,
    наценкаПроцент: Math.round(наценкаПроцент * 100) / 100,
  };
}

// ==================== ПОЛНЫЙ РАСЧЕТ СЕЛЛЕРА ====================

export interface FullSellerCalculation {
  costPrice: ReturnType<typeof calculateCostPrice>;
  salePrice: ReturnType<typeof calculateSalePrice>;
  unitEconomics: ReturnType<typeof calculateUnitEconomics>;
  breakEven: ReturnType<typeof calculateBreakEven>;
  adROI: ReturnType<typeof calculateAdROI>;
  discountImpact: ReturnType<typeof calculateDiscountImpact>;
}

export function fullSellerCalculation(
  costParams: CostPriceParams,
  marketFees: MarketplaceFees,
  saleParams: SalePriceParams,
  additional?: {
    фиксированныеРасходы: number;
    рекламаБюджет: number;
    cpc: number;
    cvr: number;
    возвратыПроцент: number;
    стоимостьВозврата: number;
  }
): FullSellerCalculation | null {
  const costPriceResult = calculateCostPrice(costParams);

  const salePriceResult = calculateSalePrice(
    costPriceResult.итогоСебестоимость,
    marketFees,
    saleParams
  );

  if (salePriceResult.продажнаяЦена === 0 || salePriceResult.прибыль < 0) {
    return null;
  }

  const unitEconomics = calculateUnitEconomics({
    продажнаяЦена: salePriceResult.продажнаяЦена,
    себестоимость: costPriceResult.итогоСебестоимость,
    комиссияМП: marketFees.комиссияМП,
    логистикаМП: marketFees.логистикаМП,
    рекламаНаЕдиницу: salePriceResult.реклама,
    возвратыПроцент: additional?.возвратыПроцент || 0.05,
    стоимостьВозврата: additional?.стоимостьВозврата || 100,
  });

  const breakEven = calculateBreakEven({
    фиксированныеРасходы: additional?.фиксированныеРасходы || 50000,
    ценаЕдиницы: salePriceResult.продажнаяЦена,
    переменныеРасходыНаЕдиницу: costPriceResult.итогоСебестоимость + marketFees.логистикаМП +
                                  salePriceResult.комиссияМП + salePriceResult.реклама,
  });

  const adROI = calculateAdROI({
    бюджетНаРекламу: additional?.рекламаБюджет || 30000,
    стоимостьКлика: additional?.cpc || 15,
    конверсияВЗаказ: additional?.cvr || 5,
    среднийЧек: salePriceResult.продажнаяЦена,
    маржинальность: salePriceResult.рентабельность,
  });

  const discountImpact = calculateDiscountImpact({
    текущаяЦена: salePriceResult.продажнаяЦена,
    себестоимость: costPriceResult.итогоСебестоимость,
    скидкиПроцент: 20,
    ростОбъема: 30,
  });

  return {
    costPrice: costPriceResult,
    salePrice: salePriceResult,
    unitEconomics,
    breakEven,
    adROI,
    discountImpact,
  };
}
