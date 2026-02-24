/**
PDF_PROCESSOR.JS
Обработка PDF-файлов в браузере с использованием pdf.js
Версия: 3.1 (Исправлено разбиение слов: умное объединение на основе координат)
*/

// Проверка загрузки PDF.js
if (typeof pdfjsLib === 'undefined') {
    console.error('❌ PDF_PROCESSOR: pdfjsLib не загружен! Проверьте порядок скриптов в index.html');
}

// Экспорт в глобальный scope
window.PDFProcessor = null;

const PDFProcessor = {
    /**
     * Извлекает текст из PDF-файла с сохранением целостности слов
     */
    /**
     * Извлекает текст из PDF-файла с умной склейкой слов на основе координат
     */
    async extractText(file) {
        console.log('🔍 Начало извлечения текста из:', file.name);
        
        try {
            const arrayBuffer = await file.arrayBuffer();
            console.log('📦 Размер файла:', arrayBuffer.byteLength, 'байт');
            
            const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
            const pdf = await loadingTask.promise;
            
            console.log('✅ PDF загружен, страниц:', pdf.numPages);
            
            let fullText = [];
            
            for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                console.log(`📄 Обработка страницы ${pageNum}/${pdf.numPages}`);
                const page = await pdf.getPage(pageNum);
                const textContent = await page.getTextContent();
                
                // Получаем viewport для корректного масштабирования, если нужно, 
                // но для координат трансформации обычно достаточно raw данных
                const items = textContent.items;
                
                if (items.length === 0) continue;

                let pageLines = [];
                let currentLineWords = [];
                
                // Переменные для отслеживания предыдущего элемента
                let lastItem = null;
                
                // Оцениваем средний размер шрифта на странице для определения порога пробела
                let totalHeight = 0;
                items.forEach(item => totalHeight += (item.height || 12));
                const avgFontSize = totalHeight / items.length;
                
                // Порог: если разрыв меньше 20% от высоты шрифта, считаем это частью слова
                const spaceThreshold = avgFontSize * 0.25; 
                // Порог смены строки: если разница по Y больше 50% высоты шрифта
                const newLineThreshold = avgFontSize * 0.5;

                for (let i = 0; i < items.length; i++) {
                    const item = items[i];
                    const str = item.str;

                    // Пропускаем пустые строки
                    if (!str || str.trim() === '') {
                        lastItem = item;
                        continue;
                    }

                    // Координаты текущего элемента
                    // transform = [scaleX, skewY, skewX, scaleY, x, y]
                    const x = item.transform[4];
                    const y = item.transform[5];
                    const width = item.width || (str.length * avgFontSize * 0.6); // Примерная ширина

                    let isNewLine = false;

                    if (lastItem) {
                        const lastX = lastItem.transform[4];
                        const lastY = lastItem.transform[5];
                        const lastWidth = lastItem.width || (lastItem.str.length * avgFontSize * 0.6);
                        const lastXEnd = lastX + lastWidth;

                        // 1. Проверка смены строки (по Y)
                        // Также учитываем случай, когда текст пошел резко влево (новый абзац)
                        if (Math.abs(y - lastY) > newLineThreshold || x < lastX) {
                            isNewLine = true;
                        } else {
                            // 2. Проверка разрыва внутри строки (по X)
                            const gap = x - lastXEnd;

                            if (gap > spaceThreshold) {
                                // Большой разрыв -> это новое слово, добавляем пробел перед ним
                                currentLineWords.push(' ' + str);
                            } else {
                                // Микро-разрыв или наложение -> это продолжение слова, клеим без пробела
                                currentLineWords.push(str);
                            }
                            
                            // Переходим к следующему элементу, не создавая новую строку
                            lastItem = item;
                            continue;
                        }
                    }

                    // Если мы здесь, значит либо это первый элемент, либо новая строка
                    
                    // Сохраняем предыдущую строку, если она есть
                    if (currentLineWords.length > 0) {
                        pageLines.push(currentLineWords.join(''));
                    }
                    
                    // Начинаем новую строку
                    currentLineWords = [str];
                    lastItem = item;
                }

                // Добавляем последнюю строку
                if (currentLineWords.length > 0) {
                    pageLines.push(currentLineWords.join(''));
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
     * Очищает текст от артефактов PDF (более мягкая очистка)
     */
    /**
     * Очищает текст от артефактов (мягкая очистка)
     */
    cleanText(text) {
        if (!text) return '';
        
        // 1. Удаляем управляющие символы
        text = text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/g, '');
        
        // 2. Заменяем табуляцию на пробел
        text = text.replace(/\t/g, ' ');
        
        // 3. Нормализуем множественные переносы строк (более 2 -> 2)
        text = text.replace(/\n{3,}/g, '\n\n');
        
        // 4. Trim каждой строки (убираем пробелы по краям)
        text = text.split('\n').map(line => line.trim()).join('\n').trim();
        
        // 5. Замена лигатур и спецсимволов (без фанатизма)
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
console.log('✅ PDFProcessor загружен и экспортирован (v3.1)');
