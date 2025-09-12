class RealTimeTranslator {
    constructor() {
        this.recognition = null;
        this.isRecording = false;
        this.apiKey = '';
        this.continuousMode = true;
        this.lastTranslationTime = 0;
        this.recognitionTimeout = null;
        this.transcriptHistory = [];
        this.currentTranscriptId = 0;
        this.totalWordCount = 0;
        this.autoDetectLanguages = ['zh-TW', 'en-US'];
        this.currentLanguageIndex = 0;
        this.presentationMaxItems = 5;
        this.maxTextLength = 800; // 最大文字長度
        this.currentOriginalText = ''; // 當前原文累積文字
        this.currentTranslatedText = ''; // 當前翻譯累積文字
        
        // 翻譯請求管理
        this.activeTranslationRequests = 0;
        this.maxConcurrentTranslations = 3; // 最多同時進行3個翻譯請求
        
        // 語音識別重啟保護和狀態管理
        this.recognitionRetryCount = 0;
        this.maxRecognitionRetries = 999; // 會議模式需要無限重試保持連續
        this.recognitionRestartDelay = 100; // 更快速重啟，減少斷線時間
        this.isRecognitionActive = false;
        this.lastSpeechTime = 0;
        this.silenceTimeout = null;
        this.recognitionStartTime = 0;
        this.meetingKeepAlive = null;
        this.recognitionKeepAliveInterval = null; // 語音識別保活定時器
        
        // 句子邊界檢測相關
        this.pendingOriginalText = ''; // 待處理的原文
        this.pendingTranslationText = ''; // 待處理的翻譯文字
        
        // Whisper 相關屬性
        this.currentRecognitionEngine = 'webspeech'; // 'webspeech' 或 'whisper'
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.whisperRecordingInterval = null;
        this.whisperRecordingDuration = 1500; // 改為1.5秒片段，提高即時性
        this.isWhisperRecording = false;
        this.audioStream = null;
        this.audioContext = null;
        this.analyser = null;
        this.lastAudioLevel = 0;
        this.silenceThreshold = 30; // 音量低於此值視為靜音
        this.whisperResponseTimes = []; // 記錄回應時間
        this.whisperAccumulatedText = ''; // Whisper累積文字
        this.lastWhisperText = ''; // 上一次的Whisper結果
        this.whisperSentenceBuffer = []; // Whisper句子緩衝區
        
        this.initElements();
        this.setupNoiseControlListeners();
        this.initializeConfidenceDisplay();
        this.initSpeechRecognition();
        this.bindEvents();
        this.startContinuousRecording();
        
        // 啟用 Wake Lock 防止整個網頁休眠
        this.initializeWakeLock();
    }

    // XSS防護：安全文本清理函數
    // 安全地設置HTML內容，允許基本格式化但防止XSS
    safeSetHTML(element, content) {
        if (!element) return;
        
        // 如果內容包含HTML標籤，進行清理
        if (typeof content === 'string' && /<[^>]*>/.test(content)) {
            // 只允許安全的HTML標籤
            const allowedTags = ['br', 'span'];
            const sanitizedContent = content.replace(/<(?!\/?(?:br|span)\b)[^>]*>/gi, '');
            
            // 進一步清理屬性，只允許基本樣式
            const cleanContent = sanitizedContent.replace(
                /<span\s+([^>]*)>/gi, 
                (match, attrs) => {
                    // 只允許style屬性，並且只允許安全的樣式
                    const styleMatch = attrs.match(/style\s*=\s*["']([^"']*)["']/i);
                    if (styleMatch) {
                        // 檢查每個樣式屬性是否安全
                        const styles = styleMatch[1].split(';').map(s => s.trim()).filter(s => s);
                        const allowedStyles = [];
                        
                        for (const style of styles) {
                            // 簡化的樣式匹配
                            if (style.startsWith('opacity:') ||
                                style.startsWith('font-style: italic') ||
                                style.startsWith('color: #') ||
                                style.startsWith('background: rgba') ||
                                style.startsWith('padding: ') ||
                                style.startsWith('border-radius: ') ||
                                style.startsWith('margin-left: ') ||
                                style.startsWith('animation: ')) {
                                allowedStyles.push(style);
                            } else {
                            }
                        }
                        
                        if (allowedStyles.length > 0) {
                            const finalStyle = `<span style="${allowedStyles.join('; ')}">`;
                            return finalStyle;
                        } else {
                            console.log(`樣式被過濾掉: "${styleMatch[1]}"`);
                        }
                    }
                    return '<span>';
                }
            );
            
            element.innerHTML = cleanContent;
        } else {
            // 純文本內容
            element.textContent = content || '';
        }
    }

    // API Key 安全存儲機制
    encryptApiKey(apiKey) {
        // 簡單的混淆加密（避免明文存儲）
        const key = 'translatorApp2024';
        let encrypted = '';
        for (let i = 0; i < apiKey.length; i++) {
            const char = apiKey.charCodeAt(i);
            const keyChar = key.charCodeAt(i % key.length);
            encrypted += String.fromCharCode(char ^ keyChar);
        }
        // Base64編碼進一步混淆
        return btoa(encrypted);
    }

    decryptApiKey(encryptedApiKey) {
        try {
            // Base64解碼
            const encrypted = atob(encryptedApiKey);
            const key = 'translatorApp2024';
            let decrypted = '';
            for (let i = 0; i < encrypted.length; i++) {
                const char = encrypted.charCodeAt(i);
                const keyChar = key.charCodeAt(i % key.length);
                decrypted += String.fromCharCode(char ^ keyChar);
            }
            return decrypted;
        } catch (error) {
            console.error('API Key 解密失敗:', error);
            return null;
        }
    }

    secureSetApiKey(apiKey) {
        if (!apiKey) return;
        
        // 加密存儲
        const encrypted = this.encryptApiKey(apiKey);
        const timestamp = Date.now();
        
        // 存儲加密的API Key和時間戳
        sessionStorage.setItem('enc_api_key', encrypted);
        sessionStorage.setItem('api_key_timestamp', timestamp.toString());
        
        // 設置24小時過期
        setTimeout(() => {
            this.clearStoredApiKey();
        }, 24 * 60 * 60 * 1000);
    }

    secureGetApiKey() {
        try {
            const encrypted = sessionStorage.getItem('enc_api_key');
            const timestamp = sessionStorage.getItem('api_key_timestamp');
            
            if (!encrypted || !timestamp) return null;
            
            // 檢查是否過期（24小時）
            const age = Date.now() - parseInt(timestamp);
            const maxAge = 24 * 60 * 60 * 1000; // 24小時
            
            if (age > maxAge) {
                this.clearStoredApiKey();
                return null;
            }
            
            return this.decryptApiKey(encrypted);
        } catch (error) {
            console.error('獲取 API Key 時發生錯誤:', error);
            this.clearStoredApiKey();
            return null;
        }
    }

    clearStoredApiKey() {
        sessionStorage.removeItem('enc_api_key');
        sessionStorage.removeItem('api_key_timestamp');
        // 清除舊的localStorage存儲（向後兼容）
        localStorage.removeItem('openai_api_key');
    }

    trackSpeechActivity() {
        // 記錄語音活動時間
        this.lastSpeechTime = Date.now();
        
        // 成功的語音識別後重置重試計數
        if (this.recognitionRetryCount > 0) {
            console.log('語音活動檢測到，重置重試計數');
            this.recognitionRetryCount = 0;
        }
    }

    // 專門用於簡報模式臨時翻譯的安全HTML設置
    setPresentationHTML(element, content) {
        if (!element) return;
        
        // 對於簡報模式的臨時翻譯，我們可以放寬限制，因為內容是我們控制的
        // 只允許我們特定的span樣式模式
        const allowedHTML = content.replace(
            /<span style="([^"]*)">/g,
            (match, style) => {
                // 檢查是否是我們的臨時翻譯樣式
                if (style.includes('background: rgba') && style.includes('border-radius: 3px')) {
                    return match; // 保持原樣
                }
                return '<span>'; // 移除樣式
            }
        );
        
        element.innerHTML = allowedHTML;
        console.log(`簡報HTML設置: ${allowedHTML}`);
    }

    // 動態更新簡報模式的臨時翻譯內容（不重建整個顯示）
    updateInterimTranslationContent(translationText) {
        if (!this.isPresentationMode || !this.translatedWrapper) return;
        
        // 尋找臨時翻譯的span元素
        const interimSpan = this.translatedWrapper.querySelector('#interim-translation');
        if (interimSpan) {
            // 直接更新內容，保持樣式和位置
            const newContent = translationText && translationText.trim() ? translationText : this.getStatusText('translating');
            interimSpan.textContent = newContent;
            console.log('動態更新臨時翻譯:', newContent);
        } else {
            // 如果沒有找到臨時翻譯span，則正常更新整個顯示
            console.log('未找到臨時翻譯容器，使用完整更新');
            this.updatePresentationLiveText('', '');
        }
    }

    // 平滑完成臨時翻譯 - 解決快速語音時翻譯消失的問題
    completeInterimTranslation(finalText) {
        // 簡報模式的處理
        if (this.isPresentationMode && this.translatedWrapper) {
            this.completeInterimTranslationPresentationMode(finalText);
        }
        
        // 正常模式的處理 - 清理臨時翻譯標記
        this.completeInterimTranslationNormalMode(finalText);
    }
    
    completeInterimTranslationPresentationMode(finalText) {
        
        // 防止重複處理
        if (this.isCompletingTranslation) {
            console.log('翻譯完成中，跳過重複處理');
            return;
        }
        
        // 清除之前的擱置計時器
        if (this.pendingTranslationTimeout) {
            clearTimeout(this.pendingTranslationTimeout);
            this.pendingTranslationTimeout = null;
        }
        
        const interimSpan = this.translatedWrapper.querySelector('#interim-translation');
        if (interimSpan && finalText && finalText.trim()) {
            this.isCompletingTranslation = true;
            
            // 立即更新為最終翻譯結果，不做動畫以避免消失
            interimSpan.textContent = finalText;
            interimSpan.style.opacity = '1';
            interimSpan.style.fontStyle = 'normal'; // 移除斜體樣式
            interimSpan.style.background = 'transparent'; // 移除背景色
            
            // 增加延遲時間，讓用戶看到完整翻譯
            this.pendingTranslationTimeout = setTimeout(() => {
                if (interimSpan && interimSpan.parentNode) {
                    // 只移除臨時元素，不手動添加到文字流（由 updateTranscriptTranslation 處理）
                    interimSpan.remove();
                    console.log('臨時翻譯元素已移除:', finalText);
                }
                this.isCompletingTranslation = false;
                // 清除臨時翻譯狀態
                this.currentIncrementalTranslation = '';
            }, 300); // 減少延遲時間
        } else if (interimSpan && (!finalText || !finalText.trim())) {
            // 如果沒有翻譯結果，直接移除臨時元素
            if (interimSpan.parentNode) {
                interimSpan.remove();
            }
            this.currentIncrementalTranslation = '';
            this.isCompletingTranslation = false;
        }
    }
    
    completeInterimTranslationNormalMode(finalText) {
        // 在正常模式下清理臨時翻譯標記
        if (this.currentText) {
            const currentTextContent = this.currentText.innerHTML;
            if (currentTextContent.includes('incremental-translation')) {
                // 移除增量翻譯的 span 標籤，但保留最終翻譯結果
                let cleanedContent = currentTextContent.replace(
                    /<span class="incremental-translation"[^>]*>\[.*?\]<\/span>/g, 
                    finalText && finalText.trim() ? `[${finalText}]` : ''
                );
                this.safeSetHTML(this.currentText, cleanedContent.trim());
                console.log('正常模式：清理臨時翻譯標記，保留最終結果');
            }
        }
        
        // 清除增量翻譯狀態
        this.currentIncrementalTranslation = '';
    }

    // 多語言支援：根據目標語言返回適當的狀態文字
    getStatusText(key) {
        const targetLang = this.targetLanguage ? this.targetLanguage.value : '繁體中文';
        
        const texts = {
            '繁體中文': {
                translating: '翻譯中...',
                waitingForTranslation: '等待翻譯結果...',
                waitingForSpeech: '等待語音輸入...',
                meetingStarted: '會議開始，正在等待語音輸入...',
                meetingStartedEn: 'Meeting started, waiting for voice input...',
                transcriptCleared: '字幕已清除，準備記錄新的會議內容...',
                transcriptClearedEn: 'Transcript cleared, ready to record new meeting content...'
            },
            'English': {
                translating: 'Translating...',
                waitingForTranslation: 'Waiting for translation...',
                waitingForSpeech: 'Waiting for speech input...',
                meetingStarted: 'Meeting started, waiting for voice input...',
                meetingStartedEn: '會議開始，正在等待語音輸入...',
                transcriptCleared: 'Transcript cleared, ready to record new meeting content...',
                transcriptClearedEn: '字幕已清除，準備記錄新的會議內容...'
            }
        };
        
        return texts[targetLang] && texts[targetLang][key] ? texts[targetLang][key] : texts['繁體中文'][key];
    }

    setupNoiseControlListeners() {
        // 信心度滑桿監聽器
        this.confidenceThreshold.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            this.currentConfidenceThreshold = value;
            
            let label;
            if (value <= 0.4) label = '很敏感';
            else if (value <= 0.6) label = '中等';
            else label = '很準確';
            
            this.confidenceValue.textContent = label;
            console.log(`識別敏感度已調整為: ${label} (${Math.round(value * 100)}%)`);
        });

        // 噪音抑制開關
        this.advancedNoiseSuppression.addEventListener('change', () => {
            console.log(`噪音抑制: ${this.advancedNoiseSuppression.checked ? '啟用' : '停用'}`);
        });

        // 增量翻譯開關
        this.incrementalTranslation.addEventListener('change', () => {
            const enabled = this.incrementalTranslation.checked;
            console.log(`即時增量翻譯: ${enabled ? '啟用' : '停用'}`);
            
            if (!enabled) {
                // 如果關閉增量翻譯，清理現有的增量翻譯顯示
                this.clearIncrementalTranslation();
            }
        });
    }

    initializeConfidenceDisplay() {
        // 設定預設信心度顯示
        const value = parseFloat(this.confidenceThreshold.value);
        let label;
        if (value <= 0.4) label = '很敏感';
        else if (value <= 0.6) label = '中等';
        else label = '很準確';
        
        this.confidenceValue.textContent = label;
        this.currentConfidenceThreshold = value;
    }

    selectBestAlternative(result, minConfidence = null) {
        // 選擇最佳語音識別候選結果
        const threshold = minConfidence || this.currentConfidenceThreshold;
        
        // 轉換為陣列並排序（按信心度由高到低）
        const alternatives = Array.from(result).sort((a, b) => 
            (b.confidence || 0) - (a.confidence || 0)
        );
        
        // 選擇第一個符合門檻的候選
        for (const alternative of alternatives) {
            const confidence = alternative.confidence || 1.0;
            if (confidence >= threshold) {
                return {
                    transcript: alternative.transcript,
                    confidence: confidence
                };
            }
        }
        
        // 如果沒有符合門檻的，但門檻不是最低的，嘗試較低門檻
        if (threshold > 0.3 && alternatives.length > 0) {
            const best = alternatives[0];
            const confidence = best.confidence || 1.0;
            if (confidence >= 0.3) {
                console.log(`使用較低門檻候選 (${(confidence * 100).toFixed(1)}%): ${best.transcript}`);
                return {
                    transcript: best.transcript,
                    confidence: confidence
                };
            }
        }
        
        return null;
    }


    initElements() {
        this.recordBtn = document.getElementById('recordBtn');
        this.sourceLanguage = document.getElementById('sourceLanguage');
        this.targetLanguage = document.getElementById('targetLanguage');
        this.apiKeyInput = document.getElementById('apiKey');
        this.transcriptDisplay = document.getElementById('transcriptDisplay');
        this.currentText = document.getElementById('currentText');
        this.clearBtn = document.getElementById('clearBtn');
        this.wordCount = document.getElementById('wordCount');
        
        // 簡報模式相關元素
        this.presentationBtn = document.getElementById('presentationBtn');
        this.exitPresentationBtn = document.getElementById('exitPresentationBtn');
        this.settingsToggle = document.getElementById('settingsToggle');
        this.transcriptContainer = document.getElementById('transcriptContainer');
        this.container = document.getElementById('container');
        this.header = document.getElementById('header');
        this.controls = document.getElementById('controls');
        this.apiConfig = document.getElementById('apiConfig');
        this.originalContent = document.getElementById('originalContent');
        this.translatedContent = document.getElementById('translatedContent');
        this.originalWrapper = null;
        this.translatedWrapper = null;
        this.originalPane = document.getElementById('originalPane');
        this.translatedPane = document.getElementById('translatedPane');
        
        // 噪音抑制相關控制項
        this.confidenceThreshold = document.getElementById('confidenceThreshold');
        this.confidenceValue = document.getElementById('confidenceValue');
        this.advancedNoiseSuppression = document.getElementById('advancedNoiseSuppression');
        
        // 語音識別引擎選擇器
        this.recognitionEngine = document.getElementById('recognitionEngine');
        this.incrementalTranslation = document.getElementById('incrementalTranslation');
        
        // 置信度指示器
        this.confidenceIndicator = document.getElementById('confidenceIndicator');
        this.confidenceFill = document.getElementById('confidenceFill');
        this.confidenceText = document.getElementById('confidenceText');
        
        // 簡報模式控制面板
        this.presentationControls = document.getElementById('presentationControls');
        this.controlToggle = document.getElementById('controlToggle');
        this.controlsContent = document.getElementById('controlsContent');
        this.fontIncrease = document.getElementById('fontIncrease');
        this.fontDecrease = document.getElementById('fontDecrease');
        this.fontSizeDisplay = document.getElementById('fontSizeDisplay');
        this.presentationExitBtn = document.getElementById('presentationExitBtn');
        // 根據螢幕大小設定初始字體
        this.currentFontSize = this.getInitialFontSize();
        this.controlsExpanded = false;
        
        this.isPresentationMode = false;
        this.currentConfidenceThreshold = 0.5;
        this.fastSpeechMode = false; // 快速語音模式標記
        
        // Wake Lock API 相關 - 防止手機休眠
        this.wakeLock = null;
        this.wakeLockSupported = 'wakeLock' in navigator;
        
        // 即時翻譯相關
        this.currentTranslationText = '';     // 當前正在翻譯的文字
        this.lastInterimText = '';            // 上次的臨時文字
        this.currentTranslationId = null;     // 當前翻譯的ID
        this.translationUpdateTimer = null;   // 翻譯更新計時器
        this.pendingTranslationTimeout = null; // 擱置翻譯完成計時器
        this.isCompletingTranslation = false;  // 正在完成翻譯的標記
        this.incrementalTranslationCleanupTimer = null; // 增量翻譯清理計時器
    }

    async initSpeechRecognition() {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            alert('您的瀏覽器不支援語音識別功能，請使用 Chrome 或 Edge 瀏覽器');
            return;
        }

        // 配置麥克風噪音抑制
        if (this.advancedNoiseSuppression.checked) {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true,
                        channelCount: 1,
                        sampleRate: 48000
                    }
                });
                
                stream.getTracks().forEach(track => track.stop());
                console.log('噪音抑制已啟用');
                
            } catch (error) {
                console.warn('無法配置音頻設定，使用預設配置:', error);
            }
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.recognition = new SpeechRecognition();
        
        // 優化語音識別設定 - 根據 Web Speech API 最佳實踐
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.maxAlternatives = 3; // 平衡準確度與性能
        
        // 設置較長的靜音超時以減少不必要的重啟
        if ('grammars' in this.recognition) {
            // 某些瀏覽器支援語法提示，但這裡我們保持通用
        }
        
        // 針對簡報模式優化語音識別參數
        if (this.isPresentationMode) {
            // 更頻繁的結果更新
            this.recognition.interimResults = true;
            this.recognition.continuous = true;
        }
        
        this.setRecognitionLanguage();

        this.recognition.onstart = () => {
            this.isRecording = true;
            this.isRecognitionActive = true;
            this.recognitionStartTime = Date.now();
            this.updateUI();
            console.log('語音識別已啟動');
            
            // 成功啟動時重置重試計數器
            this.recognitionRetryCount = 0;
            
            // 清空當前顯示的臨時文字
            this.safeSetHTML(this.currentText, '');
            
            // 清除任何現有的靜音超時
            if (this.silenceTimeout) {
                clearTimeout(this.silenceTimeout);
                this.silenceTimeout = null;
            }
        };

        this.recognition.onend = () => {
            this.isRecognitionActive = false;
            const sessionDuration = Date.now() - this.recognitionStartTime;
            console.log(`🎤 語音識別結束，持續時間: ${sessionDuration}ms`);
            
            if (!this.continuousMode) {
                this.isRecording = false;
                this.updateUI();
                return;
            }
            
            // 會議模式：立即重啟，保持麥克風持續開啟
            console.log('🔄 會議模式：立即重啟語音識別以保持連續性');
            
            // 重置重試計數器（每次自然結束都重置，避免累積）
            this.recognitionRetryCount = 0;
            
            // 立即重啟，最小化麥克風關閉時間
            setTimeout(() => {
                if (this.continuousMode && !this.isRecognitionActive) {
                    this.startRecognition();
                }
            }, this.recognitionRestartDelay); // 100ms 快速重啟
        };

        this.recognition.onerror = (event) => {
            console.error('語音識別錯誤:', event.error);
            
            // 根據錯誤類型採取不同處理策略
            const errorHandlers = {
                'no-speech': () => {
                    console.log('🔇 未檢測到語音，立即重啟保持連續');
                    // 會議環境：立即重啟，不要等待
                    if (this.continuousMode) {
                        setTimeout(() => this.startRecognition(), 200);
                    }
                },
                'audio-capture': () => {
                    console.warn('音頻捕獲失敗，請檢查麥克風權限');
                    if (this.continuousMode) {
                        setTimeout(() => this.startRecognition(), 1000);
                    }
                },
                'not-allowed': () => {
                    console.error('麥克風權限被拒絕');
                    alert('請允許麥克風權限以使用語音識別功能');
                    this.continuousMode = false;
                    this.updateUI();
                },
                'network': () => {
                    console.warn('網路連線問題，延後重試...');
                    if (this.continuousMode) {
                        setTimeout(() => this.startRecognition(), 2000);
                    }
                },
                'aborted': () => {
                    console.log('語音識別被中止');
                    // 通常是正常停止，不需要重啟
                },
                'language-not-supported': () => {
                    if (this.sourceLanguage.value === 'auto') {
                        this.tryNextLanguage();
                    } else {
                        console.error('不支援的語言');
                    }
                }
            };
            
            const handler = errorHandlers[event.error];
            if (handler) {
                handler();
            } else {
                console.warn(`未知錯誤: ${event.error}，嘗試重啟...`);
                if (this.continuousMode) {
                    setTimeout(() => this.startRecognition(), 1500);
                }
            }
        };

        this.recognition.onresult = (event) => {
            // 記錄語音活動
            this.trackSpeechActivity();
            
            let interimTranscript = '';
            let finalTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const result = event.results[i];
                
                if (result.isFinal) {
                    // 使用多個候選結果選擇最佳選項
                    const bestAlternative = this.selectBestAlternative(result);
                    if (bestAlternative) {
                        finalTranscript += bestAlternative.transcript;
                        console.log(`最終結果 (信心度: ${(bestAlternative.confidence * 100).toFixed(1)}%): ${bestAlternative.transcript}`);
                        
                        // 更新置信度指示器
                        this.updateConfidenceIndicator(bestAlternative.confidence);
                        
                        // 如果有多個候選，顯示其他選項
                        if (result.length > 1) {
                            console.log('其他候選:', Array.from(result).slice(1).map(alt => 
                                `"${alt.transcript}" (${(alt.confidence * 100).toFixed(1)}%)`
                            ).join(', '));
                        }
                        
                        // 智慧語言切換：如果識別效果不佳，考慮切換語言
                        if (this.sourceLanguage.value === 'auto' && bestAlternative.confidence < 0.4) {
                            console.log('識別效果不佳，考慮切換語言...');
                            this.considerLanguageSwitch(bestAlternative.transcript);
                        }
                    }
                } else {
                    // 即時顯示暫時結果，也使用最佳候選
                    const bestInterim = this.selectBestAlternative(result, 0.3);
                    if (bestInterim) {
                        interimTranscript += bestInterim.transcript;
                    }
                }
            }

            // 即時顯示識別結果
            this.safeSetHTML(this.currentText, 
                finalTranscript + '<span class="interim-text"> ' + interimTranscript + '</span>');

            // 簡報模式即時更新 - 更頻繁、更精確的更新
            if (this.isPresentationMode) {
                const currentFinal = finalTranscript.trim();
                const currentInterim = interimTranscript.trim();
                
                // 立即更新簡報模式顯示，不管內容是否變化
                this.updatePresentationLiveText(currentFinal, currentInterim);
                
                if (currentFinal || currentInterim) {
                    console.log(`簡報即時更新: 最終="${currentFinal}" 臨時="${currentInterim}"`);
                }
            }

            // 即時翻譯處理
            this.handleRealtimeTranslation(finalTranscript, interimTranscript);

        };
    }

    // 初始化 Wake Lock - 防止整個網頁休眠
    async initializeWakeLock() {
        console.log('🌙 正在啟用全域螢幕保持喚醒功能...');
        const success = await this.requestWakeLock();
        if (success) {
            console.log('✅ 全域螢幕保持喚醒已啟用 - 手機不會休眠');
        } else {
            console.log('⚠️ 無法立即啟用螢幕保持喚醒 - 等待用戶互動後啟用');
            this.setupUserInteractionWakeLock();
        }
    }

    // 設置用戶互動後啟用 Wake Lock
    setupUserInteractionWakeLock() {
        const enableWakeLockOnInteraction = async () => {
            console.log('👆 檢測到用戶互動，嘗試啟用 Wake Lock...');
            const success = await this.requestWakeLock();
            if (success) {
                console.log('✅ 用戶互動後成功啟用全域螢幕保持喚醒');
                // 移除事件監聽器，避免重複執行
                document.removeEventListener('click', enableWakeLockOnInteraction);
                document.removeEventListener('keydown', enableWakeLockOnInteraction);
                document.removeEventListener('touchstart', enableWakeLockOnInteraction);
            }
        };

        // 監聽用戶互動事件
        document.addEventListener('click', enableWakeLockOnInteraction, { once: true });
        document.addEventListener('keydown', enableWakeLockOnInteraction, { once: true });
        document.addEventListener('touchstart', enableWakeLockOnInteraction, { once: true });
    }

    // Wake Lock API 管理 - 防止手機休眠
    async requestWakeLock() {
        if (!this.wakeLockSupported) {
            console.warn('此瀏覽器不支援 Wake Lock API，無法防止休眠');
            return false;
        }

        try {
            this.wakeLock = await navigator.wakeLock.request('screen');
            console.log('✅ 螢幕保持喚醒已啟用 (簡報模式)');
            
            // 監聽 Wake Lock 釋放事件
            this.wakeLock.addEventListener('release', () => {
                console.log('⏰ Wake Lock 已釋放');
            });
            
            return true;
        } catch (err) {
            console.warn('無法啟用螢幕保持喚醒:', err.message);
            return false;
        }
    }

    async releaseWakeLock() {
        if (this.wakeLock && !this.wakeLock.released) {
            try {
                await this.wakeLock.release();
                this.wakeLock = null;
                console.log('🔒 螢幕保持喚醒已停用');
                return true;
            } catch (err) {
                console.warn('釋放 Wake Lock 時發生錯誤:', err.message);
                return false;
            }
        }
        return true;
    }

    // 處理頁面可見性變化時的 Wake Lock 狀態 - 始終保持喚醒
    async handleVisibilityChange() {
        if (document.visibilityState === 'visible') {
            // 頁面重新可見時，重新請求 Wake Lock (無論是否在簡報模式)
            console.log('頁面重新可見，重新啟用全域 Wake Lock');
            await this.requestWakeLock();
        }
    }

    bindEvents() {
        this.recordBtn.addEventListener('click', () => {
            this.toggleRecording();
        });

        this.sourceLanguage.addEventListener('change', () => {
            if (this.recognition) {
                this.setRecognitionLanguage();
                if (this.continuousMode) {
                    this.recognition.stop();
                    setTimeout(() => {
                        this.startRecognition();
                    }, 500);
                }
            }
        });

        this.apiKeyInput.addEventListener('input', () => {
            this.apiKey = this.apiKeyInput.value.trim();
            this.secureSetApiKey(this.apiKey);
        });

        this.recognitionEngine.addEventListener('change', () => {
            this.handleRecognitionEngineChange();
        });

        this.clearBtn.addEventListener('click', () => {
            this.clearTranscript();
        });

        this.presentationBtn.addEventListener('click', () => {
            this.enterPresentationMode();
        });

        this.exitPresentationBtn.addEventListener('click', () => {
            this.exitPresentationMode();
        });

        this.settingsToggle.addEventListener('click', () => {
            this.toggleSettings();
        });

        // 字體大小控制事件
        this.fontIncrease.addEventListener('click', (e) => {
            e.stopPropagation();
            this.adjustFontSize(2);
            this.resetAutoCollapse();
        });

        this.fontDecrease.addEventListener('click', (e) => {
            e.stopPropagation();
            this.adjustFontSize(-2);
            this.resetAutoCollapse();
        });

        // 簡報模式退出按鈕
        this.presentationExitBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.exitPresentationMode();
        });

        // 控制面板切換
        this.controlToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            console.log('點擊控制面板切換按鈕');
            this.toggleControls();
        });

        // 點擊面板外部時收縮
        document.addEventListener('click', (e) => {
            if (this.isPresentationMode && this.controlsExpanded && 
                !this.presentationControls.contains(e.target)) {
                this.collapseControls();
            }
        });

        // 滑鼠懸停時延長展開時間
        this.presentationControls.addEventListener('mouseenter', () => {
            if (this.controlsExpanded && this.autoCollapseTimer) {
                clearTimeout(this.autoCollapseTimer);
            }
        });

        this.presentationControls.addEventListener('mouseleave', () => {
            if (this.controlsExpanded) {
                this.autoCollapseTimer = setTimeout(() => {
                    this.collapseControls();
                }, 2000); // 滑鼠離開後2秒收縮
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isPresentationMode) {
                this.exitPresentationMode();
            } else if (e.key === 'F11') {
                e.preventDefault();
                if (!this.isPresentationMode) {
                    this.enterPresentationMode();
                }
            }
        });

        // 監聽視窗大小變化（例如手機旋轉）
        window.addEventListener('resize', () => {
            if (this.isPresentationMode) {
                // 根據新的螢幕尺寸重新計算字體大小
                const newFontSize = this.getInitialFontSize();
                if (newFontSize !== this.currentFontSize) {
                    this.currentFontSize = newFontSize;
                    this.fontSizeDisplay.textContent = `${this.currentFontSize}px`;
                    if (this.originalWrapper) {
                        this.originalWrapper.style.fontSize = `${this.currentFontSize}px`;
                    }
                    if (this.translatedWrapper) {
                        this.translatedWrapper.style.fontSize = `${this.currentFontSize}px`;
                    }
                    console.log(`螢幕尺寸變化，字體大小自動調整為: ${this.currentFontSize}px`);
                }
            }
        });

        // 清理舊的不安全存儲（向後兼容）
        const oldApiKey = localStorage.getItem('openai_api_key');
        if (oldApiKey) {
            // 遷移到安全存儲
            this.secureSetApiKey(oldApiKey);
            localStorage.removeItem('openai_api_key');
            console.log('已遷移API Key到安全存儲');
        }

        // 獲取安全存儲的API Key
        const savedApiKey = this.secureGetApiKey();
        if (savedApiKey) {
            this.apiKey = savedApiKey;
            this.apiKeyInput.value = savedApiKey;
        }

        // 頁面卸載時的安全清理
        window.addEventListener('beforeunload', async () => {
            // 在離開頁面時清除內存中的敏感數據
            if (this.apiKey) {
                this.apiKey = '';
                this.apiKeyInput.value = '';
            }
            
            // 釋放 Wake Lock
            await this.releaseWakeLock();
            console.log('頁面卸載：Wake Lock 已釋放');
        });

        // 頁面可見性改變時的處理
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                // 頁面被隱藏時，可以選擇清除敏感數據
                console.log('頁面被隱藏，敏感數據已標記');
            } else {
                // 頁面重新可見時，處理 Wake Lock
                this.handleVisibilityChange();
            }
        });
    }

    async toggleRecording() {
        if (!this.apiKey) {
            alert('請先輸入 OpenAI API Key');
            this.apiKeyInput.focus();
            return;
        }

        // 根據選擇的引擎進行不同的檢查
        if (this.currentRecognitionEngine === 'webspeech') {
            if (!this.recognition) {
                alert('語音識別功能不可用');
                return;
            }
            this.continuousMode = !this.continuousMode;
            
            if (this.continuousMode) {
                this.startContinuousRecording();
            } else {
                this.stopRecording();
            }
        } else if (this.currentRecognitionEngine === 'whisper') {
            // Whisper 模式
            await this.toggleWhisperRecording();
        }
    }

    startContinuousRecording() {
        if (!this.apiKey) {
            setTimeout(() => this.startContinuousRecording(), 2000);
            return;
        }
        
        // 清理所有之前的狀態
        this.clearIncrementalTranslation();
        this.currentIncrementalTranslation = '';
        
        this.continuousMode = true;
        this.startRecognition();
        
        // 啟動主動保活機制，確保麥克風持續工作
        this.startRecognitionKeepAlive();
    }

    // 主動保活機制 - 確保麥克風持續工作
    startRecognitionKeepAlive() {
        // 清除現有的保活定時器
        if (this.recognitionKeepAliveInterval) {
            clearInterval(this.recognitionKeepAliveInterval);
        }
        
        // 每隔5秒檢查語音識別狀態
        this.recognitionKeepAliveInterval = setInterval(() => {
            if (this.continuousMode && !this.isRecognitionActive) {
                console.log('🔄 保活檢查：語音識別已停止，立即重啟');
                this.startRecognition();
            } else if (this.continuousMode && this.isRecognitionActive) {
                // 檢查是否長時間沒有重啟（超過60秒）
                const timeSinceStart = Date.now() - this.recognitionStartTime;
                if (timeSinceStart > 60000) {
                    console.log('🔄 保活檢查：強制重啟以保持最佳狀態');
                    this.recognition.stop(); // 觸發 onend 事件，自動重啟
                }
            }
        }, 5000); // 每5秒檢查一次
        
        console.log('🎤 語音識別保活機制已啟動');
    }

    // 停止保活機制
    stopRecognitionKeepAlive() {
        if (this.recognitionKeepAliveInterval) {
            clearInterval(this.recognitionKeepAliveInterval);
            this.recognitionKeepAliveInterval = null;
            console.log('🔇 語音識別保活機制已停止');
        }
    }

    stopContinuousRecording() {
        this.continuousMode = false;
        this.isRecognitionActive = false;
        
        // 清除所有超時和狀態
        if (this.silenceTimeout) {
            clearTimeout(this.silenceTimeout);
            this.silenceTimeout = null;
        }
        
        if (this.recognition) {
            this.recognition.stop();
        }
        
        // 停止語音識別保活機制
        this.stopRecognitionKeepAlive();
        
        // 重置重試狀態
        this.recognitionRetryCount = 0;
        this.lastSpeechTime = 0;
        
        // 清除句子邊界檢測狀態
        this.pendingOriginalText = '';
        this.pendingTranslationText = '';
        
        // 清理所有臨時翻譯狀態
        this.clearIncrementalTranslation();
        this.currentIncrementalTranslation = '';
        
        this.isRecording = false;
        this.updateUI();
        this.updateStatus('source', 'ready', '已停止');
        
        console.log('會議模式已停止，所有狀態已清理');
    }

    startRecognition() {
        if (!this.recognition || !this.continuousMode) return;
        
        // 避免重複啟動
        if (this.isRecognitionActive) {
            console.log('語音識別已在運行中，跳過重啟');
            return;
        }
        
        // 不要在重啟時清理臨時翻譯狀態，可能會干擾正在進行的翻譯
        // this.currentIncrementalTranslation = '';
        
        try {
            console.log('正在啟動語音識別...');
            this.recognition.start();
        } catch (error) {
            console.log('語音識別啟動錯誤:', error.message);
            
            // 根據錯誤類型決定重試策略
            if (error.name === 'InvalidStateError') {
                console.log('識別器狀態錯誤，等待重試');
                setTimeout(() => {
                    if (this.continuousMode && !this.isRecognitionActive) {
                        this.startRecognition();
                    }
                }, 2000);
            } else {
                // 其他錯誤，較短延遲後重試
                setTimeout(() => {
                    if (this.continuousMode && !this.isRecognitionActive) {
                        this.startRecognition();
                    }
                }, 1000);
            }
        }
    }

    updateUI() {
        if (this.continuousMode) {
            this.recordBtn.textContent = '⏹️ 停止語音辨識';
            this.recordBtn.classList.remove('stopped');
        } else {
            this.recordBtn.textContent = '🔴 開始語音辨識';
            this.recordBtn.classList.add('stopped');
        }
    }

    addTranscriptItem(text, customId = null) {
        const timestamp = new Date().toLocaleTimeString('zh-TW', { 
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        
        const transcriptItem = {
            id: customId || this.currentTranscriptId++,
            timestamp: timestamp,
            sourceText: text,
            translatedText: this.getStatusText('translating')
        };
        
        this.transcriptHistory.push(transcriptItem);
        this.totalWordCount += text.length;
        this.renderTranscriptItem(transcriptItem);
        this.updateWordCount();
        this.scrollToBottom();
        
        // 更新簡報模式內容
        if (this.isPresentationMode) {
            this.updatePresentationContent();
        }
    }

    renderTranscriptItem(item) {
        const div = document.createElement('div');
        div.className = 'transcript-item';
        div.id = `transcript-${item.id}`;
        
        // 使用安全的方式構建內容
        const timestamp = document.createElement('div');
        timestamp.className = 'timestamp';
        timestamp.textContent = item.timestamp;
        
        const content = document.createElement('div');
        content.className = 'content';
        
        const sourceText = document.createElement('div');
        sourceText.className = 'source-text';
        sourceText.textContent = item.sourceText;
        
        const translatedText = document.createElement('div');
        translatedText.className = 'translated-text';
        translatedText.textContent = item.translatedText;
        
        content.appendChild(sourceText);
        content.appendChild(translatedText);
        div.appendChild(timestamp);
        div.appendChild(content);
        
        this.transcriptDisplay.appendChild(div);
    }

    updateTranscriptTranslation(id, translation) {
        // 清理翻譯內容中的換行符號
        const cleanTranslation = translation ? translation.replace(/\n+/g, ' ').replace(/\s+/g, ' ') : '';
        
        const element = document.getElementById(`transcript-${id}`);
        if (element) {
            const translatedDiv = element.querySelector('.translated-text');
            translatedDiv.textContent = cleanTranslation;
        }
        
        const historyItem = this.transcriptHistory.find(item => item.id === id);
        if (historyItem) {
            historyItem.translatedText = cleanTranslation;
        }
        
        // 更新簡報模式內容
        if (this.isPresentationMode) {
            this.updatePresentationTranslationFlow(id, cleanTranslation);
        }
    }

    scrollToBottom() {
        this.transcriptDisplay.scrollTop = this.transcriptDisplay.scrollHeight;
    }

    updateWordCount() {
        document.getElementById('wordCount').textContent = `字數: ${this.totalWordCount}`;
    }

    clearTranscript() {
        if (confirm('確定要清除所有字幕記錄嗎？')) {
            this.transcriptHistory = [];
            this.totalWordCount = 0;
            this.currentTranscriptId = 0;
            // 使用安全方式重建開始訊息
            this.transcriptDisplay.innerHTML = '';
            
            const startDiv = document.createElement('div');
            startDiv.className = 'transcript-item start-message';
            
            const timestamp = document.createElement('div');
            timestamp.className = 'timestamp';
            timestamp.textContent = '重新開始';
            
            const content = document.createElement('div');
            content.className = 'content';
            
            const sourceText = document.createElement('div');
            sourceText.className = 'source-text';
            sourceText.textContent = this.getStatusText('transcriptCleared');
            
            const translatedText = document.createElement('div');
            translatedText.className = 'translated-text';
            translatedText.textContent = this.getStatusText('transcriptClearedEn');
            
            content.appendChild(sourceText);
            content.appendChild(translatedText);
            startDiv.appendChild(timestamp);
            startDiv.appendChild(content);
            this.transcriptDisplay.appendChild(startDiv);
            this.updateWordCount();

            // 清空簡報模式的連續文字流
            if (this.isPresentationMode) {
                this.currentOriginalText = '';
                this.currentTranslatedText = '';
                if (this.originalWrapper) {
                    this.safeSetHTML(this.originalWrapper, this.getStatusText('waitingForSpeech'));
                }
                if (this.translatedWrapper) {
                    this.safeSetHTML(this.translatedWrapper, this.getStatusText('waitingForTranslation'));
                }
                console.log('簡報模式連續文字流已清空');
            }
        }
    }

    setRecognitionLanguage() {
        if (this.sourceLanguage.value === 'auto') {
            const currentLang = this.autoDetectLanguages[this.currentLanguageIndex];
            this.recognition.lang = currentLang;
            
            // 根據語言調整識別參數
            this.adjustRecognitionForLanguage(currentLang);
            console.log(`自動偵測設定語言: ${currentLang}`);
        } else {
            this.recognition.lang = this.sourceLanguage.value;
            this.adjustRecognitionForLanguage(this.sourceLanguage.value);
            console.log(`手動設定語言: ${this.sourceLanguage.value}`);
        }
    }

    adjustRecognitionForLanguage(language) {
        // 根據語言調整識別參數以提升準確度 - 特別針對快速英文語音優化
        if (language.startsWith('zh')) {
            // 中文識別優化
            this.recognition.maxAlternatives = 5; // 中文需要更多候選
            this.fastSpeechMode = false;
        } else if (language.startsWith('en')) {
            // 英文識別優化 - 針對快速語音特別調整
            this.recognition.maxAlternatives = 5; // 增加英文候選數量以處理快速語音
            this.fastSpeechMode = true; // 啟用快速語音模式
            
            // 針對快速英文語音的特殊設置
            if (this.recognition.continuous) {
                console.log('啟用英文快速語音模式');
            }
        }
        
        console.log(`已針對 ${language} 優化識別參數 (快速語音模式: ${this.fastSpeechMode ? '啟用' : '停用'})`);
    }

    considerLanguageSwitch(transcript) {
        // 智慧語言切換：分析文字特徵決定是否切換語言
        if (!transcript || transcript.length < 3) return;
        
        const currentLang = this.recognition.lang;
        const chineseCharRegex = /[\u4e00-\u9fff]/;
        const englishWordRegex = /[a-zA-Z]/;
        
        const hasChinese = chineseCharRegex.test(transcript);
        const hasEnglish = englishWordRegex.test(transcript);
        
        let shouldSwitch = false;
        
        if (currentLang.startsWith('zh') && !hasChinese && hasEnglish) {
            // 當前中文模式但識別出英文
            console.log('檢測到英文內容，切換到英文模式');
            shouldSwitch = true;
        } else if (currentLang.startsWith('en') && hasChinese && !hasEnglish) {
            // 當前英文模式但識別出中文
            console.log('檢測到中文內容，切換到中文模式');
            shouldSwitch = true;
        }
        
        if (shouldSwitch) {
            this.tryNextLanguage();
        }
    }

    updateConfidenceIndicator(confidence) {
        // 更新即時的置信度顯示
        const percentage = Math.round(confidence * 100);
        const fillWidth = Math.min(percentage, 100);
        
        this.confidenceFill.style.width = `${fillWidth}%`;
        this.confidenceText.textContent = `${percentage}%`;
        
        // 根據置信度調整顏色和文字
        let status;
        if (confidence >= 0.7) {
            status = '優秀';
            this.confidenceFill.style.background = '#28a745';
        } else if (confidence >= 0.5) {
            status = '良好';
            this.confidenceFill.style.background = 'linear-gradient(90deg, #ffa500 0%, #28a745 100%)';
        } else if (confidence >= 0.3) {
            status = '一般';
            this.confidenceFill.style.background = '#ffa500';
        } else {
            status = '較差';
            this.confidenceFill.style.background = '#ff4444';
        }
        
        // 在控制台顯示狀態
        if (percentage > 0) {
            console.log(`識別品質: ${status} (${percentage}%)`);
        }
    }

    async handleRealtimeTranslation(finalTranscript, interimTranscript) {
        // 處理即時翻譯邏輯 - 優化快速語音識別
        const currentText = finalTranscript + interimTranscript;
        
        if (finalTranscript.trim()) {
            // 有最終結果，準備執行最終翻譯
            this.currentTranslationText = finalTranscript;
            this.lastInterimText = '';
            
            console.log(`處理最終語音識別: "${finalTranscript}"`);
            
            // 延遲清理增量翻譯，給翻譯API時間完成
            if (this.incrementalTranslationCleanupTimer) {
                clearTimeout(this.incrementalTranslationCleanupTimer);
            }
            
            // 執行最終翻譯，等待完成後再清理
            try {
                await this.addPunctuationAndTranslate(finalTranscript, this.currentTranscriptId);
                
                // 翻譯完成後只清理翻譯相關狀態，不清理句子邊界檢測狀態
                this.incrementalTranslationCleanupTimer = setTimeout(() => {
                    if (!this.isCompletingTranslation) {
                        this.clearIncrementalTranslationOnly();
                    }
                }, 350); // 略小於 completeInterimTranslation 的 300ms
            } catch (error) {
                console.error('翻譯錯誤:', error);
                this.clearIncrementalTranslationOnly();
            }
            
        } else if (interimTranscript.trim() && this.incrementalTranslation.checked) {
            // 只有臨時結果，且啟用增量翻譯時才進行
            this.handleIncrementalTranslation(interimTranscript);
        }
    }

    // 智能合併文字，避免重複片段
    smartMergeText(existingText, newText) {
        if (!existingText || !existingText.trim()) {
            return newText.trim();
        }
        
        if (!newText || !newText.trim()) {
            return existingText.trim();
        }
        
        const existing = existingText.trim();
        const incoming = newText.trim();
        
        
        // 檢查新文字是否完全包含在現有文字中
        if (existing.includes(incoming)) {
            return existing;
        }
        
        // 檢查現有文字是否完全包含在新文字中
        if (incoming.includes(existing)) {
            return incoming;
        }
        
        // 查找重疊部分 - 從現有文字的末尾開始
        let maxOverlap = 0;
        let overlapLength = 0;
        const minOverlapLength = Math.min(3, Math.min(existing.length, incoming.length) / 2);
        
        // 從最大可能的重疊開始檢查
        for (let i = minOverlapLength; i <= Math.min(existing.length, incoming.length); i++) {
            const existingSuffix = existing.slice(-i);
            const incomingPrefix = incoming.slice(0, i);
            
            if (existingSuffix === incomingPrefix) {
                overlapLength = i;
                maxOverlap = i;
            }
        }
        
        if (overlapLength > 0) {
            // 找到重疊，合併時去除重複部分
            const merged = existing + incoming.slice(overlapLength);
            return merged;
        } else {
            // 沒有重疊，直接連接
            const merged = existing + ' ' + incoming;
            return merged;
        }
    }

    // 翻譯結果去重 - 針對翻譯內容的智能去重
    deduplicateTranslation(existingTranslation, newTranslation) {
        if (!existingTranslation || !existingTranslation.trim()) {
            return newTranslation ? newTranslation.trim() : '';
        }
        
        if (!newTranslation || !newTranslation.trim()) {
            return existingTranslation.trim();
        }
        
        const existing = existingTranslation.trim();
        const incoming = newTranslation.trim();
        
        
        // 如果新翻譯是現有翻譯的一部分，保持現有的
        if (existing.includes(incoming) && existing.length > incoming.length) {
            return existing;
        }
        
        // 如果現有翻譯是新翻譯的一部分，使用新翻譯
        if (incoming.includes(existing) && incoming.length > existing.length) {
            return incoming;
        }
        
        // 檢查詞彙級別的重複（針對翻譯內容特別優化）
        const existingWords = existing.split(/[\s\u3000]+/).filter(w => w.length > 0);
        const incomingWords = incoming.split(/[\s\u3000]+/).filter(w => w.length > 0);
        
        // 如果新翻譯只是重複了現有翻譯的最後幾個詞
        if (existingWords.length >= 3 && incomingWords.length >= 3) {
            const lastWords = existingWords.slice(-Math.min(3, existingWords.length));
            const firstWords = incomingWords.slice(0, Math.min(3, incomingWords.length));
            
            const overlap = lastWords.filter((word, index) => firstWords[index] === word).length;
            
            if (overlap >= 2) { // 有2個以上重複詞彙
                // 合併時去除重複部分
                const uniqueIncomingWords = incomingWords.slice(overlap);
                const merged = existingWords.concat(uniqueIncomingWords).join(' ');
                return merged;
            }
        }
        
        // 如果完全相同，返回其中一個
        if (existing === incoming) {
            return existing;
        }
        
        // 檢查是否是簡單的擴展（新內容在末尾添加）
        if (incoming.startsWith(existing)) {
            return incoming;
        }
        
        // 其他情況，保持新的翻譯（通常是改進的結果）
        return incoming;
    }

    // 檢測句子邊界 - 支援中英文標點
    detectSentenceBoundaries(text) {
        // 中英文句子結束標點符號
        const sentenceEndMarkers = /([.!?。！？；;][\s]*)/g;
        
        let matches = [];
        let match;
        
        // 找到所有句子邊界位置
        while ((match = sentenceEndMarkers.exec(text)) !== null) {
            matches.push({
                index: match.index + match[0].length,
                marker: match[1]
            });
        }
        
        return matches;
    }

    // 拆分文字為完整句子和剩餘部分
    splitTextAtSentenceBoundary(text) {
        const boundaries = this.detectSentenceBoundaries(text);
        
        if (boundaries.length === 0) {
            // 沒有發現句子邊界，全部作為剩餘部分
            return {
                completedSentences: '',
                remainingText: text.trim()
            };
        }
        
        // 取最後一個句子邊界作為分割點
        const lastBoundary = boundaries[boundaries.length - 1];
        const completedSentences = text.substring(0, lastBoundary.index).trim();
        const remainingText = text.substring(lastBoundary.index).trim();
        
        return {
            completedSentences,
            remainingText
        };
    }

    handleIncrementalTranslation(interimText) {
        // 處理增量翻譯 - 支援句子邊界檢測
        if (interimText === this.lastInterimText) {
            return; // 文字沒有變化，不需要重新翻譯
        }
        
        // 清除之前的計時器
        if (this.translationUpdateTimer) {
            clearTimeout(this.translationUpdateTimer);
        }
        
        // 智能合併文字，避免重複
        const fullPendingText = this.smartMergeText(this.pendingOriginalText, interimText);
        
        // 檢測句子邊界
        const { completedSentences, remainingText } = this.splitTextAtSentenceBoundary(fullPendingText);
        
        // 如果發現完整句子，立即處理
        if (completedSentences) {
            console.log(`⏳ 完整句子: "${completedSentences}" | 剩餘文字: "${remainingText}"`);
            
            // 不要立即清空臨時翻譯，保持它直到正式翻譯完成
            // 讓 completeInterimTranslation 函數來處理清理
            
            // 將完整句子轉為正式翻譯記錄（異步處理）
            this.processCompletedSentence(completedSentences).catch(error => {
                console.error('處理完整句子錯誤:', error);
                // 只有在錯誤時才清空臨時翻譯
                this.currentIncrementalTranslation = '';
            });
            
            // 更新待處理文字為剩餘部分
            this.pendingOriginalText = remainingText;
            
            // 對剩餘部分進行增量翻譯
            if (remainingText.trim()) {
                // 給正式翻譯一些時間後才開始增量翻譯
                setTimeout(() => {
                    this.performIncrementalTranslation(remainingText);
                }, 200);
            } else {
                // 如果沒有剩餘文字，清除增量翻譯狀態
                this.updateInterimTranslationContent('');
            }
        } else {
            // 沒有完整句子，更新待處理文字並進行增量翻譯
            this.pendingOriginalText = fullPendingText;
            this.performIncrementalTranslation(fullPendingText);
        }
        
        this.lastInterimText = interimText;
    }

    // 處理完整句子 - 將其轉為正式翻譯記錄
    async processCompletedSentence(completedSentences) {
        
        // 產生新的轉錄項目ID
        const transcriptId = Date.now() + '-completed';
        
        // 立即添加到轉錄歷史
        this.addTranscriptItem(completedSentences, transcriptId);
        
        // 觸發正式翻譯（異步處理但不等待，避免阻塞臨時翻譯）
        this.addPunctuationAndTranslate(completedSentences, transcriptId).catch(error => {
            console.error('句子翻譯錯誤:', error);
        });
        
    }

    // 執行增量翻譯
    performIncrementalTranslation(text) {
        // 智能觸發增量翻譯
        const shouldTranslate = this.shouldTriggerIncrementalTranslation(text);
        
        if (shouldTranslate) {
            const delay = text.length > 10 ? 300 : 600; // 較長文字更快翻譯
            this.translationUpdateTimer = setTimeout(() => {
                this.translateIncrementalText(text, text); // 直接翻譯剩餘文字
            }, delay);
        } else {
        }
    }

    shouldTriggerIncrementalTranslation(interimText) {
        // 判斷是否應該觸發增量翻譯
        
        // 基本條件檢查
        if (interimText.length < 3) return false;
        
        // 中文：至少2個字符
        const chineseCharRegex = /[\u4e00-\u9fff]/g;
        const chineseMatches = interimText.match(chineseCharRegex);
        if (chineseMatches && chineseMatches.length >= 2) {
            return true;
        }
        
        // 英文：至少一個完整單詞 (3+ 字符)
        const englishWordRegex = /[a-zA-Z]{3,}/g;
        const englishMatches = interimText.match(englishWordRegex);
        if (englishMatches && englishMatches.length >= 1) {
            return true;
        }
        
        // 混合語言：總長度達到8個字符
        if (interimText.length >= 8) {
            return true;
        }
        
        return false;
    }

    async translateIncrementalText(fullText, partialText) {
        // 增量翻譯函數
        if (!this.apiKeyInput.value.trim()) {
            console.warn('API Key 未設定，跳過增量翻譯');
            return;
        }
        
        // 增量翻譯使用較寬鬆的限制（優先度較低）
        if (this.activeTranslationRequests >= this.maxConcurrentTranslations + 1) {
            console.warn('系統繁忙，跳過增量翻譯');
            return;
        }
        
        this.activeTranslationRequests++;

        const targetLang = this.targetLanguage.value;
        
        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKeyInput.value.trim()}`
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: [
                        {
                            role: 'system',
                            content: `You are a professional real-time meeting translation assistant. Please translate the following text to ${targetLang}. This is an incremental translation during a live meeting where the text may be incomplete - provide the best partial translation available while maintaining professional tone and meeting context.`
                        },
                        {
                            role: 'user',
                            content: `Full text: "${fullText}"\nFocus on this part: "${partialText}"\n\nPlease translate to ${targetLang}. Even if the sentence is incomplete, provide the most reasonable translation for the current content.`
                        }
                    ],
                    max_tokens: 500,
                    temperature: 0.3
                })
            });

            if (!response.ok) {
                throw new Error(`翻譯API錯誤: ${response.status}`);
            }

            const data = await response.json();
            const translatedText = data.choices[0].message.content.trim().replace(/\n+/g, ' ').replace(/\s+/g, ' ');
            
            // 更新即時翻譯顯示
            this.updateIncrementalTranslation(translatedText, partialText);
            
        } catch (error) {
            console.error('增量翻譯錯誤:', error);
        } finally {
            this.activeTranslationRequests = Math.max(0, this.activeTranslationRequests - 1);
        }
    }

    updateIncrementalTranslation(translatedText, originalPart) {
        // 清理增量翻譯內容中的換行符號
        const cleanTranslatedText = translatedText ? translatedText.replace(/\n+/g, ' ').replace(/\s+/g, ' ') : '';
        
        // 更新增量翻譯的顯示
        console.log(`增量翻譯結果: "${originalPart}" -> "${cleanTranslatedText}"`);
        
        // 在當前顯示區域顯示增量翻譯（用特殊樣式標記）
        const currentDisplay = this.currentText.innerHTML;
        const incrementalHtml = `<span class="incremental-translation" style="color: #4ade80; font-style: italic; opacity: 0.8; background: rgba(74, 222, 128, 0.15); padding: 2px 6px; border-radius: 3px; margin-left: 4px;">[${cleanTranslatedText}]</span>`;
        
        // 暫時顯示增量翻譯
        this.safeSetHTML(this.currentText, currentDisplay + ' ' + incrementalHtml);
        
        // 簡報模式也更新
        if (this.isPresentationMode) {
            this.updatePresentationIncrementalTranslation(cleanTranslatedText);
        }
    }

    updatePresentationIncrementalTranslation(translatedText) {
        // 在簡報模式中顯示增量翻譯
        if (!this.translatedWrapper) return;
        
        // 更新最後一行的翻譯（增量翻譯）
        const recentHistory = this.transcriptHistory.slice(-this.presentationMaxItems);
        let translatedLines = [];
        
        recentHistory.forEach((item) => {
            translatedLines.push(item.translatedText || this.getStatusText('translating'));
        });
        
        // 清理增量翻譯文字中的換行符號
        const cleanTranslatedText = translatedText ? translatedText.replace(/\n+/g, ' ').replace(/\s+/g, ' ') : '';
        
        // 智能合併翻譯結果，避免重複
        const deduplicatedTranslation = this.deduplicateTranslation(this.currentIncrementalTranslation, cleanTranslatedText);
        
        // 儲存增量翻譯狀態
        this.currentIncrementalTranslation = deduplicatedTranslation;
        
        // 優先使用動態更新
        this.updateInterimTranslationContent(deduplicatedTranslation);
    }

    clearIncrementalTranslation() {
        // 清理增量翻譯的顯示
        if (this.translationUpdateTimer) {
            clearTimeout(this.translationUpdateTimer);
            this.translationUpdateTimer = null;
        }
        
        // 清除擱置的翻譯完成計時器
        if (this.pendingTranslationTimeout) {
            clearTimeout(this.pendingTranslationTimeout);
            this.pendingTranslationTimeout = null;
        }
        
        // 清除增量翻譯清理計時器
        if (this.incrementalTranslationCleanupTimer) {
            clearTimeout(this.incrementalTranslationCleanupTimer);
            this.incrementalTranslationCleanupTimer = null;
        }
        
        // 重置狀態
        this.isCompletingTranslation = false;
        
        // 清除句子邊界檢測的待處理狀態
        this.pendingOriginalText = '';
        this.pendingTranslationText = '';
        
        // 清理當前顯示中的增量翻譯標記
        const currentTextContent = this.currentText.innerHTML;
        if (currentTextContent.includes('incremental-translation')) {
            // 移除增量翻譯的 span 標籤
            this.safeSetHTML(this.currentText, currentTextContent.replace(
                /<span class="incremental-translation"[^>]*>\[.*?\]<\/span>/g, 
                ''
            ).trim());
        }
        
        // 簡報模式中重置臨時翻譯為等待狀態，而不是完全清除
        if (this.isPresentationMode && this.translatedWrapper) {
            const interimSpan = this.translatedWrapper.querySelector('#interim-translation');
            if (interimSpan) {
                // 重置為翻譯中狀態，保持容器存在
                interimSpan.textContent = this.getStatusText('translating');
                console.log('重置臨時翻譯為等待狀態');
            }
            // 清除舊的增量翻譯狀態
            this.currentIncrementalTranslation = '';
        }
    }
    
    clearIncrementalTranslationOnly() {
        // 只清理翻譯相關的狀態，保留句子邊界檢測狀態和臨時翻譯內容
        if (this.translationUpdateTimer) {
            clearTimeout(this.translationUpdateTimer);
            this.translationUpdateTimer = null;
        }
        
        // 清除擱置的翻譯完成計時器
        if (this.pendingTranslationTimeout) {
            clearTimeout(this.pendingTranslationTimeout);
            this.pendingTranslationTimeout = null;
        }
        
        // 清除增量翻譯清理計時器
        if (this.incrementalTranslationCleanupTimer) {
            clearTimeout(this.incrementalTranslationCleanupTimer);
            this.incrementalTranslationCleanupTimer = null;
        }
        
        // 重置翻譯完成狀態
        this.isCompletingTranslation = false;
        
        // 清理當前顯示中的增量翻譯標記
        const currentTextContent = this.currentText.innerHTML;
        if (currentTextContent.includes('incremental-translation')) {
            // 移除增量翻譯的 span 標籤
            this.safeSetHTML(this.currentText, currentTextContent.replace(
                /<span class="incremental-translation"[^>]*>\[.*?\]<\/span>/g, 
                ''
            ).trim());
        }
        
        // 簡報模式中重置臨時翻譯為等待狀態，而不是完全清除
        if (this.isPresentationMode && this.translatedWrapper) {
            const interimSpan = this.translatedWrapper.querySelector('#interim-translation');
            if (interimSpan) {
                // 重置為翻譯中狀態，保持容器存在
                interimSpan.textContent = this.getStatusText('translating');
                console.log('重置臨時翻譯為等待狀態');
            }
            // 清除舊的增量翻譯狀態
            this.currentIncrementalTranslation = '';
        }
    }

    tryNextLanguage() {
        if (this.sourceLanguage.value === 'auto') {
            this.currentLanguageIndex = (this.currentLanguageIndex + 1) % this.autoDetectLanguages.length;
            console.log(`嘗試下一個語言: ${this.autoDetectLanguages[this.currentLanguageIndex]}`);
            this.setRecognitionLanguage();
            
            setTimeout(() => {
                if (this.continuousMode) {
                    this.startRecognition();
                }
            }, 1000);
        }
    }

    async addPunctuationAndTranslate(text, transcriptId) {
        if (!text.trim() || !this.apiKey) return;
        
        // 翻譯請求限流檢查
        if (this.activeTranslationRequests >= this.maxConcurrentTranslations) {
            console.warn('翻譯請求過多，跳過此次請求');
            return;
        }
        
        this.activeTranslationRequests++;
        console.log(`正在進行翻譯請求: ${this.activeTranslationRequests}/${this.maxConcurrentTranslations}`);

        try {
            // 使用GPT同時添加標點符號和翻譯
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: [
                        {
                            role: 'system',
                            content: `You are a professional meeting transcription and translation assistant. Your task:
1. Add appropriate punctuation to the input text (periods, commas, question marks, etc.) while maintaining natural speech flow
2. Translate the punctuated text to ${this.targetLanguage.value} with professional meeting context in mind
3. Return ONLY a JSON object with this format: {"original": "text with punctuation", "translation": "translated text"}
4. Both texts should have proper punctuation and natural formatting suitable for meeting documentation
5. If input is already in target language, just add punctuation and rephrase naturally for clarity
6. Maintain professional tone appropriate for business meetings`
                        },
                        {
                            role: 'user',
                            content: text
                        }
                    ],
                    max_tokens: 1000,
                    temperature: 0.3
                })
            });

            if (!response.ok) {
                throw new Error(`API 錯誤: ${response.status}`);
            }

            const data = await response.json();
            const result = data.choices[0].message.content.trim().replace(/\n+/g, ' ').replace(/\s+/g, ' ');
            
            try {
                const parsed = JSON.parse(result);
                // 清理解析後的內容中的換行符號
                const cleanOriginal = parsed.original ? parsed.original.replace(/\n+/g, ' ').replace(/\s+/g, ' ') : '';
                const cleanTranslation = parsed.translation ? parsed.translation.replace(/\n+/g, ' ').replace(/\s+/g, ' ') : '';
                
                // 添加有標點符號的原文
                this.addTranscriptItem(cleanOriginal, transcriptId);
                // 更新翻譯
                this.updateTranscriptTranslation(transcriptId, cleanTranslation);
                
                // 簡報模式：在正式更新後平滑完成臨時翻譯
                if (this.isPresentationMode) {
                    this.completeInterimTranslation(cleanTranslation);
                }
            } catch (parseError) {
                // 如果JSON解析失敗，使用原本邏輯
                console.log('JSON解析失敗，使用備用方法');
                
                this.addTranscriptItem(text, transcriptId);
                this.translateText(text, transcriptId);
                
                // 簡報模式：即使是備用方法也要平滑完成
                if (this.isPresentationMode) {
                    this.completeInterimTranslation(''); // 沒有翻譯內容時傳入空字串
                }
            }

        } catch (error) {
            console.error('處理錯誤:', error);
            
            // 錯誤時使用原本邏輯
            this.addTranscriptItem(text, transcriptId);
            this.updateTranscriptTranslation(transcriptId, `處理失敗: ${error.message}`);
            
            // 簡報模式：錯誤時也要清理臨時狀態
            if (this.isPresentationMode) {
                this.completeInterimTranslation('');
            }
        } finally {
            // 翻譯完成或錯誤時減少計數
            this.activeTranslationRequests = Math.max(0, this.activeTranslationRequests - 1);
            console.log(`翻譯請求完成: ${this.activeTranslationRequests}/${this.maxConcurrentTranslations}`);
        }
    }

    async translateText(text, transcriptId) {
        if (!text.trim() || !this.apiKey) return;
        
        // 翻譯請求限流檢查
        if (this.activeTranslationRequests >= this.maxConcurrentTranslations) {
            console.warn('翻譯請求過多，跳過此次請求');
            return;
        }
        
        this.activeTranslationRequests++;

        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: [
                        {
                            role: 'system',
                            content: `You are a professional meeting translator. Automatically detect the input language and translate the following text to ${this.targetLanguage.value}. Add proper punctuation and maintain professional meeting tone. Only respond with the translation, no explanations. If the input is already in the target language, provide a natural rephrasing suitable for meeting documentation.`
                        },
                        {
                            role: 'user',
                            content: text
                        }
                    ],
                    max_tokens: 1000,
                    temperature: 0.3
                })
            });

            if (!response.ok) {
                throw new Error(`API 錯誤: ${response.status}`);
            }

            const data = await response.json();
            const translation = data.choices[0].message.content.trim().replace(/\n+/g, ' ').replace(/\s+/g, ' ');
            
            this.updateTranscriptTranslation(transcriptId, translation);

        } catch (error) {
            console.error('翻譯錯誤:', error);
            this.updateTranscriptTranslation(transcriptId, `翻譯失敗: ${error.message}`);
        } finally {
            this.activeTranslationRequests = Math.max(0, this.activeTranslationRequests - 1);
        }
    }

    async enterPresentationMode() {
        if (!this.apiKey) {
            alert('請先設定 API Key 才能進入簡報模式');
            return;
        }

        this.isPresentationMode = true;
        console.log('📺 進入簡報模式 (全域螢幕保持喚醒已啟用)');
        document.body.classList.add('presentation-mode');
        this.transcriptContainer.classList.add('presentation-mode');
        
        // 隱藏正常模式元素
        this.transcriptDisplay.style.display = 'none';
        
        // 顯示簡報模式元素
        this.originalPane.style.display = 'flex';
        this.translatedPane.style.display = 'flex';
        
        // 重置控制面板狀態 - 預設收縮
        this.controlsExpanded = false;
        this.presentationControls.classList.add('collapsed');
        console.log('簡報模式啟動，控制面板初始化為收縮狀態');
        
        // 初始化連續文字流
        this.initializePresentationTextFlow();
        
        // 取得文字容器
        this.originalWrapper = this.originalContent.querySelector('.text-wrapper');
        this.translatedWrapper = this.translatedContent.querySelector('.text-wrapper');
        
        // 根據當前螢幕尺寸重新設置字體大小
        this.currentFontSize = this.getInitialFontSize();
        this.fontSizeDisplay.textContent = `${this.currentFontSize}px`;
        if (this.originalWrapper) {
            this.originalWrapper.style.fontSize = `${this.currentFontSize}px`;
        }
        if (this.translatedWrapper) {
            this.translatedWrapper.style.fontSize = `${this.currentFontSize}px`;
        }
        
        this.presentationBtn.style.display = 'none';
        this.exitPresentationBtn.style.display = 'inline-block';
        
        // 更新設定按鈕文字
        this.settingsToggle.textContent = '🚪 退出簡報';
        
        this.updatePresentationContent();
    }

    exitPresentationMode() {
        this.isPresentationMode = false;
        console.log('🚪 退出簡報模式 (全域螢幕保持喚醒持續運作)');
        document.body.classList.remove('presentation-mode');
        this.transcriptContainer.classList.remove('presentation-mode');
        
        // 顯示正常模式元素
        this.transcriptDisplay.style.display = 'block';
        
        // 隱藏簡報模式元素
        this.originalPane.style.display = 'none';
        this.translatedPane.style.display = 'none';
        
        this.presentationBtn.style.display = 'inline-block';
        this.exitPresentationBtn.style.display = 'none';
        
        // 恢復設定按鈕文字
        this.settingsToggle.textContent = '⚙️ 設定';
        
        // 顯示所有隱藏的控制項
        this.header.style.display = 'block';
        this.controls.classList.remove('hidden');
        this.apiConfig.classList.remove('hidden');
    }

    toggleSettings() {
        if (this.isPresentationMode) {
            // 在簡報模式中，點擊設定按鈕直接退出簡報模式
            this.exitPresentationMode();
        } else {
            // 正常模式的設定切換
            const isHidden = this.controls.classList.contains('hidden');
            
            if (isHidden) {
                this.header.style.display = 'block';
                this.controls.classList.remove('hidden');
                this.apiConfig.classList.remove('hidden');
                this.settingsToggle.textContent = '❌ 隱藏設定';
            } else {
                this.header.style.display = 'none';
                this.controls.classList.add('hidden');
                this.apiConfig.classList.add('hidden');
                this.settingsToggle.textContent = '⚙️ 顯示設定';
            }
        }
    }

    updatePresentationLiveText(finalTranscript, interimTranscript) {
        if (!this.originalWrapper || !this.translatedWrapper) return;
        
        // 處理新的最終識別結果 - 連續追加不換行
        if (finalTranscript && finalTranscript.trim()) {
            const newText = finalTranscript.trim();
            // 檢查是否為新內容，避免重複
            const lastPart = this.currentOriginalText.slice(-newText.length - 10);
            if (!lastPart.includes(newText)) {
                this.currentOriginalText += newText + ' ';
                console.log('原文已添加到即時顯示:', newText);
            }
        }
        
        // 自動清理過長的文字（適合自然換行顯示）
        this.managePresentationTextLength();
        
        // 構建顯示文字 - 連續流動，自然換行
        let displayOriginalText = this.currentOriginalText;
        let displayTranslatedText = this.currentTranslatedText;
        
        // 添加當前正在識別的臨時文字（即時逐字顯示）
        if (interimTranscript && interimTranscript.trim()) {
            displayOriginalText += '<span id="interim-original" style="opacity: 0.8; font-style: italic; color: #7dd3fc; background: rgba(125, 211, 252, 0.15); padding: 0 4px; border-radius: 3px;">' + interimTranscript + '</span>';
            
            // 翻譯區域顯示即時翻譯或臨時文字 - 使用固定容器
            displayTranslatedText += '<span id="interim-translation" style="opacity: 0.8; font-style: italic; color: #4ade80; background: rgba(74, 222, 128, 0.15); padding: 0 4px; border-radius: 3px;">';
            
            if (this.currentIncrementalTranslation && this.currentIncrementalTranslation.trim()) {
                displayTranslatedText += this.currentIncrementalTranslation;
                console.log('簡報模式增量翻譯內容:', this.currentIncrementalTranslation);
            } else {
                displayTranslatedText += this.getStatusText('translating');
            }
            
            displayTranslatedText += '</span>';
        } else if (this.currentIncrementalTranslation && this.currentIncrementalTranslation.trim()) {
            // 即使沒有臨時語音識別，也可能有待完成的翻譯
            displayTranslatedText += '<span id="interim-translation" style="opacity: 0.8; font-style: italic; color: #4ade80; background: rgba(74, 222, 128, 0.15); padding: 0 4px; border-radius: 3px;">' + this.currentIncrementalTranslation + '</span>';
        }
        
        // 如果沒有任何內容，顯示預設文字
        if (!displayOriginalText.trim() && !interimTranscript) {
            displayOriginalText = `<span style="opacity: 0.6;">${this.getStatusText('waitingForSpeech')}</span>`;
            displayTranslatedText = `<span style="opacity: 0.6;">${this.getStatusText('waitingForTranslation')}</span>`;
        }
        
        // 更新單行顯示
        this.updateSingleLineDisplay(displayOriginalText, displayTranslatedText);
    }

    updateSingleLineDisplay(originalText, translatedText) {
        // 更新單行顯示，並實現動態文字滾動效果
        // 對於簡報模式，使用專用的HTML設置函數來保持底色效果
        if (this.isPresentationMode) {
            this.setPresentationHTML(this.originalWrapper, originalText);
            this.setPresentationHTML(this.translatedWrapper, translatedText);
        } else {
            this.safeSetHTML(this.originalWrapper, originalText);
            this.safeSetHTML(this.translatedWrapper, translatedText);
        }
        
        // 為正在識別的文字添加打字機效果
        this.addTypingEffect();
        
        // 確保更新後的內容可見
        this.ensureContentVisible();
    }

    addTypingEffect() {
        // 為臨時識別文字添加打字機光標效果
        const interimSpans = this.originalWrapper.querySelectorAll('span[style*="italic"]');
        interimSpans.forEach(span => {
            if (!span.textContent.includes('|')) {
                // 安全地添加打字機光標
                const cursor = document.createElement('span');
                cursor.style.animation = 'blink 1s infinite';
                cursor.textContent = '|';
                span.appendChild(cursor);
            }
        });
    }

    managePresentationTextLength() {
        // 管理原文文字長度
        if (this.currentOriginalText.length > this.maxTextLength) {
            // 找到適合的截斷點（空格或句號後）
            const cutPoint = this.findGoodCutPoint(this.currentOriginalText, this.maxTextLength * 0.7);
            this.currentOriginalText = this.currentOriginalText.substring(cutPoint);
            console.log('原文文字過長，已自動清理');
        }
        
        // 管理翻譯文字長度
        if (this.currentTranslatedText.length > this.maxTextLength) {
            const cutPoint = this.findGoodCutPoint(this.currentTranslatedText, this.maxTextLength * 0.7);
            this.currentTranslatedText = this.currentTranslatedText.substring(cutPoint);
            console.log('翻譯文字過長，已自動清理');
        }
    }

    findGoodCutPoint(text, targetLength) {
        // 尋找合適的截斷點，優先選擇句號、問號、驚嘆號後面
        const sentenceEnders = ['. ', '。 ', '? ', '？ ', '! ', '！ '];
        
        for (let i = Math.floor(targetLength); i < text.length && i < targetLength + 100; i++) {
            for (const ender of sentenceEnders) {
                if (text.substring(i, i + ender.length) === ender) {
                    return i + ender.length;
                }
            }
        }
        
        // 如果找不到句子結尾，尋找空格
        for (let i = Math.floor(targetLength); i < text.length && i < targetLength + 50; i++) {
            if (text[i] === ' ') {
                return i + 1;
            }
        }
        
        // 最後直接截斷
        return Math.floor(targetLength);
    }

    updatePresentationTranslationFlow(translationId, translation) {
        // 簡報模式翻譯流統一更新 - 防止重複顯示
        if (!this.translatedWrapper) return;
        
        console.log(`更新翻譯流: ID ${translationId}, 翻譯: "${translation}"`);
        
        // 找到對應的歷史項目
        const historyItem = this.transcriptHistory.find(item => item.id == translationId);
        if (historyItem && translation && translation !== this.getStatusText('translating')) {
            // 檢查翻譯是否是新的，避免重複添加
            if (!this.currentTranslatedText.includes(translation)) {
                this.currentTranslatedText += translation + ' ';
                console.log(`新翻譯已添加到連續流: "${translation}"`);
            }
        } else {
            // 如果找不到對應項目，重新構建翻譯文字流作為備用
            let rebuiltTranslatedText = '';
            let processedItems = 0;
            
            for (const item of this.transcriptHistory) {
                if (item.translatedText && item.translatedText !== this.getStatusText('translating')) {
                    // 只添加已完成的翻譯，跳過"翻譯中..."狀態
                    rebuiltTranslatedText += item.translatedText + ' ';
                    processedItems++;
                }
            }
            
            // 更新累積的翻譯文字 - 使用重建的文字流
            this.currentTranslatedText = rebuiltTranslatedText;
            console.log(`翻譯流重建完成: ${processedItems}個項目`);
        }
        
        // 管理文字長度（適合自然換行顯示）
        this.managePresentationTextLength();
        
        // 更新翻譯顯示
        if (this.isPresentationMode) {
            this.setPresentationHTML(this.translatedWrapper, this.currentTranslatedText);
            console.log('簡報模式翻譯顯示已更新');
        } else {
            this.safeSetHTML(this.translatedWrapper, this.currentTranslatedText);
        }
        
        this.ensureContentVisible();
    }

    initializePresentationTextFlow() {
        // 基於現有歷史記錄初始化連續文字流
        this.currentOriginalText = '';
        this.currentTranslatedText = '';
        
        // 從歷史記錄重建文字流
        for (const item of this.transcriptHistory) {
            this.currentOriginalText += item.sourceText + ' ';
            // 只添加真正的翻譯文字，不要添加原文
            if (item.translatedText && 
                item.translatedText !== this.getStatusText('translating') &&
                item.translatedText !== item.sourceText) {
                this.currentTranslatedText += item.translatedText + ' ';
            }
        }
        
        // 管理文字長度
        this.managePresentationTextLength();
        
        console.log(`簡報模式文字流初始化完成 - 原文: ${this.currentOriginalText.length}字符, 翻譯: ${this.currentTranslatedText.length}字符`);
    }

    updatePresentationContent() {
        this.updatePresentationHistory();
    }

    updatePresentationHistory() {
        if (!this.originalWrapper || !this.translatedWrapper) return;
        
        // 簡報模式使用連續文字流，直接顯示當前累積的文字
        if (this.currentOriginalText && this.currentOriginalText.trim()) {
            this.safeSetHTML(this.originalWrapper, this.currentOriginalText);
        } else {
            this.safeSetHTML(this.originalWrapper, this.getStatusText('waitingForSpeech'));
        }
        
        if (this.currentTranslatedText && this.currentTranslatedText.trim()) {
            if (this.isPresentationMode) {
                this.setPresentationHTML(this.translatedWrapper, this.currentTranslatedText);
            } else {
                this.safeSetHTML(this.translatedWrapper, this.currentTranslatedText);
            }
        } else {
            if (this.isPresentationMode) {
                this.setPresentationHTML(this.translatedWrapper, this.getStatusText('waitingForTranslation'));
            } else {
                this.safeSetHTML(this.translatedWrapper, this.getStatusText('waitingForTranslation'));
            }
        }
        
        // 確保文字容器能正確顯示並自動滾動到最新內容
        this.ensureContentVisible();
    }

    ensureContentVisible() {
        if (!this.isPresentationMode) return;
        
        // 確保原文和翻譯容器都能顯示最新內容
        setTimeout(() => {
            if (this.originalContent) {
                this.smartScroll(this.originalContent);
            }
            if (this.translatedContent) {
                this.smartScroll(this.translatedContent);
            }
        }, 50);
    }

    smartScroll(container) {
        if (!container) return;
        
        // 檢查內容是否超出容器高度
        const containerHeight = container.clientHeight;
        const contentHeight = container.scrollHeight;
        
        if (contentHeight > containerHeight) {
            // 平滑滾動到底部
            container.scrollTo({
                top: contentHeight,
                behavior: 'smooth'
            });
        }
    }

    getInitialFontSize() {
        // 根據螢幕大小設定初始字體
        const screenWidth = window.innerWidth;
        if (screenWidth <= 480) {
            return 18; // 小螢幕手機
        } else if (screenWidth <= 768) {
            return 20; // 大螢幕手機或小平板
        } else {
            return 28; // 桌面或大螢幕
        }
    }

    getFontSizeRange() {
        // 根據螢幕大小設定字體大小範圍
        const screenWidth = window.innerWidth;
        if (screenWidth <= 480) {
            return { min: 14, max: 24 }; // 小螢幕手機
        } else if (screenWidth <= 768) {
            return { min: 16, max: 32 }; // 大螢幕手機或小平板
        } else {
            return { min: 16, max: 48 }; // 桌面或大螢幕
        }
    }

    adjustFontSize(change) {
        // 調整字體大小
        if (!this.isPresentationMode) return;
        
        const range = this.getFontSizeRange();
        this.currentFontSize = Math.max(range.min, Math.min(range.max, this.currentFontSize + change));
        
        // 更新字體大小顯示
        this.fontSizeDisplay.textContent = `${this.currentFontSize}px`;
        
        // 應用字體大小到簡報內容
        if (this.originalWrapper) {
            this.originalWrapper.style.fontSize = `${this.currentFontSize}px`;
        }
        if (this.translatedWrapper) {
            this.translatedWrapper.style.fontSize = `${this.currentFontSize}px`;
        }
        
        console.log(`字體大小調整為: ${this.currentFontSize}px`);
        
        // 字體調整後確保內容可見
        this.ensureContentVisible();
    }

    toggleControls() {
        // 切換控制面板展開/收縮狀態
        if (this.controlsExpanded) {
            this.collapseControls();
        } else {
            this.expandControls();
        }
    }

    expandControls() {
        // 展開控制面板
        this.controlsExpanded = true;
        this.presentationControls.classList.remove('collapsed');
        console.log('控制面板展開');
        
        // 3秒後自動收縮（如果沒有交互）
        if (this.autoCollapseTimer) {
            clearTimeout(this.autoCollapseTimer);
        }
        this.autoCollapseTimer = setTimeout(() => {
            this.collapseControls();
        }, 5000);
    }

    collapseControls() {
        // 收縮控制面板
        this.controlsExpanded = false;
        this.presentationControls.classList.add('collapsed');
        console.log('控制面板收縮');
        
        if (this.autoCollapseTimer) {
            clearTimeout(this.autoCollapseTimer);
            this.autoCollapseTimer = null;
        }
    }

    resetAutoCollapse() {
        // 重置自動收縮計時器
        if (this.controlsExpanded && this.autoCollapseTimer) {
            clearTimeout(this.autoCollapseTimer);
            this.autoCollapseTimer = setTimeout(() => {
                this.collapseControls();
            }, 5000);
        }
    }

    // 處理語音識別引擎變更
    handleRecognitionEngineChange() {
        const selectedEngine = this.recognitionEngine.value;
        this.currentRecognitionEngine = selectedEngine;
        
        // 停止現有的識別
        if (this.isRecording) {
            this.stopRecording();
        }
        
        console.log(`切換語音識別引擎至: ${selectedEngine}`);
        
        // 根據選擇的引擎更新UI提示
        this.updateEngineStatus(selectedEngine);
    }
    
    // 更新引擎狀態提示
    updateEngineStatus(engine) {
        if (engine === 'whisper') {
            this.currentText.innerHTML = '<div style="color: #17a2b8;">📡 Whisper模式：點擊開始錄音，每1.5秒上傳一次進行識別</div>';
            this.recordBtn.textContent = '🎤 開始 Whisper 錄音';
            this.recordBtn.style.background = 'linear-gradient(135deg, #28a745, #20c997)';
        } else {
            this.currentText.innerHTML = '<div style="color: #28a745;">🎤 Web Speech模式：瀏覽器即時語音識別</div>';
            this.recordBtn.textContent = '🎤 開始會議模式';
            this.recordBtn.style.background = 'linear-gradient(135deg, #28a745, #20c997)';
        }
    }
    
    // 初始化Whisper錄音
    async initWhisperRecording() {
        try {
            // 增強麥克風設定，專為遠距離錄音優化
            this.audioStream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    sampleRate: 16000,
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true, // 自動增益控制
                    googEchoCancellation: true,
                    googAutoGainControl: true,
                    googNoiseSuppression: true,
                    googHighpassFilter: true,
                    googAudioMirroring: false
                } 
            });
            
            // 初始化音頻分析器用於音量檢測
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioContext.createAnalyser();
            const source = this.audioContext.createMediaStreamSource(this.audioStream);
            source.connect(this.analyser);
            
            this.analyser.fftSize = 256;
            this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
            
            this.mediaRecorder = new MediaRecorder(this.audioStream, {
                mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
            });
            
            this.audioChunks = [];
            
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };
            
            this.mediaRecorder.onstop = () => {
                this.processWhisperAudio();
            };
            
            return true;
        } catch (error) {
            console.error('無法初始化Whisper錄音:', error);
            alert('無法存取麥克風，請檢查權限設定');
            return false;
        }
    }
    
    // 計算當前音量等級
    getAudioLevel() {
        if (!this.analyser) return 0;
        
        this.analyser.getByteFrequencyData(this.dataArray);
        let sum = 0;
        for (let i = 0; i < this.dataArray.length; i++) {
            sum += this.dataArray[i];
        }
        return sum / this.dataArray.length;
    }
    
    // 檢查是否有足夠的音頻活動
    hasAudioActivity() {
        const currentLevel = this.getAudioLevel();
        this.lastAudioLevel = currentLevel;
        
        // 更新音量指示器
        this.updateAudioLevelIndicator(currentLevel);
        
        return currentLevel > this.silenceThreshold;
    }
    
    // 更新音量指示器
    updateAudioLevelIndicator(level) {
        const percentage = Math.min(100, (level / 100) * 100);
        const color = level > this.silenceThreshold ? '#28a745' : '#dc3545';
        
        this.currentText.innerHTML = `
            <div style="color: #17a2b8;">📡 Whisper模式 - 音量: ${Math.round(level)}
                <div style="background: #f0f0f0; height: 8px; border-radius: 4px; margin: 5px 0;">
                    <div style="background: ${color}; height: 100%; width: ${percentage}%; border-radius: 4px; transition: all 0.1s;"></div>
                </div>
            </div>
        `;
    }
    
    // 開始Whisper錄音
    async startWhisperRecording() {
        // 檢查 API Key
        if (!this.apiKey) {
            alert('請先輸入 OpenAI API Key');
            return false;
        }
        
        if (!this.mediaRecorder) {
            const success = await this.initWhisperRecording();
            if (!success) {
                alert('無法錄音：初始化失敗');
                return false;
            }
        }
        
        this.isWhisperRecording = true;
        this.mediaRecorder.start();
        
        // 設定定期錄音片段
        this.whisperRecordingInterval = setInterval(() => {
            if (this.isWhisperRecording && this.mediaRecorder && this.mediaRecorder.state === 'recording') {
                this.mediaRecorder.stop();
                setTimeout(() => {
                    if (this.isWhisperRecording) {
                        this.mediaRecorder.start();
                    }
                }, 100);
            }
        }, this.whisperRecordingDuration);
        
        console.log('Whisper 錄音開始');
        return true;
    }
    
    // 停止Whisper錄音
    stopWhisperRecording() {
        this.isWhisperRecording = false;
        
        if (this.whisperRecordingInterval) {
            clearInterval(this.whisperRecordingInterval);
            this.whisperRecordingInterval = null;
        }
        
        if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
            this.mediaRecorder.stop();
        }
        
        if (this.audioStream) {
            this.audioStream.getTracks().forEach(track => track.stop());
            this.audioStream = null;
        }
        
        // 停止錄音時處理最後累積的句子
        if (this.whisperAccumulatedText.length > 5) {
            console.log('錄音停止，處理最後的句子:', this.whisperAccumulatedText);
            this.processPendingSentence();
        }
        
        // 清理超時器
        if (this.sentenceTimeout) {
            clearTimeout(this.sentenceTimeout);
            this.sentenceTimeout = null;
        }
        
        console.log('Whisper 錄音停止');
    }
    
    // 處理Whisper音頻並上傳
    async processWhisperAudio() {
        if (this.audioChunks.length === 0) return;
        
        // 檢查最近是否有音頻活動
        const hasActivity = this.hasAudioActivity();
        
        const audioBlob = new Blob(this.audioChunks, { 
            type: this.mediaRecorder.mimeType || 'audio/webm' 
        });
        
        // 檢查音頻大小，避免上傳過小的片段
        if (audioBlob.size < 1000) {
            this.audioChunks = [];
            console.log('音頻片段太小，跳過上傳');
            return;
        }
        
        // 如果沒有音頻活動（靜音片段），跳過上傳
        if (!hasActivity && this.lastAudioLevel < this.silenceThreshold) {
            this.audioChunks = [];
            console.log(`音量過低 (${Math.round(this.lastAudioLevel)})，跳過靜音片段`);
            return;
        }
        
        this.audioChunks = [];
        
        try {
            const startTime = Date.now();
            await this.uploadToWhisper(audioBlob);
            const responseTime = Date.now() - startTime;
            this.whisperResponseTimes.push(responseTime);
            
            // 保持最近10次的回應時間記錄
            if (this.whisperResponseTimes.length > 10) {
                this.whisperResponseTimes.shift();
            }
            
            console.log(`Whisper 回應時間: ${responseTime}ms`);
        } catch (error) {
            console.error('Whisper 上傳失敗:', error);
        }
    }
    
    // 上傳音頻到Whisper API
    async uploadToWhisper(audioBlob) {
        if (!this.apiKey) {
            console.warn('未設定API Key，跳過Whisper轉錄');
            return;
        }
        
        const formData = new FormData();
        formData.append('audio', audioBlob, 'audio.webm');
        formData.append('api_key', this.apiKey);
        formData.append('language', this.sourceLanguage.value);
        
        try {
            const response = await fetch('/transcribe', {
                method: 'POST',
                body: formData
            });
            
            const result = await response.json();
            
            if (result.success && result.text && result.text.trim()) {
                // 處理識別結果
                this.handleWhisperResult(result.text.trim());
            } else if (result.error) {
                console.error('Whisper API 錯誤:', result.error);
                this.currentText.innerHTML = `<div style="color: #dc3545;">❌ ${result.error}</div>`;
            }
        } catch (error) {
            console.error('上傳到Whisper失敗:', error);
            this.currentText.innerHTML = '<div style="color: #dc3545;">❌ 網路錯誤，請檢查連線</div>';
        }
    }
    
    // 處理Whisper識別結果
    handleWhisperResult(text) {
        if (!text || text.length < 2) return;
        
        // 清理和標準化文字
        text = text.trim();
        
        // 智能累積文字：檢查是否是延續上一句還是新句子
        const processedText = this.accumulateWhisperText(text);
        
        // 計算平均回應時間
        const avgResponseTime = this.whisperResponseTimes.length > 0 
            ? Math.round(this.whisperResponseTimes.reduce((a, b) => a + b, 0) / this.whisperResponseTimes.length)
            : 0;
        
        // 顯示累積的文字和性能資訊
        this.currentText.innerHTML = `
            <div style="color: #17a2b8;">
                🎤 ${processedText}
                <div style="font-size: 12px; color: #6c757d; margin-top: 5px;">
                    回應時間: ${avgResponseTime}ms | 音量: ${Math.round(this.lastAudioLevel)} | 累積: ${this.whisperAccumulatedText.length}字
                </div>
            </div>
        `;
        
        // 檢查是否形成完整句子
        this.checkForCompleteSentence(processedText);
    }
    
    // 智能累積Whisper文字
    accumulateWhisperText(newText) {
        // 檢查新文字是否與上次結果有重疊（Whisper的連續性特征）
        if (this.lastWhisperText && newText.includes(this.lastWhisperText)) {
            // 如果新文字包含舊文字，說明是延續
            this.whisperAccumulatedText = newText;
        } else if (this.lastWhisperText && this.lastWhisperText.includes(newText)) {
            // 如果舊文字包含新文字，保持舊文字（避免退化）
            return this.whisperAccumulatedText;
        } else {
            // 檢查是否是自然延續（最後幾個字相同）
            const similarity = this.calculateTextSimilarity(this.lastWhisperText, newText);
            if (similarity > 0.5) {
                // 有重疊，合併文字
                const merged = this.mergeOverlappingText(this.whisperAccumulatedText, newText);
                this.whisperAccumulatedText = merged;
            } else {
                // 完全新的文字，可能是新句子開始
                if (this.whisperAccumulatedText.length > 0) {
                    // 先處理之前累積的句子
                    this.processPendingSentence();
                }
                this.whisperAccumulatedText = newText;
            }
        }
        
        this.lastWhisperText = newText;
        return this.whisperAccumulatedText;
    }
    
    // 計算兩段文字的相似度
    calculateTextSimilarity(text1, text2) {
        if (!text1 || !text2) return 0;
        
        const words1 = text1.toLowerCase().split(/\s+/);
        const words2 = text2.toLowerCase().split(/\s+/);
        
        let commonWords = 0;
        const maxLength = Math.max(words1.length, words2.length);
        
        words1.forEach(word => {
            if (words2.includes(word)) commonWords++;
        });
        
        return commonWords / maxLength;
    }
    
    // 合併有重疊的文字
    mergeOverlappingText(oldText, newText) {
        const oldWords = oldText.split(/\s+/);
        const newWords = newText.split(/\s+/);
        
        // 找到最佳重疊點
        let bestOverlap = 0;
        let bestPosition = oldWords.length;
        
        for (let i = 1; i <= Math.min(oldWords.length, newWords.length); i++) {
            const oldSuffix = oldWords.slice(-i).join(' ');
            const newPrefix = newWords.slice(0, i).join(' ');
            
            if (oldSuffix === newPrefix) {
                bestOverlap = i;
                bestPosition = oldWords.length - i;
            }
        }
        
        if (bestOverlap > 0) {
            // 有重疊，合併
            return oldWords.slice(0, bestPosition).concat(newWords).join(' ');
        } else {
            // 沒有重疊，直接連接
            return oldText + ' ' + newText;
        }
    }
    
    // 檢查是否形成完整句子
    checkForCompleteSentence(text) {
        // 句子結尾標點符號
        const sentenceEnders = /[.!?。！？]/;
        
        // 如果包含句尾標點，或者文字長度足夠長
        if (sentenceEnders.test(text) || text.length > 50) {
            this.processPendingSentence();
        }
        
        // 如果長時間沒有新輸入，也處理當前句子
        clearTimeout(this.sentenceTimeout);
        this.sentenceTimeout = setTimeout(() => {
            if (this.whisperAccumulatedText.length > 10) {
                this.processPendingSentence();
            }
        }, 3000); // 3秒沒有新輸入就處理
    }
    
    // 處理待處理的句子
    processPendingSentence() {
        if (this.whisperAccumulatedText && this.whisperAccumulatedText.length > 5) {
            console.log('處理完整句子:', this.whisperAccumulatedText);
            
            // 模擬Web Speech API的結果事件格式
            const mockEvent = {
                results: [{
                    0: { 
                        transcript: this.whisperAccumulatedText,
                        confidence: 0.9 
                    },
                    isFinal: true
                }],
                resultIndex: 0
            };
            
            // 使用現有的onresult處理邏輯進行翻譯
            this.handleSpeechResult(mockEvent);
            
            // 清空累積文字，準備下一句
            this.whisperAccumulatedText = '';
            this.lastWhisperText = '';
        }
    }
    
    
    // 新的Whisper切換錄音方法
    async toggleWhisperRecording() {
        if (!this.isWhisperRecording) {
            const success = await this.startWhisperRecording();
            if (success !== false) {
                this.recordBtn.textContent = '⏹️ 停止錄音';
                this.recordBtn.style.background = 'linear-gradient(135deg, #dc3545, #c82333)';
            }
        } else {
            this.stopWhisperRecording();
            this.recordBtn.textContent = '🎤 開始錄音';
            this.recordBtn.style.background = 'linear-gradient(135deg, #28a745, #20c997)';
        }
    }
    
    // 原本的Web Speech切換錄音方法
    toggleWebSpeechRecording() {
        // 使用原本的toggleRecording邏輯
        if (!this.isRecording) {
            this.startRecognition();
        } else {
            this.stopRecording();
        }
    }
    
    // 從現有的onresult邏輯中提取出來的處理方法
    handleSpeechResult(event) {
        // 這裡複製原本recognition.onresult中的邏輯
        // 為了簡化，我們直接調用現有的翻譯流程
        const transcript = event.results[event.resultIndex][0].transcript;
        const confidence = event.results[event.resultIndex][0].confidence || 0.9;
        const isFinal = event.results[event.resultIndex].isFinal;
        
        if (isFinal && transcript.trim()) {
            this.processTranscriptForTranslation(transcript, confidence);
        }
    }
    
    // 處理轉錄結果進行翻譯的方法
    async processTranscriptForTranslation(transcript, confidence = 0.9) {
        if (!transcript || transcript.trim().length < 2) return;
        
        try {
            // 增加字數統計
            this.totalWordCount += transcript.length;
            this.updateWordCount();
            
            // 添加到歷史記錄
            this.transcriptHistory.push({
                id: this.currentTranscriptId++,
                original: transcript,
                timestamp: new Date().toLocaleTimeString('zh-TW', { 
                    hour12: false, 
                    hour: '2-digit', 
                    minute: '2-digit', 
                    second: '2-digit' 
                }),
                confidence: confidence
            });
            
            // 翻譯文字
            await this.translateAndDisplay(transcript);
            
        } catch (error) {
            console.error('處理轉錄結果時發生錯誤:', error);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new RealTimeTranslator();
});

document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && e.ctrlKey) {
        e.preventDefault();
        document.getElementById('recordBtn').click();
    }
});

window.addEventListener('beforeunload', () => {
    const translator = window.translator;
    if (translator && translator.isRecording) {
        translator.recognition.stop();
    }
});