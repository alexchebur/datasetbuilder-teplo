/**
 * PDF_PROCESSOR.JS
 * Обработка PDF-файлов в браузере с использованием pdf.js
 */

const PDFProcessor = {
    /**
     * Извлекает текст из PDF-файла
     * @param {File} file - PDF файл
     * @returns {Promise<string>} - Извлечённый текст
     */
    async extractText(file) {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        
        let fullText = [];
        
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const textContent = await page.getTextContent();
            
            const pageText = textContent.items
                .map(item => item.str)
                .join(' ');
            
            fullText.push(`--- СТРАНИЦА ${pageNum} ---\n${pageText}\n`);
        }
        
        return fullText.join('\n\n');
    },

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

    /**
     * Извлекает информацию о деле из имени файла
     * @param {string} filename - Имя файла PDF
     * @returns {Object} - { caseNumber, decisionDate, rawFilename }
     */
    extractCaseInfo(filename) {
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
                // Формат YYYYMMDD -> YYYY-MM-DD
                result.decisionDate = `${dateStr.slice(0,4)}-${dateStr.slice(4,6)}-${dateStr.slice(6,8)}`;
            } else {
                result.decisionDate = dateStr;
            }
        }
        
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
