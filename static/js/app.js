/**
 * 即時翻譯系統主控制器
 * Real-time Translation System Main Controller
 */

class RealTimeTranslator {
    constructor() {
        // 初始化組件
        this.ui = new UIManager();
        this.translationService = new TranslationService();
        this.webSpeechRecognition = new WebSpeechRecognition();
        this.whisperRecognition = new WhisperRecognition();
        
        // 當前狀態
        this.currentRecognitionEngine = 'webspeech';
        this.isRecording = false;
        this.transcriptHistory = [];
        this.currentTranscriptId = 0;
        this.totalWordCount = 0;
        this.wakeLock = null;
        
        // 初始化
        this.initialize();
    }

    // 初始化系統
    async initialize() {
        try {
            // 設置事件監聽器
            this.setupEventListeners();
            
            // 設置語音識別回調
            this.setupRecognitionCallbacks();
            
            // 初始化 Wake Lock
            await this.initializeWakeLock();
            
            // 載入保存的設置
            this.loadSettings();
            
            console.log('✅ 即時翻譯系統初始化完成');
            
        } catch (error) {
            console.error('❌ 系統初始化失敗:', error);
            this.ui.updateCurrentText('❌ 系統初始化失敗，請重新載入頁面');
        }
    }

    // 設置事件監聽器
    setupEventListeners() {
        // 錄音按鈕
        this.ui.elements.recordBtn?.addEventListener('click', async () => {
            await this.toggleRecording();
        });

        // 語言切換
        this.ui.elements.sourceLanguage?.addEventListener('change', () => {
            this.handleLanguageChange();
        });

        // API Key 輸入
        this.ui.elements.apiKey?.addEventListener('input', (e) => {
            const apiKey = e.target.value.trim();
            this.translationService.setApiKey(apiKey);
            this.whisperRecognition.setApiKey(apiKey);
            this.saveSettings();
        });

        // 識別引擎切換
        this.ui.elements.recognitionEngine?.addEventListener('change', () => {
            this.handleRecognitionEngineChange();
        });

        // 置信度閾值
        this.ui.elements.confidenceThreshold?.addEventListener('input', (e) => {
            const threshold = parseFloat(e.target.value);
            this.webSpeechRecognition.setConfidenceThreshold(threshold);
            this.saveSettings();
        });

        // 噪音抑制
        this.ui.elements.advancedNoiseSuppression?.addEventListener('change', (e) => {
            this.webSpeechRecognition.setNoiseSuppression(e.target.checked);
            this.saveSettings();
        });

        // 鍵盤快捷鍵
        document.addEventListener('keydown', async (e) => {
            if (e.code === 'Space' && e.ctrlKey) {
                e.preventDefault();
                await this.toggleRecording();
            }
        });

        // 頁面關閉前處理
        window.addEventListener('beforeunload', () => {
            this.cleanup();
        });
    }

    // 設置語音識別回調
    setupRecognitionCallbacks() {
        // Web Speech Recognition 回調
        this.webSpeechRecognition.onResult = (result) => {
            this.handleRecognitionResult(result);
        };

        this.webSpeechRecognition.onError = (error) => {
            this.ui.updateCurrentText(`❌ 語音識別錯誤: ${error}`);
        };

        this.webSpeechRecognition.onStart = () => {
            this.ui.updateCurrentText('🎤 語音識別已啟動...');
        };

        this.webSpeechRecognition.onEnd = () => {
            if (!this.isRecording) {
                this.ui.updateCurrentText('⏹️ 語音識別已停止');
            }
        };

        this.webSpeechRecognition.onStatusChange = (status) => {
            this.handleStatusChange('webspeech', status);
        };

        // Whisper Recognition 回調
        this.whisperRecognition.onResult = (result) => {
            this.handleRecognitionResult(result);
        };

        this.whisperRecognition.onError = (error) => {
            this.ui.updateCurrentText(`❌ Whisper 錯誤: ${error}`);
        };

        this.whisperRecognition.onStart = () => {
            this.ui.updateCurrentText('📡 Whisper 錄音已啟動...');
        };

        this.whisperRecognition.onEnd = () => {
            if (!this.isRecording) {
                this.ui.updateCurrentText('⏹️ Whisper 錄音已停止');
            }
        };

        this.whisperRecognition.onStatusChange = (status, data) => {
            this.handleStatusChange('whisper', status, data);
        };

        this.whisperRecognition.onAudioLevel = (level) => {
            this.handleAudioLevel(level);
        };
    }

