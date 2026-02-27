/**
 * APP.JS
 * Основная логика редактора обогащённого датасета
 * Версия: 1.0
 */

// ============================================================================
// ГЛОБАЛЬНОЕ СОСТОЯНИЕ
// ============================================================================
const AppState = {
    datasetEntries: [],
    originalFilename: '',
    currentPreviewIndex: null,
    keysToDelete: new Set(),
    keysToAdd: [],
    isModified: false
};

// ============================================================================
// DOM ЭЛЕМЕНТЫ
// ============================================================================
const DOM = {};

function initializeDOM() {
    // Статистика
    DOM.statRecords = document.getElementById('stat-records');
    DOM.statKeys = document.getElementById('stat-keys');
    DOM.statChars = document.getElementById('stat-chars');
    DOM.statFilename = document.getElementById('stat-filename');
    DOM.datasetInfo = document.getElementById('dataset-info');
    
    // Загрузка
    DOM.jsonlUpload = document.getElementById('jsonl-upload');
    DOM.btnLoad = document.getElementById('btn-load');
    DOM.loadStatus = document.getElementById('load-status');
    
    // Управление ключами
    DOM.keyManagementSection = document.getElementById('key-management-section');
    DOM.keysToDelete = document.getElementById('keys-to-delete');
    DOM.newKeyName = document.getElementById('new-key-name');
    DOM.newKeyLocation = document.getElementById('new-key-location');
    DOM.btnAddKey = document.getElementById('btn-add-key');
    DOM.addedKeys = document.getElementById('added-keys');
    DOM.btnApplyChanges = document.getElementById('btn-apply-changes');
    DOM.applyStatus = document.getElementById('apply-status');
    
    // Предпросмотр
    DOM.previewSection = document.getElementById('preview-section');
    DOM.previewSelect = document.getElementById('preview-select');
    DOM.previewMetadata = document.getElementById('preview-metadata');
    DOM.previewContent = document.getElementById('preview-content');
    DOM.previewJson = document.getElementById('preview-json');
    DOM.btnSaveRecord = document.getElementById('btn-save-record');
    DOM.saveStatus = document.getElementById('save-status');
    
    // Таблица
    DOM.tableSection = document.getElementById('table-section');
    DOM.recordsBody = document.getElementById('records-body');
    
    // Экспорт
    DOM.exportSection = document.getElementById('export-section');
    DOM.btnDownloadJsonl = document.getElementById('btn-download-jsonl');
    DOM.btnDownloadJson = document.getElementById('btn-download-json');
    DOM.btnClearDataset = document.getElementById('btn-clear-dataset');
}

// ============================================================================
// УТИЛИТЫ
// ============================================================================
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

function truncateText(text, maxLength = 500) {
    if (!text) return '';
    const str = typeof text === 'string' ? text : JSON.stringify(text);
    if (str.length <= maxLength) return str;
    return str.slice(0, maxLength) + '...';
}

function getFilenameWithSuffix(original, suffix = '_edited') {
    const lastDot = original.lastIndexOf('.');
    if (lastDot === -1) return original + suffix;
    return original.slice(0, lastDot) + suffix + original.slice(lastDot);
}

// ============================================================================
// ОБРАБОТЧИКИ СОБЫТИЙ
// ============================================================================

async function handleLoadDataset() {
    const file = DOM.jsonlUpload?.files?.[0];
    if (!file) {
        showStatus(DOM.loadStatus, '❌ Выберите файл', 'error');
        return;
    }
    
    try {
        showStatus(DOM.loadStatus, '🔄 Загрузка...', 'info', false);
        
        const entries = await JSONLHandler.loadFromFile(file);
        
        if (entries.length === 0) {
            showStatus(DOM.loadStatus, '⚠️ Датасет пуст или некорректен', 'error');
            return;
        }
        
        AppState.datasetEntries = entries;
        AppState.originalFilename = file.name;
        AppState.isModified = false;
        
        saveToLocalStorage();
        updateUI();
        
        showStatus(DOM.loadStatus, `✅ Загружено записей: ${entries.length}`, 'success');
    } catch (error) {
        console.error('Ошибка загрузки:', error);
        showStatus(DOM.loadStatus, `❌ Ошибка: ${error.message}`, 'error');
    }
}

