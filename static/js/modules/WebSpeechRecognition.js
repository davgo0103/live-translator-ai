/**
 * Web Speech API 語音識別模組
 * Web Speech Recognition Module
 */

class WebSpeechRecognition {
    constructor() {
        this.recognition = null;
        this.isRecording = false;
        this.continuousMode = true;
        this.lastTranslationTime = 0;
        this.recognitionTimeout = null;
        this.recognitionRetryCount = 0;
        this.maxRecognitionRetries = 999;
        this.recognitionRestartDelay = 500; // 增加延遲到 500ms
        this.isRecognitionActive = false;
        this.lastSpeechTime = 0;
        this.silenceTimeout = null;
        this.recognitionStartTime = 0;
        this.meetingKeepAlive = null;
        this.recognitionKeepAliveInterval = null;
        this.isRestarting = false; // 新增重啟狀態標記
        
        // 回調函數
        this.onResult = null;
        this.onError = null;
        this.onStart = null;
        this.onEnd = null;
        this.onStatusChange = null;
        
        // 語言設置
        this.sourceLanguage = 'auto';
        this.autoDetectLanguages = ['zh-TW', 'en-US'];
        this.currentLanguageIndex = 0;
        
        // 噪音控制
        this.advancedNoiseSuppression = true;
        this.confidenceThreshold = 0.5;
        
        this.initSpeechRecognition();
    }

    // 初始化語音識別
    async initSpeechRecognition() {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            const error = '瀏覽器不支援語音識別功能';
            console.error(error);
            if (this.onError) {
                this.onError(error);
            }
            return false;
        }

