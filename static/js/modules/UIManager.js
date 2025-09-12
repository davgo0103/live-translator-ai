/**
 * UI 管理模組
 * UI Manager Module
 */

class UIManager {
    constructor() {
        this.elements = {};
        this.currentFontSize = 28;
        this.isInPresentationMode = false;
        this.controlsExpanded = false;
        this.autoCollapseTimer = null;
        this.settingsVisible = true;
        
        this.initElements();
        this.bindEvents();
    }

    // 初始化元素引用
    initElements() {
        const elementIds = [
            'recordBtn', 'sourceLanguage', 'targetLanguage', 'apiKey',
            'transcriptDisplay', 'currentText', 'clearBtn', 'wordCount',
            'presentationBtn', 'exitPresentationBtn', 'settingsToggle',
            'transcriptContainer', 'container', 'header', 'controls',
            'apiConfig', 'originalContent', 'translatedContent',
            'originalPane', 'translatedPane', 'confidenceThreshold',
            'confidenceValue', 'advancedNoiseSuppression', 'recognitionEngine',
            'incrementalTranslation', 'confidenceIndicator', 'confidenceFill',
            'confidenceText', 'fontIncrease', 'fontDecrease', 'fontSizeDisplay',
            'presentationControls', 'controlToggle', 'controlsContent',
            'presentationExitBtn'
        ];

        elementIds.forEach(id => {
            this.elements[id] = document.getElementById(id);
        });
    }

