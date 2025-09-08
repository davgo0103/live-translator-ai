# 🗣️ 即時翻譯系統

**Flask + Web Speech API + GPT-4o-mini 驅動的會議翻譯工具**

## 🚀 快速開始

### 1. 安裝依賴
```bash
pip install -r requirements.txt
```

### 2. 啟動服務器
```bash
python app.py
```

### 3. 訪問應用
- **本地**: http://localhost:5001
- **區域網**: http://[您的IP]:5001

## ✨ 主要功能

- 🎤 **即時語音識別** - 支援繁中/英文自動偵測
- 🌐 **AI 翻譯** - GPT-4o-mini 專業翻譯
- 📺 **簡報模式** - 大字體雙語顯示，適合會議投影
- 📱 **響應式設計** - 手機、平板、電腦都支援
- 🔄 **連續錄音** - 會議模式不間斷識別

## 🎯 使用說明

1. 設定 OpenAI API Key
2. 選擇語音識別語言 (自動偵測/繁中/英文)
3. 選擇翻譯目標語言
4. 點擊「開始會議模式」
5. 進入簡報模式可全螢幕雙語顯示

## 📁 檔案結構

```
WEB TRAN/
├── app.py          # Flask 應用
├── templates/      # HTML 模板
├── static/         # JS/CSS 資源
└── requirements.txt
```

## 🔧 技術架構

- **前端**: Web Speech API + JavaScript
- **後端**: Flask (Python)
- **翻譯**: OpenAI GPT-4o-mini
- **部署**: 支援本地、區域網、生產環境

---

*💡 適合會議、演講、多國會談等即時翻譯需求*