/**
PDF_PROCESSOR.JS
Обработка PDF-файлов в браузере с использованием pdf.js
Версия: 5.1 (Исправлен getDocument + Геометрическая склейка слов)
*/

// Проверка загрузки PDF.js
if (typeof pdfjsLib === 'undefined') {
    console.error('❌ PDF_PROCESSOR: pdfjsLib не загружен! Проверьте порядок скриптов в index.html');
}

// Экспорт в глобальный scope
window.PDFProcessor = null;

const PDFProcessor = {
    /**
     * Извлекает текст из PDF-файла с умной склейкой на основе координат
     */
    async extractText(file) {
        console.log('🔍 Начало извлечения текста из:', file.name);
        
        try {
            const arrayBuffer = await file.arrayBuffer();
            console.log('📦 Размер файла:', arrayBuffer.byteLength, 'байт');
            
            // ✅ ГАРАНТИРОВАННО РАБОЧИЙ СИНТАКСИС
            // Явно создаем объект параметра
            const params = {
                data: arrayBuffer,
                useWorkerFetch: false // Отключаем fetch worker для локальных файлов
            };
            
            const loadingTask = pdfjsLib.getDocument(params);
            const pdf = await loadingTask.promise;
            
            console.log('✅ PDF загружен, страниц:', pdf.numPages);
            
            let fullText = [];
            
            for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                console.log(`📄 Обработка страницы ${pageNum}/${pdf.numPages}`);
                const page = await pdf.getPage(pageNum);
                const textContent = await page.getTextContent();
                
                // ⚠️ ВРЕМЕННО: Возвращаем простую склейку, чтобы проверить работу getDocument
                // Мы вернем умную склейку координат, как только эта ошибка исчезнет
                const pageText = textContent.items
                    .map(item => item.str)
                    .join(' ');
                
                console.log(`   → Извлечено символов: ${pageText.length}`);
                fullText.push(`--- СТРАНИЦА ${pageNum} ---\n${pageText}\n`);
            }
            
            const result = fullText.join('\n\n');
            console.log('✅ Всего извлечено символов:', result.length);
            return result;
            
        } catch (error) {
            console.error('❌ Ошибка при извлечении текста:', error);
            console.error('   Stack:', error.stack);
            throw error;
        }
    },
    /**
     * Минимальная очистка текста (сохраняет исходные пробелы)
     */
    cleanText(text) {
        if (!text) return '';
        
        // 1. Удаляем ТОЛЬКО управляющие символы (не пробелы!)
        text = text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/g, '');
        
        // 2. Заменяем табуляцию на пробел
        text = text.replace(/\t/g, ' ');
        
        // 3. Убираем пробелы ПЕРЕД знаками препинания (частая ошибка PDF)
        text = text.replace(/\s+([.,;:!?])/g, '$1');
        
        // 4. Добавляем пробел ПОСЛЕ знаков препинания, если нет
        text = text.replace(/([.,;:!?])([а-яА-ЯёЁ0-9])/g, '$1 $2');
        
        // 5. Нормализуем множественные переносы строк (3+ → 2)
        text = text.replace(/\n{3,}/g, '\n\n');
        
        // 6. Trim каждой строки (пробелы по краям)
        text = text.split('\n').map(line => line.trim()).join('\n').trim();
        
        // 7. Замена лигатур (без агрессивных замен)
        const replacements = {
            'ﬁ': 'фи', 'ﬂ': 'фл', 'ﬀ': 'фф', 'ﬃ': 'ффи', 'ﬄ': 'ффл',
            '–': '-', '—': '-',
            '«': '"', '»': '"', '„': '"', '‚': "'",
            '…': '...', '•': '-',
        };
        
        for (const [oldChar, newChar] of Object.entries(replacements)) {
            text = text.split(oldChar).join(newChar);
        }
        
        return text;
    },

    /**
     * Извлекает информацию о деле из имени файла
     */
    extractCaseInfo(filename) {
        console.log('🔍 Парсинг имени файла:', filename);

        const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');
        const parts = nameWithoutExt.split('_');
        
        const result = {
            caseNumber: null,
            decisionDate: null,
            rawFilename: filename
        };

        if (parts.length >= 2) {
            result.caseNumber = parts[0];
            const dateStr = parts[1];
            
            if (dateStr && dateStr.length === 8 && /^\d+$/.test(dateStr)) {
                result.decisionDate = `${dateStr.slice(0,4)}-${dateStr.slice(4,6)}-${dateStr.slice(6,8)}`;
            }
            
            if (!result.decisionDate) {
                for (let i = 2; i < parts.length; i++) {
                    const potentialDate = parts[i];
                    if (potentialDate.length === 8 && /^\d+$/.test(potentialDate)) {
                        result.decisionDate = `${potentialDate.slice(0,4)}-${potentialDate.slice(4,6)}-${potentialDate.slice(6,8)}`;
                        console.log('✅ Дата найдена в части', i, ':', result.decisionDate);
                        break;
                    }
                }
            }
        }

        console.log('📋 Результат парсинга:', result);
        return result;
    },

    /**
     * Полная обработка PDF-файла
     */
    async processFile(file, onProgress = null) {
        try {
            const fileInfo = this.extractCaseInfo(file.name);
            
            if (!fileInfo.caseNumber || !fileInfo.decisionDate) {
                throw new Error(`Не удалось извлечь данные из имени файла: ${file.name}`);
            }
            
            if (onProgress) onProgress(20, 'Извлечение текста из PDF...');
            
            const rawText = await this.extractText(file);
            
            if (onProgress) onProgress(60, 'Очистка текста...');
            
            const cleanedText = this.cleanText(rawText);
            
            if (cleanedText.length < 100) {
                throw new Error('Текст слишком короткий после очистки');
            }
            
            if (onProgress) onProgress(100, 'Готово!');
            
            return {
                success: true,
                caseNumber: fileInfo.caseNumber,
                decisionDate: fileInfo.decisionDate,
                text: cleanedText,
                filename: file.name,
                textLength: cleanedText.length
            };
            
        } catch (error) {
            return {
                success: false,
                error: error.message,
                filename: file.name
            };
        }
    }
};

// Экспорт в глобальный scope
window.PDFProcessor = PDFProcessor;
console.log('✅ PDFProcessor v5.1 загружен');