    // 綁定事件
    bindEvents() {
        // 簡報模式相關事件
        if (this.elements.presentationBtn) {
            this.elements.presentationBtn.addEventListener('click', () => {
                this.enterPresentationMode();
            });
        }

        if (this.elements.exitPresentationBtn) {
            this.elements.exitPresentationBtn.addEventListener('click', () => {
                this.exitPresentationMode();
            });
        }

        if (this.elements.presentationExitBtn) {
            this.elements.presentationExitBtn.addEventListener('click', () => {
                this.exitPresentationMode();
            });
        }

        if (this.elements.settingsToggle) {
            this.elements.settingsToggle.addEventListener('click', () => {
                this.toggleSettings();
            });
        }

        // 字體控制事件
        if (this.elements.fontIncrease) {
            this.elements.fontIncrease.addEventListener('click', (e) => {
                e.stopPropagation();
                this.adjustFontSize(2);
                this.resetAutoCollapse();
            });
        }

        if (this.elements.fontDecrease) {
            this.elements.fontDecrease.addEventListener('click', (e) => {
                e.stopPropagation();
                this.adjustFontSize(-2);
                this.resetAutoCollapse();
            });
        }

        // 控制面板展開/收縮
        if (this.elements.controlToggle) {
            this.elements.controlToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleControls();
            });
        }

        // 置信度控制
        if (this.elements.confidenceThreshold) {
            this.elements.confidenceThreshold.addEventListener('input', (e) => {
                this.updateConfidenceDisplay(e.target.value);
            });
        }

        // 清除按鈕
        if (this.elements.clearBtn) {
            this.elements.clearBtn.addEventListener('click', () => {
                this.clearTranscript();
            });
        }
    }

    // 進入簡報模式
    enterPresentationMode() {
        this.isInPresentationMode = true;
        
        // 隱藏不需要的元素
        if (this.elements.header) this.elements.header.style.display = 'none';
        if (this.elements.controls) this.elements.controls.style.display = 'none';
        if (this.elements.apiConfig) this.elements.apiConfig.style.display = 'none';
        if (this.elements.presentationBtn) this.elements.presentationBtn.style.display = 'none';
        if (this.elements.exitPresentationBtn) this.elements.exitPresentationBtn.style.display = 'block';
        
        // 顯示簡報面板
        if (this.elements.originalPane) this.elements.originalPane.style.display = 'block';
        if (this.elements.translatedPane) this.elements.translatedPane.style.display = 'block';
        if (this.elements.presentationControls) this.elements.presentationControls.style.display = 'block';
        
        // 調整容器樣式
        if (this.elements.container) {
            this.elements.container.classList.add('presentation-mode');
        }
        
        // 初始化簡報內容
        this.initializePresentationContent();
        
        // 設置自動收縮
        this.setupAutoCollapse();
        
        console.log('進入簡報模式');
    }

    // 退出簡報模式
    exitPresentationMode() {
        this.isInPresentationMode = false;
        
        // 顯示正常元素
        if (this.elements.header) this.elements.header.style.display = 'block';
        if (this.elements.controls) this.elements.controls.style.display = 'flex';
        if (this.elements.apiConfig) this.elements.apiConfig.style.display = 'block';
        if (this.elements.presentationBtn) this.elements.presentationBtn.style.display = 'block';
        if (this.elements.exitPresentationBtn) this.elements.exitPresentationBtn.style.display = 'none';
        
        // 隱藏簡報面板
        if (this.elements.originalPane) this.elements.originalPane.style.display = 'none';
        if (this.elements.translatedPane) this.elements.translatedPane.style.display = 'none';
        if (this.elements.presentationControls) this.elements.presentationControls.style.display = 'none';
        
        // 移除簡報模式樣式
        if (this.elements.container) {
            this.elements.container.classList.remove('presentation-mode');
        }
        
        // 清除自動收縮定時器
        if (this.autoCollapseTimer) {
            clearTimeout(this.autoCollapseTimer);
        }
        
        console.log('退出簡報模式');
    }

    // 初始化簡報內容
    initializePresentationContent() {
        if (this.elements.originalContent) {
            this.elements.originalContent.innerHTML = '<div class="text-wrapper">等待語音輸入...</div>';
        }
        if (this.elements.translatedContent) {
            this.elements.translatedContent.innerHTML = '<div class="text-wrapper">等待翻譯結果...</div>';
        }
    }

    // 更新簡報內容
    updatePresentationContent(originalText, translatedText) {
        if (!this.isInPresentationMode) return;
        
        if (this.elements.originalContent && originalText) {
            this.elements.originalContent.innerHTML = `<div class="text-wrapper">${this.sanitizeHTML(originalText)}</div>`;
        }
        
        if (this.elements.translatedContent && translatedText) {
            this.elements.translatedContent.innerHTML = `<div class="text-wrapper">${this.sanitizeHTML(translatedText)}</div>`;
        }
    }

    // 切換設定面板
    toggleSettings() {
        this.settingsVisible = !this.settingsVisible;
        
        if (this.elements.apiConfig) {
            this.elements.apiConfig.style.display = this.settingsVisible ? 'block' : 'none';
        }
        
        if (this.elements.settingsToggle) {
            this.elements.settingsToggle.textContent = this.settingsVisible ? '⚙️ 隱藏設定' : '⚙️ 顯示設定';
        }
    }

    // 調整字體大小
    adjustFontSize(change) {
        this.currentFontSize += change;
        this.currentFontSize = Math.max(12, Math.min(60, this.currentFontSize));
        
        if (this.elements.fontSizeDisplay) {
            this.elements.fontSizeDisplay.textContent = `${this.currentFontSize}px`;
        }
        
        // 應用字體大小到簡報內容
        const presentationElements = [this.elements.originalContent, this.elements.translatedContent];
        presentationElements.forEach(element => {
            if (element) {
                element.style.fontSize = `${this.currentFontSize}px`;
            }
        });
    }

    // 切換控制面板
    toggleControls() {
        this.controlsExpanded = !this.controlsExpanded;
        
        if (this.elements.controlsContent) {
            this.elements.controlsContent.style.display = this.controlsExpanded ? 'flex' : 'none';
        }
        
        if (this.controlsExpanded) {
            this.setupAutoCollapse();
        }
    }

    // 收縮控制面板
    collapseControls() {
        this.controlsExpanded = false;
        if (this.elements.controlsContent) {
            this.elements.controlsContent.style.display = 'none';
        }
    }

    // 設置自動收縮
    setupAutoCollapse() {
        if (this.autoCollapseTimer) {
            clearTimeout(this.autoCollapseTimer);
        }
        
        this.autoCollapseTimer = setTimeout(() => {
            this.collapseControls();
        }, 5000);
    }

    // 重置自動收縮
    resetAutoCollapse() {
        if (this.controlsExpanded && this.autoCollapseTimer) {
            clearTimeout(this.autoCollapseTimer);
            this.autoCollapseTimer = setTimeout(() => {
                this.collapseControls();
            }, 5000);
        }
    }

    // 更新置信度顯示
    updateConfidenceDisplay(value) {
        const threshold = parseFloat(value);
        const labels = {
            0.3: '低',
            0.4: '較低',
            0.5: '中等',
            0.6: '較高',
            0.7: '高',
            0.8: '很高'
        };
        
        if (this.elements.confidenceValue) {
            this.elements.confidenceValue.textContent = labels[threshold] || '自定義';
        }
    }

    // 更新置信度指示器
    updateConfidenceIndicator(confidence) {
        if (!this.elements.confidenceFill || !this.elements.confidenceText) return;
        
        const percentage = Math.round(confidence * 100);
        this.elements.confidenceFill.style.width = `${percentage}%`;
        this.elements.confidenceText.textContent = `${percentage}%`;
        
        // 根據置信度設置顏色
        let color = '#dc3545'; // 紅色 - 低置信度
        if (confidence > 0.7) {
            color = '#28a745'; // 綠色 - 高置信度
        } else if (confidence > 0.5) {
            color = '#ffc107'; // 黃色 - 中等置信度
        }
        
        this.elements.confidenceFill.style.backgroundColor = color;
    }

    // 添加轉錄項目
    addTranscriptItem(data) {
        if (!this.elements.transcriptDisplay) return;
        
        const item = document.createElement('div');
        item.className = 'transcript-item';
        const timestamp = data.timestamp || new Date().toLocaleTimeString('zh-TW', { 
            hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' 
        });
        const sanitizedOriginal = this.sanitizeHTML(data.original || '');
        const sanitizedTranslated = this.sanitizeHTML(data.translated || '');
        
        item.innerHTML = `
            <div class="timestamp">${timestamp}</div>
            <div class="content">
                <div class="source-text">${sanitizedOriginal}</div>
                <div class="translated-text">${sanitizedTranslated}</div>
            </div>
        `;
        
        // 移除開始消息（如果存在）
        const startMessage = this.elements.transcriptDisplay.querySelector('.start-message');
        if (startMessage) {
            startMessage.remove();
        }
        
        this.elements.transcriptDisplay.appendChild(item);
        
        // 自動滾動到底部
        this.elements.transcriptDisplay.scrollTop = this.elements.transcriptDisplay.scrollHeight;
        
        // 更新簡報內容
        if (this.isInPresentationMode) {
            this.updatePresentationContent(data.original, data.translated);
        }
    }

    // 清除轉錄記錄
    clearTranscript() {
        if (this.elements.transcriptDisplay) {
            this.elements.transcriptDisplay.innerHTML = `
                <div class="transcript-item start-message">
                    <div class="timestamp">開始時間</div>
                    <div class="content">
                        <div class="source-text">會議開始，正在等待語音輸入...</div>
                        <div class="translated-text">Meeting started, waiting for voice input...</div>
                    </div>
                </div>
            `;
        }
        
        // 重置簡報內容
        this.initializePresentationContent();
        
        // 重置字數統計
        this.updateWordCount(0);
    }

    // 更新字數統計
    updateWordCount(count) {
        if (this.elements.wordCount) {
            this.elements.wordCount.textContent = `字數: ${count}`;
        }
    }

    // 更新當前文字顯示
    updateCurrentText(text, status = '') {
        if (this.elements.currentText) {
            if (typeof text === 'string') {
                this.elements.currentText.innerHTML = this.sanitizeHTML(text);
            } else {
                this.elements.currentText.innerHTML = text;
            }
        }
    }

    // 本地的 sanitizeHTML 方法
    sanitizeHTML(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // 更新錄音按鈕狀態
    updateRecordButton(isRecording, text) {
        if (!this.elements.recordBtn) return;
        
        if (isRecording) {
            this.elements.recordBtn.textContent = text || '⏹️ 停止錄音';
            this.elements.recordBtn.style.background = 'linear-gradient(135deg, #dc3545, #c82333)';
            this.elements.recordBtn.disabled = false;
        } else {
            this.elements.recordBtn.textContent = text || '檢查狀態';
            this.elements.recordBtn.style.background = 'linear-gradient(135deg, #28a745, #20c997)';
            this.elements.recordBtn.disabled = false;
        }
    }

    // 獲取表單值
    getFormValues() {
        return {
            apiKey: this.elements.apiKey?.value.trim() || '',
            sourceLanguage: this.elements.sourceLanguage?.value || 'auto',
            targetLanguage: this.elements.targetLanguage?.value || '繁體中文',
            recognitionEngine: this.elements.recognitionEngine?.value || 'webspeech',
            confidenceThreshold: parseFloat(this.elements.confidenceThreshold?.value || '0.5'),
            advancedNoiseSuppression: this.elements.advancedNoiseSuppression?.checked || false,
            incrementalTranslation: this.elements.incrementalTranslation?.checked || false
        };
    }

    // 設置表單值
    setFormValues(values) {
        if (values.apiKey && this.elements.apiKey) {
            this.elements.apiKey.value = values.apiKey;
        }
        if (values.sourceLanguage && this.elements.sourceLanguage) {
            this.elements.sourceLanguage.value = values.sourceLanguage;
        }
        if (values.targetLanguage && this.elements.targetLanguage) {
            this.elements.targetLanguage.value = values.targetLanguage;
        }
        if (values.recognitionEngine && this.elements.recognitionEngine) {
            this.elements.recognitionEngine.value = values.recognitionEngine;
        }
        if (values.confidenceThreshold !== undefined && this.elements.confidenceThreshold) {
            this.elements.confidenceThreshold.value = values.confidenceThreshold;
            this.updateConfidenceDisplay(values.confidenceThreshold);
        }
        if (values.advancedNoiseSuppression !== undefined && this.elements.advancedNoiseSuppression) {
            this.elements.advancedNoiseSuppression.checked = values.advancedNoiseSuppression;
        }
        if (values.incrementalTranslation !== undefined && this.elements.incrementalTranslation) {
            this.elements.incrementalTranslation.checked = values.incrementalTranslation;
        }
    }

    // 獲取當前狀態
    getState() {
        return {
            isInPresentationMode: this.isInPresentationMode,
            settingsVisible: this.settingsVisible,
            controlsExpanded: this.controlsExpanded,
            currentFontSize: this.currentFontSize
        };
    }

    // 銷毀
    destroy() {
        if (this.autoCollapseTimer) {
            clearTimeout(this.autoCollapseTimer);
        }
        
        // 清理事件監聽器（如果需要的話）
        this.elements = {};
    }
}

// 導出模組
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UIManager;
} else {
    window.UIManager = UIManager;
}