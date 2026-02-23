/**
JSONL_HANDLER.JS
Создание, загрузка и экспорт JSONL датасетов
Версия: 3.0 (с поддержкой полей appealed и canceled)
*/
const JSONLHandler = {
    /**
     * Создаёт запись JSONL для датасета
     */
    createEntry(caseNumber, decisionDate, text, appealed = false, canceled = false) {
        return {
            case_number: caseNumber,
            decision_date: decisionDate,
            decision_text: text,
            appealed: appealed,
            canceled: canceled,
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
     */
    createInstructionEntry(caseNumber, decisionDate, text, appealed = false, canceled = false) {
        const appealInfo = appealed ? 
            (canceled ? ' (решение отменено)' : ' (обжаловано)') : '';
        
        return {
            instruction: `Проанализируй судебный акт по делу № ${caseNumber} от ${decisionDate}${appealInfo}`,
            input: text.slice(0, 2000),
            output: `Судебное решение по делу ${caseNumber} от ${decisionDate}${appealInfo}. Текст решения: ${text.slice(0, 3000)}...`,
            metadata: {
                case_number: caseNumber,
                decision_date: decisionDate,
                appealed: appealed,
                canceled: canceled
            }
        };
    },
    
    /**
     * Конвертирует массив записей в JSONL строку
     * ВАЖНО: Одна запись = одна строка (стандарт JSONL)
     */
    toJSONL(entries) {
        return entries.map(entry => JSON.stringify(entry)).join('\n');
    },
    
    /**
     * Парсит JSONL строку в массив записей
     * С поддержкой многострочных записей (на случай старых файлов)
     */
    fromJSONL(jsonlString) {
        const entries = [];
        
        // Метод 1: Быстрый парсинг (одна строка = одна запись)
        const lines = jsonlString.trim().split('\n');
        
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            
            if (!trimmed.startsWith('{')) continue;
            
            try {
                const entry = JSON.parse(trimmed);
                // Добавляем значения по умолчанию для старых записей
                if (entry.appealed === undefined) {
                    entry.appealed = false;
                }
                if (entry.canceled === undefined) {
                    entry.canceled = false;
                }
                entries.push(entry);
            } catch (e) {
                // Если не распарсилось — возможно, это многострочная запись
            }
        }
        
        if (entries.length > 0) {
            return entries;
        }
        
        // Метод 2: Парсинг многострочных JSON-объектов
        try {
            const jsonPattern = /\{[\s\S]*?"metadata"\s*:\s*\{[\s\S]*?\}\s*\}/g;
            const matches = jsonlString.match(jsonPattern);
            
            if (matches) {
                for (const match of matches) {
                    try {
                        const entry = JSON.parse(match);
                        if (entry.appealed === undefined) {
                            entry.appealed = false;
                        }
                        if (entry.canceled === undefined) {
                            entry.canceled = false;
                        }
                        entries.push(entry);
                    } catch (e) {
                        console.warn('Ошибка парсинга JSON-объекта:', match.slice(0, 100));
                    }
                }
            }
        } catch (e) {
            console.warn('Ошибка при парсинге многострочного JSONL:', e);
        }
        
        return entries;
    },
    
    /**
     * Загружает JSONL из файла
     */
    async loadFromFile(file) {
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
    },
    
    /**
     * Создаёт ZIP-архив с датасетом
     */
    async createZipArchive(entries, instructionEntries = null) {
        const zip = new JSZip();
        const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
        
        zip.file('court_decisions_dataset.jsonl', this.toJSONL(entries));
        
        if (instructionEntries && instructionEntries.length > 0) {
            zip.file('instruction_dataset.jsonl', this.toJSONL(instructionEntries));
        }
        
        if (entries.length > 0) {
            const csvContent = this.generateCSV(entries);
            zip.file('dataset_statistics.csv', csvContent);
        }
        
        const readme = this.generateReadme(entries, timestamp);
        zip.file('README.md', readme);
        
        return await zip.generateAsync({ type: 'blob' });
    },
    
    /**
     * Генерирует CSV со статистикой
     */
    generateCSV(entries) {
        const headers = ['case_number', 'decision_date', 'text_length', 'appealed', 'canceled'];
        const rows = entries.map(e => [
            e.case_number || '',
            e.decision_date || '',
            e.decision_text?.length || 0,
            e.appealed ? 'true' : 'false',
            e.canceled ? 'true' : 'false'
        ]);
        
        return [headers, ...rows].map(row => row.join(',')).join('\n');
    },
    
    /**
     * Генерирует README файл
     */
    generateReadme(entries, timestamp) {
        const appealedCount = entries.filter(e => e.appealed).length;
        const canceledCount = entries.filter(e => e.canceled).length;
        
        return `# Датасет судебных актов арбитражных судов

## Описание
Датасет содержит тексты судебных решений арбитражных судов России.

## Формат записей (JSONL)
\`\`\`json
{
    "case_number": "A60-123456-2024",
    "decision_date": "2025-01-15",
    "decision_text": "...",
    "appealed": false,
    "canceled": false,
    "metadata": {"source": "arbitration_court"}
}
\`\`\`

## Поля
- \`case_number\` — номер дела
- \`decision_date\` — дата решения (YYYY-MM-DD)
- \`decision_text\` — текст судебного акта
- \`appealed\` — было ли обжалование в апелляции (boolean)
- \`canceled\` — отменено ли решение по итогам обжалования (boolean)
- \`metadata\` — дополнительные метаданные

## Статистика
- Всего записей: ${entries.length}
- Обжаловано: ${appealedCount}
- Отменено: ${canceledCount}
- Дата создания: ${timestamp}
`;
    },
    
    /**
     * Объединяет два датасета, избегая дубликатов
     */
    mergeDatasets(existing, newEntries) {
        const existingCases = new Set(
            existing.filter(e => e.case_number).map(e => e.case_number)
        );
        const merged = [...existing];
        
        for (const entry of newEntries) {
            if (!entry.case_number || !existingCases.has(entry.case_number)) {
                // Добавляем значения по умолчанию для старых записей
                if (entry.appealed === undefined) {
                    entry.appealed = false;
                }
                if (entry.canceled === undefined) {
                    entry.canceled = false;
                }
                merged.push(entry);
                if (entry.case_number) {
                    existingCases.add(entry.case_number);
                }
            }
        }
        
        return merged;
    }
};
