/**
 * APP.JS
 * Основная логика приложения для сбора датасета судебных актов
 * Версия: 2.0 (с улучшенной валидацией и отладкой)
 */

// ============================================================================
// ГЛОБАЛЬНОЕ СОСТОЯНИЕ ПРИЛОЖЕНИЯ
// ============================================================================
const AppState = {
    datasetEntries: [],
    processedFiles: new Set(),
    lastUpdated: null,
    isProcessing: false
};

// ============================================================================
// DOM ЭЛЕМЕНТЫ (КЭШИРОВАНИЕ)
// ============================================================================
const DOM = {};

function initializeDOM() {
    // Статистика
    DOM.statRecords = document.getElementById('stat-records');
    DOM.statProcessed = document.getElementById('stat-processed');
    DOM.statChars = document.getElementById('stat-chars');
    DOM.statDateRange = document.getElementById('stat-date-range');
    DOM.datasetCount = document.getElementById('dataset-count');
    
    // Загрузка JSONL
    DOM.jsonlUpload = document.getElementById('jsonl-upload');
    DOM.btnLoadJsonl = document.getElementById('btn-load-jsonl');
    DOM.loadStatus = document.getElementById('load-status');
    
    // Загрузка PDF
    DOM.pdfUpload = document.getElementById('pdf-upload');
    DOM.btnProcess = document.getElementById('btn-process');
    DOM.processProgressContainer = document.getElementById('process-progress-container');
    DOM.processProgress = document.getElementById('process-progress');
    DOM.processStatus = document.getElementById('process-status');
    
    // Предпросмотр
    DOM.previewSection = document.getElementById('preview-section');
    DOM.previewSelect = document.getElementById('preview-select');
    DOM.previewMetadata = document.getElementById('preview-metadata');
    DOM.previewText = document.getElementById('preview-text');
    
    // Таблица
    DOM.tableSection = document.getElementById('table-section');
    DOM.recordsBody = document.getElementById('records-body');
    
    // Экспорт
    DOM.exportSection = document.getElementById('export-section');
    DOM.btnDownloadJsonl = document.getElementById('btn-download-jsonl');
    DOM.btnDownloadInstruction = document.getElementById('btn-download-instruction');
    DOM.btnDownloadZip = document.getElementById('btn-download-zip');
}

// ============================================================================
// УТИЛИТЫ
// ============================================================================

/**
 * Отображение статусного сообщения
 */
function showStatus(element, message, type = 'info', autoClear = true) {
    if (!element) return;
    
    const className = `status-${type}`;
    element.innerHTML = `<span class="${className}">${message}</span>`;
    
    if (autoClear && type !== 'error') {
        setTimeout(() => {
            if (element.innerHTML.includes(message)) {
                element.innerHTML = '';
            }
        }, 5000);
    }
}

/**
 * Обновление прогресс-бара
 */
function updateProgress(percent, message) {
    if (!DOM.processProgress || !DOM.processProgressContainer) return;
    
    DOM.processProgress.style.width = `${percent}%`;
    DOM.processProgress.textContent = `${percent}%`;
    
    if (message && DOM.processStatus) {
        DOM.processStatus.innerHTML = `<span class="status-info">${message}</span>`;
    }
}

/**
 * Проверка: является ли файл PDF
 */
function isValidPDF(file) {
    // Проверка по типу MIME
    if (file.type === 'application/pdf') {
        return true;
    }
    
    // Проверка по расширению (на случай неправильного MIME)
    if (file.name && file.name.toLowerCase().endsWith('.pdf')) {
        return true;
    }
    
    return false;
}

/**
 * Проверка размера файла (макс 50 MB)
 */
function isValidFileSize(file, maxSizeMB = 50) {
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    return file.size <= maxSizeBytes;
}

/**
 * Извлечение информации о деле из имени файла
 * Поддерживаемые форматы:
 * - A60-49559-2024_20250616_Reshenija.pdf
 * - A60-49559-2024_20250616_Reshenija_i_postanovlenija.pdf
 * - A60-49559-2024_20250616_Anything.pdf
 */
function extractCaseInfo(filename) {
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
}

/**
 * Комплексная валидация файла
 */