function updateKeyManagementUI() {
    if (!DOM.keysToDelete || !DOM.addedKeys) return;
    
    // Ключи для удаления
    DOM.keysToDelete.innerHTML = '';
    const allKeys = JSONLHandler.extractAllKeys(AppState.datasetEntries);
    
    allKeys.forEach(key => {
        const badge = document.createElement('span');
        badge.className = 'badge bg-secondary cursor-pointer key-badge';
        badge.textContent = key;
        badge.dataset.key = key;
        
        if (AppState.keysToDelete.has(key)) {
            badge.classList.remove('bg-secondary');
            badge.classList.add('bg-danger');
        }
        
        badge.addEventListener('click', () => toggleKeyToDelete(key));
        DOM.keysToDelete.appendChild(badge);
    });
    
    // Добавленные ключи
    DOM.addedKeys.innerHTML = '';
    AppState.keysToAdd.forEach((keyInfo, index) => {
        const badge = document.createElement('span');
        badge.className = 'badge bg-success cursor-pointer';
        badge.textContent = `${keyInfo.location}.${keyInfo.name} ✕`;
        badge.addEventListener('click', () => removeAddedKey(index));
        DOM.addedKeys.appendChild(badge);
    });
    
    // Показываем секцию если есть данные
    if (DOM.keyManagementSection) {
        DOM.keyManagementSection.style.display = AppState.datasetEntries.length > 0 ? 'block' : 'none';
    }
}

function toggleKeyToDelete(key) {
    if (AppState.keysToDelete.has(key)) {
        AppState.keysToDelete.delete(key);
    } else {
        AppState.keysToDelete.add(key);
    }
    updateKeyManagementUI();
}

function handleAddKey() {
    const keyName = DOM.newKeyName?.value?.trim();
    const location = DOM.newKeyLocation?.value || 'root';
    
    if (!keyName) {
        showStatus(DOM.applyStatus, '❌ Введите название ключа', 'error');
        return;
    }
    
    AppState.keysToAdd.push({ name: keyName, location, value: '' });
    DOM.newKeyName.value = '';
    updateKeyManagementUI();
    showStatus(DOM.applyStatus, `➕ Ключ "${location}.${keyName}" добавлен в очередь`, 'success');
}

function removeAddedKey(index) {
    AppState.keysToAdd.splice(index, 1);
    updateKeyManagementUI();
}

async function handleApplyChanges() {
    if (AppState.datasetEntries.length === 0) {
        showStatus(DOM.applyStatus, '❌ Нет данных', 'error');
        return;
    }
    
    try {
        showStatus(DOM.applyStatus, '🔄 Применение изменений...', 'info', false);
        
        // Удаляем ключи
        if (AppState.keysToDelete.size > 0) {
            JSONLHandler.deleteKeysFromEntries(
                AppState.datasetEntries, 
                Array.from(AppState.keysToDelete)
            );
        }
        
        // Добавляем ключи
        AppState.keysToAdd.forEach(keyInfo => {
            JSONLHandler.addKeyToEntries(
                AppState.datasetEntries, 
                keyInfo.name, 
                keyInfo.location, 
                keyInfo.value
            );
        });
        
        AppState.isModified = true;
        AppState.keysToDelete.clear();
        AppState.keysToAdd = [];
        
        saveToLocalStorage();
        updateUI();
        updateKeyManagementUI();
        
        showStatus(DOM.applyStatus, '✅ Изменения применены ко всем записям', 'success');
    } catch (error) {
        console.error('Ошибка применения изменений:', error);
        showStatus(DOM.applyStatus, `❌ Ошибка: ${error.message}`, 'error');
    }
}

function handlePreviewChange() {
    const index = DOM.previewSelect?.value;
    if (index === '' || index === null) return;
    
    AppState.currentPreviewIndex = parseInt(index);
    const entry = AppState.datasetEntries[AppState.currentPreviewIndex];
    
    if (!entry) return;
    
    // Метаданные
    if (DOM.previewMetadata) {
        DOM.previewMetadata.innerHTML = `
            <p><strong>case_id:</strong> ${entry.case_id || '—'}</p>
            <p><strong>decision_verdict:</strong> ${entry.decision_verdict || '—'}</p>
            <p><strong>plaintiff:</strong> ${entry.plaintiff?.name || '—'}</p>
            <p><strong>defendant:</strong> ${entry.defendant?.name || '—'}</p>
            <p><strong>q_a count:</strong> ${entry.q_a?.length || 0}</p>
            <p><strong>rules count:</strong> ${entry.mentioned_rules?.length || 0}</p>
        `;
    }
    
    // Основные поля (до 500 символов)
    if (DOM.previewContent) {
        DOM.previewContent.innerHTML = `
            <h6>dispute_summary:</h6>
            <p>${truncateText(entry.dispute_summary, 500)}</p>
            
            <h6>key_statements_plaintiff:</h6>
            <p>${truncateText(entry.key_statements_plaintiff?.join('; '), 500)}</p>
            
            <h6>key_statements_defendant:</h6>
            <p>${truncateText(entry.key_statements_defendant?.join('; '), 500)}</p>
            
            <h6>court_resolutions:</h6>
            <p>${truncateText(entry.court_resolutions?.join('; '), 500)}</p>
        `;
    }
    
    // Полный JSON
    if (DOM.previewJson) {
        DOM.previewJson.textContent = JSON.stringify(entry, null, 2);
    }
}

