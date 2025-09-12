#!/usr/bin/env python3
"""
即時翻譯系統 Flask 應用
Real-time Translation System Flask App
"""

from flask import Flask, render_template, request, jsonify
import openai
import tempfile
import os
import hashlib
import time
import threading
from functools import lru_cache

app = Flask(__name__)

# 翻譯快取和並發控制
translation_cache = {}
cache_lock = threading.Lock()
active_translations = {}
MAX_CACHE_SIZE = 1000
CACHE_EXPIRY = 3600  # 1小時

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/transcribe', methods=['POST'])
def transcribe_audio():
    """使用 OpenAI Whisper API 轉錄音頻"""
    try:
        # 檢查請求中是否有音頻文件
        if 'audio' not in request.files:
            return jsonify({'error': '沒有找到音頻文件'}), 400
        
        audio_file = request.files['audio']
        api_key = request.form.get('api_key', '')
        language = request.form.get('language', 'auto')
        
        if not api_key:
            return jsonify({'error': '請提供 OpenAI API Key'}), 400
            
        if audio_file.filename == '':
            return jsonify({'error': '沒有選擇文件'}), 400
        
        # 設置 OpenAI API key
        openai.api_key = api_key
        
        # 根據文件類型決定擴展名
        file_extension = '.webm'  # 預設
        if audio_file.filename:
            if audio_file.filename.endswith('.mp4'):
                file_extension = '.mp4'
            elif audio_file.filename.endswith('.wav'):
                file_extension = '.wav'
            elif audio_file.filename.endswith('.m4a'):
                file_extension = '.m4a'
        
        # 創建臨時文件保存音頻
        with tempfile.NamedTemporaryFile(delete=False, suffix=file_extension) as temp_file:
            audio_file.save(temp_file.name)
            temp_file_path = temp_file.name
        
        try:
            # 使用 OpenAI Whisper API 轉錄
            with open(temp_file_path, 'rb') as audio:
                if language == 'auto':
                    transcript = openai.audio.transcriptions.create(
                        model="whisper-1",
                        file=audio,
                        response_format="text"
                    )
                else:
                    # 語言碼映射
                    lang_map = {
                        'zh-TW': 'zh',
                        'en-US': 'en'
                    }
                    transcript = openai.audio.transcriptions.create(
                        model="whisper-1", 
                        file=audio,
                        language=lang_map.get(language, language),
                        response_format="text"
                    )
            
            # 清理臨時文件
            os.unlink(temp_file_path)
            
            return jsonify({
                'success': True,
                'text': transcript.strip() if hasattr(transcript, 'strip') else str(transcript).strip()
            })
            
        except Exception as e:
            # 清理臨時文件
            if os.path.exists(temp_file_path):
                os.unlink(temp_file_path)
            return jsonify({'error': f'Whisper 轉錄失敗: {str(e)}'}), 500
            
    except Exception as e:
        return jsonify({'error': f'服務器錯誤: {str(e)}'}), 500

def generate_cache_key(text, target_language, source_language):
    """生成快取鍵值"""
    content = f"{text}|{target_language}|{source_language}"
    return hashlib.md5(content.encode('utf-8')).hexdigest()

def clean_cache():
    """清理過期快取"""
    current_time = time.time()
    with cache_lock:
        expired_keys = [
            key for key, (_, timestamp) in translation_cache.items()
            if current_time - timestamp > CACHE_EXPIRY
        ]
        for key in expired_keys:
            del translation_cache[key]

def get_from_cache(cache_key):
    """從快取獲取翻譯結果"""
    with cache_lock:
        if cache_key in translation_cache:
            translation, timestamp = translation_cache[cache_key]
            if time.time() - timestamp < CACHE_EXPIRY:
                return translation
            else:
                del translation_cache[cache_key]
    return None

def save_to_cache(cache_key, translation):
    """保存翻譯結果到快取"""
    with cache_lock:
        # 限制快取大小
        if len(translation_cache) >= MAX_CACHE_SIZE:
            # 刪除最舊的條目
            oldest_key = min(translation_cache.keys(), 
                            key=lambda k: translation_cache[k][1])
            del translation_cache[oldest_key]
        
        translation_cache[cache_key] = (translation, time.time())

def validate_translation_request(data):
    """驗證翻譯請求"""
    if not data:
        return False, '沒有找到 JSON 數據'
    
    text = data.get('text', '').strip()
    api_key = data.get('api_key', '')
    
    if not text:
        return False, '請提供要翻譯的文字'
    
    if len(text) > 5000:
        return False, '文字長度不能超過 5000 字符'
    
    if not api_key:
        return False, '請提供 OpenAI API Key'
    
    return True, None

def optimize_translation_prompt(text, target_language, source_language):
    """優化翻譯提示詞"""
    # 語言映射，優化提示詞
    language_map = {
        '繁體中文': 'Traditional Chinese',
        '簡體中文': 'Simplified Chinese', 
        '英文': 'English',
        '日文': 'Japanese',
        '韓文': 'Korean',
        'auto': 'auto-detect'
    }
    
    target_lang = language_map.get(target_language, target_language)
    source_lang = language_map.get(source_language, source_language)
    
    if source_language == 'auto':
        system_prompt = f"You are a professional translator. Translate the following text to {target_lang}. Maintain the original tone and context. Return only the translation without explanations."
        user_prompt = text
    else:
        system_prompt = f"You are a professional translator. Translate the following {source_lang} text to {target_lang}. Maintain the original tone and context. Return only the translation without explanations."
        user_prompt = text
    
    return system_prompt, user_prompt