function validateFile(file) {
    console.log('🔍 Валидация файла:', file.name);
    
    const validation = {
        isValid: false,
        file: file,
        errors: [],
        warnings: [],
        caseInfo: null
    };
    
    // 1. Проверка: это PDF?
    if (!isValidPDF(file)) {
        validation.errors.push('Файл не является PDF');
        console.warn('❌ Не PDF файл');
        return validation;
    }
    
    // 2. Проверка размера
    if (!isValidFileSize(file)) {
        validation.errors.push('Файл слишком большой (максимум 50 MB)');
        console.warn('❌ Файл слишком большой:', file.size);
        return validation;
    }
    
    // 3. Проверка имени файла
    validation.caseInfo = extractCaseInfo(file.name);
    
    if (!validation.caseInfo.isValid) {
        validation.errors.push(...validation.caseInfo.errors);
        console.warn('❌ Ошибки имени файла:', validation.caseInfo.errors);
        return validation;
    }
    
    // 4. Проверка: не обрабатывали ли уже этот файл?
    if (AppState.processedFiles.has(file.name)) {
        validation.warnings.push('Файл уже был обработан ранее');
        console.warn('⚠️ Файл уже обработан:', file.name);
        // Не блокируем, но предупреждаем
    }
    
    validation.isValid = true;
    console.log('✅ Файл прошёл валидацию:', validation);
    
    return validation;
}

/**
 * Валидация всех выбранных файлов
 */
function validateFiles(files) {
    console.log('🔍 Валидация группы файлов:', files.length);
    
    const results = {
        validFiles: [],
        invalidFiles: [],
        totalFiles: files.length
    };
    
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const validation = validateFile(file);
        
        if (validation.isValid) {
            results.validFiles.push(validation);
        } else {
            results.invalidFiles.push({
                file: file,
                errors: validation.errors,
                warnings: validation.warnings
            });
        }
    }
    
    console.log('📊 Результаты валидации:', results);
    
    return results;
}

// ============================================================================
// ОБРАБОТЧИКИ СОБЫТИЙ
// ============================================================================

/**
 * Обработчик изменения выбора PDF файлов
 */
function handlePDFUploadChange(event) {
    console.log('📁 Событие изменения PDF файлов');
    
    const files = event.target.files;
    
    if (!files || files.length === 0) {
        DOM.btnProcess.disabled = true;
        showStatus(DOM.processStatus, '', 'info', false);
        return;
    }
    
    console.log(`📁 Выбрано файлов: ${files.length}`);
    
    // Валидируем все файлы
    const validationResults = validateFiles(files);
    
    // Формируем сообщение о статусе
    let statusHTML = '';
    
    if (validationResults.validFiles.length > 0) {
        const sizeInfo = validationResults.validFiles.reduce((sum, v) => sum + v.file.size, 0);
        const sizeMB = (sizeInfo / 1024 / 1024).toFixed(2);
        
        statusHTML = `
            <span class="status-success">
                ✅ Готово к обработке: ${validationResults.validFiles.length} из ${validationResults.totalFiles} файлов 
                (${sizeMB} MB)
            </span>
        `;
        
        // Активируем кнопку
        DOM.btnProcess.disabled = false;
    }
    
    // Добавляем информацию о проблемных файлах
    if (validationResults.invalidFiles.length > 0) {
        statusHTML += `
            <details style="margin-top: 0.5rem;">
                <summary style="cursor: pointer; color: #dc3545;">
                    ⚠️ ${validationResults.invalidFiles.length} файл(ов) не прошли проверку (нажмите для деталей)
                </summary>
                <ul style="margin-top: 0.5rem; padding-left: 1.5rem; font-size: 0.85rem;">
                    ${validationResults.invalidFiles.map(f => `
                        <li>
                            <strong>${f.file.name}</strong>: 
                            ${f.errors.join('; ')}
                        </li>
                    `).join('')}
                </ul>
            </details>
        `;
        
        // Если нет валидных файлов — деактивируем кнопку
        if (validationResults.validFiles.length === 0) {
            DOM.btnProcess.disabled = true;
        }
    }
    
    showStatus(DOM.processStatus, statusHTML, 'info', false);
}

/**
 * Обработчик загрузки JSONL
 */
