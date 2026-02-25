/**
APP.JS
Основная логика приложения для сбора датасета судебных актов
Версия: 3.0 (с поддержкой полей appealed и canceled)
*/
// ============================================================================
// ГЛОБАЛЬНОЕ СОСТОЯНИЕ ПРИЛОЖЕНИЯ
// ============================================================================
const AppState = {
    datasetEntries: [],
    processedFiles: new Set(),
    lastUpdated: null,
    isProcessing: false,
    currentPreviewIndex: null
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
    
    // Чекбоксы обжалования
    DOM.checkboxAppealed = document.getElementById('checkbox-appealed');
    DOM.checkboxCanceled = document.getElementById('checkbox-canceled');
    DOM.btnSaveChanges = document.getElementById('btn-save-changes');
    DOM.saveStatus = document.getElementById('save-status');
    
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
Отображение статусного сообщения
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
Обновление прогресс-бара
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
Проверка: является ли файл PDF
*/
function isValidPDF(file) {
    if (file.type === 'application/pdf') {
        return true;
    }
    if (file.name && file.name.toLowerCase().endsWith('.pdf')) {
        return true;
    }
    return false;
}

/**
Проверка размера файла (макс 50 MB)
*/
function isValidFileSize(file, maxSizeMB = 50) {
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    return file.size <= maxSizeBytes;
}

/**
Извлечение информации о деле из имени файла
*/
function extractCaseInfo(filename) {
    console.log('🔍 Парсинг имени файла:', filename);
    const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');
    const parts = nameWithoutExt.split('_');
    
    const result = {
        caseNumber: null,
        decisionDate: null,
        rawFilename: filename,
        isValid: false,
        errors: []
    };
    
    if (parts.length < 2) {
        result.errors.push('Недостаточно частей в имени файла (ожидается формат: НомерДела_Дата_*.pdf)');
        console.warn('❌ Недостаточно частей:', parts);
        return result;
    }
    
    result.caseNumber = parts[0];
    
    if (!result.caseNumber || result.caseNumber.length < 5) {
        result.errors.push(`Некорректный номер дела: "${result.caseNumber}"`);
        console.warn('❌ Некорректный номер дела:', result.caseNumber);
        return result;
    }
    
    const dateStr = parts[1];
    if (!dateStr || dateStr.length !== 8 || !/^\d+$/.test(dateStr)) {
        result.errors.push(`Некорректная дата: "${dateStr}" (ожидается формат YYYYMMDD)`);
        console.warn('❌ Некорректная дата:', dateStr);
        
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
        result.decisionDate = `${dateStr.slice(0,4)}-${dateStr.slice(4,6)}-${dateStr.slice(6,8)}`;
    }
    
    if (result.decisionDate) {
        const year = parseInt(result.decisionDate.split('-')[0]);
        if (year < 2000 || year > 2030) {
            result.errors.push(`Подозрительный год в дате: ${year}`);
            console.warn('⚠️ Подозрительный год:', year);
        }
    }
    
    result.isValid = true;
    console.log('✅ Имя файла валидно:', result);
    return result;
}

/**
Комплексная валидация файла
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
    
    if (!isValidPDF(file)) {
        validation.errors.push('Файл не является PDF');
        console.warn('❌ Не PDF файл');
        return validation;
    }
    
    if (!isValidFileSize(file)) {
        validation.errors.push('Файл слишком большой (максимум 50 MB)');
        console.warn('❌ Файл слишком большой:', file.size);
        return validation;
    }
    
    validation.caseInfo = extractCaseInfo(file.name);
    if (!validation.caseInfo.isValid) {
        validation.errors.push(...validation.caseInfo.errors);
        console.warn('❌ Ошибки имени файла:', validation.caseInfo.errors);
        return validation;
    }
    
    if (AppState.processedFiles.has(file.name)) {
        validation.warnings.push('Файл уже был обработан ранее');
        console.warn('⚠️ Файл уже обработан:', file.name);
    }
    
    validation.isValid = true;
    console.log('✅ Файл прошёл валидацию:', validation);
    return validation;
}

/**
Валидация всех выбранных файлов
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
Обработчик изменения выбора PDF файлов
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
    const validationResults = validateFiles(files);
    
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
        DOM.btnProcess.disabled = false;
    }
    
    if (validationResults.invalidFiles.length > 0) {
        statusHTML += `<details style="margin-top: 0.5rem;">
            <summary style="cursor: pointer; color: #dc3545;">
                ⚠️ ${validationResults.invalidFiles.length} файл(ов) не прошли проверку (нажмите для деталей)
            </summary>
            <ul style="margin-top: 0.5rem; padding-left: 1.5rem; font-size: 0.85rem;">
                ${validationResults.invalidFiles.map(f => `
                    <li>${f.file.name}: ${f.errors.join('; ')}</li>
                `).join('')}
            </ul>
        </details>`;
        
        if (validationResults.validFiles.length === 0) {
            DOM.btnProcess.disabled = true;
        }
    }
    
    showStatus(DOM.processStatus, statusHTML, 'info', false);
}

/**
Обработчик загрузки JSONL
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
        
        const previousCount = AppState.datasetEntries.length;
        AppState.datasetEntries = JSONLHandler.mergeDatasets(
            AppState.datasetEntries,
            entries
        );
        const newCount = AppState.datasetEntries.length;
        
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
Обработчик обработки PDF файлов
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
    
    AppState.isProcessing = true;
    DOM.btnProcess.disabled = true;
    DOM.processProgressContainer.classList.add('show');
    
    let processedCount = 0;
    let errorCount = 0;
    const totalFiles = files.length;
    
    try {
        for (let i = 0; i < totalFiles; i++) {
            const file = files[i];
            
            if (AppState.processedFiles.has(file.name)) {
                console.log('⏭️ Пропущен уже обработанный файл:', file.name);
                continue;
            }
            
            const validation = validateFile(file);
            
            if (!validation.isValid) {
                console.warn('❌ Файл не прошёл валидацию:', file.name, validation.errors);
                errorCount++;
                continue;
            }
            
            const progress = Math.round(((i) / totalFiles) * 100);
            updateProgress(progress, `Обработка ${i + 1}/${totalFiles}: ${file.name}`);
            
            const result = await PDFProcessor.processFile(file, (p, msg) => {
                const subProgress = Math.round((i + p / 100) / totalFiles * 100);
                updateProgress(subProgress, msg);
            });
            
            if (result.success) {
                const entry = JSONLHandler.createEntry(
                    result.caseNumber,
                    result.decisionDate,
                    result.text
                );
                
                entry.metadata.source_filename = result.filename;
                
                AppState.datasetEntries.push(entry);
                AppState.processedFiles.add(file.name);
                processedCount++;
                
                console.log('✅ Файл обработан:', file.name);
            } else {
                console.error('❌ Ошибка обработки:', file.name, result.error);
                errorCount++;
            }
        }
        
        AppState.lastUpdated = new Date().toISOString();
        saveToLocalStorage();
        
        updateProgress(100, '✅ Обработка завершена!');
        
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
        AppState.isProcessing = false;
        
        setTimeout(() => {
            DOM.processProgressContainer.classList.remove('show');
            
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
Обработчик выбора записи для предпросмотра
*/
function handlePreviewChange() {
    const index = DOM.previewSelect?.value;
    if (index === '' || index === null) {
        return;
    }
    
    AppState.currentPreviewIndex = parseInt(index);
    const entry = AppState.datasetEntries[AppState.currentPreviewIndex];
    
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
            ${entry.metadata?.source_filename ? `<p><strong>Файл:</strong> ${entry.metadata.source_filename}</p>` : ''}
        `;
    }
    
    // Обновляем чекбоксы
    if (DOM.checkboxAppealed) {
        DOM.checkboxAppealed.checked = entry.appealed || false;
    }
    
    if (DOM.checkboxCanceled) {
        DOM.checkboxCanceled.checked = entry.canceled || false;
        // Блокируем/разблокируем чекбокс canceled в зависимости от appealed
        DOM.checkboxCanceled.disabled = !(entry.appealed || false);
    }
    
    // Обновляем текст
    if (DOM.previewText) {
        const previewText = entry.decision_text?.slice(0, 2000) || '';
        DOM.previewText.textContent = previewText + 
            (entry.decision_text?.length > 2000 ? '\n\n[... продолжение скрыто ...]' : '');
    }
}

/**
Обработчик изменения чекбокса "Обжаловалось"
*/
function handleAppealedChange() {
    if (!DOM.checkboxAppealed || !DOM.checkboxCanceled) return;
    
    const isAppealed = DOM.checkboxAppealed.checked;
    
    // Если appealed снят, то canceled тоже должен быть снят и заблокирован
    if (!isAppealed) {
        DOM.checkboxCanceled.checked = false;
        DOM.checkboxCanceled.disabled = true;
    } else {
        // Если appealed установлен, разблокируем canceled
        DOM.checkboxCanceled.disabled = false;
    }
}

/**
Обработчик изменения чекбокса "Отменено"
*/
function handleCanceledChange() {
    if (!DOM.checkboxAppealed || !DOM.checkboxCanceled) return;
    
    const isCanceled = DOM.checkboxCanceled.checked;
    
    // Если canceled установлен, appealed должен быть установлен
    if (isCanceled && !DOM.checkboxAppealed.checked) {
        DOM.checkboxAppealed.checked = true;
    }
}

/**
Обработчик сохранения изменений чекбоксов
*/
function handleSaveChanges() {
    if (AppState.currentPreviewIndex === null || AppState.currentPreviewIndex === undefined) {
        showStatus(DOM.saveStatus, '❌ Выберите запись для сохранения', 'error');
        return;
    }
    
    const entry = AppState.datasetEntries[AppState.currentPreviewIndex];
    if (!entry) {
        showStatus(DOM.saveStatus, '❌ Запись не найдена', 'error');
        return;
    }
    
    // Обновляем значения
    entry.appealed = DOM.checkboxAppealed?.checked || false;
    entry.canceled = DOM.checkboxCanceled?.checked || false;
    
    // Валидация: canceled не может быть true без appealed
    if (entry.canceled && !entry.appealed) {
        entry.canceled = false;
        if (DOM.checkboxCanceled) {
            DOM.checkboxCanceled.checked = false;
        }
        showStatus(DOM.saveStatus, '⚠️ "Отменено" сброшено (требуется "Обжаловалось")', 'warning');
        return;
    }
    
    // Обновляем метаданные
    entry.metadata.updated_at = new Date().toISOString();
    
    // Сохраняем
    saveToLocalStorage();
    
    // Обновляем таблицу
    updateRecordsTable();
    
    showStatus(DOM.saveStatus, '✅ Изменения сохранены', 'success');
    
    // Очищаем статус через 3 секунды
    setTimeout(() => {
        if (DOM.saveStatus) {
            DOM.saveStatus.innerHTML = '';
        }
    }, 3000);
}

/**
Обработчик скачивания JSONL
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
Обработчик скачивания Instruction Dataset
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
            e.decision_text,
            e.appealed,
            e.canceled
        )
    );
    
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    JSONLHandler.download(
        instructionEntries,
        `instruction_dataset_${timestamp}.jsonl`
    );
}

/**
Обработчик скачивания ZIP-архива
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
            e.decision_text,
            e.appealed,
            e.canceled
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
Обновление всей UI
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
Обновление выпадающего списка предпросмотра
*/
function updatePreviewSelect() {
    if (!DOM.previewSelect) return;
    
    DOM.previewSelect.innerHTML = '<option value="">Выберите запись...</option>';
    AppState.datasetEntries.forEach((entry, index) => {
        const option = document.createElement('option');
        option.value = index;
        const appealedBadge = entry.appealed ? ' [🔄]' : '';
        const canceledBadge = entry.canceled ? ' [❌]' : '';
        option.textContent = `${entry.case_number || '—'} от ${entry.decision_date || '—'}${appealedBadge}${canceledBadge}`;
        DOM.previewSelect.appendChild(option);
    });
}

/**
Обновление таблицы записей
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
            <td>${entry.appealed ? '<span class="badge bg-warning">🔄 Да</span>' : '<span class="badge bg-secondary">Нет</span>'}</td>
            <td>${entry.canceled ? '<span class="badge bg-danger">❌ Да</span>' : '<span class="badge bg-secondary">Нет</span>'}</td>
            <td><span class="badge bg-success">✅</span></td>
        `;
        
        row.addEventListener('click', () => {
            if (DOM.previewSelect) {
                DOM.previewSelect.value = index;
            }
            handlePreviewChange();
            
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
Сохранение в localStorage
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
Загрузка из localStorage
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
    
    // 1. Загрузка JSONL
    if (DOM.btnLoadJsonl) {
        DOM.btnLoadJsonl.addEventListener('click', handleLoadJSONL);
    }

    // 2. Загрузка PDF
    if (DOM.pdfUpload) {
        DOM.pdfUpload.addEventListener('change', handlePDFUploadChange);
    }

    // 3. Обработка PDF
    if (DOM.btnProcess) {
        DOM.btnProcess.addEventListener('click', handleProcessPDFs);
    }

    // 4. Предпросмотр
    if (DOM.previewSelect) {
        DOM.previewSelect.addEventListener('change', handlePreviewChange);
    }

    // 5. Экспорт (JSONL)
    if (DOM.btnDownloadJsonl) {
        DOM.btnDownloadJsonl.addEventListener('click', handleDownloadJSONL);
    }

    // 6. Экспорт (Instruction)
    if (DOM.btnDownloadInstruction) {
        DOM.btnDownloadInstruction.addEventListener('click', handleDownloadInstruction);
    }

    // 7. Экспорт (ZIP) - ✅ ИСПРАВЛЕНО: добавлена закрывающая скобка
    if (DOM.btnDownloadZip) {
        DOM.btnDownloadZip.addEventListener('click', handleDownloadZip);
    }

    // 8. Очистка датасета - ✅ ДОБАВЛЕНО
    const btnClear = document.getElementById('btn-clear-data');
    if (btnClear) {
        btnClear.addEventListener('click', window.clearDataset);
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