        try {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            this.recognition = new SpeechRecognition();
            
            this.setupRecognitionSettings();
            this.bindRecognitionEvents();
            
            return true;
        } catch (error) {
            console.error('語音識別初始化失敗:', error);
            if (this.onError) {
                this.onError(error.message);
            }
            return false;
        }
    }

    // 設置識別參數
    setupRecognitionSettings() {
        if (!this.recognition) return;

        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.maxAlternatives = 3;

        // 設置語法提示（如果支持）
        if ('grammars' in this.recognition) {
            const grammar = '#JSGF V1.0; grammar meeting; public <meeting> = 會議 | 翻譯 | 議程 | 報告 | 討論;';
            const speechRecognitionList = new webkitSpeechGrammarList();
            speechRecognitionList.addFromString(grammar, 1);
            this.recognition.grammars = speechRecognitionList;
            this.recognition.interimResults = true;
            this.recognition.continuous = true;
        }
        
        this.setRecognitionLanguage();
    }

    // 綁定識別事件
    bindRecognitionEvents() {
        if (!this.recognition) return;

        this.recognition.onstart = () => {
            this.isRecognitionActive = true;
            this.recognitionStartTime = Date.now();
            
            if (this.recognitionRetryCount > 0) {
                console.log(`語音識別重啟成功 (重試次數: ${this.recognitionRetryCount})`);
                this.recognitionRetryCount = 0;
            }
            
            this.startKeepAlive();
            
            if (this.onStart) {
                this.onStart();
            }
            
            if (this.onStatusChange) {
                this.onStatusChange('active');
            }
        };

        this.recognition.onend = () => {
            this.isRecognitionActive = false;
            const sessionDuration = Date.now() - this.recognitionStartTime;
            
            console.log(`🎤 語音識別結束，持續時間: ${sessionDuration}ms`);

            // 簡化重啟邏輯：只有在正常錄音狀態且沒有正在重啟時才重啟
            if (this.isRecording && this.continuousMode && !this.isRestarting) {
                console.log(`🔄 會議模式：立即重啟語音識別以保持連續性`);
                this.scheduleRestart();
            } else {
                this.isRestarting = false; // 清除重啟標記
            }
            
            if (this.onEnd) {
                this.onEnd();
            }
        };

        this.recognition.onerror = (event) => {
            const errorType = event.error;
            
            // 根據錯誤類型決定處理方式
            if (errorType === 'aborted') {
                // aborted 錯誤是正常重啟過程，不需要特殊處理
                console.log('語音識別被中止');
                return; // 直接返回，不進行任何額外處理
            }
            
            console.error('語音識別錯誤:', errorType);
            
            const errorMessages = {
                'network': '網路連接錯誤，請檢查網路設定',
                'not-allowed': '麥克風權限被拒絕，請允許存取麥克風',
                'service-not-allowed': '語音識別服務不可用',
                'bad-grammar': '語法錯誤',
                'language-not-supported': '不支援的語言',
                'no-speech': '沒有檢測到語音輸入',
                'audio-capture': '無法捕獲音頻'
            };
            
            const message = errorMessages[errorType] || `未知錯誤: ${errorType}`;
            
            if (this.onStatusChange) {
                this.onStatusChange('error');
            }
            
            if (this.onError) {
                this.onError(message);
            }
            
            // 只對嚴重錯誤進行重啟，且增加延遲
            if (['network', 'audio-capture'].includes(errorType)) {
                if (this.isRecording && !this.isRestarting) {
                    console.log(`因 ${errorType} 錯誤準備重啟語音識別...`);
                    this.scheduleRestart(2000); // 2秒延遲
                }
            }
        };

        this.recognition.onresult = (event) => {
            this.handleRecognitionResult(event);
        };
    }

    // 處理識別結果
    handleRecognitionResult(event) {
        if (!event.results) return;

        for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i];
            const transcript = result[0].transcript;
            const confidence = result[0].confidence || 0;
            const isFinal = result.isFinal;
            
            // 應用置信度閾值
            if (confidence > 0 && confidence < this.confidenceThreshold && isFinal) {
                console.log(`低置信度結果已跳過: ${transcript} (置信度: ${confidence.toFixed(2)})`);
                continue;
            }
            
            // 更新最後語音時間
            this.lastSpeechTime = Date.now();
            
            // 調用結果回調
            if (this.onResult) {
                this.onResult({
                    transcript: transcript.trim(),
                    confidence,
                    isFinal,
                    timestamp: this.lastSpeechTime
                });
            }
            
            if (this.onStatusChange) {
                this.onStatusChange('processing');
            }
        }
    }

    // 設置識別語言
    setRecognitionLanguage() {
        if (!this.recognition) return;

        if (this.sourceLanguage === 'auto') {
            const currentLang = this.autoDetectLanguages[this.currentLanguageIndex];
            this.recognition.lang = currentLang;
            console.log(`自動語言檢測設定為: ${currentLang}`);
        } else {
            this.recognition.lang = this.sourceLanguage;
            console.log(`語音識別語言設定為: ${this.sourceLanguage}`);
        }

        // 根據語言調整參數
        if (this.recognition.lang.startsWith('zh')) {
            this.recognition.maxAlternatives = 5;
        } else if (this.recognition.lang.startsWith('en')) {
            this.recognition.maxAlternatives = 5;
        }
        
        // 確保連續模式
        if (this.recognition.continuous) {
            console.log('✓ 連續識別模式已啟用');
        }
    }

    // 開始識別
    async startRecognition() {
        if (!this.recognition || !this.continuousMode) return false;

        try {
            // 檢查是否已經在重啟中，避免重複啟動
            if (this.isRecognitionActive && !this.isRestarting) {
                console.log('語音識別已啟動，先停止現有識別...');
                this.recognition.stop();
                await new Promise(resolve => setTimeout(resolve, 200));
            }

            console.log('正在啟動語音識別...');
            this.recognition.start();
            this.isRecording = true;
            
            if (this.onStatusChange) {
                this.onStatusChange('starting');
            }
            
            return true;
        } catch (error) {
            console.error('無法啟動語音識別:', error);
            this.isRestarting = false; // 啟動失敗時清除重啟標記
            if (this.onError) {
                this.onError(error.message);
            }
            return false;
        }
    }

    // 停止識別
    stopRecording() {
        console.log('停止語音識別...');
        
        if (this.recognition && this.isRecognitionActive) {
            this.recognition.stop();
        }

        this.isRecording = false;
        this.isRestarting = false; // 清除重啟標記
        this.stopKeepAlive();
        this.recognitionRetryCount = 0;
        
        if (this.onStatusChange) {
            this.onStatusChange('stopped');
        }
        
        console.log('語音識別已停止');
    }

    // 統一重啟調度方法
    scheduleRestart(delay = 500) {
        if (this.isRestarting) {
            console.log('重啟已在進行中，跳過此次重啟請求');
            return;
        }
        
        this.isRestarting = true;
        console.log(`正在啟動語音識別...`);
        
        setTimeout(() => {
            if (this.isRecording && this.isRestarting) {
                this.isRestarting = false;
                this.startRecognition();
            } else {
                this.isRestarting = false;
            }
        }, delay);
    }

    // 開始保活機制（延長保活時間以減少重啟頻率）
    startKeepAlive() {
        this.stopKeepAlive();

        this.recognitionKeepAliveInterval = setInterval(() => {
            if (this.isRecognitionActive) {
                const timeSinceStart = Date.now() - this.recognitionStartTime;
                
                // 延長保活時間到 4 分鐘，減少重啟頻率
                if (timeSinceStart > 240000) {
                    console.log('語音識別保活觸發，重新啟動...');
                    this.scheduleRestart();
                }
            }
        }, 230000); // 檢查間隔也延長到 3.8 分鐘
    }

    // 停止保活機制
    stopKeepAlive() {
        if (this.recognitionKeepAliveInterval) {
            clearInterval(this.recognitionKeepAliveInterval);
            this.recognitionKeepAliveInterval = null;
        }
    }

    // 設置語言
    setLanguage(language) {
        this.sourceLanguage = language;
        this.setRecognitionLanguage();
        
        if (this.continuousMode && this.isRecording) {
            this.recognition.stop();
            setTimeout(() => {
                this.startRecognition();
            }, 500);
        }
    }

    // 設置置信度閾值
    setConfidenceThreshold(threshold) {
        this.confidenceThreshold = Math.max(0.1, Math.min(0.9, threshold));
    }

    // 設置噪音抑制
    setNoiseSuppression(enabled) {
        this.advancedNoiseSuppression = enabled;
    }

    // 切換語言檢測
    switchLanguageDetection() {
        if (this.sourceLanguage === 'auto') {
            this.currentLanguageIndex = (this.currentLanguageIndex + 1) % this.autoDetectLanguages.length;
            this.setRecognitionLanguage();
        }
    }

    // 獲取狀態
    getStatus() {
        return {
            isRecording: this.isRecording,
            isActive: this.isRecognitionActive,
            isRestarting: this.isRestarting,
            language: this.recognition ? this.recognition.lang : 'unknown',
            retryCount: this.recognitionRetryCount,
            confidenceThreshold: this.confidenceThreshold
        };
    }

    // 銷毀
    destroy() {
        this.stopRecording();
        this.stopKeepAlive();
        
        if (this.recognition) {
            this.recognition.onstart = null;
            this.recognition.onend = null;
            this.recognition.onerror = null;
            this.recognition.onresult = null;
        }
        
        this.recognition = null;
    }
}

// 導出模組
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WebSpeechRecognition;
} else {
    window.WebSpeechRecognition = WebSpeechRecognition;
}