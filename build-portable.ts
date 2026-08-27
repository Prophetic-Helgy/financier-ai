/**
 * Скрипт для сборки портативной (распространяемой) версии Финансист.AI
 * 
 * Отличия портативной версии:
 * - URL модели заменён на заглушку https://example.com/v1/chat/completions
 * - Пользователь видит инструкцию как заполнить свой адрес
 * - В названии файла добавляется "-Portable"
 */

import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs';
import { execSync } from 'child_process';

const PORTABLE_ENDPOINT = 'https://example.com/v1/chat/completions';

console.log('📦 Сборка портативной версии Финансист.AI...\n');

// 1. Создать файл конфигурации для портативной версии
const portableConfig = {
  endpoint: PORTABLE_ENDPOINT,
  model: 'local-model',
  isPortable: true,
  instructions: `Для подключения к вашей AI-модели:
1. Запустите LM Studio и включите сервер (Start Server)
2. В приложении перейдите в раздел "LM Studio"
3. Замените URL на: http://127.0.0.1:1234/v1/chat/completions
4. Или используйте IP вашего сервера: http://<IP-адрес>:1234/v1/chat/completions`
};

writeFileSync(
  'public/portable-config.json',
  JSON.stringify(portableConfig, null, 2),
  'utf-8'
);

console.log('✅ Создан файл конфигурации портативной версии');
console.log(`   URL модели: ${PORTABLE_ENDPOINT}\n`);

// 2. Собрать проект
console.log('🔨 Сборка проекта...');
try {
  execSync('npm run build', { stdio: 'inherit' });
  console.log('✅ Проект собран\n');
} catch (e) {
  console.error('❌ Ошибка сборки:', e);
  process.exit(1);
}

// 3. Собрать Electron приложение
console.log('📦 Сборка Electron приложения...');
try {
  execSync('npx electron-builder --win portable --config', { stdio: 'inherit' });
  console.log('\n✅ Портативная версия собрана!\n');
  console.log('Файлы находятся в папке release/');
} catch (e) {
  console.error('❌ Ошибка сборки Electron:', e);
  process.exit(1);
}

console.log('\n📋 Инструкция для распространения:');
console.log('1. Скопируйте файл release/Финансист.AI Portable 1.0.0.exe');
console.log('2. Получатель установки увидит заглушку для URL модели');
console.log('3. Инструкция по заполнению URL будет показана в приложении');
console.log('\nГотово! ✨');