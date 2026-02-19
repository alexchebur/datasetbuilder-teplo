/**
 * JSONL_HANDLER.JS
 * Создание, загрузка и экспорт JSONL датасетов
 */

const JSONLHandler = {
    /**
     * Создаёт запись JSONL для датасета
     * @param {string} caseNumber - Номер дела
     * @param {string} decisionDate - Дата решения
     * @param {string} text - Текст решения
     * @returns {Object} - Запись JSONL
     */
    createEntry(caseNumber, decisionDate, text) {
        return {
            case_number: caseNumber,
            decision_date: decisionDate,
            decision_text: text,
            metadata: {
                source: 'arbitration_court',
                document_type: 'court_decision',
                language: 'ru',
                created_at: new Date().toISOString()
            }
        };
    },

    /**
     * Создаёт запись для инструктивного датасета
     * @param {string} caseNumber - Номер дела
     * @param {string} decisionDate - Дата решения
     * @param {string} text - Текст решения
     * @returns {Object} - Instruction entry
     */
    createInstructionEntry(caseNumber, decisionDate, text) {
        return {
            instruction: `Проанализируй судебный акт по делу № ${caseNumber} от ${decisionDate}`,
            input: text.slice(0, 2000),
            output: `Судебное решение по делу ${caseNumber} от ${decisionDate}. Текст решения: ${text.slice(0, 3000)}...`
        };
    },

    /**
     * Конвертирует массив записей в JSONL строку
     * @param {Array<Object>} entries - Массив записей
     * @returns {string} - JSONL строка
     */
    toJSONL(entries) {
        return entries.map(entry => JSON.stringify(entry, null, 2)).join('\n');
    },

    /**
     * Парсит JSONL строку в массив записей
     * @param {string} jsonlString - JSONL строка
     * @returns {Array<Object>} - Массив записей
     */
    fromJSONL(jsonlString) {
        const entries = [];
        const lines = jsonlString.trim().split('\n');
        
        for (const line of lines) {
            if (line.trim()) {
                try {
                    entries.push(JSON.parse(line));
                } catch (e) {
                    console.warn('Ошибка парсинга строки JSONL:', line.slice(0, 100));
                }
            }
        }
        
        return entries;
    },

    /**
     * Загружает JSONL из файла
     * @param {File} file - JSONL файл
     * @returns {Promise<Array<Object>>} - Массив записей
     */
    async loadFromFile(file) {
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
    },

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
{
  "case_number": "Номер дела",
  "decision_date": "Дата решения (YYYY-MM-DD)",
  "decision_text": "Текст решения",
  "metadata": {
    "source": "arbitration_court",
    "document_type": "court_decision",
    "language": "ru",
    "created_at": "ISO-8601 timestamp"
  }
}
\`\`\`

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

    /**
     * Объединяет два датасета, избегая дубликатов
     * @param {Array<Object>} existing - Существующие записи
     * @param {Array<Object>} newEntries - Новые записи
     * @returns {Array<Object>} - Объединённый датасет
     */
    mergeDatasets(existing, newEntries) {
        const existingCases = new Set(
            existing.filter(e => e.case_number).map(e => e.case_number)
        );
        
        const merged = [...existing];
        
        for (const entry of newEntries) {
            if (!entry.case_number || !existingCases.has(entry.case_number)) {
                merged.push(entry);
                if (entry.case_number) {
                    existingCases.add(entry.case_number);
                }
            }
        }
        
        return merged;
    }
};
