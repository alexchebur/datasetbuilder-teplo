/**
 * JSONL_HANDLER.JS
 * Создание, загрузка и экспорт JSONL датасетов
 * Версия: 3.0 (с полной нормализацией номеров арбитражных дел)
 * 
 * Ключевые исправления:
 * - Нормализация номеров дел при создании записей
 * - Нормализация номеров дел при загрузке существующих JSONL
 * - Нормализация для отображения в интерфейсе
 * - Использование нормализованных номеров для предотвращения дубликатов
 */

const JSONLHandler = {
    // ============================================================================
    // НОРМАЛИЗАЦИЯ НОМЕРОВ ДЕЛ
    // ============================================================================
    /**
     * Нормализует номер арбитражного дела к единому формату
     * Формат: А60-49559/2024 (кириллическая "А", слэш перед годом)
     * 
     * @param {string} caseNumber - Номер дела в любом формате
     * @returns {string} - Нормализованный номер дела
     * 
     * Примеры преобразования:
     * - "A60-49559-2024" → "А60-49559/2024" (Latin A → Cyrillic А, dash → slash)
     * - "А60-49559/2024" → "А60-49559/2024" (без изменений)
     * - "a60-49559-2024" → "А60-49559/2024" (lowercase → uppercase)
     * - "А60-49559-2024" → "А60-49559/2024" (dash → slash)
     */
    normalizeCaseNumber(caseNumber) {
        if (!caseNumber || typeof caseNumber !== 'string') {
            return '';
        }
        
        // Сохраняем оригинал для логирования
        const original = caseNumber;
        
        // 1. Заменяем латинскую "A" (и "a") на кириллическую "А" в начале строки
        let normalized = caseNumber.replace(/^[Aa]/, 'А');
        
        // 2. Разбиваем номер на части по дефисам
        const parts = normalized.split('-');
        
        // 3. Если есть минимум 3 части (например: А60, 49559, 2024)
        if (parts.length >= 3) {
            // Проверяем, является ли последняя часть годом (4 цифры)
            const lastPart = parts[parts.length - 1];
            if (/^\d{4}$/.test(lastPart)) {
                // Последняя часть - год, объединяем остальное через дефис, год через слэш
                const year = parts.pop();
                const rest = parts.join('-');
                normalized = `${rest}/${year}`;
            }
        }
        
        // 4. Логирование изменений (для отладки)
        if (normalized !== original) {
            console.log(`🔄 Нормализация номера дела: "${original}" → "${normalized}"`);
        }
        
        return normalized;
    },

    // ============================================================================
    // СОЗДАНИЕ ЗАПИСЕЙ
    // ============================================================================
    /**
     * Создаёт запись JSONL для датасета
     * @param {string} caseNumber - Номер дела
     * @param {string} decisionDate - Дата решения
     * @param {string} text - Текст решения
     * @param {string} filename - Имя исходного файла (опционально)
     * @returns {Object} - Запись JSONL
     */
    createEntry(caseNumber, decisionDate, text, filename = null) {
        // ✅ КРИТИЧНО: Нормализуем номер дела при создании
        const normalizedCaseNumber = this.normalizeCaseNumber(caseNumber);
        
        return {
            case_number: normalizedCaseNumber,
            decision_date: decisionDate,
            decision_text: text,
            metadata: {
                source: 'arbitration_court',
                document_type: 'court_decision',
                language: 'ru',
                source_filename: filename,
                created_at: new Date().toISOString()
            }
        };
    },

    /**
     * Создаёт запись для инструктивного датасета (Fine-tuning LLM)
     * @param {string} caseNumber - Номер дела
     * @param {string} decisionDate - Дата решения
     * @param {string} text - Текст решения
     * @returns {Object} - Instruction entry
     */
    createInstructionEntry(caseNumber, decisionDate, text) {
        // ✅ Нормализуем номер дела
        const normalizedCaseNumber = this.normalizeCaseNumber(caseNumber);
        
        return {
            instruction: `Проанализируй судебный акт по делу № ${normalizedCaseNumber} от ${decisionDate}`,
            input: text.slice(0, 2000),
            output: `Судебное решение по делу ${normalizedCaseNumber} от ${decisionDate}. Текст решения: ${text.slice(0, 3000)}...`
        };
    },

    // ============================================================================
    // КОНВЕРТАЦИЯ JSONL
    // ============================================================================
    /**
     * Конвертирует массив записей в JSONL строку
     * @param {Array<Object>} entries - Массив записей
     * @returns {string} - JSONL строка (одна запись = одна строка)
     */
    toJSONL(entries) {
        // ✅ КРИТИЧНО: Без форматирования (null, 2), иначе fromJSONL не сможет распарсить
        return entries.map(entry => JSON.stringify(entry)).join('\n');
    },

    /**
     * Парсит JSONL строку в массив записей
     * @param {string} jsonlString - JSONL строка
     * @returns {Array<Object>} - Массив записей
     */
    fromJSONL(jsonlString) {
        const entries = [];
        const lines = jsonlString.trim().split('\n');
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            // Пропускаем пустые строки
            if (!line) {
                continue;
            }
            
            // Пропускаем строки, которые не начинаются с {
            if (!line.startsWith('{')) {
                console.warn(`⚠️ Строка ${i + 1} не является JSON-объектом: ${line.slice(0, 50)}...`);
                continue;
            }
            
            try {
                const entry = JSON.parse(line);
                
                // ✅ КРИТИЧНО: Нормализуем номер дела при загрузке
                // Это предотвращает дубликаты при загрузке старых датасетов
                if (entry.case_number) {
                    const originalCaseNumber = entry.case_number;
                    entry.case_number = this.normalizeCaseNumber(entry.case_number);
                    
                    if (originalCaseNumber !== entry.case_number) {
                        console.log(`🔄 Нормализован номер дела при загрузке: "${originalCaseNumber}" → "${entry.case_number}"`);
                    }
                }
                
                entries.push(entry);
                
            } catch (e) {
                console.warn(`❌ Ошибка парсинга строки ${i + 1}: ${line.slice(0, 100)}...`);
                console.warn('   Ошибка:', e.message);
            }
        }
        
        console.log(`✅ Загружено записей из JSONL: ${entries.length}`);
        return entries;
    },

    // ============================================================================
    // ЗАГРУЗКА И СОХРАНЕНИЕ ФАЙЛОВ
    // ============================================================================
    /**
     * Загружает JSONL из файла
     * @param {File} file - JSONL файл
     * @returns {Promise<Array<Object>>} - Массив записей
     */
    async loadFromFile(file) {
        console.log('📂 Загрузка JSONL файла:', file.name);
        const text = await file.text();
        return this.fromJSONL(text);
    },

    /**
     * Скачивает JSONL файл
     * @param {Array<Object>} entries - Записи
     * @param {string} filename - Имя файла
     */
    download(entries, filename = 'court_decisions.jsonl') {
        const jsonl = this.toJSONL(entries);
        const blob = new Blob([jsonl], { type: 'application/jsonl;charset=utf-8' });
        saveAs(blob, filename);
        console.log(`📥 Скачан файл: ${filename} (${entries.length} записей)`);
    },

    // ============================================================================
    // РАБОТА С ZIP-АРХИВАМИ
    // ============================================================================
    /**
     * Создаёт ZIP-архив с датасетом
     * @param {Array<Object>} entries - Основные записи
     * @param {Array<Object>} instructionEntries - Instruction записи (опционально)
     * @returns {Promise<Blob>} - ZIP файл
     */
    async createZipArchive(entries, instructionEntries = null) {
        const zip = new JSZip();
        const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
        
        // Основной датасет
        zip.file('court_decisions_dataset.jsonl', this.toJSONL(entries));
        
        // Instruction датасет
        if (instructionEntries && instructionEntries.length > 0) {
            zip.file('instruction_dataset.jsonl', this.toJSONL(instructionEntries));
        }
        
        // Статистика CSV
        if (entries.length > 0) {
            const csvContent = this.generateCSV(entries);
            zip.file('dataset_statistics.csv', csvContent);
        }
        
        // README
        const readme = this.generateReadme(entries, timestamp);
        zip.file('README.md', readme);
        
        return await zip.generateAsync({ type: 'blob' });
    },

    /**
     * Генерирует CSV со статистикой
     * @param {Array<Object>} entries - Записи
     * @returns {string} - CSV контент
     */
    generateCSV(entries) {
        const headers = ['case_number', 'decision_date', 'text_length'];
        const rows = entries.map(e => [
            e.case_number || '',
            e.decision_date || '',
            e.decision_text?.length || 0
        ]);
        
        return [headers, ...rows].map(row => row.join(',')).join('\n');
    },

    /**
     * Генерирует README файл
     * @param {Array<Object>} entries - Записи
     * @param {string} timestamp - Временная метка
     * @returns {string} - README контент
     */
    generateReadme(entries, timestamp) {
        return `# Датасет судебных актов арбитражных судов

## Описание
Датасет содержит тексты судебных решений арбитражных судов России.

## Структура файлов
- \`court_decisions_dataset.jsonl\` - Основной датасет
- \`instruction_dataset.jsonl\` - Инструктивный датасет для Fine-tuning
- \`dataset_statistics.csv\` - Статистика в таблице
- \`README.md\` - Этот файл

## Формат записей (JSONL)
\`\`\`json
{"case_number":"А60-49559/2024","decision_date":"2025-06-16","decision_text":"...","metadata":{"source":"arbitration_court"}}
\`\`\`

## Формат номеров дел
- Все номера дел нормализованы к единому формату
- Кириллическая "А" в начале (не латинская "A")
- Слэш перед годом: А60-49559/2024 (не дефис)

## Статистика
- Всего записей: ${entries.length}
- Дата создания: ${timestamp}

## Назначение
- Обучение LoRA-адаптеров для юридических LLM
- Fine-tuning моделей для анализа судебных решений
- Создание инструктивных датасетов

## Лицензия
Данные предназначены для исследовательских целей.
`;
    },

    // ============================================================================
    // ОБЪЕДИНЕНИЕ ДАТАСЕТОВ
    // ============================================================================
    /**
     * Объединяет два датасета, избегая дубликатов по нормализованному номеру дела
     * @param {Array<Object>} existing - Существующие записи
     * @param {Array<Object>} newEntries - Новые записи
     * @returns {Array<Object>} - Объединённый датасет
     */
    mergeDatasets(existing, newEntries) {
        console.log('🔄 Объединение датасетов...');
        console.log(`   Существующих записей: ${existing.length}`);
        console.log(`   Новых записей: ${newEntries.length}`);
        
        // ✅ КРИТИЧНО: Создаём Set нормализованных номеров дел из существующих записей
        const existingCases = new Set(
            existing
                .filter(e => e.case_number)
                .map(e => this.normalizeCaseNumber(e.case_number))
        );
        
        console.log(`   Уникальных номеров дел в существующем датасете: ${existingCases.size}`);
        
        const merged = [...existing];
        let duplicatesSkipped = 0;
        let newAdded = 0;
        
        for (const entry of newEntries) {
            // Нормализуем номер дела для проверки
            const normalizedCaseNumber = entry.case_number ? 
                this.normalizeCaseNumber(entry.case_number) : null;
            
            if (!normalizedCaseNumber || !existingCases.has(normalizedCaseNumber)) {
                // Это новая запись, добавляем
                merged.push(entry);
                if (normalizedCaseNumber) {
                    existingCases.add(normalizedCaseNumber);
                }
                newAdded++;
            } else {
                // Это дубликат, пропускаем
                duplicatesSkipped++;
                console.log(`⏭️ Пропущен дубликат: ${normalizedCaseNumber}`);
            }
        }
        
        console.log(`✅ Объединение завершено:`);
        console.log(`   Добавлено новых записей: ${newAdded}`);
        console.log(`   Пропущено дубликатов: ${duplicatesSkipped}`);
        console.log(`   Итого записей: ${merged.length}`);
        
        return merged;
    }
};

// ============================================================================
// ЭКСПОРТ В ГЛОБАЛЬНЫЙ SCOPE
// ============================================================================
window.JSONLHandler = JSONLHandler;
console.log('✅ JSONLHandler загружен и экспортирован в window.JSONLHandler');
console.log('   Доступные методы:', Object.keys(JSONLHandler).join(', '));
