/**
 * 即時翻譯系統 - 整合版本
 * Real-time Translation System - Integrated Version
 */

class RealTimeTranslator {
    constructor() {
        // 語音識別相關
        this.recognition = null;
        this.isRecording = false;
        this.continuousMode = true;
        this.lastTranslationTime = 0;
        this.recognitionTimeout = null;
        this.recognitionRetryCount = 0;
        this.maxRecognitionRetries = 999;
        this.recognitionRestartDelay = 500;
        this.isRecognitionActive = false;
        this.lastSpeechTime = 0;
        this.silenceTimeout = null;
        this.recognitionStartTime = 0;
        this.meetingKeepAlive = null;
        this.recognitionKeepAliveInterval = null;
        this.isRestarting = false; // 重啟狀態標記
        
        // 語音識別設置
        this.sourceLanguage = 'auto';
        this.autoDetectLanguages = ['zh-TW', 'en-US'];
        this.currentLanguageIndex = 0;
        this.advancedNoiseSuppression = true;
        this.confidenceThreshold = 0.5;
        
        // Whisper 相關
        this.currentRecognitionEngine = 'webspeech';
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.whisperRecordingStartTime = 0;
        this.segmentDuration = 1500;
        this.accumulatedText = '';
        this.sentenceBoundaryPattern = /[。！？.!?]/;
        this.lastTranscriptLength = 0;
        
        // 翻譯服務
        this.apiKey = '';
        this.translationCache = new Map();
        
        // 應用狀態
        this.transcriptHistory = [];
        this.currentTranscriptId = 0;
        this.totalWordCount = 0;
        this.wakeLock = null;
        this.translatedTexts = new Set(); // 追蹤已翻譯的文本
        
        // DOM 元素
        this.elements = {};
        
        // 初始化
        this.initialize();
    }

    // 初始化系統
    async initialize() {
        try {
            // 初始化 DOM 元素
            this.initializeElements();
            
            // 設置事件監聽器
            this.setupEventListeners();
            
            // 初始化語音識別
            await this.initSpeechRecognition();
            
            // 初始化 Wake Lock
            await this.initializeWakeLock();
            
            // 載入設置
            this.loadSettings();
            
            console.log('✅ 即時翻譯系統初始化完成');
            
        } catch (error) {
            console.error('❌ 系統初始化失敗:', error);
            this.updateCurrentText('❌ 系統初始化失敗，請重新載入頁面');
        }
    }

    // 初始化 DOM 元素
    initializeElements() {
        this.elements = {
            recordBtn: document.getElementById('recordBtn'),
            sourceLanguage: document.getElementById('sourceLanguage'),
            targetLanguage: document.getElementById('targetLanguage'),
            apiKey: document.getElementById('apiKey'),
            recognitionEngine: document.getElementById('recognitionEngine'),
            confidenceThreshold: document.getElementById('confidenceThreshold'),
            confidenceValue: document.getElementById('confidenceValue'),
            advancedNoiseSuppression: document.getElementById('advancedNoiseSuppression'),
            incrementalTranslation: document.getElementById('incrementalTranslation'),
            currentText: document.getElementById('currentText'),
            transcriptDisplay: document.getElementById('transcriptDisplay'),
            wordCount: document.getElementById('wordCount'),
            clearBtn: document.getElementById('clearBtn'),
            presentationBtn: document.getElementById('presentationBtn'),
            confidenceIndicator: document.getElementById('confidenceIndicator'),
            confidenceFill: document.getElementById('confidenceFill'),
            confidenceText: document.getElementById('confidenceText')
        };
    }