@app.route('/translate', methods=['POST'])
def translate_text():
    """重構的翻譯端點 - 支援快取、並發控制、錯誤處理"""
    start_time = time.time()
    
    try:
        # 清理過期快取
        if len(translation_cache) > 0:
            clean_cache()
        
        # 獲取和驗證請求數據
        data = request.get_json()
        is_valid, error_msg = validate_translation_request(data)
        
        if not is_valid:
            return jsonify({
                'success': False,
                'error': error_msg,
                'processing_time': round((time.time() - start_time) * 1000, 2)
            }), 400
        
        text = data.get('text', '').strip()
        target_language = data.get('target_language', '繁體中文')
        source_language = data.get('source_language', 'auto')
        api_key = data.get('api_key', '')
        
        # 生成快取鍵值
        cache_key = generate_cache_key(text, target_language, source_language)
        
        # 檢查快取
        cached_translation = get_from_cache(cache_key)
        if cached_translation:
            return jsonify({
                'success': True,
                'translation': cached_translation,
                'source_text': text,
                'target_language': target_language,
                'source_language': source_language,
                'from_cache': True,
                'processing_time': round((time.time() - start_time) * 1000, 2)
            })
        
        # 檢查是否有相同請求正在處理（防重複請求）
        if cache_key in active_translations:
            return jsonify({
                'success': False,
                'error': '相同的翻譯請求正在處理中，請稍後',
                'processing_time': round((time.time() - start_time) * 1000, 2)
            }), 429
        
        # 標記請求為處理中
        active_translations[cache_key] = True
        
        try:
            # 設置 OpenAI API key
            openai.api_key = api_key
            
            # 優化翻譯提示詞
            system_prompt, user_prompt = optimize_translation_prompt(
                text, target_language, source_language
            )
            
            # 調用 OpenAI API
            response = openai.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                max_tokens=2000,
                temperature=0.1,  # 降低溫度提高一致性
                timeout=30  # 30秒超時
            )
            
            translation = response.choices[0].message.content.strip()
            
            # 保存到快取
            save_to_cache(cache_key, translation)
            
            return jsonify({
                'success': True,
                'translation': translation,
                'source_text': text,
                'target_language': target_language,
                'source_language': source_language,
                'from_cache': False,
                'processing_time': round((time.time() - start_time) * 1000, 2),
                'cache_size': len(translation_cache)
            })
            
        finally:
            # 清除處理中標記
            active_translations.pop(cache_key, None)
            
    except openai.RateLimitError:
        return jsonify({
            'success': False,
            'error': 'API 請求頻率限制，請稍後再試',
            'processing_time': round((time.time() - start_time) * 1000, 2)
        }), 429
        
    except openai.AuthenticationError:
        return jsonify({
            'success': False,
            'error': 'API Key 無效，請檢查您的 OpenAI API Key',
            'processing_time': round((time.time() - start_time) * 1000, 2)
        }), 401
        
    except openai.APITimeoutError:
        return jsonify({
            'success': False,
            'error': '請求超時，請稍後再試',
            'processing_time': round((time.time() - start_time) * 1000, 2)
        }), 408
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'翻譯失敗: {str(e)}',
            'processing_time': round((time.time() - start_time) * 1000, 2)
        }), 500

@app.route('/translate/status', methods=['GET'])
def translation_status():
    """獲取翻譯服務狀態"""
    clean_cache()  # 清理過期快取
    
    return jsonify({
        'cache_size': len(translation_cache),
        'max_cache_size': MAX_CACHE_SIZE,
        'cache_expiry_seconds': CACHE_EXPIRY,
        'active_translations': len(active_translations),
        'uptime': time.time(),
        'cache_hit_rate': round(len(translation_cache) / max(1, len(translation_cache) + len(active_translations)) * 100, 2)
    })

@app.route('/translate/clear-cache', methods=['POST'])
def clear_translation_cache():
    """清除翻譯快取"""
    with cache_lock:
        translation_cache.clear()
        active_translations.clear()
    
    return jsonify({
        'success': True,
        'message': '翻譯快取已清除',
        'cache_size': 0
    })

if __name__ == '__main__':
    try:
        print("🗣️ 即時翻譯系統啟動中...")
        print("🌐 開啟瀏覽器並前往: http://localhost:5001")
        print("📱 手機訪問請使用: http://[您的IP]:5001")
        print("🔴 按 Ctrl+C 停止服務器")
    except UnicodeEncodeError:
        print("Real-time Translation System Starting...")
        print("Open browser and go to: http://localhost:5001")
        print("Mobile access: http://[Your IP]:5001")
        print("Press Ctrl+C to stop server")
    
    app.run(debug=True, host='0.0.0.0', port=5001)