function handleSaveRecord() {
    if (AppState.currentPreviewIndex === null && AppState.currentPreviewIndex !== 0) {
        showStatus(DOM.saveStatus, '❌ Выберите запись', 'error');
        return;
    }
    
    AppState.isModified = true;
    saveToLocalStorage();
    showStatus(DOM.saveStatus, '✅ Изменения сохранены', 'success');
}

function handleDownloadJSONL() {
    if (AppState.datasetEntries.length === 0) {
        alert('Датасет пуст!');
        return;
    }
    
    const filename = getFilenameWithSuffix(AppState.originalFilename || 'enriched_dataset.jsonl', '_edited');
    JSONLHandler.downloadJSONL(AppState.datasetEntries, filename);
}

function handleDownloadJSON() {
    if (AppState.datasetEntries.length === 0) {
        alert('Датасет пуст!');
        return;
    }
    
    const filename = getFilenameWithSuffix(AppState.originalFilename || 'enriched_dataset.json', '_edited');
    JSONLHandler.downloadJSON(AppState.datasetEntries, filename);
}

function handleClearDataset() {
    if (AppState.datasetEntries.length === 0) {
        alert('Датасет уже пуст!');
        return;
    }
    
    if (confirm('⚠️ Вы уверены, что хотите удалить ВСЕ записи?\n\nЭто действие нельзя отменить.')) {
        AppState.datasetEntries = [];
        AppState.originalFilename = '';
        AppState.currentPreviewIndex = null;
        AppState.keysToDelete.clear();
        AppState.keysToAdd = [];
        AppState.isModified = false;
        
        if (DOM.jsonlUpload) DOM.jsonlUpload.value = '';
        
        saveToLocalStorage();
        updateUI();
        
        alert('✅ Датасет очищен!');
    }
}

// ============================================================================
// ОБНОВЛЕНИЕ ИНТЕРФЕЙСА
// ============================================================================

function updateUI() {
    // Статистика
    if (DOM.statRecords) {
        DOM.statRecords.textContent = AppState.datasetEntries.length.toLocaleString('ru-RU');
    }
    
    if (DOM.statKeys) {
        const uniqueKeys = JSONLHandler.extractAllKeys(AppState.datasetEntries);
        DOM.statKeys.textContent = uniqueKeys.length.toLocaleString('ru-RU');
    }
    
    if (DOM.statChars) {
        const totalChars = AppState.datasetEntries.reduce(
            (sum, e) => sum + JSON.stringify(e).length, 0
        );
        DOM.statChars.textContent = totalChars.toLocaleString('ru-RU');
    }
    
    if (DOM.statFilename) {
        DOM.statFilename.textContent = AppState.originalFilename || '—';
    }
    
    if (DOM.datasetInfo) {
        DOM.datasetInfo.textContent = `Записей: ${AppState.datasetEntries.length}`;
    }
    
    // Предпросмотр
    updatePreviewSelect();
    
    // Таблица
    updateRecordsTable();
    
    // Показ/скрытие секций
    const hasData = AppState.datasetEntries.length > 0;
    
    if (DOM.previewSection) DOM.previewSection.style.display = hasData ? 'block' : 'none';
    if (DOM.tableSection) DOM.tableSection.style.display = hasData ? 'block' : 'none';
    if (DOM.exportSection) DOM.exportSection.style.display = hasData ? 'block' : 'none';
    if (DOM.keyManagementSection) DOM.keyManagementSection.style.display = hasData ? 'block' : 'none';
    
    updateKeyManagementUI();
}

