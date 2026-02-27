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
// 🔧 ЗАЩИТА: Проверка загрузки JSONLHandler
if (typeof JSONLHandler === 'undefined') {
    console.error('❌ Критическая ошибка: jsonl-handler.js не загружен!');
    document.addEventListener('DOMContentLoaded', () => {
        document.body.innerHTML = `
            <div style="padding:2rem;text-align:center;color:#dc3545">
                <h2>⚠️ Ошибка загрузки</h2>
                <p>Файл <code>js/jsonl-handler.js</code> не найден.</p>
                <p>Проверьте:</p>
                <ul style="text-align:left;max-width:500px;margin:1rem auto">
                    <li>Файл загружен на GitHub</li>
                    <li>Пути в index.html корректны</li>
                    <li>GitHub Pages обновился (может занять 1-2 мин)</li>
                </ul>
                <a href="../index.html" class="btn btn-primary">← Вернуться в сборщик</a>
            </div>
        `;
    });
    // Прерываем дальнейшее выполнение
    throw new Error('JSONLHandler not loaded');
}
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

/**
 * 🎨 УЛУЧШЕННЫЙ предпросмотр записи с группировкой по смыслу
 */
function handlePreviewChange() {
    const index = DOM.previewSelect?.value;
    if (index === '' || index === null) return;
    
    AppState.currentPreviewIndex = parseInt(index);
    const entry = AppState.datasetEntries[AppState.currentPreviewIndex];
    
    if (!entry) return;
    
    // ========================================================================
    // 📋 БЛОК 1: Базовая информация (всегда виден)
    // ========================================================================
    if (DOM.previewMetadata) {
        DOM.previewMetadata.innerHTML = `
            <div class="preview-section">
                <h6 class="section-header">📋 Базовая информация</h6>
                <div class="field-row">
                    <span class="field-label">case_id:</span>
                    <span class="field-value code">${escapeHtml(entry.case_id || '—')}</span>
                    <button class="btn-copy" onclick="copyToClipboard('${escapeJs(entry.case_id || '')}')" title="Копировать">📋</button>
                </div>
                <div class="field-row">
                    <span class="field-label">decision_verdict:</span>
                    <span class="field-value badge ${getVerdictBadge(entry.decision_verdict)}">
                        ${entry.decision_verdict || '—'}
                    </span>
                </div>
                <div class="field-row">
                    <span class="field-label">initial_claims:</span>
                    <span class="field-value">${formatCurrency(entry.initial_claims_sum?.initial_claims)} ₽</span>
                </div>
                <div class="field-row">
                    <span class="field-label">awarded:</span>
                    <span class="field-value text-success">${formatCurrency(entry.initial_claims_sum?.awarded)} ₽</span>
                </div>
            </div>
        `;
    }
    
    // ========================================================================
    // 👥 БЛОК 2: Стороны спора (collapsible)
    // ========================================================================
    const plaintiffHtml = renderPartyBlock('plaintiff', entry.plaintiff);
    const defendantHtml = renderPartyBlock('defendant', entry.defendant);
    
    // ========================================================================
    // ⚖️ БЛОК 3: Ключевые утверждения (expandable lists)
    // ========================================================================
    const statementsHtml = `
        <div class="preview-section collapsible">
            <div class="section-header collapsible-header" onclick="toggleCollapse(this)">
                ⚖️ Ключевые утверждения сторон <span class="collapse-icon">▼</span>
            </div>
            <div class="collapsible-content">
                <div class="subsection">
                    <strong>🟦 Истец:</strong>
                    <ul class="key-list">
                        ${(entry.key_statements_plaintiff || []).map(s => 
                            `<li>${escapeHtml(s)}</li>`
                        ).join('') || '<li class="text-muted">—</li>'}
                    </ul>
                </div>
                <div class="subsection mt-2">
                    <strong>🟥 Ответчик:</strong>
                    <ul class="key-list">
                        ${(entry.key_statements_defendant || []).map(s => 
                            `<li>${escapeHtml(s)}</li>`
                        ).join('') || '<li class="text-muted">—</li>'}
                    </ul>
                </div>
            </div>
        </div>
    `;
    
    // ========================================================================
    // 📜 БЛОК 4: Решения суда + нормы права
    // ========================================================================
    const resolutionsHtml = `
        <div class="preview-section collapsible">
            <div class="section-header collapsible-header" onclick="toggleCollapse(this)">
                📜 Решения суда <span class="collapse-icon">▼</span>
            </div>
            <div class="collapsible-content">
                <ul class="key-list">
                    ${(entry.court_resolutions || []).map(r => 
                        `<li>✅ ${escapeHtml(r)}</li>`
                    ).join('') || '<li class="text-muted">—</li>'}
                </ul>
            </div>
        </div>
        
        <div class="preview-section mt-2">
            <h6 class="section-header">⚖️ Упомянутые нормы права</h6>
            <div class="tags-container">
                ${(entry.mentioned_rules || []).map(rule => 
                    `<span class="tag tag-law">${escapeHtml(rule)}</span>`
                ).join('') || '<span class="text-muted">—</span>'}
            </div>
        </div>
    `;
    
    // ========================================================================
    // 📄 БЛОК 5: Краткое содержание (до 500 символов, как просили)
    // ========================================================================
    if (DOM.previewContent) {
        DOM.previewContent.innerHTML = `
            <div class="preview-section">
                <h6 class="section-header">📄 Краткое содержание дела</h6>
                <p class="summary-text">${truncateText(entry.dispute_summary, 500)}</p>
                ${entry.dispute_summary?.length > 500 ? 
                    `<button class="btn btn-sm btn-link p-0" onclick="showFullSummary()">Показать полностью</button>` : ''}
            </div>
            ${statementsHtml}
            ${resolutionsHtml}
        `;
    }
    
    // ========================================================================
    // ❓ БЛОК 6: Q&A секция (аккордеон)
    // ========================================================================
    const qaHtml = `
        <div class="preview-section collapsible" id="qa-section">
            <div class="section-header collapsible-header" onclick="toggleCollapse(this)">
                ❓ Вопросы и ответы (${entry.q_a?.length || 0}) <span class="collapse-icon">▼</span>
            </div>
            <div class="collapsible-content">
                ${(entry.q_a || []).map((qa, idx) => `
                    <div class="qa-item">
                        <div class="qa-question" onclick="toggleQAAnswer(this)">
                            <strong>Q${idx + 1}:</strong> ${escapeHtml(qa.question)} <span class="qa-toggle">+</span>
                        </div>
                        <div class="qa-answer" style="display:none">
                            <em>A:</em> ${escapeHtml(qa.answer)}
                        </div>
                    </div>
                `).join('') || '<p class="text-muted">—</p>'}
            </div>
        </div>
    `;
    
    // ========================================================================
    // 🔐 БЛОК 7: Персональные данные (с возможностью скрытия)
    // ========================================================================
    const personalDataHtml = `
        <div class="preview-section collapsible">
            <div class="section-header collapsible-header d-flex justify-content-between" onclick="toggleCollapse(this)">
                <span>🔐 Персональные данные <span class="badge bg-warning text-dark">${entry.personal_data?.length || 0}</span></span>
                <span class="collapse-icon">▼</span>
            </div>
            <div class="collapsible-content">
                <div class="form-check mb-2">
                    <input class="form-check-input" type="checkbox" id="anonymize-toggle" 
                           onchange="toggleAnonymization(this)" checked>
                    <label class="form-check-label small" for="anonymize-toggle">
                        Скрыть ФИО (анонимизировать)
                    </label>
                </div>
                <ul class="key-list" id="personal-data-list">
                    ${(entry.personal_data || []).map(name => 
                        `<li class="personal-name" data-original="${escapeHtml(name)}">
                            ${entry.personal_data?.length > 0 ? 'Физическое лицо' : '—'}
                        </li>`
                    ).join('') || '<li class="text-muted">—</li>'}
                </ul>
            </div>
        </div>
    `;
    
    // ========================================================================
    // 📦 БЛОК 8: Raw JSON (сворачиваемый, с подсветкой)
    // ========================================================================
    if (DOM.previewJson) {
        DOM.previewJson.innerHTML = `
            <div class="preview-section collapsible collapsed">
                <div class="section-header collapsible-header bg-light" onclick="toggleCollapse(this)">
                    📦 Полная структура JSON (raw) <span class="collapse-icon">▶</span>
                </div>
                <div class="collapsible-content">
                    <div class="d-flex justify-content-end mb-2">
                        <button class="btn btn-sm btn-outline-secondary" onclick="copyToClipboard(JSON.stringify(${JSON.stringify(entry)}, null, 2))">
                            📋 Копировать JSON
                        </button>
                    </div>
                    <pre class="json-viewer">${syntaxHighlight(entry)}</pre>
                </div>
            </div>
            ${qaHtml}
            ${personalDataHtml}
        `;
    }
    
    // Обновляем выпадающий список: добавляем больше контекста
    updatePreviewSelectWithDetails();
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
// 🎨 ВСПОМОГАТЕЛЬНЫЕ ФУНЦИИ ДЛЯ УЛУЧШЕННОГО ПРЕДПРОСМОТРА
// ============================================================================

/**
 * Рендерит блок со стороной спора (истец/ответчик)
 */
function renderPartyBlock(role, party) {
    if (!party) return '';
    
    const isPlaintiff = role === 'plaintiff';
    const colorClass = isPlaintiff ? 'border-primary' : 'border-danger';
    const icon = isPlaintiff ? '🟦' : '🟥';
    
    return `
        <div class="preview-section collapsible">
            <div class="section-header collapsible-header ${colorClass}" onclick="toggleCollapse(this)">
                ${icon} ${isPlaintiff ? 'Истец' : 'Ответчик'} <span class="collapse-icon">▼</span>
            </div>
            <div class="collapsible-content">
                <div class="field-row">
                    <span class="field-label">name:</span>
                    <span class="field-value">${escapeHtml(party.name || '—')}</span>
                </div>
                <div class="field-row">
                    <span class="field-label">type:</span>
                    <span class="field-value">${escapeHtml(party.type || '—')}</span>
                </div>
            </div>
        </div>
    `;
}

/**
 * Форматирует сумму в рублях
 */
function formatCurrency(amount) {
    if (amount === 0) return '0';
    if (!amount) return '—';
    return new Intl.NumberFormat('ru-RU').format(amount);
}

/**
 * Безопасный escape HTML
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Escape для вставки в JS-строку (для onclick)
 */
function escapeJs(text) {
    return String(text)
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n');
}

/**
 * Простая подсветка синтаксиса JSON
 */
function syntaxHighlight(json) {
    if (typeof json !== 'string') {
        json = JSON.stringify(json, null, 2);
    }
    return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g, function (match) {
        let cls = 'number';
        if (/^"/.test(match)) {
            if (/:$/.test(match)) {
                cls = 'key';
            } else {
                cls = 'string';
            }
        } else if (/true|false/.test(match)) {
            cls = 'boolean';
        } else if (/null/.test(match)) {
            cls = 'null';
        }
        return `<span class="json-${cls}">${escapeHtml(match)}</span>`;
    });
}