async function handleLoadJSONL() {
    console.log('📂 Загрузка JSONL');
    
    const file = DOM.jsonlUpload?.files?.[0];
    
    if (!file) {
        showStatus(DOM.loadStatus, '❌ Выберите файл JSONL', 'error');
        return;
    }
    
    try {
        showStatus(DOM.loadStatus, '🔄 Загрузка датасета...', 'info', false);
        
        const text = await file.text();
        const entries = JSONLHandler.fromJSONL(text);
        
        if (entries.length === 0) {
            showStatus(DOM.loadStatus, '⚠️ Датасет пуст или некорректен', 'error');
            return;
        }
        
        // Объединение с существующими записями
        const previousCount = AppState.datasetEntries.length;
        AppState.datasetEntries = JSONLHandler.mergeDatasets(
            AppState.datasetEntries,
            entries
        );
        const newCount = AppState.datasetEntries.length;
        
        // Обновление processedFiles
        entries.forEach(e => {
            if (e.metadata?.source_filename) {
                AppState.processedFiles.add(e.metadata.source_filename);
            }
        });
        
        AppState.lastUpdated = new Date().toISOString();
        saveToLocalStorage();
        
        showStatus(
            DOM.loadStatus,
            `✅ Загружено записей: ${entries.length} (всего: ${newCount})`,
            'success'
        );
        
        updateUI();
        
    } catch (error) {
        console.error('Ошибка загрузки JSONL:', error);
        showStatus(DOM.loadStatus, `❌ Ошибка: ${error.message}`, 'error');
    }
}

/**
 * Обработчик обработки PDF файлов
 */
async function handleProcessPDFs() {
    console.log('🔄 Начало обработки PDF файлов');
    
    const files = DOM.pdfUpload?.files;
    
    if (!files || files.length === 0) {
        showStatus(DOM.processStatus, '❌ Файлы не выбраны', 'error');
        return;
    }
    
    if (AppState.isProcessing) {
        showStatus(DOM.processStatus, '⚠️ Обработка уже выполняется', 'warning');
        return;
    }
    
    // Блокируем повторный запуск
    AppState.isProcessing = true;
    DOM.btnProcess.disabled = true;
    DOM.processProgressContainer.classList.add('show');
    
    let processedCount = 0;
    let errorCount = 0;
    const totalFiles = files.length;
    
    try {
        for (let i = 0; i < totalFiles; i++) {
            const file = files[i];
            
            // Пропускаем уже обработанные (но не блокируем)
            if (AppState.processedFiles.has(file.name)) {
                console.log('⏭️ Пропущен уже обработанный файл:', file.name);
                continue;
            }
            
            // Валидация
            const validation = validateFile(file);
            
            if (!validation.isValid) {
                console.warn('❌ Файл не прошёл валидацию:', file.name, validation.errors);
                errorCount++;
                continue;
            }
            
            // Обновляем прогресс
            const progress = Math.round(((i) / totalFiles) * 100);
            updateProgress(progress, `Обработка ${i + 1}/${totalFiles}: ${file.name}`);
            
            // Обработка файла
            const result = await PDFProcessor.processFile(file, (p, msg) => {
                const subProgress = Math.round((i + p / 100) / totalFiles * 100);
                updateProgress(subProgress, msg);
            });
            
            if (result.success) {
                // Создаём запись JSONL
                const entry = JSONLHandler.createEntry(
                    result.caseNumber,
                    result.decisionDate,
                    result.text
                );
                
                // Добавляем имя файла в метаданные
                entry.metadata.source_filename = result.filename;
                
                // Добавляем в датасет
                AppState.datasetEntries.push(entry);
                AppState.processedFiles.add(file.name);
                processedCount++;
                
                console.log('✅ Файл обработан:', file.name);
            } else {
                console.error('❌ Ошибка обработки:', file.name, result.error);
                errorCount++;
            }
        }
        
        // Финальное обновление
        AppState.lastUpdated = new Date().toISOString();
        saveToLocalStorage();
        
        updateProgress(100, '✅ Обработка завершена!');
        
        // Итоговое сообщение
        let finalMessage = `✅ Успешно обработано: ${processedCount} из ${totalFiles} файлов`;
        if (errorCount > 0) {
            finalMessage += ` (ошибок: ${errorCount})`;
        }
        
        showStatus(DOM.processStatus, finalMessage, 'success');
        
        updateUI();
        
    } catch (error) {
        console.error('Критическая ошибка обработки:', error);
        showStatus(DOM.processStatus, `❌ Ошибка: ${error.message}`, 'error');
    } finally {
        // Разблокируем интерфейс
        AppState.isProcessing = false;
        
        // Скрываем прогресс через 2 секунды
        setTimeout(() => {
            DOM.processProgressContainer.classList.remove('show');
            
            // Обновляем состояние кнопки
            if (DOM.pdfUpload?.files?.length > 0) {
                const validationResults = validateFiles(DOM.pdfUpload.files);
                DOM.btnProcess.disabled = validationResults.validFiles.length === 0;
            } else {
                DOM.btnProcess.disabled = true;
            }
        }, 2000);
    }
}

