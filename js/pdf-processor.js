/**
PDF_PROCESSOR.JS
Обработка PDF-файлов в браузере с использованием pdf.js
Версия: 4.0 (Геометрическая склейка слов на основе координат)
*/

// Проверка загрузки PDF.js
if (typeof pdfjsLib === 'undefined') {
    console.error('❌ PDF_PROCESSOR: pdfjsLib не загружен! Проверьте порядок скриптов в index.html');
}

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
            
            // Используем правильный формат для pdf.js
            const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
            const pdf = await loadingTask.promise;
            
            console.log('✅ PDF загружен, страниц:', pdf.numPages);
            
            let fullText = [];
            
            for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                console.log(`📄 Обработка страницы ${pageNum}/${pdf.numPages}`);
                const page = await pdf.getPage(pageNum);
                const textContent = await page.getTextContent();
                const items = textContent.items;
                
                if (items.length === 0) continue;

                let pageLines = [];
                let currentLineParts = [];
                
                let lastItem = null;
                
                // 1. Вычисляем средний размер шрифта для этой страницы
                let totalHeight = 0;
                let count = 0;
                items.forEach(item => {
                    if (item.height) {
                        totalHeight += item.height;
                        count++;
                    }
                });
                const avgFontSize = count > 0 ? totalHeight / count : 12;
                
                // 2. Настраиваем пороги
                // Если разрыв меньше 20% высоты шрифта -> это часть слова (склеиваем БЕЗ пробела)
                const WORD_GAP_THRESHOLD = avgFontSize * 0.2; 
                // Если разрыв по Y больше 50% высоты шрифта -> новая строка
                const LINE_HEIGHT_THRESHOLD = avgFontSize * 0.5;

                for (let i = 0; i < items.length; i++) {
                    const item = items[i];
                    const str = item.str;

                    // Пропускаем пустые элементы
                    if (!str || str.trim() === '') {
                        lastItem = item;
                        continue;
                    }

                    // Координаты: transform = [scaleX, skewY, skewX, scaleY, x, y]
                    const x = item.transform[4];
                    const y = item.transform[5];
                    
                    // Приблизительная ширина элемента
                    const width = item.width || (str.length * avgFontSize * 0.6);
                    const xEnd = x + width;

                    if (lastItem) {
                        const lastX = lastItem.transform[4];
                        const lastY = lastItem.transform[5];
                        const lastWidth = lastItem.width || (lastItem.str.length * avgFontSize * 0.6);
                        const lastXEnd = lastX + lastWidth;

                        const deltaY = Math.abs(y - lastY);
                        const gap = x - lastXEnd;

                        // А. Проверка на новую строку
                        if (deltaY > LINE_HEIGHT_THRESHOLD || x < lastX) {
                            // Сохраняем текущую строку
                            if (currentLineParts.length > 0) {
                                pageLines.push(currentLineParts.join(''));
                            }
                            currentLineParts = [str];
                            lastItem = item;
                            continue;
                        }

                        // Б. Проверка разрыва внутри строки
                        if (gap > WORD_GAP_THRESHOLD) {
                            // Большой разрыв -> добавляем пробел перед словом
                            currentLineParts.push(' ' + str);
                        } else {
                            // Микро-разрыв или наложение -> склеиваем без пробела
                            // Это исправляет "рассмотре л" -> "рассмотрел"
                            currentLineParts.push(str);
                        }
                    } else {
                        // Первый элемент строки
                        currentLineParts.push(str);
                    }

                    lastItem = item;
                }

                // Добавляем последнюю строку страницы
                if (currentLineParts.length > 0) {
                    pageLines.push(currentLineParts.join(''));
                }

                fullText.push(`--- СТРАНИЦА ${pageNum} ---\n${pageLines.join('\n')}\n`);
            }
            
            const result = fullText.join('\n\n');
            console.log('✅ Всего извлечено символов:', result.length);
            return result;
            
        } catch (error) {
            console.error('❌ Ошибка при извлечении текста:', error);
            throw error;
        }
    },

    /**
     * Мягкая очистка текста (без агрессивной склейки)
     */
    cleanText(text) {
        if (!text) return '';
        
        // Удаляем управляющие символы
        text = text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/g, '');
        
        // Заменяем табуляцию на пробел
        text = text.replace(/\t/g, ' ');
        
        // Убираем пробелы ПЕРЕД знаками препинания (частая ошибка PDF)
        text = text.replace(/\s+([.,;:!?])/g, '$1');
        
        // Восстанавливаем пробелы ПОСЛЕ знаков препинания, если они слиплись
        text = text.replace(/([.,;:!?])([а-яА-ЯёЁ0-9])/g, '$1 $2');
        
        // Нормализуем множественные переносы строк
        text = text.replace(/\n{3,}/g, '\n\n');
        
        // Trim каждой строки
        text = text.split('\n').map(line => line.trim()).join('\n').trim();
        
        // Замена лигатур
        const replacements = {
            'ﬁ': 'фи', 'ﬂ': 'фл', 'ﬀ': 'фф', 'ﬃ': 'ффи', 'ﬄ': 'ффл',
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
            return {
                success: false,
                error: error.message,
                filename: file.name
            };
        }
    }
};

window.PDFProcessor = PDFProcessor;
console.log('✅ PDFProcessor v4.0 загружен (Геометрический анализ)');
