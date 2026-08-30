'use strict';
// Валидатор формы бэкапа/хранилища (пентест 2026-08-30, находка #3).
// store:import / store:restoreBackup / store:save / store:load пропускают JSON
// через validateBackupShape ПЕРЕД записью на диск и перед применением.
// Защита: поддельная роль admin, __proto__-загрязнение, schemaVersion-DoS,
// переразмеренный файл. Возвращает { ok, error } — error человекочитаем.

const ALLOWED_ROLES = ['admin', 'member', 'viewer'];
const FORBIDDEN_KEYS = ['__proto__', 'prototype', 'constructor'];
const MAX_JSON_LEN = 64 * 1024 * 1024; // сырой JSON, байт
const MAX_NODES = 2_000_000;           // итерационный обход: защита от циклов/глубины
const MAX_DEPTH = 100;

// v1..v4 (цепочка миграций migrateStore)
const MIN_SCHEMA = 1;
const MAX_SCHEMA = 4;
const REQUIRED_ARRAYS = ['transactions', 'accounts', 'categories'];
const OPTIONAL_ARRAYS = ['organizations', 'counterparties', 'budgets', 'fxRates', 'periods', 'users', 'auditLog'];

function fail(error) {
  return { ok: false, error };
}

/**
 * Глубинная проверка: запрещённые собственные ключи (__proto__/prototype/constructor)
 * рекурсивно, с лимитом узлов и глубины (итеративно — без стек-переполнения).
 */
function scanForbiddenKeys(root) {
  const stack = [{ node: root, depth: 0 }];
  let visited = 0;
  while (stack.length) {
    const { node, depth } = stack.pop();
    if (node === null || typeof node !== 'object') continue;
    if (++visited > MAX_NODES) return 'слишком сложная структура бэкапа';
    if (depth > MAX_DEPTH) return 'слишком глубокая структура бэкапа';
    if (Array.isArray(node)) {
      for (const item of node) stack.push({ node: item, depth: depth + 1 });
      continue;
    }
    for (const key of Object.keys(node)) {
      if (FORBIDDEN_KEYS.includes(key)) {
        return `бэкап содержит запрещённый ключ «${key}»`;
      }
      stack.push({ node: node[key], depth: depth + 1 });
    }
  }
  return null;
}

/**
 * Проверка объекта, претендующего на роль хранилища/бэкапа Финансист.AI.
 * Не отклоняет НЕИЗВЕСТНЫЕ поля (обратная совместимость будущих версий),
 * но требует типизированные коллекции, integer schemaVersion 1..4,
 * role ∈ {admin, member, viewer} и отсутствие __proto__/prototype/constructor.
 */
function validateBackupShape(obj, opts = {}) {
  const maxJsonLen = opts.maxJsonLen || MAX_JSON_LEN;
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return fail('файл не является хранилищем Финансист.AI');
  }
  if (typeof opts.jsonLen === 'number' && opts.jsonLen > maxJsonLen) {
    return fail('файл бэкапа слишком большой');
  }

  const sv = obj.schemaVersion;
  if (!Number.isInteger(sv) || sv < MIN_SCHEMA || sv > MAX_SCHEMA) {
    return fail(`schemaVersion должен быть целым числом от ${MIN_SCHEMA} до ${MAX_SCHEMA}`);
  }

  for (const key of REQUIRED_ARRAYS) {
    if (!Array.isArray(obj[key])) {
      return fail(`в хранилище отсутствует обязательный массив «${key}»`);
    }
  }
  for (const key of OPTIONAL_ARRAYS) {
    if (obj[key] !== undefined && !Array.isArray(obj[key])) {
      return fail(`поле «${key}» должно быть массивом`);
    }
  }
  if (obj.meta !== undefined && (obj.meta === null || typeof obj.meta !== 'object' || Array.isArray(obj.meta))) {
    return fail('поле «meta» должно быть объектом');
  }

  if (Array.isArray(obj.users)) {
    for (const u of obj.users) {
      if (!u || typeof u !== 'object' || Array.isArray(u)) return fail('users: элемент должен быть объектом');
      if (u.role !== undefined && !ALLOWED_ROLES.includes(u.role)) {
        return fail(`users: недопустимая роль «${String(u.role).slice(0, 40)}»`);
      }
    }
  }

  const forbidden = scanForbiddenKeys(obj);
  if (forbidden) return fail(forbidden);

  return { ok: true, error: null };
}

module.exports = { validateBackupShape, ALLOWED_ROLES, MAX_JSON_LEN };