    // 處理識別結果
    handleRecognitionResult(result) {
        if (!result.isFinal || !result.transcript || result.transcript.length < 2) {
            return;
        }

        console.log('收到識別結果:', result);

        // 更新置信度指示器
        if (result.confidence) {
            this.ui.updateConfidenceIndicator(result.confidence);
        }

        // 處理翻譯
        this.processTranscriptForTranslation(result.transcript, result.confidence);
    }

    // 處理轉錄結果進行翻譯
    async processTranscriptForTranslation(transcript, confidence = 0.9) {
        if (!transcript || transcript.trim().length < 2) return;

        try {
            // 增加字數統計
            this.totalWordCount += transcript.length;
            this.ui.updateWordCount(this.totalWordCount);

            // 添加到歷史記錄
            const transcriptItem = {
                id: this.currentTranscriptId++,
                original: transcript,
                timestamp: new Date().toLocaleTimeString('zh-TW', { 
                    hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' 
                }),
                confidence: confidence
            };

            this.transcriptHistory.push(transcriptItem);

            // 執行翻譯
            await this.translateAndDisplay(transcript, transcriptItem);

        } catch (error) {
            console.error('處理轉錄結果時發生錯誤:', error);
        }
    }

    // 翻譯並顯示結果
    async translateAndDisplay(originalText, transcriptItem) {
        const formValues = this.ui.getFormValues();

        try {
            // 先顯示臨時翻譯狀態（不覆蓋正在進行的其他翻譯）
            if (!this.hasActiveTemporaryTranslation()) {
                this.ui.updateCurrentText(`🎤 ${originalText}`);
            }

            // 顯示翻譯進行中狀態
            this.ui.updateCurrentText(`🔄 翻譯中: ${originalText}`);

            // 執行翻譯
            const translationResult = await this.translationService.translateText(
                originalText,
                formValues.targetLanguage,
                formValues.sourceLanguage
            );

            if (translationResult.success) {
                const translatedText = translationResult.translation;

                // 更新轉錄項目
                transcriptItem.translated = translatedText;

                // 添加到UI
                this.ui.addTranscriptItem({
                    original: originalText,
                    translated: translatedText,
                    timestamp: transcriptItem.timestamp
                });

                // 顯示翻譯結果
                this.ui.updateCurrentText(`✅ ${translatedText}`);

                console.log(`翻譯完成: ${originalText} → ${translatedText}`);

            } else {
                console.error('翻譯失敗:', translationResult.error);
                this.ui.updateCurrentText(`❌ 翻譯失敗: ${translationResult.error}`);
            }

        } catch (error) {
            console.error('翻譯過程中出現錯誤:', error);
            this.ui.updateCurrentText(`❌ 翻譯錯誤: ${error.message}`);
        }
    }

    // 處理狀態變化
    handleStatusChange(engine, status, data) {
        switch (status) {
            case 'active':
                // 只有在沒有臨時翻譯時才更新
                if (!this.hasActiveTemporaryTranslation()) {
                    this.ui.updateCurrentText('🎤 語音識別中...');
                }
                break;
            case 'processing':
                if (engine === 'whisper' && data) {
                    const info = `回應時間: ${data.responseTime}ms | 音量: ${Math.round(data.audioLevel)} | 累積: ${data.accumulatedLength}字`;
                    // 不覆蓋臨時翻譯，改為更新語音識別狀態
                    this.updateRecognitionStatus(`
                        <div style="color: #17a2b8;">
                            🎤 ${data.text}
                            <div style="font-size: 12px; color: #6c757d; margin-top: 5px;">
                                ${info}
                            </div>
                        </div>
                    `);
                }
                break;
            case 'recording':
                if (!this.hasActiveTemporaryTranslation()) {
                    this.ui.updateCurrentText('📡 Whisper 錄音中...');
                }
                break;
            case 'stopped':
                if (!this.hasActiveTemporaryTranslation()) {
                    this.ui.updateCurrentText('⏹️ 錄音已停止');
                }
                break;
            case 'error':
                this.ui.updateCurrentText('❌ 識別錯誤');
                break;
        }
    }