/**
 * Обработчик выбора записи для предпросмотра
 */
function handlePreviewChange() {
    const index = DOM.previewSelect?.value;
    
    if (!index && index !== 0) {
        return;
    }
    
    const entry = AppState.datasetEntries[index];
    
    if (!entry) {
        return;
    }
    
    // Обновляем метаданные
    if (DOM.previewMetadata) {
        DOM.previewMetadata.innerHTML = `
            <p><strong>Номер дела:</strong> ${entry.case_number || '—'}</p>
            <p><strong>Дата решения:</strong> ${entry.decision_date || '—'}</p>
            <p><strong>Длина текста:</strong> ${(entry.decision_text?.length || 0).toLocaleString('ru-RU')} символов</p>
            <p><strong>Создано:</strong> ${entry.metadata?.created_at?.slice(0, 19) || '—'}</p>
            ${entry.metadata?.source_filename ? 
                `<p><strong>Файл:</strong> ${entry.metadata.source_filename}</p>` : ''}
        `;
    }
    
    // Обновляем текст (первые 2000 символов)
    if (DOM.previewText) {
        const previewText = entry.decision_text?.slice(0, 2000) || '';
        DOM.previewText.textContent = previewText + 
            (entry.decision_text?.length > 2000 ? '\n\n[... продолжение скрыто ...]' : '');
    }
}

/**
 * Обработчик скачивания JSONL
 */
function handleDownloadJSONL() {
    console.log('📥 Скачивание JSONL');
    
    if (AppState.datasetEntries.length === 0) {
        alert('Датасет пуст!');
        return;
    }
    
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    JSONLHandler.download(
        AppState.datasetEntries,
        `court_decisions_${timestamp}.jsonl`
    );
}

/**
 * Обработчик скачивания Instruction Dataset
 */
function handleDownloadInstruction() {
    console.log('📥 Скачивание Instruction Dataset');
    
    if (AppState.datasetEntries.length === 0) {
        alert('Датасет пуст!');
        return;
    }
    
    const instructionEntries = AppState.datasetEntries.map(e =>
        JSONLHandler.createInstructionEntry(
            e.case_number,
            e.decision_date,
            e.decision_text
        )
    );
    
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    JSONLHandler.download(
        instructionEntries,
        `instruction_dataset_${timestamp}.jsonl`
    );
}

/**
 * Обработчик скачивания ZIP-архива
 */
async function handleDownloadZip() {
    console.log('📦 Скачивание ZIP-архива');
    
    if (AppState.datasetEntries.length === 0) {
        alert('Датасет пуст!');
        return;
    }
    
    const instructionEntries = AppState.datasetEntries.map(e =>
        JSONLHandler.createInstructionEntry(
            e.case_number,
            e.decision_date,
            e.decision_text
        )
    );
    
    try {
        showStatus(DOM.processStatus, '🔄 Создание архива...', 'info', false);
        
        const zipBlob = await JSONLHandler.createZipArchive(
            AppState.datasetEntries,
            instructionEntries
        );
        
        const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
        saveAs(zipBlob, `court_dataset_${timestamp}.zip`);
        
        showStatus(DOM.processStatus, '✅ Архив скачан!', 'success');
        
    } catch (error) {
        console.error('Ошибка создания ZIP:', error);
        showStatus(DOM.processStatus, `❌ Ошибка: ${error.message}`, 'error');
    }
}

// ============================================================================
// ОБНОВЛЕНИЕ ИНТЕРФЕЙСА
// ============================================================================

/**
 * Обновление всей UI
 */
