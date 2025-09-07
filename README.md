# 🗣️ 即時翻譯系統 - Flask 版本

**Flask + Web Speech API + GPT-4o-mini 驅動的專業級會議翻譯工具**

## 📁 檔案結構

```
WEB TRAN/
├── 📄 app.py              # Flask 主應用程式 (整合啟動功能)
├── 📄 requirements.txt    # Python 依賴套件
├── 📁 templates/          # HTML 模板
│   └── index.html         # 主要界面
├── 📁 static/             # 靜態資源
│   ├── app.js             # 前端 JavaScript
│   └── style.css          # CSS 樣式表
├── 📋 README.md           # 專案說明文件
├── 📋 CHANGELOG.md        # 更新日誌
└── 📋 project-structure.md # 專案架構文件
```

## 🚀 安裝與啟動

### 1. 安裝依賴
```bash
pip install -r requirements.txt
```

### 2. 啟動服務器
```bash
python app.py
```

### 3. 訪問應用
- 本地訪問: http://localhost:5001
- 區域網訪問: http://[您的IP]:5001

## 🎯 Flask 版本優勢

### 🌐 **網路訪問**
- **多裝置支援** - 手機、平板、電腦都可訪問
- **區域網共享** - 會議參與者可同時使用
- **無需安裝** - 瀏覽器即可使用

### ⚡ **更好的性能**
- **靜態資源優化** - Flask 優化的檔案服務
- **併發處理** - 支援多用戶同時使用
- **快取機制** - 更快的載入速度

### 🔧 **擴展性**
- **API 端點** - 可加入後端 API 功能
- **資料庫整合** - 可儲存會議記錄
- **用戶系統** - 可加入登入功能

## 🛠️ 技術架構

### 後端 (Flask)
- **路由處理**: 主頁面渲染
- **靜態檔案服務**: CSS/JS 資源管理
- **擴展接口**: 預留 API 擴展空間

### 前端 (不變)
- **Web Speech API**: 語音識別
- **GPT-4o-mini**: AI 翻譯引擎
- **響應式設計**: 多裝置適配

## 📱 多裝置使用

### 桌面電腦
- 完整功能體驗
- 簡報模式投影

### 手機/平板
- 響應式界面適配
- 觸控操作優化
- 語音權限管理

## 🔄 開發模式

啟動開發伺服器：
```bash
python app.py
```

特色：
- 🔥 **熱重載** - 修改代碼自動重啟
- 🐛 **除錯模式** - 詳細錯誤信息
- 📝 **請求日誌** - 完整訪問記錄

## 🚀 部署選項

### 本地部署
```bash
python app.py
```

### 生產環境 (使用 Gunicorn)
```bash
pip install gunicorn
gunicorn -w 4 -b 0.0.0.0:5001 app:app
```

### Docker 部署 (可選)
```dockerfile
FROM python:3.9
COPY . /app
WORKDIR /app
RUN pip install -r requirements.txt
EXPOSE 5001
CMD ["python", "app.py"]
```

---

*🌐 現在您的翻譯系統可以在網路上訪問了！*