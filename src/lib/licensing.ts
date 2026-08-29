/**
 * Лицензирование (Фаза 6).
 *
 * Policy-флаг: сейчас — `'open'` (полностью бесплатно, полная функциональность,
 * без искусственных ограничений). Платный режим не реализован — дизайн
 * (проверка ключа, привязка к машине, онлайн/офлайн-активация, отзыв/продление)
 * описан в docs/PAYED_LICENSING.md; при переключении ветка добавляется в
 * getLicenseInfo() по этому документу.
 */
export type LicenseMode = 'open' | 'paid';

export interface LicenseInfo {
  /** Текущая policy */
  policy: LicenseMode;
  /** Короткая подпись для UI */
  label: string;
  /** Расшифровка для UI */
  note: string;
  /** Действующие ограничения (в open-режиме — пустой список) */
  restrictions: string[];
}

/** Policy релиза: 'open'. Платный режим — см. docs/PAYED_LICENSING.md */
export const LICENSE_POLICY: LicenseMode = 'open';

export function getLicenseInfo(): LicenseInfo {
  // Пока только open-режим: ограничений нет. Платная ветка (проверка ключа
  // в main-процессе + передача результата сюда) появится при переключении
  // LICENSE_POLICY по документу docs/PAYED_LICENSING.md.
  return {
    policy: LICENSE_POLICY,
    label: 'Открытый режим',
    note: 'полная функциональность, бесплатно, без искусственных ограничений',
    restrictions: [],
  };
}
