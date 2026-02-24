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
                
                // Получаем параметры страницы для масштабирования координат
                const viewport = page.getViewport({ scale: 1.0 });
                const items = textContent.items;
                
                if (items.length === 0) continue;

                let pageLines = [];
                let currentLine = [];
                let lastItem = null;
                
                // Порог расстояния для определения разрыва слова (примерно ширина пробела)
                // Вычисляем динамически на основе среднего размера шрифта
                let avgFontSize = 0;
                items.forEach(item => avgFontSize += item.height);
                avgFontSize = avgFontSize / items.length;
                const spaceThreshold = avgFontSize * 0.3; 

                for (let i = 0; i < items.length; i++) {
                    const item = items[i];
                    
                    // Пропускаем пустые элементы
                    if (!item.str || !item.str.trim()) {
                        lastItem = item;
                        continue;
                    }

                    const isNewLine = lastItem && (
                        Math.abs(item.transform[5] - lastItem.transform[5]) > avgFontSize * 0.5 || // Сменилась строка по Y
                        item.transform[4] < lastItem.transform[4] // Началось слева (новый абзац)
                    );

                    if (isNewLine) {
                        // Сохраняем предыдущую строку
                        if (currentLine.length > 0) {
                            pageLines.push(currentLine.join(''));
                        }
                        currentLine = [item.str];
                    } else {
                        // Та же строка: проверяем расстояние по X
                        if (lastItem) {
                            const lastXEnd = lastItem.transform[4] + (lastItem.width || 0);
                            const currXStart = item.transform[4];
                            const gap = currXStart - lastXEnd;

                            // Если разрыв маленький (меньше порога), склеиваем без пробела
                            if (gap > 0 && gap < spaceThreshold) {
                                currentLine.push(item.str);
                            } else if (gap >= spaceThreshold) {
                                // Большой разрыв — добавляем пробел
                                currentLine.push(' ' + item.str);
                            } else {
                                // Отрицательный gap (наложение) или 0 — склеиваем плотно
                                currentLine.push(item.str);
                            }
                        } else {
                            currentLine.push(item.str);
                        }
                    }
                    
                    lastItem = item;
                }
                
                // Добавляем последнюю строку
                if (currentLine.length > 0) {
                    pageLines.push(currentLine.join(''));
                }

                fullText.push(`--- СТРАНИЦА ${pageNum} ---\n${pageLines.join('\n')}\n`);
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
     * Очищает текст от артефактов PDF (более мягкая очистка)
     */
    cleanText(text) {
        if (!text) return '';
        
        // Удаляем только управляющие символы, оставляя пробелы и переносы строк
        text = text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/g, '');
        
        // Заменяем табуляцию на пробел, но не схлопываем множественные пробелы внутри строк сразу
        text = text.replace(/\t/g, ' ');
        
        // Нормализуем множественные переносы строк (более 2 подряд)
        text = text.replace(/\n{3,}/g, '\n\n');
        
        // Убираем пробелы в начале и конце каждой строки, но не трогаем внутренние
        text = text.split('\n').map(line => line.trim()).join('\n').trim();
        
        // Замена лигатур и спецсимволов
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