    // 設置事件監聽器
    setupEventListeners() {
        // 錄音按鈕
        this.elements.recordBtn?.addEventListener('click', async () => {
            await this.toggleRecording();
        });

        // 語言切換
        this.elements.sourceLanguage?.addEventListener('change', () => {
            this.handleLanguageChange();
        });

        // API Key 輸入
        this.elements.apiKey?.addEventListener('input', (e) => {
            this.apiKey = e.target.value.trim();
            this.saveSettings();
        });

        // 識別引擎切換
        this.elements.recognitionEngine?.addEventListener('change', () => {
            this.handleRecognitionEngineChange();
        });

        // 置信度閾值
        this.elements.confidenceThreshold?.addEventListener('input', (e) => {
            const threshold = parseFloat(e.target.value);
            this.confidenceThreshold = threshold;
            this.updateConfidenceValueDisplay(threshold);
            this.saveSettings();
        });

        // 噪音抑制
        this.elements.advancedNoiseSuppression?.addEventListener('change', (e) => {
            this.advancedNoiseSuppression = e.target.checked;
            this.saveSettings();
        });

        // 清除按鈕
        this.elements.clearBtn?.addEventListener('click', () => {
            this.clearTranscript();
        });

        // 簡報模式
        this.elements.presentationBtn?.addEventListener('click', () => {
            this.togglePresentationMode();
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

    // 初始化語音識別
    async initSpeechRecognition() {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            const error = '瀏覽器不支援語音識別功能';
            console.error(error);
            this.updateCurrentText(`❌ ${error}`);
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
            this.updateCurrentText(`❌ 語音識別初始化失敗: ${error.message}`);
            return false;
        }
    }

    // 設置識別參數
    setupRecognitionSettings() {
        if (!this.recognition) return;

        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.maxAlternatives = 3;

        this.setRecognitionLanguage();
    }

    // 綁定識別事件 - 修復 aborted 錯誤
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
            this.updateCurrentText('🎤 語音識別中...');
        };

        this.recognition.onend = () => {
            this.isRecognitionActive = false;
            const sessionDuration = Date.now() - this.recognitionStartTime;
            
            console.log(`🎤 語音識別結束，持續時間: ${sessionDuration}ms`);

            // 修復：只有在正常錄音狀態且沒有正在重啟時才重啟
            if (this.isRecording && this.continuousMode && !this.isRestarting) {
                console.log(`🔄 會議模式：立即重啟語音識別以保持連續性`);
                this.scheduleRestart();
            } else {
                this.isRestarting = false; // 清除重啟標記
            }
        };

        this.recognition.onerror = (event) => {
            const errorType = event.error;
            
            // 修復：完全忽略 aborted 錯誤，這是正常的重啟行為
            if (errorType === 'aborted') {
                console.log('語音識別被中止 (正常重啟過程)');
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
            this.updateCurrentText(`❌ 語音識別錯誤: ${message}`);
            
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

    // 統一重啟調度方法
    scheduleRestart(delay = 500) {
        if (this.isRestarting) {
            console.log('重啟已在進行中，跳過此次重啟請求');
            return;
        }
        
        this.isRestarting = true;
        console.log(`計劃在 ${delay}ms 後重啟語音識別...`);
        
        setTimeout(() => {
            if (this.isRecording && this.isRestarting) {
                this.isRestarting = false;
                this.startWebSpeechRecognition();
            } else {
                this.isRestarting = false;
            }
        }, delay);
    }

    // 開始保活機制
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
            
            // 更新置信度指示器
            if (confidence > 0) {
                this.updateConfidenceIndicator(confidence);
            }
            
            // 處理結果
            if (isFinal && transcript.trim().length >= 2) {
                this.processTranscriptForTranslation(transcript.trim(), confidence);
            } else if (!isFinal) {
                // 顯示臨時文本
                if (!this.hasActiveTemporaryTranslation()) {
                    this.updateCurrentText(`🎤 ${transcript}`);
                }
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
    }

    // 開始 Web Speech Recognition
    async startWebSpeechRecognition() {
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
            
            return true;
        } catch (error) {
            console.error('無法啟動語音識別:', error);
            this.isRestarting = false; // 啟動失敗時清除重啟標記
            this.updateCurrentText(`❌ 語音識別啟動失敗: ${error.message}`);
            return false;
        }
    }

    // Whisper 語音識別相關方法
    async startWhisperRecording() {
        try {
            if (!this.apiKey) {
                this.updateCurrentText('❌ 請先設定 OpenAI API Key');
                return false;
            }

            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: this.advancedNoiseSuppression,
                    autoGainControl: true
                } 
            });

            // 嘗試不同的 MIME 類型，確保瀏覽器相容性
            let mimeType = 'audio/webm;codecs=opus';
            if (!MediaRecorder.isTypeSupported(mimeType)) {
                mimeType = 'audio/webm';
                if (!MediaRecorder.isTypeSupported(mimeType)) {
                    mimeType = 'audio/mp4';
                    if (!MediaRecorder.isTypeSupported(mimeType)) {
                        mimeType = ''; // 使用預設格式
                    }
                }
            }

            console.log(`使用 MIME 類型: ${mimeType || '預設'}`);

            this.mediaRecorder = mimeType ? 
                new MediaRecorder(stream, { mimeType }) : 
                new MediaRecorder(stream);

            this.audioChunks = [];
            this.accumulatedText = '';
            this.lastTranscriptLength = 0;

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };

