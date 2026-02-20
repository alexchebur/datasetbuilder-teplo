/**
 * PDF_PROCESSOR.JS
 * Обработка PDF-файлов в браузере с использованием pdf.js
 * Версия: 2.0
 */

// Проверка загрузки PDF.js при загрузке модуля
if (typeof pdfjsLib === 'undefined') {
    console.error('❌ PDF_PROCESSOR: pdfjsLib не загружен! Проверьте порядок скриптов в index.html');
}

// Экспорт модуля в глобальный scope для отладки
window.PDFProcessor = null; // Будет assigned ниже
const PDFProcessor = {
    /**
     * Извлекает текст из PDF-файла
     */
    async extractText(file) {
        console.log('🔍 Начало извлечения текста из:', file.name);
        
        try {
            const arrayBuffer = await file.arrayBuffer();
            console.log('📦 Размер файла:', arrayBuffer.byteLength, 'байт');
            
            const loadingTask = pdfjsLib.getDocument({ arrayBuffer });
            const pdf = await loadingTask.promise;
            
            console.log('✅ PDF загружен, страниц:', pdf.numPages);
            
            let fullText = [];
            
            for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                console.log(`📄 Обработка страницы ${pageNum}/${pdf.numPages}`);
                const page = await pdf.getPage(pageNum);
                const textContent = await page.getTextContent();
                
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
    window.PDFProcessor = PDFProcessor;


    /**
     * Очищает текст от артефактов PDF
     * @param {string} text - Исходный текст
     * @returns {string} - Очищенный текст
     */
    cleanText(text) {
        if (!text) return '';
        
        // Удаление непечатаемых символов
        text = text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/g, '');
        
        // Замена множественных пробелов
        text = text.replace(/[ \t]+/g, ' ');
        
        // Замена множественных переносов
        text = text.replace(/\n\s*\n/g, '\n\n');
        
        // Trim строк
        text = text.split('\n').map(line => line.trim()).join('\n').trim();
        
        // Замена распространённых артефактов
        const replacements = {
            'ﬁ': 'фи', 'ﬂ': 'фл', 'ﬀ': 'фф', 'ﬃ': 'ффи', 'ﬄ': 'ффл',
            '–': '-', '—': '-', '«': '"', '»': '"', '„': '"', '‚': "'",
            '′': "'", '″': '"', '…': '...', '•': '-', '©': '(c)',
            '®': '(R)', '™': '(TM)',
        };
        
        for (const [oldChar, newChar] of Object.entries(replacements)) {
            text = text.split(oldChar).join(newChar);
        }
        
        return text;
    },


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
            // Номер дела - первая часть (должен содержать дефисы, например А60-49559-2024)
            result.caseNumber = parts[0];
        
            // Дата - вторая часть (должна быть 8 цифр YYYYMMDD)
            const dateStr = parts[1];
            if (dateStr && dateStr.length === 8 && /^\d+$/.test(dateStr)) {
                result.decisionDate = `${dateStr.slice(0,4)}-${dateStr.slice(4,6)}-${dateStr.slice(6,8)}`;
            }
        
            // Альтернативный поиск даты в других частях имени файла
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
     * @param {File} file - PDF файл
     * @param {Function} onProgress - Callback для обновления прогресса
     * @returns {Promise<Object>} - Результат обработки
     */
    async processFile(file, onProgress = null) {
        try {
            // Шаг 1: Извлечение информации из имени файла
            const fileInfo = this.extractCaseInfo(file.name);
            
            if (!fileInfo.caseNumber || !fileInfo.decisionDate) {
                throw new Error(`Не удалось извлечь данные из имени файла: ${file.name}`);
            }
            
            if (onProgress) onProgress(20, 'Извлечение текста из PDF...');
            
            // Шаг 2: Извлечение текста
            const rawText = await this.extractText(file);
            
            if (onProgress) onProgress(60, 'Очистка текста...');
            
            // Шаг 3: Очистка текста
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