/**
 * Переключение сворачиваемых секций
 */
function toggleCollapse(headerEl) {
    const content = headerEl.nextElementSibling;
    const icon = headerEl.querySelector('.collapse-icon');
    
    if (content && icon) {
        const isCollapsed = content.style.display === 'none' || !content.style.display;
        content.style.display = isCollapsed ? 'block' : 'none';
        icon.textContent = isCollapsed ? '▼' : '▶';
        headerEl.closest('.collapsible')?.classList.toggle('collapsed', !isCollapsed);
    }
}

/**
 * Переключение ответа в Q&A
 */
function toggleQAAnswer(questionEl) {
    const answer = questionEl.nextElementSibling;
    const toggle = questionEl.querySelector('.qa-toggle');
    
    if (answer && toggle) {
        const isVisible = answer.style.display === 'block';
        answer.style.display = isVisible ? 'none' : 'block';
        toggle.textContent = isVisible ? '+' : '−';
    }
}

/**
 * Анонимизация персональных данных
 */
function toggleAnonymization(checkbox) {
    const items = document.querySelectorAll('#personal-data-list .personal-name');
    items.forEach(item => {
        const original = item.dataset.original;
        item.textContent = checkbox.checked ? 'Физическое лицо' : original;
    });
}

/**
 * Показать полное содержание дела
 */
