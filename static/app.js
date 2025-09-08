class RealTimeTranslator {
    constructor() {
        this.recognition = null;
        this.isRecording = false;
        this.apiKey = '';
        this.continuousMode = true;
        this.lastTranslationTime = 0;
        this.recognitionTimeout = null;
        this.translationQueue = [];
        this.transcriptHistory = [];
        this.currentTranscriptId = 0;
        this.totalWordCount = 0;
        this.autoDetectLanguages = ['zh-TW', 'en-US'];
        this.currentLanguageIndex = 0;
        this.presentationMaxItems = 5;
        this.maxTextLength = 800; // 最大文字長度
        this.currentOriginalText = ''; // 當前原文累積文字
        this.currentTranslatedText = ''; // 當前翻譯累積文字
        
        // 語音識別重啟保護
        this.recognitionRetryCount = 0;
        this.maxRecognitionRetries = 5;
        this.recognitionRestartDelay = 100;
        
        this.initElements();
        this.setupNoiseControlListeners();
        this.initializeConfidenceDisplay();
        this.initSpeechRecognition();
        this.bindEvents();
        this.startContinuousRecording();
    }

    getEnvironmentSettings() {
        const environment = this.noiseEnvironment.value;
        
        switch (environment) {
            case 'quiet':
                return {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false,
                    sampleRate: 44100
                };
            case 'normal':
                return {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    sampleRate: 48000
                };
            case 'noisy':
                return {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    sampleRate: 48000
                };
            case 'very-noisy':
                return {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    sampleRate: 48000
                };
            default:
                return {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    sampleRate: 48000
                };
        }
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
        this.currentFontSize = 28;
        this.controlsExpanded = false;
        
        this.isPresentationMode = false;
        this.currentConfidenceThreshold = 0.5;
        
        // 即時翻譯相關
        this.currentTranslationText = '';     // 當前正在翻譯的文字
        this.lastInterimText = '';            // 上次的臨時文字
        this.currentTranslationId = null;     // 當前翻譯的ID
        this.translationUpdateTimer = null;   // 翻譯更新計時器
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
        this.recognition.maxAlternatives = 5; // 更多候選結果提升準確度
        
        // 針對簡報模式優化語音識別參數
        if (this.isPresentationMode) {
            // 更頻繁的結果更新
            this.recognition.interimResults = true;
            this.recognition.continuous = true;
        }
        
        this.setRecognitionLanguage();

        this.recognition.onstart = () => {
            this.isRecording = true;
            this.updateUI();
            console.log('語音識別已啟動');
            
            // 成功啟動時重置重試計數器
            this.recognitionRetryCount = 0;
            
            // 清空當前顯示的臨時文字
            this.currentText.innerHTML = '';
            
            // 簡報模式不需要清空，保持連續文字流
        };

        this.recognition.onend = () => {
            console.log('語音識別結束，重新啟動...');
            if (this.continuousMode) {
                if (this.recognitionRetryCount < this.maxRecognitionRetries) {
                    this.recognitionRetryCount++;
                    const delay = Math.min(this.recognitionRestartDelay * this.recognitionRetryCount, 2000);
                    console.log(`語音識別重啟 (第${this.recognitionRetryCount}次，延遲${delay}ms)`);
                    
                    setTimeout(() => {
                        this.startRecognition();
                    }, delay);
                } else {
                    console.error('語音識別重試次數已達上限，停止自動重啟');
                    this.stopContinuousRecording();
                    alert('語音識別遇到問題，請檢查麥克風權限後重新開始');
                }
            } else {
                this.isRecording = false;
                this.updateUI();
            }
        };

        this.recognition.onerror = (event) => {
            console.error('語音識別錯誤:', event.error);
            
            // 根據錯誤類型採取不同處理策略
            const errorHandlers = {
                'no-speech': () => {
                    console.log('未檢測到語音，快速重啟...');
                    if (this.continuousMode) {
                        setTimeout(() => this.startRecognition(), 300);
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
            this.currentText.innerHTML = finalTranscript + 
                '<span class="interim-text"> ' + interimTranscript + '</span>';

            // 簡報模式即時更新 - 更頻繁、更精確的更新
            if (this.isPresentationMode) {
                const currentFinal = finalTranscript.trim();
                const currentInterim = interimTranscript.trim();
                
                // 立即更新簡報模式顯示，不管內容是否變化
                this.updatePresentationLiveText(currentFinal, currentInterim);
                
                // 調試信息
                if (currentFinal || currentInterim) {
                    console.log(`簡報即時更新: 最終="${currentFinal}" 臨時="${currentInterim}"`);
                }
            }

            // 即時翻譯處理
            this.handleRealtimeTranslation(finalTranscript, interimTranscript);

        };
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
            localStorage.setItem('openai_api_key', this.apiKey);
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

        const savedApiKey = localStorage.getItem('openai_api_key');
        if (savedApiKey) {
            this.apiKey = savedApiKey;
            this.apiKeyInput.value = savedApiKey;
        }
    }

    toggleRecording() {
        if (!this.apiKey) {
            alert('請先輸入 OpenAI API Key');
            this.apiKeyInput.focus();
            return;
        }

        if (!this.recognition) {
            alert('語音識別功能不可用');
            return;
        }

        this.continuousMode = !this.continuousMode;
        
        if (this.continuousMode) {
            this.startContinuousRecording();
        } else {
            this.stopContinuousRecording();
        }
    }

    startContinuousRecording() {
        if (!this.apiKey) {
            setTimeout(() => this.startContinuousRecording(), 2000);
            return;
        }
        
        this.continuousMode = true;
        this.startRecognition();
    }

    stopContinuousRecording() {
        this.continuousMode = false;
        if (this.recognition) {
            this.recognition.stop();
        }
        this.isRecording = false;
        this.updateUI();
        this.updateStatus('source', 'ready', '已停止');
    }

    startRecognition() {
        if (!this.recognition || !this.continuousMode) return;
        
        try {
            this.recognition.start();
        } catch (error) {
            console.log('Recognition already started or error:', error);
            setTimeout(() => {
                if (this.continuousMode) {
                    this.startRecognition();
                }
            }, 1000);
        }
    }

    updateUI() {
        if (this.continuousMode) {
            this.recordBtn.textContent = '⏹️ 停止會議模式';
            this.recordBtn.classList.remove('stopped');
        } else {
            this.recordBtn.textContent = '🔴 開始會議模式';
            this.recordBtn.classList.add('stopped');
        }
    }

    addTranscriptItem(text) {
        const timestamp = new Date().toLocaleTimeString('zh-TW', { 
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        
        const transcriptItem = {
            id: this.currentTranscriptId++,
            timestamp: timestamp,
            sourceText: text,
            translatedText: '翻譯中...'
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
        
        div.innerHTML = `
            <div class="timestamp">${item.timestamp}</div>
            <div class="content">
                <div class="source-text">${item.sourceText}</div>
                <div class="translated-text">${item.translatedText}</div>
            </div>
        `;
        
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
            this.transcriptDisplay.innerHTML = `
                <div class="transcript-item start-message">
                    <div class="timestamp">重新開始</div>
                    <div class="content">
                        <div class="source-text">字幕已清除，準備記錄新的會議內容...</div>
                        <div class="translated-text">Transcript cleared, ready to record new meeting content...</div>
                    </div>
                </div>
            `;
            this.updateWordCount();

            // 清空簡報模式的連續文字流
            if (this.isPresentationMode) {
                this.currentOriginalText = '';
                this.currentTranslatedText = '';
                if (this.originalWrapper) {
                    this.originalWrapper.innerHTML = '等待語音輸入...';
                }
                if (this.translatedWrapper) {
                    this.translatedWrapper.innerHTML = '等待翻譯結果...';
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
        // 根據語言調整識別參數以提升準確度
        if (language.startsWith('zh')) {
            // 中文識別優化
            this.recognition.maxAlternatives = 5; // 中文需要更多候選
        } else if (language.startsWith('en')) {
            // 英文識別優化
            this.recognition.maxAlternatives = 3;
        }
        
        console.log(`已針對 ${language} 優化識別參數`);
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

    handleRealtimeTranslation(finalTranscript, interimTranscript) {
        // 處理即時翻譯邏輯
        const currentText = finalTranscript + interimTranscript;
        
        if (finalTranscript.trim()) {
            // 有最終結果，立即翻譯並更新基準
            this.currentTranslationText = finalTranscript;
            this.lastInterimText = '';
            
            // 清理增量翻譯顯示
            this.clearIncrementalTranslation();
            
            // 執行最終翻譯
            this.addPunctuationAndTranslate(finalTranscript, this.currentTranscriptId);
            
        } else if (interimTranscript.trim() && this.incrementalTranslation.checked) {
            // 只有臨時結果，且啟用增量翻譯時才進行
            this.handleIncrementalTranslation(interimTranscript);
        }
    }

    handleIncrementalTranslation(interimText) {
        // 處理增量翻譯
        if (interimText === this.lastInterimText) {
            return; // 文字沒有變化，不需要重新翻譯
        }
        
        // 清除之前的計時器
        if (this.translationUpdateTimer) {
            clearTimeout(this.translationUpdateTimer);
        }
        
        // 如果文字有顯著變化，觸發增量翻譯
        const fullText = this.currentTranslationText + ' ' + interimText;
        
        // 智能觸發增量翻譯
        const shouldTranslate = this.shouldTriggerIncrementalTranslation(interimText);
        
        if (shouldTranslate) {
            const delay = interimText.length > 10 ? 300 : 600; // 較長文字更快翻譯
            this.translationUpdateTimer = setTimeout(() => {
                console.log(`增量翻譯 (${interimText.length}字): "${interimText}"`);
                this.translateIncrementalText(fullText.trim(), interimText);
            }, delay);
        }
        
        this.lastInterimText = interimText;
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
                            content: `你是一個即時翻譯助手。請翻譯以下文字到${targetLang}。這是一個增量翻譯，文字可能不完整，請提供最佳的部分翻譯。`
                        },
                        {
                            role: 'user',
                            content: `完整文字: "${fullText}"\n需要特別關注的部分: "${partialText}"\n\n請翻譯到${targetLang}，如果句子不完整也沒關係，提供當前最合理的翻譯。`
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
        }
    }

    updateIncrementalTranslation(translatedText, originalPart) {
        // 清理增量翻譯內容中的換行符號
        const cleanTranslatedText = translatedText ? translatedText.replace(/\n+/g, ' ').replace(/\s+/g, ' ') : '';
        
        // 更新增量翻譯的顯示
        console.log(`增量翻譯結果: "${originalPart}" -> "${cleanTranslatedText}"`);
        
        // 在當前顯示區域顯示增量翻譯（用特殊樣式標記）
        const currentDisplay = this.currentText.innerHTML;
        const incrementalHtml = `<span class="incremental-translation" style="color: #4facfe; font-style: italic; opacity: 0.8;">[${cleanTranslatedText}]</span>`;
        
        // 暫時顯示增量翻譯
        this.currentText.innerHTML = currentDisplay + ' ' + incrementalHtml;
        
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
            translatedLines.push(item.translatedText || '翻譯中...');
        });
        
        // 清理增量翻譯文字中的換行符號
        const cleanTranslatedText = translatedText ? translatedText.replace(/\n+/g, ' ').replace(/\s+/g, ' ') : '';
        
        // 儲存增量翻譯狀態
        this.currentIncrementalTranslation = cleanTranslatedText;
        
        // 立即更新簡報模式的連續文字流顯示
        this.updatePresentationLiveText('', '');
    }

    clearIncrementalTranslation() {
        // 清理增量翻譯的顯示
        if (this.translationUpdateTimer) {
            clearTimeout(this.translationUpdateTimer);
            this.translationUpdateTimer = null;
        }
        
        // 清理當前顯示中的增量翻譯標記
        const currentTextContent = this.currentText.innerHTML;
        if (currentTextContent.includes('incremental-translation')) {
            // 移除增量翻譯的 span 標籤
            this.currentText.innerHTML = currentTextContent.replace(
                /<span class="incremental-translation"[^>]*>\[.*?\]<\/span>/g, 
                ''
            ).trim();
        }
        
        // 清理簡報模式中的增量翻譯
        if (this.isPresentationMode && this.translatedWrapper) {
            const presentationContent = this.translatedWrapper.innerHTML;
            if (presentationContent.includes('italic')) {
                this.translatedWrapper.innerHTML = presentationContent.replace(
                    /<span style="opacity: 0\.7; font-style: italic;">\s*\[.*?\]<\/span>/g,
                    ''
                ).trim();
            }
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
                            content: `You are a professional transcription and translation assistant. Your task:
1. First, add appropriate punctuation to the input text (periods, commas, question marks, etc.)
2. Then translate the punctuated text to ${this.targetLanguage.value}
3. Return ONLY a JSON object with this format: {"original": "text with punctuation", "translation": "translated text"}
4. Both texts should have proper punctuation and natural formatting
5. If input is already in target language, just add punctuation and rephrase naturally`
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
                this.addTranscriptItem(cleanOriginal);
                // 更新翻譯
                this.updateTranscriptTranslation(transcriptId, cleanTranslation);
            } catch (parseError) {
                // 如果JSON解析失敗，使用原本邏輯
                console.log('JSON解析失敗，使用備用方法');
                this.addTranscriptItem(text);
                this.translateText(text, transcriptId);
            }

        } catch (error) {
            console.error('處理錯誤:', error);
            // 錯誤時使用原本邏輯
            this.addTranscriptItem(text);
            this.updateTranscriptTranslation(transcriptId, `處理失敗: ${error.message}`);
        }
    }

    async translateText(text, transcriptId) {
        if (!text.trim() || !this.apiKey) return;

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
                            content: `You are a professional translator. Automatically detect the input language and translate the following text to ${this.targetLanguage.value}. Add proper punctuation to both input and output. Only respond with the translation, no explanations. If the input is already in the target language, provide a natural rephrasing or keep it as is.`
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
        }
    }

    enterPresentationMode() {
        if (!this.apiKey) {
            alert('請先設定 API Key 才能進入簡報模式');
            return;
        }

        this.isPresentationMode = true;
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
        
        // 初始化字體大小
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
                this.currentTranslatedText += newText + ' ';
            }
        }
        
        // 自動清理過長的文字（適合自然換行顯示）
        this.managePresentationTextLength();
        
        // 構建顯示文字 - 連續流動，自然換行
        let displayOriginalText = this.currentOriginalText;
        let displayTranslatedText = this.currentTranslatedText;
        
        // 添加當前正在識別的臨時文字（即時逐字顯示）
        if (interimTranscript && interimTranscript.trim()) {
            displayOriginalText += '<span style="opacity: 0.8; font-style: italic; color: #7dd3fc; background: rgba(125, 211, 252, 0.15); padding: 0 4px; border-radius: 3px;">' + interimTranscript + '</span>';
            
            // 翻譯區域顯示即時翻譯或臨時文字
            if (this.currentIncrementalTranslation && this.currentIncrementalTranslation.trim()) {
                displayTranslatedText += '<span style="opacity: 0.8; font-style: italic; color: #4ade80; background: rgba(74, 222, 128, 0.15); padding: 0 4px; border-radius: 3px;">' + this.currentIncrementalTranslation + '</span>';
            } else {
                displayTranslatedText += '<span style="opacity: 0.6; font-style: italic; color: #94a3b8;">翻譯中...</span>';
            }
        }
        
        // 如果沒有任何內容，顯示預設文字
        if (!displayOriginalText.trim() && !interimTranscript) {
            displayOriginalText = '<span style="opacity: 0.6;">等待語音輸入...</span>';
            displayTranslatedText = '<span style="opacity: 0.6;">等待翻譯結果...</span>';
        }
        
        // 更新單行顯示
        this.updateSingleLineDisplay(displayOriginalText, displayTranslatedText);
    }

    managePresentationTextLengthForSingleLine() {
        // 針對單行顯示的文字長度管理 - 更積極地清理
        const maxLength = 200; // 更短的長度限制，適合單行顯示
        
        if (this.currentOriginalText.length > maxLength) {
            const cutPoint = this.findGoodCutPoint(this.currentOriginalText, maxLength * 0.6);
            this.currentOriginalText = this.currentOriginalText.substring(cutPoint);
            console.log('原文已自動清理以保持單行顯示');
        }
        
        if (this.currentTranslatedText.length > maxLength) {
            const cutPoint = this.findGoodCutPoint(this.currentTranslatedText, maxLength * 0.6);
            this.currentTranslatedText = this.currentTranslatedText.substring(cutPoint);
            console.log('翻譯已自動清理以保持單行顯示');
        }
    }

    updateSingleLineDisplay(originalText, translatedText) {
        // 更新單行顯示，並實現動態文字滾動效果
        this.originalWrapper.innerHTML = originalText;
        this.translatedWrapper.innerHTML = translatedText;
        
        // 為正在識別的文字添加打字機效果
        this.addTypingEffect();
    }

    addTypingEffect() {
        // 為臨時識別文字添加打字機光標效果
        const interimSpans = this.originalWrapper.querySelectorAll('span[style*="italic"]');
        interimSpans.forEach(span => {
            if (!span.textContent.includes('|')) {
                span.innerHTML += '<span style="animation: blink 1s infinite;">|</span>';
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
        // 單行顯示的翻譯流更新
        if (!this.translatedWrapper) return;
        
        // 重新構建翻譯文字流 - 保持單行格式
        let rebuiltTranslatedText = '';
        for (const item of this.transcriptHistory) {
            if (item.translatedText) {
                rebuiltTranslatedText += item.translatedText + ' ';
            } else {
                rebuiltTranslatedText += item.sourceText + ' ';
            }
        }
        
        // 更新累積的翻譯文字
        this.currentTranslatedText = rebuiltTranslatedText;
        
        // 管理文字長度（適合自然換行顯示）
        this.managePresentationTextLength();
        
        // 更新翻譯顯示，允許自然換行
        this.translatedWrapper.innerHTML = this.currentTranslatedText;
        
        console.log(`簡報模式翻譯更新: ID ${translationId}, 長度: ${this.currentTranslatedText.length}`);
    }

    initializePresentationTextFlow() {
        // 基於現有歷史記錄初始化連續文字流
        this.currentOriginalText = '';
        this.currentTranslatedText = '';
        
        // 從歷史記錄重建文字流
        for (const item of this.transcriptHistory) {
            this.currentOriginalText += item.sourceText + ' ';
            if (item.translatedText) {
                this.currentTranslatedText += item.translatedText + ' ';
            } else {
                this.currentTranslatedText += item.sourceText + ' ';
            }
        }
        
        // 管理文字長度
        this.managePresentationTextLength();
        
        console.log('簡報模式連續文字流已初始化');
    }

    updatePresentationContent() {
        this.updatePresentationHistory();
    }

    updatePresentationHistory() {
        if (!this.originalWrapper || !this.translatedWrapper) return;
        
        // 獲取最近的歷史記錄，用換行分隔
        const recentHistory = this.transcriptHistory.slice(-this.presentationMaxItems);
        
        if (recentHistory.length === 0) {
            this.originalWrapper.innerHTML = '等待語音輸入...';
            this.translatedWrapper.innerHTML = '等待翻譯結果...';
            return;
        }
        
        // 構建顯示內容，每句話一行
        let originalLines = [];
        let translatedLines = [];
        
        recentHistory.forEach((item) => {
            originalLines.push(item.sourceText || '');
            translatedLines.push(item.translatedText || item.sourceText || '');
        });
        
        // 更新顯示內容
        this.originalWrapper.innerHTML = originalLines.join('<br>');
        this.translatedWrapper.innerHTML = translatedLines.join('<br>');
        
        // 強制自動滾動到底部
        setTimeout(() => {
            this.forceScrollToBottom(this.originalContent);
            this.forceScrollToBottom(this.translatedContent);
        }, 50);
    }

    autoScrollToBottom(element) {
        // 檢查是否需要滾動
        setTimeout(() => {
            if (element.scrollHeight > element.clientHeight) {
                element.scrollTop = element.scrollHeight;
            }
        }, 100);
    }

    forceScrollToBottom(element) {
        // 強制滾動到底部，用於簡報模式
        if (!element) return;
        
        element.scrollTop = element.scrollHeight;
    }

    adjustFontSize(change) {
        // 調整字體大小
        if (!this.isPresentationMode) return;
        
        this.currentFontSize = Math.max(16, Math.min(48, this.currentFontSize + change));
        
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
        
        // 簡報模式不需要滾動，文字會自動管理長度
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