'use strict';
// Политики безопасности главного процесса (пентест 2026-08-30, находки #1, #7, #8).
// Чистые функции — юнит-теструются через tsx без запуска Electron (test-security.ts).

const DEV_ORIGIN = 'http://localhost:3000';

/**
 * Классификация навигации окна / открытия нового окна.
 * Возвращает одну из команд для main.cjs:
 *  'allow'     — разрешить переход внутри окна (только dev-сервер в dev-режиме)
 *  'read-drop' — переход блокируется; URL воспринимается как файл, брошенный в окно
 *                (Chromium при drop шлёт file://-навигацию — фича импорта сохранена)
 *  'external'  — переход блокируется; ссылка открывается во ВНЕШНЕМ браузере
 *                (http/https/mailto — туда ведут markdown-ссылки LLM-отчётов)
 *  'block'     — блокировать безусловно (javascript:, data:, file-вне-drop и т.п.)
 */
function classifyNavigation(rawUrl, opts = {}) {
  const { isPackaged = true, devOrigin = DEV_ORIGIN } = opts;
  let url;
  try {
    url = new URL(String(rawUrl));
  } catch {
    return 'block';
  }
  switch (url.protocol) {
    case 'file:':
      return 'read-drop';
    case 'http:':
    case 'https:': {
      if (!isPackaged) {
        try {
          if (url.origin === new URL(devOrigin).origin) return 'allow';
        } catch { /*.origin бросил — падаем в external*/ }
      }
      return 'external';
    }
    case 'mailto:':
      return 'external';
    default:
      return 'block';
  }
}

/**
 * Разрешено ли открывать URL во внешнем браузере (shell.openExternal).
 * Только http/https/mailto — никаких file:, javascript:, custom-схем.
 */
function isSafeExternalUrl(rawUrl) {
  let url;
  try {
    url = new URL(String(rawUrl));
  } catch {
    return false;
  }
  return url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'mailto:';
}

module.exports = { classifyNavigation, isSafeExternalUrl, DEV_ORIGIN };
// NB: validateEndpoint живёт в renderer (src/lib/llmIntegration.ts) — fetch LLM
// выполняется там; единственная реализация, чтобы не расходились политики.
