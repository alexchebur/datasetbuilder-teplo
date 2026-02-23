/**
 * JSONL_HANDLER.JS
 * Создание, загрузка и экспорт JSONL датасетов
 * Версия: 3.1 (исправлен формат JSONL)
 */

const JSONLHandler = {
    /**
     * Нормализует номер арбитражного дела
     */
    normalizeCaseNumber(caseNumber) {
        if (!caseNumber || typeof caseNumber !== 'string') return '';
        
        let normalized = caseNumber.replace(/^[Aa]/, 'А');
        
        const parts = normalized.split('-');
        if (parts.length >= 3 && !normalized.includes('/')) {
            const year = parts.pop();
            const rest = parts.join('-');
            normalized = `${rest}/${year}`;
        }
        
        return normalized;
    },

    /**
     * Создаёт запись JSONL для датасета
     */
    createEntry(caseNumber, decisionDate, text, filename = null) {
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
     * Создаёт запись для инструктивного датасета
     */
    createInstructionEntry(caseNumber, decisionDate, text) {
        const normalizedCaseNumber = this.normalizeCaseNumber(caseNumber);
        
        return {
            instruction: `Проанализируй судебный акт по делу № ${normalizedCaseNumber} от ${decisionDate}`,
            input: text.slice(0, 2000),
            output: `Судебное решение по делу ${normalizedCaseNumber} от ${decisionDate}. Текст решения: ${text.slice(0, 3000)}...`
        };
    },

    /**
     * ✅ КРИТИЧНО: Конвертирует массив записей в JSONL строку
     * КАЖДАЯ запись = ОДНА строка, БЕЗ форматирования, БЕЗ запятых
     * @param {Array<Object>} entries - Массив записей
     * @returns {string} - JSONL строка
     */
    toJSONL(entries) {
        // ✅ ПРАВИЛЬНО: без null, 2 - каждая запись в одной строке
        return entries
            .map(entry => JSON.stringify(entry))  // ← БЕЗ форматирования!
            .join('\n');  // ← Разделитель: перенос строки, НЕ запятая
    },

    /**
     * Парсит JSONL строку в массив записей
     * @param {string} jsonlString - JSONL строка
     * @returns {Array<Object>} - Массив записей
     */
    fromJSONL(jsonlString) {
        const entries = [];
        const lines = jsonlString.trim().split('\n');
        
        console.log(`🔍 Парсинг JSONL: ${lines.length} строк`);
        
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
                
                // Нормализуем номер дела при загрузке
                if (entry.case_number) {
                    const originalCaseNumber = entry.case_number;
                    entry.case_number = this.normalizeCaseNumber(entry.case_number);
                    
                    if (originalCaseNumber !== entry.case_number) {
                        console.log(`🔄 Нормализован номер дела: "${originalCaseNumber}" → "${entry.case_number}"`);
                    }
                }
                
                entries.push(entry);
                
            } catch (e) {
                console.error(`❌ Ошибка парсинга строки ${i + 1}:`);
                console.error(`   Строка: ${line.slice(0, 100)}...`);
                console.error(`   Ошибка: ${e.message}`);
            }
        }
        
        console.log(`✅ Успешно загружено записей: ${entries.length} из ${lines.length}`);
        return entries;
    },

    /**
     * Загружает JSONL из файла
     */
    async loadFromFile(file) {
        console.log('📂 Загрузка JSONL файла:', file.name);
        const text = await file.text();
        return this.fromJSONL(text);
    },

    /**
     * Скачивает JSONL файл
     */
    download(entries, filename = 'court_decisions.jsonl') {
        const jsonl = this.toJSONL(entries);
        const blob = new Blob([jsonl], { type: 'application/jsonl;charset=utf-8' });
        saveAs(blob, filename);
        console.log(`📥 Скачан файл: ${filename} (${entries.length} записей)`);
    },

    /**
     * Создаёт ZIP-архив с датасетом
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
     */
    generateReadme(entries, timestamp) {
        return `# Датасет судебных актов арбитражных судов

## Описание
Датасет содержит тексты судебных решений арбитражных судов России.

## Формат записей (JSONL)
\`\`\`json
{"case_number":"А60-49559/2024","decision_date":"2025-06-16","decision_text":"...","metadata":{"source":"arbitration_court"}}
{"case_number":"А60-12345/2023","decision_date":"2025-01-15","decision_text":"...","metadata":{...}}
\`\`\`

## Статистика
- Всего записей: ${entries.length}
- Дата создания: ${timestamp}
`;
    },

    /**
     * Объединяет два датасета, избегая дубликатов
     */
    mergeDatasets(existing, newEntries) {
        console.log('🔄 Объединение датасетов...');
        console.log(`   Существующих записей: ${existing.length}`);
        console.log(`   Новых записей: ${newEntries.length}`);
        
        const existingCases = new Set(
            existing.filter(e => e.case_number).map(e => e.case_number)
        );
        
        const merged = [...existing];
        let duplicatesSkipped = 0;
        
        for (const entry of newEntries) {
            if (!entry.case_number || !existingCases.has(entry.case_number)) {
                merged.push(entry);
                if (entry.case_number) {
                    existingCases.add(entry.case_number);
                }
            } else {
                duplicatesSkipped++;
                console.log(`⏭️ Пропущен дубликат: ${entry.case_number}`);
            }
        }
        
        console.log(`✅ Объединение завершено: ${merged.length} записей (пропущено дубликатов: ${duplicatesSkipped})`);
        return merged;
    }
};

// Экспорт в глобальный scope
window.JSONLHandler = JSONLHandler;
console.log('✅ JSONLHandler загружен и экспортирован');
