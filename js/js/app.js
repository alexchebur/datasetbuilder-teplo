/**
 * APP.JS
 * Основная логика приложения для сбора датасета
 */

// Глобальное состояние приложения
const AppState = {
    datasetEntries: [],
    processedFiles: new Set(),
    lastUpdated: null
};

// DOM элементы
const DOM = {
    // Статистика
    statRecords: document.getElementById('stat-records'),
    statProcessed: document.getElementById('stat-processed'),
    statChars: document.getElementById('stat-chars'),
    statDateRange: document.getElementById('stat-date-range'),
    datasetCount: document.getElementById('dataset-count'),
    
    // Загрузка JSONL
    jsonlUpload: document.getElementById('jsonl-upload'),
    btnLoadJsonl: document.getElementById('btn-load-jsonl'),
    loadStatus: document.getElementById('load-status'),
    
    // Загрузка PDF
    pdfUpload: document.getElementById('pdf-upload'),
    btnProcess: document.getElementById('btn-process'),
    processProgressContainer: document.getElementById('process-progress-container'),
    processProgress: document.getElementById('process-progress'),
    processStatus: document.getElementById('process-status'),
    
    // Предпросмотр
    previewSection: document.getElementById('preview-section'),
    previewSelect: document.getElementById('preview-select'),
    previewMetadata: document.getElementById('preview-metadata'),
    previewText: document.getElementById('preview-text'),
    
    // Таблица
    tableSection: document.getElementById('table-section'),
    recordsBody: document.getElementById('records-body'),
    
    // Экспорт
    exportSection: document.getElementById('export-section'),
    btnDownloadJsonl: document.getElementById('btn-download-jsonl'),
    btnDownloadInstruction: document.getElementById('btn-download-instruction'),
    btnDownloadZip: document.getElementById('btn-download-zip')
};

// Инициализация приложения
function init() {
    // Обработчики событий
    DOM.btnLoadJsonl.addEventListener('click', handleLoadJSONL);
    DOM.btnProcess.addEventListener('click', handleProcessPDFs);
    DOM.previewSelect.addEventListener('change', handlePreviewChange);
    DOM.btnDownloadJsonl.addEventListener('click', handleDownloadJSONL);
    DOM.btnDownloadInstruction.addEventListener('click', handleDownloadInstruction);
    DOM.btnDownloadZip.addEventListener('click', handleDownloadZip);
    
    // Валидация выбора файлов
    DOM.pdfUpload.addEventListener('change', validateFileSelection);
    
    // Загрузка из localStorage при старте
    loadFromLocalStorage();
    
    // Обновление интерфейса
    updateUI();
    
    console.log('✅ Приложение инициализировано');
}

// Валидация выбора файлов PDF
function validateFileSelection() {
    const files = DOM.pdfUpload.files;
    DOM.btnProcess.disabled = files.length === 0;
    
    if (files.length > 0) {
        DOM.processStatus.innerHTML = 
            `<span class="status-info">Выбрано файлов: ${files.length}</span>`;
    }
}

// Обработка загрузки JSONL
async function handleLoadJSONL() {
    const file = DOM.jsonlUpload.files[0];
    if (!file) {
        showStatus(DOM.loadStatus, '❌ Выберите файл JSONL', 'error');
        return;
    }
    
    try {
        showStatus(DOM.loadStatus, '🔄 Загрузка датасета...', 'info');
        
        const entries = await JSONLHandler.loadFromFile(file);
        
        if (entries.length === 0) {
            showStatus(DOM.loadStatus, '⚠️ Датасет пуст или некорректен', 'error');
            return;
        }
        
        // Объединение с существующими записями
        AppState.datasetEntries = JSONLHandler.mergeDatasets(
            AppState.datasetEntries, 
            entries
        );
        
        // Обновление processedFiles
        entries.forEach(e => {
            if (e.metadata?.source_filename) {
                AppState.processedFiles.add(e.metadata.source_filename);
            }
        });
        
        AppState.lastUpdated = new Date().toISOString();
        saveToLocalStorage();
        
        showStatus(DOM.loadStatus, `✅ Загружено записей: ${entries.length}`, 'success');
        updateUI();
        
    } catch (error) {
        showStatus(DOM.loadStatus, `❌ Ошибка: ${error.message}`, 'error');
        console.error('Ошибка загрузки JSONL:', error);
    }
}