function updateUI() {
    console.log('🔄 Обновление интерфейса');
    
    // Обновление статистики
    if (DOM.statRecords) {
        DOM.statRecords.textContent = AppState.datasetEntries.length.toLocaleString('ru-RU');
    }
    
    if (DOM.statProcessed) {
        DOM.statProcessed.textContent = AppState.processedFiles.size.toLocaleString('ru-RU');
    }
    
    if (DOM.statChars) {
        const totalChars = AppState.datasetEntries.reduce(
            (sum, e) => sum + (e.decision_text?.length || 0),
            0
        );
        DOM.statChars.textContent = totalChars.toLocaleString('ru-RU');
    }
    
    // Диапазон дат
    if (DOM.statDateRange) {
        const dates = AppState.datasetEntries
            .map(e => e.decision_date)
            .filter(d => d && /^\d{4}-\d{2}-\d{2}$/.test(d))
            .sort();
        
        if (dates.length > 0) {
            DOM.statDateRange.textContent = `${dates[0]} — ${dates[dates.length - 1]}`;
        } else {
            DOM.statDateRange.textContent = '—';
        }
    }
    
    // Счётчик в навбаре
    if (DOM.datasetCount) {
        DOM.datasetCount.textContent = `Записей: ${AppState.datasetEntries.length}`;
    }
    
    // Обновление предпросмотра
    updatePreviewSelect();
    
    // Обновление таблицы
    updateRecordsTable();
    
    // Показ/скрытие секций
    const hasData = AppState.datasetEntries.length > 0;
    
    if (DOM.previewSection) {
        DOM.previewSection.style.display = hasData ? 'block' : 'none';
    }
    
    if (DOM.tableSection) {
        DOM.tableSection.style.display = hasData ? 'block' : 'none';
    }
    
    if (DOM.exportSection) {
        DOM.exportSection.style.display = hasData ? 'block' : 'none';
    }
}

/**
 * Обновление выпадающего списка предпросмотра
 */
function updatePreviewSelect() {
    if (!DOM.previewSelect) return;
    
    DOM.previewSelect.innerHTML = '<option value="">Выберите запись...</option>';
    
    AppState.datasetEntries.forEach((entry, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = `${entry.case_number || '—'} от ${entry.decision_date || '—'}`;
        DOM.previewSelect.appendChild(option);
    });
}

/**
 * Обновление таблицы записей
 */