            this.mediaRecorder.onstop = () => {
                this.processWhisperAudio();
            };

            this.mediaRecorder.onerror = (event) => {
                console.error('MediaRecorder 錯誤:', event.error);
                this.updateCurrentText(`❌ 錄音錯誤: ${event.error}`);
            };

            // 分段錄音
            this.mediaRecorder.start();
            this.whisperRecordingStartTime = Date.now();
            
            this.scheduleWhisperSegment();
            
            console.log('✅ Whisper 錄音已啟動');
            return true;
        } catch (error) {
            console.error('Whisper 錄音啟動失敗:', error);
            this.updateCurrentText(`❌ Whisper 錄音啟動失敗: ${error.message}`);
            return false;
        }
    }

    scheduleWhisperSegment() {
        setTimeout(() => {
            if (this.isRecording && this.mediaRecorder && this.mediaRecorder.state === 'recording') {
                this.mediaRecorder.stop();
                
                // 重新開始下一段錄音
                setTimeout(() => {
                    if (this.isRecording) {
                        this.mediaRecorder.start();
                        this.scheduleWhisperSegment();
                    }
                }, 100);
            }
        }, this.segmentDuration);
    }

    async processWhisperAudio() {
        if (this.audioChunks.length === 0) return;

        try {
            // 使用 MediaRecorder 的實際 MIME 類型
            const mimeType = this.mediaRecorder.mimeType || 'audio/webm';
            const audioBlob = new Blob(this.audioChunks, { type: mimeType });
            this.audioChunks = [];

            // 根據 MIME 類型決定文件擴展名
            let filename = 'audio.webm';
            if (mimeType.includes('mp4')) {
                filename = 'audio.mp4';
            } else if (mimeType.includes('wav')) {
                filename = 'audio.wav';
            }

            const formData = new FormData();
            formData.append('audio', audioBlob, filename);
            formData.append('api_key', this.apiKey);
            formData.append('language', this.sourceLanguage);

            console.log(`上傳音頻文件: ${filename}, 大小: ${audioBlob.size} bytes`);

            const response = await fetch('/transcribe', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (data.success && data.text) {
                this.processWhisperResult(data.text);
            } else {
                console.error('Whisper 轉錄失敗:', data.error);
                // 如果轉錄失敗，顯示錯誤但不停止錄音
                if (data.error && !data.error.includes('沒有找到音頻文件')) {
                    this.updateCurrentText(`❌ 轉錄錯誤: ${data.error}`);
                }
            }

        } catch (error) {
            console.error('處理 Whisper 音頻時出錯:', error);
            this.updateCurrentText(`❌ 音頻處理錯誤: ${error.message}`);
        }
    }

    processWhisperResult(newText) {
        if (!newText || newText.trim().length < 2) return;

        const trimmedText = newText.trim();
        console.log(`🎤 Whisper 收到: "${trimmedText}"`);

        // 更智能的文本累積邏輯
        let shouldAddText = true;

        // 如果新文本完全包含在累積文本中，跳過
        if (this.accumulatedText && this.accumulatedText.includes(trimmedText)) {
            shouldAddText = false;
        }

        // 如果累積文本包含在新文本中，替換累積文本
        if (this.accumulatedText && trimmedText.includes(this.accumulatedText)) {
            this.accumulatedText = trimmedText;
            shouldAddText = false;
        }

        // 添加新文本到累積文本
        if (shouldAddText) {
            if (this.accumulatedText) {
                // 檢查是否有重疊部分
                const words = this.accumulatedText.split(' ');
                const newWords = trimmedText.split(' ');
                
                // 尋找重疊的詞語
                let overlap = 0;
                for (let i = 0; i < Math.min(words.length, newWords.length); i++) {
                    if (words[words.length - 1 - i] === newWords[i]) {
                        overlap = i + 1;
                    } else {
                        break;
                    }
                }

                if (overlap > 0) {
                    // 移除重疊部分再添加
                    const uniqueNewWords = newWords.slice(overlap);
                    if (uniqueNewWords.length > 0) {
                        this.accumulatedText += ' ' + uniqueNewWords.join(' ');
                    }
                } else {
                    this.accumulatedText += ' ' + trimmedText;
                }
            } else {
                this.accumulatedText = trimmedText;
            }
        }

        console.log(`📝 累積文本: "${this.accumulatedText}"`);

        // 檢查是否有完整句子
        const sentenceMatch = this.accumulatedText.match(/.*?[。！？.!?]/);
        if (sentenceMatch) {
            const completeSentence = sentenceMatch[0].trim();
            
            // 只有當句子長度足夠且不重複時才進行翻譯
            if (completeSentence.length >= 3 && 
                !this.isTranslationInProgress(completeSentence) && 
                !this.translatedTexts.has(completeSentence)) {
                
                console.log(`✅ 完整句子準備翻譯: "${completeSentence}"`);
                this.processTranscriptForTranslation(completeSentence, 0.9);
                
                // 移除已翻譯的部分
                this.accumulatedText = this.accumulatedText.replace(completeSentence, '').trim();
            } else {
                console.log(`跳過句子 (重複或正在翻譯中): "${completeSentence}"`);
            }
        }

        // 顯示當前累積的文本（不覆蓋翻譯進行中的狀態）
        if (!this.hasActiveTemporaryTranslation()) {
            this.updateCurrentText(`📡 ${this.accumulatedText}`);
        }

        // 更新簡報模式顯示
        this.updatePresentationPanes(this.accumulatedText, '等待完整句子...');
    }

    // 檢查是否有相同文本的翻譯正在進行中
    isTranslationInProgress(text) {
        const currentTextElement = this.elements.currentText;
        if (!currentTextElement) return false;
        
        const currentContent = currentTextElement.innerHTML;
        return currentContent.includes('🔄') && currentContent.includes(text);
    }

    stopWhisperRecording() {
        console.log('🛑 停止 Whisper 錄音...');
        
        if (this.mediaRecorder) {
            this.mediaRecorder.stop();
            
            // 停止所有音頻軌道
            this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
            this.mediaRecorder = null;
        }

        // 處理剩餘的累積文本
        if (this.accumulatedText && this.accumulatedText.trim().length >= 3) {
            console.log(`📝 處理剩餘文本: "${this.accumulatedText.trim()}"`);
            
            // 檢查是否還沒翻譯過
            const remainingText = this.accumulatedText.trim();
            const existingTranscript = this.transcriptHistory.find(item => 
                item.original === remainingText
            );
            
            if (!existingTranscript) {
                this.processTranscriptForTranslation(remainingText, 0.9);
            }
        }

        // 清除累積文本
        this.accumulatedText = '';
        console.log('✅ Whisper 錄音已完全停止');
    }

    // 翻譯相關方法
    async translateText(text, targetLanguage = '繁體中文', sourceLanguage = 'auto') {
        if (!text || text.trim().length < 2) {
            return { success: false, error: '文本太短' };
        }

        if (!this.apiKey) {
            return { success: false, error: '未設定 API Key' };
        }

        // 檢查緩存
        const cacheKey = `${text}_${targetLanguage}_${sourceLanguage}`;
        if (this.translationCache.has(cacheKey)) {
            return { 
                success: true, 
                translation: this.translationCache.get(cacheKey),
                fromCache: true 
            };
        }

        try {
            const response = await fetch('/translate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    text: text,
                    target_language: targetLanguage,
                    source_language: sourceLanguage,
                    api_key: this.apiKey
                })
            });

            if (!response.ok) {
                throw new Error(`翻譯服務錯誤: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            
            if (!data.success) {
                throw new Error(data.error || '翻譯失敗');
            }

            const translation = data.translation.trim();
            
            // 儲存到緩存
            this.translationCache.set(cacheKey, translation);
            
            // 限制緩存大小
            if (this.translationCache.size > 100) {
                const firstKey = this.translationCache.keys().next().value;
                this.translationCache.delete(firstKey);
            }

            return { success: true, translation };

        } catch (error) {
            console.error('翻譯錯誤:', error);
            return { success: false, error: error.message };
        }
    }

    // 處理轉錄結果進行翻譯
    async processTranscriptForTranslation(transcript, confidence = 0.9) {
        if (!transcript || transcript.trim().length < 2) return;

        try {
            // 增加字數統計
            this.totalWordCount += transcript.length;
            this.updateWordCount(this.totalWordCount);

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
        const targetLanguage = this.elements.targetLanguage?.value || '繁體中文';
        const sourceLanguage = this.elements.sourceLanguage?.value || 'auto';

        try {
            // 檢查是否已經有相同文本正在翻譯中
            if (this.isTranslationInProgress(originalText)) {
                console.log(`跳過重複翻譯: ${originalText}`);
                return;
            }

            // 檢查是否已翻譯過相同內容
            if (this.translatedTexts.has(originalText)) {
                console.log(`跳過重複內容: ${originalText}`);
                return;
            }

            // 顯示翻譯進行中狀態
            this.updateCurrentText(`🔄 翻譯中: ${originalText}`);
            
            // 更新簡報模式 - 顯示翻譯進行中
            this.updatePresentationPanes(originalText, '🔄 翻譯中...');

            // 執行翻譯
            const translationResult = await this.translateText(
                originalText,
                targetLanguage,
                sourceLanguage
            );

            if (translationResult.success) {
                const translatedText = translationResult.translation;

                // 標記為已翻譯
                this.translatedTexts.add(originalText);

                // 更新轉錄項目
                transcriptItem.translated = translatedText;

                // 添加到UI
                this.addTranscriptItem({
                    original: originalText,
                    translated: translatedText,
                    timestamp: transcriptItem.timestamp
                });

                // 顯示翻譯結果，並在簡報模式下更新對應面板
                this.updateCurrentText(`✅ ${translatedText}`);
                this.updatePresentationPanes(originalText, translatedText);

                console.log(`翻譯完成: ${originalText} → ${translatedText}`);

            } else {
                console.error('翻譯失敗:', translationResult.error);
                this.updateCurrentText(`❌ 翻譯失敗: ${translationResult.error}`);
            }

        } catch (error) {
            console.error('翻譯過程中出現錯誤:', error);
            this.updateCurrentText(`❌ 翻譯錯誤: ${error.message}`);
        }
    }

    // 更新簡報模式的面板
    updatePresentationPanes(originalText, translatedText) {
        const originalContent = document.getElementById('originalContent');
        const translatedContent = document.getElementById('translatedContent');
        
        if (originalContent) {
            originalContent.innerHTML = `<div class="text-wrapper">${originalText}</div>`;
        }
        
        if (translatedContent) {
            translatedContent.innerHTML = `<div class="text-wrapper">${translatedText}</div>`;
        }
    }

    // 檢查是否有活躍的臨時翻譯
    hasActiveTemporaryTranslation() {
        const currentTextElement = this.elements.currentText;
        if (!currentTextElement) return false;
        
        const currentContent = currentTextElement.innerHTML;
        return currentContent.includes('🔄') || currentContent.includes('翻譯中');
    }

    // UI 相關方法
    updateCurrentText(text) {
        if (this.elements.currentText) {
            this.elements.currentText.innerHTML = text;
        }
    }


    updateWordCount(count) {
        if (this.elements.wordCount) {
            this.elements.wordCount.textContent = `字數: ${count}`;
        }
    }

    updateConfidenceIndicator(confidence) {
        if (this.elements.confidenceFill && this.elements.confidenceText) {
            const percentage = Math.round(confidence * 100);
            this.elements.confidenceFill.style.width = `${percentage}%`;
            this.elements.confidenceText.textContent = `${percentage}%`;
            
            // 顏色指示
            if (confidence >= 0.8) {
                this.elements.confidenceFill.style.background = '#28a745';
            } else if (confidence >= 0.6) {
                this.elements.confidenceFill.style.background = '#ffc107';
            } else {
                this.elements.confidenceFill.style.background = '#dc3545';
            }
        }
    }

    updateConfidenceValueDisplay(threshold) {
        if (this.elements.confidenceValue) {
            const labels = {
                0.3: '很敏感',
                0.4: '敏感',
                0.5: '中等',
                0.6: '較準確',
                0.7: '準確',
                0.8: '很準確'
            };
            this.elements.confidenceValue.textContent = labels[threshold] || '中等';
        }
    }

    addTranscriptItem(item) {
        if (!this.elements.transcriptDisplay) return;

        const transcriptItem = document.createElement('div');
        transcriptItem.className = 'transcript-item';
        transcriptItem.innerHTML = `
            <div class="timestamp">${item.timestamp}</div>
            <div class="content">
                <div class="source-text">${item.original}</div>
                <div class="translated-text">${item.translated}</div>
            </div>
        `;

        // 移除開始消息（如果存在）
        const startMessage = this.elements.transcriptDisplay.querySelector('.start-message');
        if (startMessage) {
            startMessage.remove();
        }

        this.elements.transcriptDisplay.appendChild(transcriptItem);
        transcriptItem.scrollIntoView({ behavior: 'smooth' });
    }

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
        
        this.transcriptHistory = [];
        this.currentTranscriptId = 0;
        this.totalWordCount = 0;
        this.translatedTexts.clear(); // 清除已翻譯文本追蹤
        this.accumulatedText = ''; // 清除 Whisper 累積文本
        
        this.updateWordCount(0);
        this.updateCurrentText('📝 記錄已清除，可以重新開始');
        
        console.log('🗑️ 轉錄記錄和翻譯追蹤已清除');
    }

    updateRecordButton(isRecording, text = null) {
        if (!this.elements.recordBtn) return;
        
        if (isRecording) {
            this.elements.recordBtn.textContent = '⏹️ 停止錄音';
            this.elements.recordBtn.className = 'record-btn recording';
        } else {
            this.elements.recordBtn.textContent = text || '🎤 檢查狀態';
            this.elements.recordBtn.className = 'record-btn';
        }
    }

    // 主要控制方法
    async toggleRecording() {
        if (this.isRecording) {
            this.stopRecording();
        } else {
            await this.startRecording();
        }
    }

    async startRecording() {
        try {
            let success = false;

            if (this.currentRecognitionEngine === 'whisper') {
                if (!this.apiKey) {
                    this.updateCurrentText('❌ 請先設定 OpenAI API Key');
                    return;
                }
                success = await this.startWhisperRecording();
            } else {
                success = await this.startWebSpeechRecognition();
            }

            if (success) {
                this.isRecording = true;
                this.updateRecordButton(true);
                console.log(`${this.currentRecognitionEngine} 錄音已開始`);
            } else {
                this.updateCurrentText(`❌ 無法啟動 ${this.currentRecognitionEngine} 錄音`);
            }

        } catch (error) {
            console.error('啟動錄音失敗:', error);
            this.updateCurrentText(`❌ 錄音啟動失敗: ${error.message}`);
        }
    }

    stopRecording() {
        console.log('停止語音識別...');
        
        if (this.currentRecognitionEngine === 'whisper') {
            this.stopWhisperRecording();
        } else {
            if (this.recognition && this.isRecognitionActive) {
                this.recognition.stop();
            }
            this.stopKeepAlive();
        }

        this.isRecording = false;
        this.isRestarting = false; // 清除重啟標記
        this.recognitionRetryCount = 0;
        
        this.updateRecordButton(false);
        console.log('語音識別已停止');
    }

    handleRecognitionEngineChange() {
        const newEngine = this.elements.recognitionEngine?.value || 'webspeech';

        // 停止現有錄音
        if (this.isRecording) {
            this.stopRecording();
        }

        this.currentRecognitionEngine = newEngine;
        this.updateEngineStatus(newEngine);
        this.saveSettings();
        
        console.log(`切換識別引擎至: ${newEngine}`);
    }

    updateEngineStatus(engine) {
        if (engine === 'whisper') {
            this.updateCurrentText('<div style="color: #17a2b8;">📡 Whisper模式：點擊開始錄音，每1.5秒上傳一次進行識別</div>');
            this.updateRecordButton(false, '🎤 開始 Whisper 錄音');
        } else {
            this.updateCurrentText('<div style="color: #28a745;">🎤 Web Speech模式：瀏覽器即時語音識別</div>');
            this.updateRecordButton(false, '🎤 開始會議模式');
        }
    }

    handleLanguageChange() {
        const sourceLanguage = this.elements.sourceLanguage?.value || 'auto';
        this.sourceLanguage = sourceLanguage;
        
        if (this.currentRecognitionEngine === 'webspeech') {
            this.setRecognitionLanguage();
            
            if (this.continuousMode && this.isRecording) {
                this.recognition.stop();
                setTimeout(() => {
                    this.startWebSpeechRecognition();
                }, 500);
            }
        }

        this.saveSettings();
    }

    togglePresentationMode() {
        const container = document.getElementById('container');
        const presentationControls = document.getElementById('presentationControls');
        const originalPane = document.getElementById('originalPane');
        const translatedPane = document.getElementById('translatedPane');
        const transcriptContainer = document.getElementById('transcriptContainer');
        
        if (container && presentationControls && originalPane && translatedPane) {
            const isPresentationMode = container.classList.contains('presentation-mode');
            
            if (!isPresentationMode) {
                // 進入簡報模式
                container.classList.add('presentation-mode');
                presentationControls.style.display = 'block';
                originalPane.style.display = 'block';
                translatedPane.style.display = 'block';
                transcriptContainer.style.display = 'none';
                
                if (this.elements.presentationBtn) {
                    this.elements.presentationBtn.style.display = 'none';
                }
                
                console.log('進入簡報模式');
            } else {
                // 退出簡報模式
                this.exitPresentationMode();
            }
        }
    }

    exitPresentationMode() {
        const container = document.getElementById('container');
        const presentationControls = document.getElementById('presentationControls');
        const originalPane = document.getElementById('originalPane');
        const translatedPane = document.getElementById('translatedPane');
        const transcriptContainer = document.getElementById('transcriptContainer');
        
        if (container && presentationControls && originalPane && translatedPane) {
            container.classList.remove('presentation-mode');
            presentationControls.style.display = 'none';
            originalPane.style.display = 'none';
            translatedPane.style.display = 'none';
            transcriptContainer.style.display = 'block';
            
            if (this.elements.presentationBtn) {
                this.elements.presentationBtn.style.display = 'inline-block';
            }
            
            console.log('退出簡報模式');
        }
    }

    // Wake Lock
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

    // 設置管理
    loadSettings() {
        try {
            const settings = JSON.parse(localStorage.getItem('translatorSettings') || '{}');
            
            if (settings.apiKey) {
                this.apiKey = settings.apiKey;
                if (this.elements.apiKey) {
                    this.elements.apiKey.value = settings.apiKey;
                }
            }
            
            if (settings.recognitionEngine) {
                this.currentRecognitionEngine = settings.recognitionEngine;
                if (this.elements.recognitionEngine) {
                    this.elements.recognitionEngine.value = settings.recognitionEngine;
                }
                this.updateEngineStatus(settings.recognitionEngine);
            }
            
            if (settings.sourceLanguage) {
                this.sourceLanguage = settings.sourceLanguage;
                if (this.elements.sourceLanguage) {
                    this.elements.sourceLanguage.value = settings.sourceLanguage;
                }
            }
            
            if (settings.targetLanguage && this.elements.targetLanguage) {
                this.elements.targetLanguage.value = settings.targetLanguage;
            }
            
            if (settings.confidenceThreshold) {
                this.confidenceThreshold = settings.confidenceThreshold;
                if (this.elements.confidenceThreshold) {
                    this.elements.confidenceThreshold.value = settings.confidenceThreshold;
                }
                this.updateConfidenceValueDisplay(settings.confidenceThreshold);
            }
            
            if (typeof settings.advancedNoiseSuppression === 'boolean') {
                this.advancedNoiseSuppression = settings.advancedNoiseSuppression;
                if (this.elements.advancedNoiseSuppression) {
                    this.elements.advancedNoiseSuppression.checked = settings.advancedNoiseSuppression;
                }
            }
            
        } catch (error) {
            console.warn('載入設置失敗:', error);
        }
    }

    saveSettings() {
        try {
            const settings = {
                apiKey: this.apiKey,
                recognitionEngine: this.currentRecognitionEngine,
                sourceLanguage: this.sourceLanguage,
                targetLanguage: this.elements.targetLanguage?.value || '繁體中文',
                confidenceThreshold: this.confidenceThreshold,
                advancedNoiseSuppression: this.advancedNoiseSuppression
            };
            
            localStorage.setItem('translatorSettings', JSON.stringify(settings));
        } catch (error) {
            console.warn('保存設置失敗:', error);
        }
    }

    // 清理資源
    cleanup() {
        this.stopRecording();
        this.stopKeepAlive();
        
        if (this.wakeLock) {
            this.wakeLock.release();
        }

        if (this.recognition) {
            this.recognition.onstart = null;
            this.recognition.onend = null;
            this.recognition.onerror = null;
            this.recognition.onresult = null;
        }
    }

    // 獲取系統狀態
    getSystemStatus() {
        return {
            isRecording: this.isRecording,
            currentEngine: this.currentRecognitionEngine,
            isRecognitionActive: this.isRecognitionActive,
            isRestarting: this.isRestarting,
            language: this.recognition ? this.recognition.lang : 'unknown',
            retryCount: this.recognitionRetryCount,
            confidenceThreshold: this.confidenceThreshold,
            totalWordCount: this.totalWordCount,
            historyCount: this.transcriptHistory.length,
            cacheSize: this.translationCache.size
        };
    }
}

// 初始化應用
let translator = null;

document.addEventListener('DOMContentLoaded', () => {
    translator = new RealTimeTranslator();
    window.translator = translator; // 用於調試
    
    // 設置簡報模式控制
    setupPresentationControls();
});

function setupPresentationControls() {
    // 控制面板切換
    const controlToggle = document.getElementById('controlToggle');
    const controlsContent = document.getElementById('controlsContent');
    
    if (controlToggle && controlsContent) {
        controlToggle.addEventListener('click', () => {
            const isExpanded = controlsContent.style.display === 'block';
            controlsContent.style.display = isExpanded ? 'none' : 'block';
        });
    }
    
    // 字體大小控制
    const fontDecrease = document.getElementById('fontDecrease');
    const fontIncrease = document.getElementById('fontIncrease');
    const fontSizeDisplay = document.getElementById('fontSizeDisplay');
    
    let currentFontSize = 28;
    
    if (fontDecrease && fontIncrease && fontSizeDisplay) {
        fontDecrease.addEventListener('click', () => {
            if (currentFontSize > 16) {
                currentFontSize -= 2;
                updatePresentationFontSize(currentFontSize);
                fontSizeDisplay.textContent = `${currentFontSize}px`;
            }
        });
        
        fontIncrease.addEventListener('click', () => {
            if (currentFontSize < 48) {
                currentFontSize += 2;
                updatePresentationFontSize(currentFontSize);
                fontSizeDisplay.textContent = `${currentFontSize}px`;
            }
        });
    }
    
    // 退出簡報模式
    const presentationExitBtn = document.getElementById('presentationExitBtn');
    const exitPresentationBtn = document.getElementById('exitPresentationBtn');
    
    if (presentationExitBtn) {
        presentationExitBtn.addEventListener('click', () => {
            if (translator) {
                translator.exitPresentationMode();
            }
        });
    }
    
    if (exitPresentationBtn) {
        exitPresentationBtn.addEventListener('click', () => {
            if (translator) {
                translator.exitPresentationMode();
            }
        });
    }
    
    // 設定切換
    const settingsToggle = document.getElementById('settingsToggle');
    const apiConfig = document.getElementById('apiConfig');
    const controls = document.getElementById('controls');
    
    if (settingsToggle && apiConfig && controls) {
        settingsToggle.addEventListener('click', () => {
            const isHidden = apiConfig.style.display === 'none';
            apiConfig.style.display = isHidden ? 'block' : 'none';
            controls.style.display = isHidden ? 'block' : 'none';
            settingsToggle.textContent = isHidden ? '⚙️ 隱藏設定' : '⚙️ 顯示設定';
        });
    }
}

function updatePresentationFontSize(size) {
    const originalContent = document.getElementById('originalContent');
    const translatedContent = document.getElementById('translatedContent');
    
    if (originalContent) {
        originalContent.style.fontSize = `${size}px`;
    }
    
    if (translatedContent) {
        translatedContent.style.fontSize = `${size}px`;
    }
}