// Обработка обработки PDF файлов
async function handleProcessPDFs() {
    const files = DOM.pdfUpload.files;
    if (files.length === 0) return;
    
    // Показываем прогресс
    DOM.processProgressContainer.classList.add('show');
    DOM.btnProcess.disabled = true;
    
    let processedCount = 0;
    const totalFiles = files.length;
    
    try {
        for (let i = 0; i < totalFiles; i++) {
            const file = files[i];
            
            // Пропускаем уже обработанные файлы
            if (AppState.processedFiles.has(file.name)) {
                continue;
            }
            
            // Обновляем прогресс
            const progress = Math.round(((i) / totalFiles) * 100);
            updateProgress(progress, `Обработка ${i + 1}/${totalFiles}: ${file.name}`);
            
            // Обрабатываем файл
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
            } else {
                console.warn(`Ошибка обработки ${file.name}:`, result.error);
            }
        }
        
        // Финальное обновление
        AppState.lastUpdated = new Date().toISOString();
        saveToLocalStorage();
        
        updateProgress(100, '✅ Обработка завершена!');
        showStatus(DOM.processStatus, 
            `✅ Успешно обработано: ${processedCount} из ${totalFiles} файлов`, 
            'success'
        );
        
        updateUI();
        
    } catch (error) {
        showStatus(DOM.processStatus, `❌ Ошибка: ${error.message}`, 'error');
        console.error('Ошибка обработки PDF:', error);
    } finally {
        // Скрываем прогресс через 2 секунды
        setTimeout(() => {
            DOM.processProgressContainer.classList.remove('show');
            DOM.btnProcess.disabled = DOM.pdfUpload.files.length === 0;
        }, 2000);
    }
}

// Обновление прогресс-бара
function updateProgress(percent, message) {
    DOM.processProgress.style.width = `${percent}%`;
    DOM.processProgress.textContent = `${percent}%`;
    if (message) {
        DOM.processStatus.innerHTML = `<span class="status-info">${message}</span>`;
    }
}

// Обработка выбора записи для предпросмотра
function handlePreviewChange() {
    const index = DOM.previewSelect.value;
    if (!index) return;
    
    const entry = AppState.datasetEntries[index];
    if (!entry) return;
    
    // Обновляем метаданные
    DOM.previewMetadata.innerHTML = `
        <p><strong>Номер дела:</strong> ${entry.case_number || '—'}</p>
        <p><strong>Дата решения:</strong> ${entry.decision_date || '—'}</p>
        <p><strong>Длина текста:</strong> ${entry.decision_text?.length || 0} символов</p>
        <p><strong>Создано:</strong> ${entry.metadata?.created_at?.slice(0, 19) || '—'}</p>
    `;
    
    // Обновляем текст (первые 2000 символов)
    const previewText = entry.decision_text?.slice(0, 2000) || '';
    DOM.previewText.textContent = previewText + (entry.decision_text?.length > 2000 ? '\n\n...' : '');
}

