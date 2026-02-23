/**
 * PDF_PROCESSOR.JS
 * Обработка PDF-файлов в браузере с использованием pdf.js
 * Версия: 3.0 (полностью исправленная)
 * 
 * Исправления:
 * - Корректная передача данных в pdfjsLib.getDocument()
 * - Правильный экспорт в глобальный scope
 * - Улучшенная очистка текста для русских документов
 * - Гибкий парсинг имён файлов
 * - Детальное логирование для отладки
 */

// ============================================================================
// ПРОВЕРКА ЗАГРУЗКИ PDF.JS
// ============================================================================
if (typeof pdfjsLib === 'undefined') {
    console.error('❌ PDF_PROCESSOR: pdfjsLib не загружен! Проверьте порядок скриптов в index.html');
    console.error('   PDF.js должен быть подключён ДО pdf-processor.js');
}

// Экспорт в глобальный scope (будет assigned после определения объекта)
window.PDFProcessor = null;

// ============================================================================
// ОСНОВНОЙ ОБЪЕКТ PDFPROCESSOR
// ============================================================================
const PDFProcessor = {
    
    // ============================================================================
    // ИЗВЛЕЧЕНИЕ ТЕКСТА ИЗ PDF
    // ============================================================================
    /**
     * Извлекает текст из PDF-файла
     * @param {File} file - PDF файл
     * @returns {Promise<string>} - Извлечённый текст
     */
    async extractText(file) {
        console.log('🔍 Начало извлечения текста из:', file.name);
        
        try {
            // Чтение файла как ArrayBuffer
            const arrayBuffer = await file.arrayBuffer();
            console.log('📦 Размер файла:', arrayBuffer.byteLength, 'байт');
            
            // ✅ КРИТИЧНО: передаём { data: arrayBuffer }, а не { arrayBuffer }
            const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
            const pdf = await loadingTask.promise;
            
            console.log('✅ PDF загружен, страниц:', pdf.numPages);
            
            // Проверка на зашифрованный PDF
            if (pdf._pdfInfo?.encrypted) {
                throw new Error('PDF защищён паролем и не может быть обработан');
            }
            
            let fullText = [];
            
            for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                console.log(`📄 Обработка страницы ${pageNum}/${pdf.numPages}`);
                
                const page = await pdf.getPage(pageNum);
                const textContent = await page.getTextContent();
                
                // Проверка: есть ли текст на странице
                if (!textContent.items || textContent.items.length === 0) {
                    console.warn(`⚠️ Страница ${pageNum} не содержит извлекаемого текста (возможно, скан)`);
                    continue;
                }
                
                // Умное объединение текста с учётом позиции элементов
                const pageText = this.reconstructTextFromItems(textContent.items);
                
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

    // ============================================================================
    // РЕКОНСТРУКЦИЯ ТЕКСТА С УЧЁТОМ ПОЗИЦИИ
    // ============================================================================
    /**
     * Реконструкция текста с учётом позиции элементов на странице
     * @param {Array} items - Элементы текста из pdf.js
     * @returns {string} - Восстановленный текст
     */
    reconstructTextFromItems(items) {
        if (!items || items.length === 0) return '';
        
        // Фильтруем пустые элементы
        const validItems = items.filter(item => 
            item.str && item.str.trim().length > 0
        );
        
        if (validItems.length === 0) return '';
        
        let textLines = [];
        let currentLine = [];
        let lastY = null;
        const Y_THRESHOLD = 5; // Порог для определения новой строки (в пунктах)
        
        for (const item of validItems) {
            // Y-координата в pdf.js: transform[5]
            const currentY = item.transform[5];
            
            // Если Y изменился значительно — новая строка
            if (lastY !== null && Math.abs(currentY - lastY) > Y_THRESHOLD) {
                textLines.push(currentLine.join(' '));
                currentLine = [];
            }
            
            currentLine.push(item.str);
            lastY = currentY;
        }
        
        // Добавляем последнюю строку
        if (currentLine.length > 0) {
            textLines.push(currentLine.join(' '));
        }
        
        return textLines.join('\n');
    },

    /**
     * Очищает текст от артефактов PDF
     * @param {string} text - Исходный текст
     * @returns {string} - Очищенный текст
     */
    cleanText(text) {
        if (!text) return '';
    
        // 1. Удаление непечатаемых символов
        text = text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/g, '');
    
        // 2. ❌ УДАЛЕНО: Агрессивное удаление пробелов между буквами
        // Эта строка сломала текст — НЕ используйте её!
        // text = text.replace(/([а-яА-ЯёЁ])\s+([а-яА-ЯёЁ])/g, '$1$2');
    
        // 3. ✅ БЕЗОПАСНО: Удаление множественных пробелов (3 и более)
        text = text.replace(/[ \t]{3,}/g, ' ');
    
        // 4. ✅ БЕЗОПАСНО: Удаление пробелов перед знаками препинания
        text = text.replace(/\s+([.,;:!?])/g, '$1');
    
        // 5. ✅ БЕЗОПАСНО: Удаление пробелов после открывающих скобок/кавычек
        text = text.replace(/([\(\["])\s+/g, '$1');
        text = text.replace(/\s+([\)\]"])/g, '$1');
    
        // 6. Замена множественных переносов на двойной
        text = text.replace(/\n\s*\n/g, '\n\n');
        text = text.replace(/\n{3,}/g, '\n\n');
    
        // 7. Trim строк
        text = text.split('\n').map(line => line.trim()).join('\n').trim();
    
        // 8. Замена распространённых артефактов PDF
        const replacements = {
            'ﬁ': 'фи', 'ﬂ': 'фл', 'ﬀ': 'фф', 'ﬃ': 'ффи', 'ﬄ': 'ффл',
            '–': '-', '—': '-', '«': '"', '»': '"', '„': '"', '‚': "'",
            '′': "'", '″': '"', '…': '...', '•': '-', '©': '(c)',
            '®': '(R)', '™': '(TM)',
        };
    
        for (const [oldChar, newChar] of Object.entries(replacements)) {
            text = text.split(oldChar).join(newChar);
        }
    
        // 9. ✅ ОПЦИОНАЛЬНО: Исправление разорванных слов (очень консервативно)
        // Только если между буквами 1 символ и это явно артефакт
        // Например: "судебног о" → "судебного" (но только если это редкий случай)
        // Для безопасности — отключено по умолчанию
        // text = text.replace(/(\w{5,})\s(\w{1,2})\s(\w{3,})/g, '$1$2$3');
    
        return text;
    }
    // ============================================================================
    // ПАРСИНГ ИМЕНИ ФАЙЛА
    // ============================================================================
    /**
     * Извлекает информацию о деле из имени файла
     * Поддерживаемые форматы:
     * - A60-49559-2024_20250616_Reshenija.pdf
     * - A60-49559-2024_20250616_Reshenija_i_postanovlenija.pdf
     * - A60-XXXXX-YYYY_YYYYMMDD_*.pdf
     * 
     * @param {string} filename - Имя файла PDF
     * @returns {Object} - { caseNumber, decisionDate, rawFilename, isValid, errors }
     */
    extractCaseInfo(filename) {
        console.log('🔍 Парсинг имени файла:', filename);
        
        // Удаляем расширение
        const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');
        
        // Разделяем по подчёркиванию
        const parts = nameWithoutExt.split('_');
        
        const result = {
            caseNumber: null,
            decisionDate: null,
            rawFilename: filename,
            isValid: false,
            errors: []
        };
        
        // Нужно минимум 2 части: номер дела и дата
        if (parts.length < 2) {
            result.errors.push('Недостаточно частей в имени файла (ожидается формат: НомерДела_Дата_*.pdf)');
            console.warn('❌ Недостаточно частей:', parts);
            return result;
        }
        
        // Часть 1: Номер дела (должен содержать дефисы, например А60-49559-2024)
        result.caseNumber = parts[0];
        
        // Валидация номера дела
        if (!result.caseNumber || result.caseNumber.length < 5) {
            result.errors.push(`Некорректный номер дела: "${result.caseNumber}"`);
            console.warn('❌ Некорректный номер дела:', result.caseNumber);
            return result;
        }
        
        // Часть 2: Дата (должна быть 8 цифр YYYYMMDD)
        const dateStr = parts[1];
        
        if (!dateStr || dateStr.length !== 8 || !/^\d+$/.test(dateStr)) {
            result.errors.push(`Некорректная дата: "${dateStr}" (ожидается формат YYYYMMDD)`);
            console.warn('❌ Некорректная дата:', dateStr);
            
            // Пытаемся найти дату в других частях
            for (let i = 2; i < parts.length; i++) {
                const potentialDate = parts[i];
                if (potentialDate.length === 8 && /^\d+$/.test(potentialDate)) {
                    result.decisionDate = `${potentialDate.slice(0,4)}-${potentialDate.slice(4,6)}-${potentialDate.slice(6,8)}`;
                    console.log('✅ Дата найдена в части', i, ':', result.decisionDate);
                    break;
                }
            }
            
            if (!result.decisionDate) {
                return result;
            }
        } else {
            // Конвертируем YYYYMMDD → YYYY-MM-DD
            result.decisionDate = `${dateStr.slice(0,4)}-${dateStr.slice(4,6)}-${dateStr.slice(6,8)}`;
        }
        
        // Валидация даты (проверка на разумность)
        if (result.decisionDate) {
            const year = parseInt(result.decisionDate.split('-')[0]);
            if (year < 2000 || year > 2030) {
                result.errors.push(`Подозрительный год в дате: ${year}`);
                console.warn('⚠️ Подозрительный год:', year);
                // Не блокируем, но предупреждаем
            }
        }
        
        result.isValid = true;
        console.log('✅ Имя файла валидно:', result);
        
        return result;
    },

    // ============================================================================
    // ПОЛНАЯ ОБРАБОТКА ФАЙЛА
    // ============================================================================
    /**
     * Полная обработка PDF-файла
     * @param {File} file - PDF файл
     * @param {Function} onProgress - Callback для обновления прогресса (percent, message)
     * @returns {Promise<Object>} - Результат обработки
     */
    async processFile(file, onProgress = null) {
        try {
            // Шаг 1: Извлечение информации из имени файла
            const fileInfo = this.extractCaseInfo(file.name);
            
            if (!fileInfo.isValid) {
                return {
                    success: false,
                    error: fileInfo.errors.join('; '),
                    filename: file.name
                };
            }
            
            if (onProgress) onProgress(20, 'Извлечение текста из PDF...');
            
            // Шаг 2: Извлечение текста
            const rawText = await this.extractText(file);
            
            if (onProgress) onProgress(60, 'Очистка текста...');
            
            // Шаг 3: Очистка текста
            const cleanedText = this.cleanText(rawText);
            
            if (cleanedText.length < 100) {
                return {
                    success: false,
                    error: 'Текст слишком короткий после очистки (< 100 символов)',
                    filename: file.name
                };
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
            console.error('❌ Критическая ошибка processFile:', error);
            return {
                success: false,
                error: error.message,
                filename: file.name
            };
        }
    }
};

// ============================================================================
// ЭКСПОРТ В ГЛОБАЛЬНЫЙ SCOPE (ПОСЛЕ ОПРЕДЕЛЕНИЯ ОБЪЕКТА!)
// ============================================================================
window.PDFProcessor = PDFProcessor;
console.log('✅ PDFProcessor загружен и экспортирован в window.PDFProcessor');
console.log('   Доступные методы:', Object.keys(PDFProcessor).join(', '));fагр
