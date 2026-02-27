/**
 * JSONL_HANDLER.JS
 * Обработка обогащённых JSONL датасетов судебных актов
 * Версия: 1.0
 */

const JSONLHandler = {
    /**
     * Создаёт запись enriched датасета
     */
    createEnrichedEntry(data) {
        return {
            case_id: data.case_id || '',
            dispute_summary: data.dispute_summary || '',
            plaintiff: data.plaintiff || { name: '', type: '' },
            defendant: data.defendant || { name: '', type: '' },
            key_statements_plaintiff: data.key_statements_plaintiff || [],
            key_statements_defendant: data.key_statements_defendant || [],
            court_resolutions: data.court_resolutions || [],
            decision_verdict: data.decision_verdict || '',
            initial_claims_sum: data.initial_claims_sum || { initial_claims: 0, awarded: 0 },
            mentioned_rules: data.mentioned_rules || [],
            personal_data: data.personal_data || [],
            q_a: data.q_a || [],
            metadata: {
                source: 'enriched_legal_dataset',
                language: 'ru',
                created_at: data.metadata?.created_at || new Date().toISOString(),
                updated_at: new Date().toISOString()
            }
        };
    },

    /**
     * Конвертирует массив записей в JSONL строку
     */
    toJSONL(entries) {
        return entries.map(entry => JSON.stringify(entry, null, 0)).join('\n');
    },

    /**
     * Конвертирует массив записей в JSON строку (массив объектов)
     */
    toJSON(entries) {
        return JSON.stringify(entries, null, 2);
    },

    /**
     * Парсит JSONL строку в массив записей
     */
    fromJSONL(jsonlString) {
        const entries = [];
        const lines = jsonlString.trim().split('\n');
        
        console.log(`🔍 Парсинг JSONL: ${lines.length} строк`);
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            if (!line || !line.startsWith('{')) {
                continue;
            }
            
            try {
                const entry = JSON.parse(line);
                entries.push(entry);
            } catch (e) {
                console.warn(`⚠️ Ошибка парсинга строки ${i + 1}:`, e.message);
            }
        }
        
        console.log(`✅ Успешно загружено записей: ${entries.length}`);
        return entries;
    },

    /**
     * Парсит JSON строку в массив записей
     */
    fromJSON(jsonString) {
        try {
            const data = JSON.parse(jsonString);
            if (Array.isArray(data)) {
                return data;
            }
            return [data];
        } catch (e) {
            console.error('❌ Ошибка парсинга JSON:', e.message);
            return [];
        }
    },

    /**
     * Загружает файл (JSONL или JSON)
     */
    async loadFromFile(file) {
        const text = await file.text();
        const filename = file.name.toLowerCase();
        
        if (filename.endsWith('.jsonl')) {
            return this.fromJSONL(text);
        } else if (filename.endsWith('.json')) {
            return this.fromJSON(text);
        } else {
            // Пытаемся определить по содержимому
            const trimmed = text.trim();
            if (trimmed.startsWith('[')) {
                return this.fromJSON(text);
            } else if (trimmed.startsWith('{')) {
                return this.fromJSONL(text);
            }
            return [];
        }
    },

    /**
     * Скачивает JSONL файл
     */
    downloadJSONL(entries, filename = 'enriched_dataset.jsonl') {
        const jsonl = this.toJSONL(entries);
        const blob = new Blob([jsonl], { type: 'application/jsonl;charset=utf-8' });
        saveAs(blob, filename);
        console.log(`📥 Скачан JSONL: ${filename} (${entries.length} записей)`);
    },

    /**
     * Скачивает JSON файл
     */
    downloadJSON(entries, filename = 'enriched_dataset.json') {
        const json = this.toJSON(entries);
        const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
        saveAs(blob, filename);
        console.log(`📥 Скачан JSON: ${filename} (${entries.length} записей)`);
    },

    /**
     * Извлекает все уникальные ключи из датасета
     */
    extractAllKeys(entries) {
        const allKeys = new Set();
        
        function extractKeys(obj, prefix = '') {
            if (typeof obj !== 'object' || obj === null) return;
            
            for (const key of Object.keys(obj)) {
                const fullKey = prefix ? `${prefix}.${key}` : key;
                allKeys.add(fullKey);
                
                if (typeof obj[key] === 'object' && obj[key] !== null) {
                    extractKeys(obj[key], fullKey);
                }
            }
        }
        
        entries.forEach(entry => extractKeys(entry));
        return Array.from(allKeys).sort();
    },

    /**
     * Удаляет ключи из всех записей
     */
    deleteKeysFromEntries(entries, keysToDelete) {
        let deletedCount = 0;
        
        entries.forEach(entry => {
            keysToDelete.forEach(keyPath => {
                if (this.deleteKeyByPath(entry, keyPath)) {
                    deletedCount++;
                }
            });
        });
        
        console.log(`🗑 Удалено ключей: ${deletedCount} из ${entries.length} записей`);
        return entries;
    },

    /**
     * Удаляет ключ по пути (например "plaintiff.name")
     */
    deleteKeyByPath(obj, keyPath) {
        const parts = keyPath.split('.');
        let current = obj;
        
        for (let i = 0; i < parts.length - 1; i++) {
            if (current[parts[i]] === undefined) return false;
            current = current[parts[i]];
        }
        
        const lastKey = parts[parts.length - 1];
        if (current[lastKey] !== undefined) {
            delete current[lastKey];
            return true;
        }
        return false;
    },

    /**
     * Добавляет новый ключ во все записи
     */
    addKeyToEntries(entries, keyName, location = 'root', value = '') {
        let addedCount = 0;
        
        entries.forEach(entry => {
            if (location === 'root') {
                if (entry[keyName] === undefined) {
                    entry[keyName] = value;
                    addedCount++;
                }
            } else if (entry[location] && typeof entry[location] === 'object') {
                if (entry[location][keyName] === undefined) {
                    entry[location][keyName] = value;
                    addedCount++;
                }
            }
        });
        
        console.log(`➕ Добавлено ключей: ${addedCount} в ${entries.length} записей`);
        return entries;
    },

    /**
     * Получает значение по пути
     */
    getValueByPath(obj, keyPath) {
        const parts = keyPath.split('.');
        let current = obj;
        
        for (const part of parts) {
            if (current === undefined || current === null) return undefined;
            current = current[part];
        }
        
        return current;
    },

    /**
     * Устанавливает значение по пути
     */
    setValueByPath(obj, keyPath, value) {
        const parts = keyPath.split('.');
        let current = obj;
        
        for (let i = 0; i < parts.length - 1; i++) {
            if (current[parts[i]] === undefined) {
                current[parts[i]] = {};
            }
            current = current[parts[i]];
        }
        
        current[parts[parts.length - 1]] = value;
    },

    /**
     * Объединяет два датасета
     */
    mergeDatasets(existing, newEntries) {
        const existingIds = new Set(existing.filter(e => e.case_id).map(e => e.case_id));
        const merged = [...existing];
        let duplicatesSkipped = 0;
        
        for (const entry of newEntries) {
            if (!entry.case_id || !existingIds.has(entry.case_id)) {
                merged.push(entry);
                if (entry.case_id) {
                    existingIds.add(entry.case_id);
                }
            } else {
                duplicatesSkipped++;
                console.log(`⏭️ Пропущен дубликат: ${entry.case_id}`);
            }
        }
        
        console.log(`✅ Объединение: ${merged.length} записей (пропущено: ${duplicatesSkipped})`);
        return merged;
    },

    /**
     * Генерирует статистику по датасету
     */
    generateStatistics(entries) {
        const stats = {
            totalRecords: entries.length,
            uniqueKeys: this.extractAllKeys(entries).length,
            totalChars: entries.reduce((sum, e) => sum + JSON.stringify(e).length, 0),
            verdicts: {},
            hasPlaintiff: 0,
            hasDefendant: 0,
            hasQA: 0
        };
        
        entries.forEach(e => {
            if (e.decision_verdict) {
                stats.verdicts[e.decision_verdict] = (stats.verdicts[e.decision_verdict] || 0) + 1;
            }
            if (e.plaintiff?.name) stats.hasPlaintiff++;
            if (e.defendant?.name) stats.hasDefendant++;
            if (e.q_a?.length > 0) stats.hasQA++;
        });
        
        return stats;
    }
};

// Экспорт в глобальный scope
window.JSONLHandler = JSONLHandler;
console.log('✅ JSONLHandler загружен');