// Обработка скачивания JSONL
function handleDownloadJSONL() {
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

// Обработка скачивания Instruction Dataset
function handleDownloadInstruction() {
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

// Обработка скачивания ZIP-архива
async function handleDownloadZip() {
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
        showStatus(DOM.processStatus, '🔄 Создание архива...', 'info');
        
        const zipBlob = await JSONLHandler.createZipArchive(
            AppState.datasetEntries,
            instructionEntries
        );
        
        const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
        saveAs(zipBlob, `court_dataset_${timestamp}.zip`);
        
        showStatus(DOM.processStatus, '✅ Архив скачан!', 'success');
        
    } catch (error) {
        showStatus(DOM.processStatus, `❌ Ошибка: ${error.message}`, 'error');
        console.error('Ошибка создания ZIP:', error);
    }
}

// Обновление интерфейса
function updateUI() {
    // Обновление статистики
    DOM.statRecords.textContent = AppState.datasetEntries.length;
    DOM.statProcessed.textContent = AppState.processedFiles.size;
    
    const totalChars = AppState.datasetEntries.reduce(
        (sum, e) => sum + (e.decision_text?.length || 0), 0
    );
    DOM.statChars.textContent = totalChars.toLocaleString('ru-RU');
    
    // Диапазон дат
    const dates = AppState.datasetEntries
        .map(e => e.decision_date)
        .filter(d => d && /^\d{4}-\d{2}-\d{2}$/.test(d))
        .sort();
    
    if (dates.length > 0) {
        DOM.statDateRange.textContent = `${dates[0]} — ${dates[dates.length - 1]}`;
    } else {
        DOM.statDateRange.textContent = '—';
    }
    
    // Счётчик в навбаре
    DOM.datasetCount.textContent = `Записей: ${AppState.datasetEntries.length}`;
    
    // Обновление предпросмотра
    updatePreviewSelect();
    
    // Обновление таблицы
    updateRecordsTable();
    
    // Показ/скрытие секций
    const hasData = AppState.datasetEntries.length > 0;
    DOM.previewSection.style.display = hasData ? 'block' : 'none';
    DOM.tableSection.style.display = hasData ? 'block' : 'none';
    DOM.exportSection.style.display = hasData ? 'block' : 'none';
}

// Обновление выпадающего списка предпросмотра
function updatePreviewSelect() {
    DOM.previewSelect.innerHTML = '<option value="">Выберите запись...</option>';
    
    AppState.datasetEntries.forEach((entry, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = `${entry.case_number} от ${entry.decision_date}`;
        DOM.previewSelect.appendChild(option);
    });
}

// Обновление таблицы записей
function updateRecordsTable() {
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
            DOM.previewSelect.value = index;
            handlePreviewChange();
            // Прокрутка к предпросмотру
            DOM.previewSection.scrollIntoView({ behavior: 'smooth' });
        });
        
        row.classList.add('cursor-pointer');
        DOM.recordsBody.appendChild(row);
    });
}

// Отображение статусного сообщения
function showStatus(element, message, type = 'info') {
    element.innerHTML = `<span class="status-${type}">${message}</span>`;
    
    // Авто-очистка через 5 секунд для success/info
    if (type !== 'error') {
        setTimeout(() => {
            if (element.innerHTML.includes(message)) {
                element.innerHTML = '';
            }
        }, 5000);
    }
}

// Сохранение в localStorage
function saveToLocalStorage() {
    try {
        const data = {
            entries: AppState.datasetEntries,
            processedFiles: Array.from(AppState.processedFiles),
            lastUpdated: AppState.lastUpdated
        };
        localStorage.setItem('court_dataset_builder', JSON.stringify(data));
    } catch (error) {
        console.warn('Не удалось сохранить в localStorage:', error);
    }
}

// Загрузка из localStorage
function loadFromLocalStorage() {
    try {
        const saved = localStorage.getItem('court_dataset_builder');
        if (saved) {
            const data = JSON.parse(saved);
            AppState.datasetEntries = data.entries || [];
            AppState.processedFiles = new Set(data.processedFiles || []);
            AppState.lastUpdated = data.lastUpdated;
            console.log('✅ Данные загружены из localStorage');
        }
    } catch (error) {
        console.warn('Не удалось загрузить из localStorage:', error);
    }
}

// Очистка датасета (для отладки)
function clearDataset() {
    if (confirm('Очистить весь датасет? Это действие нельзя отменить.')) {
        AppState.datasetEntries = [];
        AppState.processedFiles.clear();
        AppState.lastUpdated = null;
        saveToLocalStorage();
        updateUI();
        console.log('🗑 Датасет очищен');
    }
}

// Экспорт функции для отладки в консоли
window.clearDataset = clearDataset;

// Запуск при загрузке DOM
document.addEventListener('DOMContentLoaded', init);
