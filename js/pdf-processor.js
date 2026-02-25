/**
PDF_PROCESSOR.JS
Обработка PDF-файлов в браузере с использованием pdf.js
Версия: 5.0 (Геометрический анализ + Минимальная очистка)
*/

if (typeof pdfjsLib === 'undefined') {
    console.error('❌ PDF_PROCESSOR: pdfjsLib не загружен!');
}

window.PDFProcessor = null;

const PDFProcessor = {
    async extractText(file) {
        console.log('🔍 Извлечение текста:', file.name);
        
        try {
            const arrayBuffer = await file.arrayBuffer();
            const loadingTask = pdfjsLib.getDocument({  arrayBuffer });
            const pdf = await loadingTask.promise;
            
            console.log('✅ PDF загружен, страниц:', pdf.numPages);
            
            let fullText = [];
            
            for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                const page = await pdf.getPage(pageNum);
                const textContent = await page.getTextContent();
                const items = textContent.items;
                
                if (items.length === 0) continue;

                // 1. Считаем средний размер шрифта
                let totalHeight = 0;
                let count = 0;
                items.forEach(item => {
                    if (item.height) {
                        totalHeight += item.height;
                        count++;
                    }
                });
                const avgFontSize = count > 0 ? totalHeight / count : 12;
                
                // 2. Пороги (настроены мягко)
                const WORD_GAP_THRESHOLD = avgFontSize * 0.15;
                const LINE_HEIGHT_THRESHOLD = avgFontSize * 0.3;

                let pageLines = [];
                let currentLineParts = [];
                let lastItem = null;

                for (let i = 0; i < items.length; i++) {
                    const item = items[i];
                    const str = item.str;

                    if (!str || str.trim() === '') {
                        lastItem = item;
                        continue;
                    }

                    const x = item.transform[4];
                    const y = item.transform[5];
                    const width = item.width || (str.length * avgFontSize * 0.6);
                    const xEnd = x + width;

                    if (lastItem) {
                        const lastX = lastItem.transform[4];
                        const lastY = lastItem.transform[5];
                        const lastWidth = lastItem.width || (lastItem.str.length * avgFontSize * 0.6);
                        const lastXEnd = lastX + lastWidth;

                        const deltaY = Math.abs(y - lastY);
                        const gap = x - lastXEnd;

                        // Новая строка?
                        if (deltaY > LINE_HEIGHT_THRESHOLD || x < lastX) {
                            if (currentLineParts.length > 0) {
                                pageLines.push(currentLineParts.join(''));
                            }
                            currentLineParts = [str];
                            lastItem = item;
                            continue;
                        }

                        // Разрыв внутри строки
                        if (gap > WORD_GAP_THRESHOLD) {
                            currentLineParts.push(' ' + str);
                        } else {
                            currentLineParts.push(str);
                        }
                    } else {
                        currentLineParts.push(str);
                    }

                    lastItem = item;
                }

                if (currentLineParts.length > 0) {
                    pageLines.push(currentLineParts.join(''));
                }

                fullText.push(`--- СТРАНИЦА ${pageNum} ---\n${pageLines.join('\n')}\n`);
            }
            
            return fullText.join('\n\n');
            
        } catch (error) {
            console.error('❌ Ошибка извлечения:', error);
            throw error;
        }
    },

    cleanText(text) {
        if (!text) return '';
        
        // Только критические артефакты
        text = text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/g, '');
        text = text.replace(/\t/g, ' ');
        text = text.replace(/\s+([.,;:!?])/g, '$1');
        text = text.replace(/([.,;:!?])([а-яА-ЯёЁ0-9])/g, '$1 $2');
        text = text.replace(/\n{3,}/g, '\n\n');
        text = text.split('\n').map(line => line.trim()).join('\n').trim();
        
        const replacements = {
            'ﬁ': 'фи', 'ﬂ': 'фл', 'ﬀ': 'фф', 'ﬃ': 'ффи', 'ﬄ': 'ффл',
            '–': '-', '—': '-', '«': '"', '»': '"', '„': '"', '‚': "'",
            '…': '...', '•': '-',
        };
        
        for (const [oldChar, newChar] of Object.entries(replacements)) {
            text = text.split(oldChar).join(newChar);
        }
        
        return text;
    },

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

    async processFile(file, onProgress = null) {
        try {
            const fileInfo = this.extractCaseInfo(file.name);
            
            if (!fileInfo.caseNumber || !fileInfo.decisionDate) {
                throw new Error(`Неверное имя файла: ${file.name}`);
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
console.log('✅ PDFProcessor v5.0 загружен');
