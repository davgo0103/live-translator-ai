#!/usr/bin/env python3
"""
即時翻譯系統 Flask 應用
Real-time Translation System Flask App
"""

from flask import Flask, render_template, request, jsonify
import openai
import tempfile
import os

app = Flask(__name__)

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
        
        # 創建臨時文件保存音頻
        with tempfile.NamedTemporaryFile(delete=False, suffix='.webm') as temp_file:
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