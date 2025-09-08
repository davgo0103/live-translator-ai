#!/usr/bin/env python3
"""
即時翻譯系統 Flask 應用
Real-time Translation System Flask App
"""

from flask import Flask, render_template

app = Flask(__name__)

@app.route('/')
def index():
    return render_template('index.html')

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