function showFullSummary() {
    const entry = AppState.datasetEntries[AppState.currentPreviewIndex];
    if (!entry?.dispute_summary) return;
    
    const modal = document.createElement('div');
    modal.className = 'modal fade show';
    modal.style.display = 'block';
    modal.innerHTML = `
        <div class="modal-dialog modal-lg">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">📄 Полное содержание: ${escapeHtml(entry.case_id)}</h5>
                    <button type="button" class="btn-close" onclick="this.closest('.modal').remove()"></button>
                </div>
                <div class="modal-body">
                    <pre style="white-space: pre-wrap; font-size: 0.9rem">${escapeHtml(entry.dispute_summary)}</pre>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-primary" onclick="copyToClipboard('${escapeJs(entry.dispute_summary)}'); this.textContent='✓ Скопировано'">
                        📋 Копировать
                    </button>
                    <button class="btn btn-secondary" onclick="this.closest('.modal').remove()">Закрыть</button>
                </div>
            </div>
        </div>
    `;
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    document.body.appendChild(modal);
}

/**
 * Копирование в буфер обмена
 */
function copyToClipboard(text) {
    navigator.clipboard?.writeText(text).then(() => {
        // Визуальная обратная связь
        const btn = event?.target;
        if (btn) {
            const original = btn.textContent;
            btn.textContent = '✓';
            setTimeout(() => btn.textContent = original, 1000);
        }
    }).catch(err => {
        console.error('Не удалось скопировать:', err);
        alert('❌ Не удалось скопировать в буфер обмена');
    });
}

/**
 * Обновление выпадающего списка с деталями
 */
function updatePreviewSelectWithDetails() {
    if (!DOM.previewSelect) return;
    
    const current = DOM.previewSelect.value;
    DOM.previewSelect.innerHTML = '<option value="">🔍 Выберите запись...</option>';
    
    AppState.datasetEntries.forEach((entry, index) => {
        const option = document.createElement('option');
        option.value = index;
        
        // Формируем информативную подпись
        const plaintiffShort = entry.plaintiff?.name?.split('«')?.[1]?.split('»')?.[0] || 
                              entry.plaintiff?.name?.slice(0, 20) || '—';
        const verdictIcon = entry.decision_verdict?.includes('удовлетвор') ? '✅' : 
                           entry.decision_verdict?.includes('отказ') ? '❌' : '⚖️';
        
        option.textContent = `${entry.case_id || '—'} | ${verdictIcon} ${entry.decision_verdict || '—'} | ${plaintiffShort}`;
        DOM.previewSelect.appendChild(option);
    });
    
    // Восстанавливаем выбор
    if (current) DOM.previewSelect.value = current;
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
