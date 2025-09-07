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
    print("🗣️ 即時翻譯系統啟動中...")
    print("🌐 開啟瀏覽器並前往: http://localhost:5001")
    print("📱 手機訪問請使用: http://[您的IP]:5001")
    print("🔴 按 Ctrl+C 停止服務器")
    
    app.run(debug=True, host='0.0.0.0', port=5001)