    // 檢查是否有活躍的臨時翻譯
    hasActiveTemporaryTranslation() {
        // 檢查是否正在顯示臨時翻譯（包含"🔄"符號的翻譯）
        const currentTextElement = document.getElementById('currentText');
        if (!currentTextElement) return false;
        
        const currentContent = currentTextElement.innerHTML;
        return currentContent.includes('🔄') || currentContent.includes('翻譯中');
    }

    // 更新語音識別狀態（不覆蓋臨時翻譯）
    updateRecognitionStatus(statusContent) {
        // 如果有臨時翻譯正在顯示，將狀態信息以小字體形式附加
        if (this.hasActiveTemporaryTranslation()) {
            const currentTextElement = document.getElementById('currentText');
            if (currentTextElement) {
                // 在當前臨時翻譯下方添加狀態信息
                const existingContent = currentTextElement.innerHTML;
                const statusDiv = `<div style="font-size: 10px; color: #6c757d; margin-top: 8px; border-top: 1px solid #eee; padding-top: 4px;">${statusContent}</div>`;
                
                // 移除舊的狀態信息（如果存在）
                const cleanContent = existingContent.replace(/<div style="font-size: 10px;[^>]*>.*?<\/div>/g, '');
                currentTextElement.innerHTML = cleanContent + statusDiv;
            }
        } else {
            // 沒有臨時翻譯時直接更新
            this.ui.updateCurrentText(statusContent);
        }
    }

    // 處理音量等級
    handleAudioLevel(level) {
        const percentage = Math.min(100, (level / 100) * 100);
        const color = level > 30 ? '#28a745' : '#dc3545';
        
        // 不覆蓋臨時翻譯，使用狀態更新方法
        const audioStatus = `
            <div style="color: #17a2b8;">📡 Whisper模式 - 音量: ${Math.round(level)}
                <div style="background: #f0f0f0; height: 8px; border-radius: 4px; margin: 5px 0;">
                    <div style="background: ${color}; height: 100%; width: ${percentage}%; border-radius: 4px; transition: all 0.1s;"></div>
                </div>
            </div>
        `;
        this.updateRecognitionStatus(audioStatus);
    }

    // 切換錄音
    async toggleRecording() {
        if (this.isRecording) {
            this.stopRecording();
        } else {
            await this.startRecording();
        }
    }

    // 開始錄音
    async startRecording() {
        try {
            let success = false;

            if (this.currentRecognitionEngine === 'whisper') {
                // 檢查API Key
                const formValues = this.ui.getFormValues();
                if (!formValues.apiKey) {
                    this.ui.updateCurrentText('❌ 請先設定 OpenAI API Key');
                    return;
                }
                
                success = await this.whisperRecognition.startWhisperRecording();
            } else {
                success = await this.webSpeechRecognition.startRecognition();
            }

            if (success) {
                this.isRecording = true;
                this.ui.updateRecordButton(true);
                console.log(`${this.currentRecognitionEngine} 錄音已開始`);
            } else {
                this.ui.updateCurrentText(`❌ 無法啟動 ${this.currentRecognitionEngine} 錄音`);
            }

        } catch (error) {
            console.error('啟動錄音失敗:', error);
            this.ui.updateCurrentText(`❌ 錄音啟動失敗: ${error.message}`);
        }
    }

    // 停止錄音
    stopRecording() {
        if (this.currentRecognitionEngine === 'whisper') {
            this.whisperRecognition.stopWhisperRecording();
        } else {
            this.webSpeechRecognition.stopRecording();
        }

        this.isRecording = false;
        this.ui.updateRecordButton(false);
        console.log(`${this.currentRecognitionEngine} 錄音已停止`);
    }

    // 處理識別引擎變更
    handleRecognitionEngineChange() {
        const formValues = this.ui.getFormValues();
        const newEngine = formValues.recognitionEngine;

        // 停止現有錄音
        if (this.isRecording) {
            this.stopRecording();
        }

        this.currentRecognitionEngine = newEngine;

        // 更新引擎狀態
        this.updateEngineStatus(newEngine);

        // 同步設置
        this.syncEngineSettings();

        this.saveSettings();
        console.log(`切換識別引擎至: ${newEngine}`);
    }

    // 更新引擎狀態提示
    updateEngineStatus(engine) {
        if (engine === 'whisper') {
            this.ui.updateCurrentText('<div style="color: #17a2b8;">📡 Whisper模式：點擊開始錄音，每1.5秒上傳一次進行識別</div>');
            this.ui.updateRecordButton(false, '🎤 開始 Whisper 錄音');
        } else {
            this.ui.updateCurrentText('<div style="color: #28a745;">🎤 Web Speech模式：瀏覽器即時語音識別</div>');
            this.ui.updateRecordButton(false, '🎤 開始會議模式');
        }
    }

    // 同步引擎設置
    syncEngineSettings() {
        const formValues = this.ui.getFormValues();

        // 設置語言
        if (this.currentRecognitionEngine === 'whisper') {
            this.whisperRecognition.setLanguage(formValues.sourceLanguage);
        } else {
            this.webSpeechRecognition.setLanguage(formValues.sourceLanguage);
        }
    }

    // 處理語言變更
    handleLanguageChange() {
        const formValues = this.ui.getFormValues();
        
        if (this.currentRecognitionEngine === 'whisper') {
            this.whisperRecognition.setLanguage(formValues.sourceLanguage);
        } else {
            this.webSpeechRecognition.setLanguage(formValues.sourceLanguage);
        }

        this.saveSettings();
    }

    // 初始化 Wake Lock
    async initializeWakeLock() {
        if ('wakeLock' in navigator) {
            try {
                this.wakeLock = await navigator.wakeLock.request('screen');
                console.log('✅ 屏幕保持喚醒已啟用');
                
                document.addEventListener('visibilitychange', async () => {
                    if (this.wakeLock !== null && document.visibilityState === 'visible') {
                        this.wakeLock = await navigator.wakeLock.request('screen');
                    }
                });
            } catch (err) {
                console.warn('Wake Lock 不可用:', err);
            }
        }
    }

    // 載入設置
    loadSettings() {
        const settings = this.getStoredSettings('translatorSettings', {});
        
        if (Object.keys(settings).length > 0) {
            this.ui.setFormValues(settings);
            
            // 同步到服務
            if (settings.apiKey) {
                this.translationService.setApiKey(settings.apiKey);
                this.whisperRecognition.setApiKey(settings.apiKey);
            }
            
            if (settings.recognitionEngine) {
                this.currentRecognitionEngine = settings.recognitionEngine;
                this.updateEngineStatus(settings.recognitionEngine);
            }
            
            // 初始化按鈕狀態
            this.updateEngineStatus(this.currentRecognitionEngine);
        }
    }

    // 保存設置
    saveSettings() {
        const settings = this.ui.getFormValues();
        settings.recognitionEngine = this.currentRecognitionEngine;
        this.setStoredSettings('translatorSettings', settings);
    }

    // 本地存儲方法
    getStoredSettings(key, defaultValue = {}) {
        try {
            const value = localStorage.getItem(key);
            return value ? JSON.parse(value) : defaultValue;
        } catch (error) {
            console.warn('LocalStorage get error:', error);
            return defaultValue;
        }
    }

    setStoredSettings(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (error) {
            console.warn('LocalStorage set error:', error);
            return false;
        }
    }

    // 清理資源
    cleanup() {
        this.stopRecording();
        
        if (this.wakeLock) {
            this.wakeLock.release();
        }

        // 銷毀組件
        this.webSpeechRecognition.destroy();
        this.whisperRecognition.destroy();
        this.translationService.destroy();
        this.ui.destroy();
    }

    // 獲取系統狀態
    getSystemStatus() {
        return {
            isRecording: this.isRecording,
            currentEngine: this.currentRecognitionEngine,
            webSpeechStatus: this.webSpeechRecognition.getStatus(),
            whisperStatus: this.whisperRecognition.getStatus(),
            translationStats: this.translationService.getCacheStats(),
            uiState: this.ui.getState(),
            totalWordCount: this.totalWordCount,
            historyCount: this.transcriptHistory.length
        };
    }
}

// 全局初始化
let translator = null;

document.addEventListener('DOMContentLoaded', () => {
    translator = new RealTimeTranslator();
    window.translator = translator; // 用於調試
});

// 導出（如果是模組環境）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = RealTimeTranslator;
}