function updatePreviewSelect() {
    if (!DOM.previewSelect) return;
    
    DOM.previewSelect.innerHTML = '<option value="">Выберите запись...</option>';
    
    AppState.datasetEntries.forEach((entry, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = `${entry.case_id || '—'} | ${entry.decision_verdict || '—'}`;
        DOM.previewSelect.appendChild(option);
    });
}

function updateRecordsTable() {
    if (!DOM.recordsBody) return;
    
    DOM.recordsBody.innerHTML = '';
    
    AppState.datasetEntries.forEach((entry, index) => {
        const row = document.createElement('tr');
        row.className = 'fade-in';
        row.style.animationDelay = `${index * 0.02}s`;
        
        row.innerHTML = `
            <td>${index + 1}</td>
            <td><code>${truncateText(entry.case_id, 50)}</code></td>
            <td class="text-truncate-2" style="max-width: 300px;">${truncateText(entry.dispute_summary, 200)}</td>
            <td class="text-truncate-2">${truncateText(entry.plaintiff?.name, 100)}</td>
            <td class="text-truncate-2">${truncateText(entry.defendant?.name, 100)}</td>
            <td><span class="badge ${getVerdictBadge(entry.decision_verdict)}">${entry.decision_verdict || '—'}</span></td>
            <td>
                <button class="btn btn-sm btn-outline-primary" onclick="selectRecord(${index})">👁</button>
            </td>
        `;
        
        row.querySelector('button').addEventListener('click', () => {
            if (DOM.previewSelect) DOM.previewSelect.value = index;
            handlePreviewChange();
            DOM.previewSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
        
        DOM.recordsBody.appendChild(row);
    });
}

function getVerdictBadge(verdict) {
    if (!verdict) return 'bg-secondary';
    const v = verdict.toLowerCase();
    if (v.includes('удовлетвор')) return 'bg-success';
    if (v.includes('отказ')) return 'bg-danger';
    if (v.includes('частичн')) return 'bg-warning';
    return 'bg-info';
}

// Глобальная функция для доступа из HTML
window.selectRecord = function(index) {
    if (DOM.previewSelect) DOM.previewSelect.value = index;
    handlePreviewChange();
};

// ============================================================================
// LOCALSTORAGE
// ============================================================================

function saveToLocalStorage() {
    try {
        const data = {
            entries: AppState.datasetEntries,
            originalFilename: AppState.originalFilename,
            currentPreviewIndex: AppState.currentPreviewIndex,
            keysToDelete: Array.from(AppState.keysToDelete),
            keysToAdd: AppState.keysToAdd,
            lastUpdated: new Date().toISOString()
        };
        localStorage.setItem('enriched_dataset_editor', JSON.stringify(data));
    } catch (error) {
        console.warn('Не удалось сохранить в localStorage:', error);
    }
}

function loadFromLocalStorage() {
    try {
        const saved = localStorage.getItem('enriched_dataset_editor');
        if (saved) {
            const data = JSON.parse(saved);
            AppState.datasetEntries = data.entries || [];
            AppState.originalFilename = data.originalFilename || '';
            AppState.currentPreviewIndex = data.currentPreviewIndex || null;
            AppState.keysToDelete = new Set(data.keysToDelete || []);
            AppState.keysToAdd = data.keysToAdd || [];
        }
    } catch (error) {
        console.warn('Не удалось загрузить из localStorage:', error);
    }
}

// ============================================================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================================================

function init() {
    console.log('🚀 Инициализация редактора обогащённого датасета...');
    
    initializeDOM();
    loadFromLocalStorage();
    
    // Обработчики событий
    if (DOM.btnLoad) DOM.btnLoad.addEventListener('click', handleLoadDataset);
    if (DOM.btnAddKey) DOM.btnAddKey.addEventListener('click', handleAddKey);
    if (DOM.btnApplyChanges) DOM.btnApplyChanges.addEventListener('click', handleApplyChanges);
    if (DOM.previewSelect) DOM.previewSelect.addEventListener('change', handlePreviewChange);
    if (DOM.btnSaveRecord) DOM.btnSaveRecord.addEventListener('click', handleSaveRecord);
    if (DOM.btnDownloadJsonl) DOM.btnDownloadJsonl.addEventListener('click', handleDownloadJSONL);
    if (DOM.btnDownloadJson) DOM.btnDownloadJson.addEventListener('click', handleDownloadJSON);
    if (DOM.btnClearDataset) DOM.btnClearDataset.addEventListener('click', handleClearDataset);
    
    updateUI();
    
    console.log('✅ Редактор инициализирован');
}

document.addEventListener('DOMContentLoaded', init);
