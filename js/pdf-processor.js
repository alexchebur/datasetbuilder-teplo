/**
 * PDF_PROCESSOR.JS
 * Обработка PDF-файлов в браузере с использованием pdf-text-reader
 * Версия: 5.0 (Использует продвинутую геометрическую склейку из библиотеки)
 */

// Импортируем библиотеку (предполагается, что вы используете сборщик модулей)
// Если нет - см. инструкцию после кода
import { readPdfText } from 'pdf-text-reader';

window.PDFProcessor = null;

const PDFProcessor = {
    /**
     * Извлекает текст из PDF-файла с помощью pdf-text-reader
     * Теперь это просто и надежно!
     */
    async extractText(file) {
        console.log('🔍 Начало извлечения текста из:', file.name);
        
        try {
            const arrayBuffer = await file.arrayBuffer();
            console.log('📦 Размер файла:', arrayBuffer.byteLength, 'байт');
            
            // pdf-text-reader принимает данные в разных форматах
            const text = await readPdfText({ data: arrayBuffer });
            
            console.log('✅ Текст успешно извлечен, длина:', text.length);
            return text;
            
        } catch (error) {
            console.error('❌ Ошибка при извлечении текста:', error);
            throw error;
        }
    },

    /**
     * Мягкая очистка текста
     * Теперь это вспомогательная функция, а не основной механизм
     */
    cleanText(text) {
        if (!text) return '';
        
        // Удаляем управляющие символы (кроме переносов строк и табуляции)
        text = text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/g, '');
        
        // Нормализуем переносы строк
        text = text.replace(/\r\n/g, '\n');
        text = text.replace(/\r/g, '\n');
        
        // Убираем пробелы ПЕРЕД знаками препинания (иногда остаются)
        text = text.replace(/\s+([.,;:!?])/g, '$1');
        
        // Восстанавливаем пробелы ПОСЛЕ знаков препинания, если они слиплись
        text = text.replace(/([.,;:!?])([а-яА-ЯёЁa-zA-Z0-9])/g, '$1 $2');
        
        // Убираем множественные пробелы
        text = text.replace(/[ ]{2,}/g, ' ');
        
        // Нормализуем множественные переносы строк (не больше двух подряд)
        text = text.replace(/\n{3,}/g, '\n\n');
        
        // Trim каждой строки (убираем лишние пробелы в начале/конце строк)
        text = text.split('\n').map(line => line.trim()).join('\n');
        
        // Общий trim
        text = text.trim();
        
        // Замена лигатур и спецсимволов
        const replacements = {
            'ﬁ': 'fi', 'ﬂ': 'fl', 'ﬀ': 'ff', 'ﬃ': 'ffi', 'ﬄ': 'ffl',
            '–': '-', '—': '-', 
            '«': '"', '»': '"', '„': '"', '‚': "'",
            '′': "'", '″': '"', '…': '...', '•': '-', 
            '©': '(c)', '®': '(R)', '™': '(TM)',
        };
        
        for (const [oldChar, newChar] of Object.entries(replacements)) {
            text = text.split(oldChar).join(newChar);
        }
        
        return text;
    },

    /**
     * Извлекает информацию о деле из имени файла
     * (без изменений, работает отлично)
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
                        break;
                    }
                }
            }
        }
        return result;
    },

    /**
     * Полная обработка файла
     * (минимальные изменения для совместимости)
     */
    async processFile(file, onProgress = null) {
        try {
            const fileInfo = this.extractCaseInfo(file.name);
            
            if (!fileInfo.caseNumber || !fileInfo.decisionDate) {
                throw new Error(`Не удалось извлечь данные из имени файла: ${file.name}`);
            }
            
            if (onProgress) onProgress(20, 'Извлечение текста...');
            
            const rawText = await this.extractText(file);
            
            if (onProgress) onProgress(60, 'Очистка текста...');
            
            const cleanedText = this.cleanText(rawText);
            
            if (cleanedText.length < 100) {
                throw new Error('Текст слишком короткий');
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
            console.error('❌ Ошибка обработки:', error);
            return {
                success: false,
                error: error.message,
                filename: file.name
            };
        }
    }
};

window.PDFProcessor = PDFProcessor;
console.log('✅ PDFProcessor v5.0 загружен (использует pdf-text-reader)');
