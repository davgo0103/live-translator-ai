/**
 * Whisper 語音識別模組
 * Whisper Recognition Module
 */

class WhisperRecognition {
    constructor() {
        this.apiKey = '';
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.whisperRecordingInterval = null;
        this.whisperRecordingDuration = 1500; // 1.5秒片段
        this.isWhisperRecording = false;
        this.audioStream = null;
        this.audioContext = null;
        this.analyser = null;
        this.lastAudioLevel = 0;
        this.silenceThreshold = 30;
        this.whisperResponseTimes = [];
        
        // 智能累積相關
        this.whisperAccumulatedText = '';
        this.lastWhisperText = '';
        this.sentenceTimeout = null;
        
        // 回調函數
        this.onResult = null;
        this.onError = null;
        this.onStart = null;
        this.onEnd = null;
        this.onStatusChange = null;
        this.onAudioLevel = null;
        
        // 語言設置
        this.sourceLanguage = 'auto';
    }

    // 設置 API Key
    setApiKey(apiKey) {
        this.apiKey = apiKey;
    }

    // 初始化 Whisper 錄音
    async initWhisperRecording() {
        try {
            // 增強麥克風設定，專為遠距離錄音優化
            this.audioStream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    sampleRate: 16000,
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
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
            if (this.onError) {
                this.onError('無法存取麥克風，請檢查權限設定');
            }
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
        
        // 通知音量變化
        if (this.onAudioLevel) {
            this.onAudioLevel(currentLevel);
        }
        
        return currentLevel > this.silenceThreshold;
    }

    // 開始 Whisper 錄音
    async startWhisperRecording() {
        if (!this.mediaRecorder) {
            const success = await this.initWhisperRecording();
            if (!success) return false;
        }
        
        if (!this.apiKey) {
            if (this.onError) {
                this.onError('請先設定 OpenAI API Key');
            }
            return false;
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
        
        if (this.onStart) {
            this.onStart();
        }
        
        if (this.onStatusChange) {
            this.onStatusChange('recording');
        }
        
        console.log('Whisper 錄音開始');
        return true;
    }
    
    // 停止 Whisper 錄音
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
        
        if (this.onEnd) {
            this.onEnd();
        }
        
        if (this.onStatusChange) {
            this.onStatusChange('stopped');
        }
        
        console.log('Whisper 錄音停止');
    }
    
    // 處理 Whisper 音頻並上傳
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
    
    // 上傳音頻到 Whisper API
    async uploadToWhisper(audioBlob) {
        if (!this.apiKey) {
            console.warn('未設定API Key，跳過Whisper轉錄');
            return;
        }
        
        const formData = new FormData();
        formData.append('audio', audioBlob, 'audio.webm');
        formData.append('api_key', this.apiKey);
        formData.append('language', this.sourceLanguage);
        
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
                if (this.onError) {
                    this.onError(result.error);
                }
            }
        } catch (error) {
            console.error('上傳到Whisper失敗:', error);
            if (this.onError) {
                this.onError('網路錯誤，請檢查連線');
            }
        }
    }
    
    // 處理 Whisper 識別結果
    handleWhisperResult(text) {
        if (!text || text.length < 2) return;
        
        // 清理和標準化文字
        text = text.trim().replace(/\s+/g, ' ');
        
        // 智能累積文字：檢查是否是延續上一句還是新句子
        const processedText = this.accumulateWhisperText(text);
        
        // 計算平均回應時間
        const avgResponseTime = this.whisperResponseTimes.length > 0 
            ? Math.round(this.whisperResponseTimes.reduce((a, b) => a + b, 0) / this.whisperResponseTimes.length)
            : 0;
        
        // 通知狀態更新
        if (this.onStatusChange) {
            this.onStatusChange('processing', {
                text: processedText,
                responseTime: avgResponseTime,
                audioLevel: this.lastAudioLevel,
                accumulatedLength: this.whisperAccumulatedText.length
            });
        }
        
        // 檢查是否形成完整句子
        this.checkForCompleteSentence(processedText);
    }
    
    // 智能累積 Whisper 文字
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
            
            // 調用結果回調
            if (this.onResult) {
                this.onResult({
                    transcript: this.whisperAccumulatedText,
                    confidence: 0.9,
                    isFinal: true,
                    timestamp: Date.now()
                });
            }
            
            // 清空累積文字，準備下一句
            this.whisperAccumulatedText = '';
            this.lastWhisperText = '';
        }
    }

    // 設置語言
    setLanguage(language) {
        this.sourceLanguage = language;
    }

    // 設置錄音時長
    setRecordingDuration(duration) {
        this.whisperRecordingDuration = Math.max(1000, Math.min(5000, duration));
    }

    // 設置靜音閾值
    setSilenceThreshold(threshold) {
        this.silenceThreshold = Math.max(10, Math.min(100, threshold));
    }

    // 獲取狀態
    getStatus() {
        return {
            isRecording: this.isWhisperRecording,
            hasApiKey: !!this.apiKey,
            language: this.sourceLanguage,
            audioLevel: this.lastAudioLevel,
            accumulatedText: this.whisperAccumulatedText,
            avgResponseTime: this.whisperResponseTimes.length > 0 
                ? Math.round(this.whisperResponseTimes.reduce((a, b) => a + b, 0) / this.whisperResponseTimes.length)
                : 0
        };
    }

    // 銷毀
    destroy() {
        this.stopWhisperRecording();
        
        if (this.audioContext) {
            this.audioContext.close();
        }
        
        // 清理屬性
        this.apiKey = '';
        this.whisperAccumulatedText = '';
        this.lastWhisperText = '';
        this.whisperResponseTimes = [];
    }
}

// 導出模組
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WhisperRecognition;
} else {
    window.WhisperRecognition = WhisperRecognition;
}