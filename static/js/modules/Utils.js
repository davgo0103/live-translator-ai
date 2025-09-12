/**
 * 工具函數模組
 * Utility Functions Module
 */

class Utils {
    // XSS防護：安全文本清理函數
    static sanitizeHTML(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // 安全地設置HTML內容，允許基本格式化但防止XSS
    static safeSetHTML(element, htmlString) {
        if (!element) return;
        
        const allowedTags = ['b', 'i', 'em', 'strong', 'span', 'div', 'br'];
        const cleanHTML = htmlString.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
        
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = cleanHTML;
        
        const scripts = tempDiv.querySelectorAll('script');
        scripts.forEach(script => script.remove());
        
        element.innerHTML = tempDiv.innerHTML;
    }

    // 句子邊界檢測
    static detectSentenceEnd(text) {
        const sentenceEnders = /[.!?。！？]/;
        const sentences = text.split(sentenceEnders);
        
        if (sentences.length > 1 && sentences[sentences.length - 1].trim() === '') {
            return {
                hasEnd: true,
                completeSentence: sentences.slice(0, -1).join('').trim(),
                remaining: ''
            };
        }
        
        return {
            hasEnd: false,
            completeSentence: '',
            remaining: text
        };
    }

    // 文本清理和標準化
    static normalizeText(text) {
        if (!text) return '';
        return text.trim()
                  .replace(/\s+/g, ' ')
                  .replace(/([.!?。！？])\s*([.!?。！？])/g, '$1');
    }

    // 計算兩個字符串的相似度
    static calculateSimilarity(str1, str2) {
        if (!str1 || !str2) return 0;
        
        const longer = str1.length > str2.length ? str1 : str2;
        const shorter = str1.length > str2.length ? str2 : str1;
        
        if (longer.length === 0) return 1.0;
        
        const distance = this.levenshteinDistance(longer, shorter);
        return (longer.length - distance) / longer.length;
    }

    // Levenshtein距離算法
    static levenshteinDistance(str1, str2) {
        const matrix = [];
        
        for (let i = 0; i <= str2.length; i++) {
            matrix[i] = [i];
        }
        
        for (let j = 0; j <= str1.length; j++) {
            matrix[0][j] = j;
        }
        
        for (let i = 1; i <= str2.length; i++) {
            for (let j = 1; j <= str1.length; j++) {
                if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }
        
        return matrix[str2.length][str1.length];
    }

    // 格式化時間戳
    static formatTimestamp(date = new Date()) {
        return date.toLocaleTimeString('zh-TW', { 
            hour12: false, 
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit' 
        });
    }

    // 防抖函數
    static debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // 節流函數
    static throttle(func, limit) {
        let inThrottle;
        return function() {
            const args = arguments;
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }

    // 生成唯一ID
    static generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    // 本地存儲操作
    static storage = {
        get(key, defaultValue = null) {
            try {
                const value = localStorage.getItem(key);
                return value ? JSON.parse(value) : defaultValue;
            } catch (error) {
                console.warn('LocalStorage get error:', error);
                return defaultValue;
            }
        },

        set(key, value) {
            try {
                localStorage.setItem(key, JSON.stringify(value));
                return true;
            } catch (error) {
                console.warn('LocalStorage set error:', error);
                return false;
            }
        },

        remove(key) {
            try {
                localStorage.removeItem(key);
                return true;
            } catch (error) {
                console.warn('LocalStorage remove error:', error);
                return false;
            }
        }
    };

    // 語言偵測輔助函數
    static detectLanguage(text) {
        if (!text) return 'unknown';
        
        const chinesePattern = /[\u4e00-\u9fff]/;
        const englishPattern = /[a-zA-Z]/;
        
        const chineseCount = (text.match(chinesePattern) || []).length;
        const englishCount = (text.match(englishPattern) || []).length;
        
        if (chineseCount > englishCount) {
            return 'zh';
        } else if (englishCount > chineseCount) {
            return 'en';
        }
        
        return 'unknown';
    }

    // 文件大小格式化
    static formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // URL 驗證
    static isValidUrl(string) {
        try {
            new URL(string);
            return true;
        } catch (_) {
            return false;
        }
    }

    // 錯誤處理包裝器
    static async safeExecute(asyncFunction, errorHandler = console.error) {
        try {
            return await asyncFunction();
        } catch (error) {
            errorHandler(error);
            return null;
        }
    }
}

// 導出模組
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Utils;
} else {
    window.Utils = Utils;
}