function updateRecordsTable() {
    if (!DOM.recordsBody) return;
    
    DOM.recordsBody.innerHTML = '';
    
    AppState.datasetEntries.forEach((entry, index) => {
        const row = document.createElement('tr');
        row.className = 'fade-in';
        row.style.animationDelay = `${index * 0.02}s`;
        
        row.innerHTML = `
            <td>${index + 1}</td>
            <td><code>${entry.case_number || '—'}</code></td>
            <td>${entry.decision_date || '—'}</td>
            <td>${(entry.decision_text?.length || 0).toLocaleString('ru-RU')}</td>
            <td><span class="badge bg-success">✅</span></td>
        `;
        
        // Клик по строке для предпросмотра
        row.addEventListener('click', () => {
            if (DOM.previewSelect) {
                DOM.previewSelect.value = index;
            }
            handlePreviewChange();
            
            // Прокрутка к предпросмотру
            if (DOM.previewSection) {
                DOM.previewSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        });
        
        row.classList.add('cursor-pointer');
        DOM.recordsBody.appendChild(row);
    });
}

// ============================================================================
// LOCALSTORAGE (СОХРАНЕНИЕ/ЗАГРУЗКА)
// ============================================================================

/**
 * Сохранение в localStorage
 */
function saveToLocalStorage() {
    try {
        const data = {
            entries: AppState.datasetEntries,
            processedFiles: Array.from(AppState.processedFiles),
            lastUpdated: AppState.lastUpdated
        };
        
        localStorage.setItem('court_dataset_builder', JSON.stringify(data));
        console.log('💾 Данные сохранены в localStorage');
    } catch (error) {
        console.warn('Не удалось сохранить в localStorage:', error);
    }
}

/**
 * Загрузка из localStorage
 */
function loadFromLocalStorage() {
    try {
        const saved = localStorage.getItem('court_dataset_builder');
        
        if (saved) {
            const data = JSON.parse(saved);
            
            AppState.datasetEntries = data.entries || [];
            AppState.processedFiles = new Set(data.processedFiles || []);
            AppState.lastUpdated = data.lastUpdated;
            
            console.log('✅ Данные загружены из localStorage');
            console.log(`   Записей: ${AppState.datasetEntries.length}`);
            console.log(`   Обработано файлов: ${AppState.processedFiles.size}`);
        } else {
            console.log('ℹ️ Нет сохранённых данных в localStorage');
        }
    } catch (error) {
        console.warn('Не удалось загрузить из localStorage:', error);
    }
}

// ============================================================================
// ИНИЦИАЛИЗАЦИЯ ПРИЛОЖЕНИЯ
// ============================================================================

function init() {
    console.log('🚀 Инициализация приложения...');
    
    // Инициализация DOM
    initializeDOM();
    
    // Проверка готовности PDF.js
    if (typeof pdfjsLib === 'undefined') {
        console.error('❌ PDF.js не загружен!');
        showStatus(
            DOM.processStatus,
            '❌ Ошибка: PDF.js не загружен. Проверьте консоль (F12)',
            'error',
            false
        );
        
        if (DOM.btnProcess) {
            DOM.btnProcess.disabled = true;
        }
        
        return;
    }
    
    console.log('✅ PDF.js готов, версия:', pdfjsLib.version);
    
    // Загрузка сохранённых данных
    loadFromLocalStorage();
    
    // Навешиваем обработчики событий
    if (DOM.btnLoadJsonl) {
        DOM.btnLoadJsonl.addEventListener('click', handleLoadJSONL);
    }
    
    if (DOM.pdfUpload) {
        DOM.pdfUpload.addEventListener('change', handlePDFUploadChange);
    }
    
    if (DOM.btnProcess) {
        DOM.btnProcess.addEventListener('click', handleProcessPDFs);
    }
    
    if (DOM.previewSelect) {
        DOM.previewSelect.addEventListener('change', handlePreviewChange);
    }
    
    if (DOM.btnDownloadJsonl) {
        DOM.btnDownloadJsonl.addEventListener('click', handleDownloadJSONL);
    }
    
    if (DOM.btnDownloadInstruction) {
        DOM.btnDownloadInstruction.addEventListener('click', handleDownloadInstruction);
    }
    
    if (DOM.btnDownloadZip) {
        DOM.btnDownloadZip.addEventListener('click', handleDownloadZip);
    }
    
    // Обновление интерфейса
    updateUI();
    
    // Инициализация кнопки Process (проверка выбранных файлов)
    if (DOM.pdfUpload && DOM.pdfUpload.files && DOM.pdfUpload.files.length > 0) {
        handlePDFUploadChange({ target: DOM.pdfUpload });
    }
    
    console.log('✅ Приложение инициализировано');
}

// ============================================================================
// ЭКСПОРТ ДЛЯ ОТЛАДКИ В КОНСОЛИ
// ============================================================================

// Функция для тестирования парсинга имён файлов
window.testFilenameParsing = function(filename) {
    console.log('🧪 Тест парсинга имени файла:', filename);
    const result = extractCaseInfo(filename);
    console.log('📋 Результат:', result);
    
    if (result.isValid) {
        console.log('✅ Имя файла валидно!');
    } else {
        console.log('❌ Имя файла НЕ валидно!');
        result.errors.forEach(e => console.log('   -', e));
    }
    
    return result;
};

// Функция для очистки датасета
window.clearDataset = function() {
    if (confirm('Очистить весь датасет? Это действие нельзя отменить.')) {
        AppState.datasetEntries = [];
        AppState.processedFiles.clear();
        AppState.lastUpdated = null;
        saveToLocalStorage();
        updateUI();
        console.log('🗑 Датасет очищен');
    }
};

// Функция для экспорта состояния
window.exportState = function() {
    console.log('📊 Текущее состояние:', {
        entries: AppState.datasetEntries.length,
        processedFiles: AppState.processedFiles.size,
        lastUpdated: AppState.lastUpdated
    });
};

// ============================================================================
// ЗАПУСК ПРИ ЗАГРУЗКЕ DOM
// ============================================================================

document.addEventListener('DOMContentLoaded', init);
