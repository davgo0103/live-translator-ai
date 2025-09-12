/**
 * 翻譯服務模組
 * Translation Service Module
 */

class TranslationService {
    constructor() {
        this.apiKey = '';
        this.activeTranslationRequests = 0;
        this.maxConcurrentTranslations = 3;
        this.translationCache = new Map();
        this.requestQueue = [];
        this.isProcessingQueue = false;
    }

    // 設置API密鑰
    setApiKey(apiKey) {
        this.apiKey = apiKey;
    }

    // 安全設置API密鑰（避免明文存儲）
    secureSetApiKey(apiKey) {
        if (apiKey && typeof apiKey === 'string' && apiKey.length > 10) {
            this.apiKey = apiKey;
            return true;
        }
        return false;
    }

    // 翻譯文本
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

        // 檢查並發限制
        if (this.activeTranslationRequests >= this.maxConcurrentTranslations) {
            return this.queueTranslation(text, targetLanguage, sourceLanguage);
        }

        return this.performTranslation(text, targetLanguage, sourceLanguage, cacheKey);
    }

    // 執行翻譯請求
    async performTranslation(text, targetLanguage, sourceLanguage, cacheKey) {
        this.activeTranslationRequests++;

        try {
            // 使用本地翻譯端點而非直接調用 OpenAI API
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
            
            // 檢查本地 API 的響應格式
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
        } finally {
            this.activeTranslationRequests--;
            this.processQueue();
        }
    }

    // 構建翻譯提示
    buildTranslationPrompt(text, targetLanguage, sourceLanguage) {
        const languageMap = {
            '繁體中文': 'Traditional Chinese',
            'English': 'English',
            '简体中文': 'Simplified Chinese',
            '日本語': 'Japanese',
            '한국어': 'Korean'
        };

        const target = languageMap[targetLanguage] || targetLanguage;
        const source = sourceLanguage === 'auto' ? 'automatically detected language' : languageMap[sourceLanguage] || sourceLanguage;

        return `Please translate the following text from ${source} to ${target}. 
        Keep the translation natural and contextually appropriate. 
        Only return the translated text without explanations or additional formatting.
        
        Text to translate: "${text}"`;
    }

    // 翻譯隊列處理
    async queueTranslation(text, targetLanguage, sourceLanguage) {
        return new Promise((resolve) => {
            this.requestQueue.push({
                text,
                targetLanguage,
                sourceLanguage,
                resolve
            });
        });
    }

    // 處理隊列
    async processQueue() {
        if (this.isProcessingQueue || this.requestQueue.length === 0) {
            return;
        }

        if (this.activeTranslationRequests >= this.maxConcurrentTranslations) {
            return;
        }

        this.isProcessingQueue = true;
        const request = this.requestQueue.shift();
        
        if (request) {
            const result = await this.translateText(
                request.text, 
                request.targetLanguage, 
                request.sourceLanguage
            );
            request.resolve(result);
        }

        this.isProcessingQueue = false;
        
        // 繼續處理隊列
        if (this.requestQueue.length > 0) {
            setTimeout(() => this.processQueue(), 100);
        }
    }

    // 批量翻譯
    async batchTranslate(texts, targetLanguage = '繁體中文', sourceLanguage = 'auto') {
        if (!Array.isArray(texts) || texts.length === 0) {
            return [];
        }

        const results = await Promise.all(
            texts.map(text => this.translateText(text, targetLanguage, sourceLanguage))
        );

        return results;
    }

    // 清除緩存
    clearCache() {
        this.translationCache.clear();
    }

    // 獲取緩存統計
    getCacheStats() {
        return {
            size: this.translationCache.size,
            activeRequests: this.activeTranslationRequests,
            queueLength: this.requestQueue.length
        };
    }

    // 語言檢測
    detectSourceLanguage(text) {
        if (!text) return 'unknown';
        
        const chinesePattern = /[\u4e00-\u9fff]/g;
        const englishPattern = /[a-zA-Z]/g;
        
        const chineseMatches = text.match(chinesePattern) || [];
        const englishMatches = text.match(englishPattern) || [];
        
        if (chineseMatches.length > englishMatches.length) {
            // 進一步區分繁簡中文
            const traditionalChars = /[繁體準確確實際應該為對於這樣進行]/g;
            const simplifiedChars = /[简体准确确实际应该为对于这样进行]/g;
            
            const traditionalCount = (text.match(traditionalChars) || []).length;
            const simplifiedCount = (text.match(simplifiedChars) || []).length;
            
            return traditionalCount > simplifiedCount ? 'zh-TW' : 'zh-CN';
        } else if (englishMatches.length > chineseMatches.length) {
            return 'en-US';
        }
        
        return 'auto';
    }

    // 翻譯質量評估
    assessTranslationQuality(original, translation) {
        if (!original || !translation) return 0;
        
        const originalLength = original.length;
        const translationLength = translation.length;
        
        // 長度比例評估
        const lengthRatio = Math.min(translationLength / originalLength, originalLength / translationLength);
        
        // 基本內容檢查
        const hasContent = translation.trim().length > 0;
        const notEmpty = !translation.match(/^[\s\n]*$/);
        
        let quality = 0.5; // 基礎分數
        
        if (hasContent && notEmpty) quality += 0.3;
        if (lengthRatio > 0.3) quality += lengthRatio * 0.2;
        
        return Math.min(quality, 1.0);
    }

    // 設置並發限制
    setConcurrencyLimit(limit) {
        this.maxConcurrentTranslations = Math.max(1, Math.min(limit, 10));
    }

    // 銷毀服務
    destroy() {
        this.clearCache();
        this.requestQueue = [];
        this.apiKey = '';
    }
}

// 導出模組
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TranslationService;
} else {
    window.TranslationService = TranslationService;
}