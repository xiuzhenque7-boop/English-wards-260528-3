import React, { useState, useRef, useEffect } from "react";
import Tesseract from "tesseract.js";
import { 
  Plus, 
  Upload, 
  Image, 
  FileText, 
  Trash2, 
  Volume2, 
  Search, 
  Sparkles, 
  Check, 
  X, 
  BookOpen, 
  Award, 
  AlertTriangle,
  FileCheck,
  RefreshCw,
  HelpCircle,
  Eye,
  EyeOff
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { DictationWord } from "../types";

interface WordLibraryProps {
  words: DictationWord[];
  onAddWords: (newWords: Omit<DictationWord, "id" | "createdAt" | "wrongCount" | "correctCount" | "isWrongList">[]) => void;
  onDeleteWord: (id: string) => void;
  onToggleWrongList: (id: string) => void;
  onClearStats: (id: string) => void;
  speakWord: (text: string) => void;
}

export default function WordLibrary({
  words,
  onAddWords,
  onDeleteWord,
  onToggleWrongList,
  onClearStats,
  speakWord
}: WordLibraryProps) {
  // Tabs & Filters
  const [activeTab, setActiveTab] = useState<"all" | "wrong">("all");
  const [searchTerm, setSearchTerm] = useState("");

  // Modals / Dropdowns states
  const [showAddModal, setShowAddModal] = useState(false);
  const [addMethod, setAddMethod] = useState<"manual" | "text" | "photo">("manual");
  const [isProcessing, setIsProcessing] = useState(false);
  const [ocrEngine, setOcrEngine] = useState<"tesseract" | "gemini">("tesseract");
  const [tesseractProgress, setTesseractProgress] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Manual addition inputs
  const [manualWord, setManualWord] = useState("");
  const [manualPhonetic, setManualPhonetic] = useState("");
  const [manualMeaning, setManualMeaning] = useState("");
  const [manualExample, setManualExample] = useState("");
  const [manualExampleTr, setManualExampleTr] = useState("");
  
  // Custom text input for batch processing
  const [batchTextInput, setBatchTextInput] = useState("");

  // OCR state
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);

  // Preview of words extracted from OCR or text import before final approval
  const [previewImportWords, setPreviewImportWords] = useState<any[]>([]);

  // Drag over states
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto query Gemini to enrich manual word
  const [isEnrichingManual, setIsEnrichingManual] = useState(false);

  // Reset forms on modal open
  useEffect(() => {
    if (showAddModal) {
      resetForms();
    }
  }, [showAddModal, addMethod]);

  const resetForms = () => {
    setManualWord("");
    setManualPhonetic("");
    setManualMeaning("");
    setManualExample("");
    setManualExampleTr("");
    setBatchTextInput("");
    setImagePreviewUrl(null);
    setSelectedImageFile(null);
    setPreviewImportWords([]);
    setErrorMsg(null);
  };

  // Filter and search words
  const filteredWords = words.filter(w => {
    const matchesSearch = 
      w.word.toLowerCase().includes(searchTerm.toLowerCase()) ||
      w.meaning.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesTab = activeTab === "all" || w.isWrongList;
    return matchesSearch && matchesTab;
  });

  // Calculate statistics
  const totalCount = words.length;
  const wrongListCount = words.filter(w => w.isWrongList).length;
  // Mastering rate
  const masteredCount = words.filter(w => w.correctCount > 0 && w.wrongCount === 0).length;
  const masterPercentage = totalCount > 0 ? Math.round((masteredCount / totalCount) * 100) : 0;

  // Helper to safely handle fetching and reporting serverless/express host incompatibility
  const safeFetchJson = async (url: string, options: RequestInit) => {
    let response;
    try {
      const customKey = localStorage.getItem("lexis_custom_gemini_key") || "";
      const headers = {
        ...(options.headers || {}),
      } as Record<string, string>;
      if (customKey) {
        headers["X-Gemini-Key"] = customKey;
      }

      response = await fetch(url, { ...options, headers });
    } catch (networkErr: any) {
      throw new Error(`网络连接失败：请检查网络连接，或确保后台后端正在运行。\n(错误信息: ${networkErr.message})`);
    }

    const contentType = response.headers.get("content-type") || "";
    if (!response.ok) {
      if (contentType.includes("application/json")) {
        try {
          const errData = await response.json();
          if (errData && errData.error) {
            throw new Error(`服务器错误：${errData.error}`);
          }
        } catch (e: any) {
          if (e.message && e.message.startsWith("服务器错误：")) {
            throw e;
          }
        }
      }
      if (contentType.includes("text/html")) {
        const text = await response.text();
        if (text.includes("The page") || text.includes("not found") || text.includes("Cannot GET") || text.includes("Cannot POST") || text.includes("404")) {
          throw new Error("⚠️ Vercel/静态托管限制：当前 API 端点返回了 HTML 错误。这通常是因为当前应用部署在了纯静态平台（如 Vercel 免费版，且未配置 Serverless functions），并没有正确运行 Express (node) 后端服务器。建议您直接在 Google AI Studio 平台中使用一键部署到 Cloud Run (可完美、完整地运行 Express 后端与 AI 分析)，或者检查您的 Vercel Serverless Functions 配置。");
        }
      }
      throw new Error(`服务器响应错误：HTTP 状态码 ${response.status}`);
    }

    if (!contentType.includes("application/json")) {
      const textPreview = (await response.text()).slice(0, 100);
      throw new Error(`接口响应格式错误：期望 JSON 格式，但收到了非 JSON (如 HTML/Text) 内容。\n这说明您当前的部署环境（例如 Vercel 静态解析）未运行后台 Express 服务，直接返回了前端首页。\n收到内容前缀: "${textPreview}..."`);
    }

    try {
      return await response.json();
    } catch (parseErr: any) {
      throw new Error(`JSON 解析异常：${parseErr.message}。收到的内容格式不符合 JSON 规范。`);
    }
  };

  const fetchGeminiFromWordsDirectly = async (apiKey: string, text: string) => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`;
    
    const prompt = `You are an expert English teacher. The user provided the following input:
"${text}"

Extract or identify English vocabulary words/phrases from this input. If it is already a list of words, expand and enrich them. If it is a block of text, extract key educational interest/grade-appropriate English words from it (up to 20 words).

For each English word/phrase, provide:
1. The English word itself.
2. The standard IPA phonetic symbol enclosed in slashes (e.g., /ækˈtɪv.ə.ti/).
3. The accurate Chinese description and part of speech (e.g., 'n. 活动').
4. An illustrative, grammatically sound English example sentence.
5. The high-quality Chinese translation of the example sentence.

Avoid duplicates. Generate response strictly as a JSON array matching the schema.`;

    const requestBody = {
      contents: [
        {
          parts: [
            {
              text: prompt
            }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "ARRAY",
          description: "A list of English words extracted or generated based on the user request, complete with phonetic guides, Chinese definitions, and high-quality example sentences.",
          items: {
            type: "OBJECT",
            properties: {
              word: {
                type: "STRING",
                description: "The English word or professional phrase (e.g., 'concept' or 'artificial intelligence'). Correct capitalization if needed."
              },
              phonetic: {
                type: "STRING",
                description: "The standard IPA (International Phonetic Alphabet) phonetic symbol enclosed in slashes, e.g. /æp.əl/ or /kənˈsept/."
              },
              meaning: {
                type: "STRING",
                description: "The primary and accurate Chinese translation of the word, along with part of speech (e.g. 'n. 苹果' or 'v. 确认')."
              },
              example: {
                type: "STRING",
                description: "A natural, helpful English example sentence that clearly demonstrates the usage of the word."
              },
              exampleTranslation: {
                type: "STRING",
                description: "The high-quality Chinese translation of the example sentence."
              }
            },
            required: ["word", "phonetic", "meaning", "example", "exampleTranslation"]
          }
        },
        temperature: 0.3
      }
    };

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody)
    });

    if (!res.ok) {
      let errText = "";
      try {
        const errJson = await res.json();
        errText = errJson?.error?.message || res.statusText;
      } catch (e) {
        errText = await res.text();
      }
      throw new Error(`直接访问 Google API 失败: ${errText} (HTTP ${res.status})`);
    }

    const data = await res.json();
    const textResult = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textResult) {
      throw new Error("未能收到 Gemini 的识别文本。");
    }

    const parsedWords = JSON.parse(textResult.trim());
    return { success: true, words: parsedWords };
  };

  const fetchGeminiFromImageDirectly = async (apiKey: string, base64Data: string, mimeType: string) => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`;
    
    const requestBody = {
      contents: [
        {
          parts: [
            {
              inlineData: {
                mimeType: mimeType,
                data: base64Data
              }
            },
            {
              text: "You are an expert English lexicographer and tutor. Scan this image. " +
                "Extract all English words or short vocabulary phrases written or pictured in it. " +
                "For each word or phrase found, generate its standard IPA phonetic symbols, its primary " +
                "Chinese meaning, write a very helpful English example sentence that highlights its context, " +
                "and provide a Chinese translation of the example sentence. " +
                "Output ONLY the JSON list corresponding to the requested schema. Do not include markdown wraps or conversational preambles."
            }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "ARRAY",
          description: "A list of English words extracted or generated based on the user request, complete with phonetic guides, Chinese definitions, and high-quality example sentences.",
          items: {
            type: "OBJECT",
            properties: {
              word: {
                type: "STRING",
                description: "The English word or professional phrase (e.g., 'concept' or 'artificial intelligence'). Correct capitalization if needed."
              },
              phonetic: {
                type: "STRING",
                description: "The standard IPA (International Phonetic Alphabet) phonetic symbol enclosed in slashes, e.g. /æp.əl/ or /kənˈsept/."
              },
              meaning: {
                type: "STRING",
                description: "The primary and accurate Chinese translation of the word, along with part of speech (e.g. 'n. 苹果' or 'v. 确认')."
              },
              example: {
                type: "STRING",
                description: "A natural, helpful English example sentence that clearly demonstrates the usage of the word."
              },
              exampleTranslation: {
                type: "STRING",
                description: "The high-quality Chinese translation of the example sentence."
              }
            },
            required: ["word", "phonetic", "meaning", "example", "exampleTranslation"]
          }
        },
        temperature: 0.2
      }
    };

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody)
    });

    if (!res.ok) {
      let errText = "";
      try {
        const errJson = await res.json();
        errText = errJson?.error?.message || res.statusText;
      } catch (e) {
        errText = await res.text();
      }
      throw new Error(`直接访问 Google API 失败: ${errText} (HTTP ${res.status})`);
    }

    const data = await res.json();
    const textResult = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textResult) {
      throw new Error("未能收到 Gemini 的识别文本。");
    }

    const parsedWords = JSON.parse(textResult.trim());
    return { success: true, words: parsedWords };
  };

  // Handle manual enrich with Gemini API
  const handleEnrichManualWord = async () => {
    if (!manualWord.trim()) {
      setErrorMsg("请先输入待补全的英文单词。");
      return;
    }
    setIsEnrichingManual(true);
    setErrorMsg(null);
    try {
      const customKey = localStorage.getItem("lexis_custom_gemini_key") || "";
      let data;
      if (customKey) {
        try {
          data = await fetchGeminiFromWordsDirectly(customKey, manualWord.trim());
        } catch (directErr: any) {
          console.warn("Direct enrich API failed, falling back to server-side proxy...", directErr);
          data = await safeFetchJson("/api/generate-from-words", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: manualWord.trim() })
          });
        }
      } else {
        data = await safeFetchJson("/api/generate-from-words", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: manualWord.trim() })
        });
      }

      if (!data.success || !data.words || data.words.length === 0) {
        throw new Error(data.error || "获取单词数据失败。");
      }
      const enriched = data.words[0];
      setManualPhonetic(enriched.phonetic);
      setManualMeaning(enriched.meaning);
      setManualExample(enriched.example);
      setManualExampleTr(enriched.exampleTranslation);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "智能补全失败，您可以手动填写词义及例句。");
    } finally {
      setIsEnrichingManual(false);
    }
  };

  // Submit manual word
  const submitManualWord = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualWord.trim() || !manualMeaning.trim()) {
      setErrorMsg("英文单词和中文词义为必填项。");
      return;
    }
    
    // Add word
    onAddWords([{
      word: manualWord.trim(),
      phonetic: manualPhonetic.trim() || `/ ${manualWord.trim()} /`,
      meaning: manualMeaning.trim(),
      example: manualExample.trim() || `Study "${manualWord.trim()}" carefully.`,
      exampleTranslation: manualExampleTr.trim() || `仔细学习 “${manualWord.trim()}”。`
    }]);

    setShowAddModal(false);
    resetForms();
  };

  // Handle batch text input or import from pasted raw text/word list
  const handleProcessBatchText = async () => {
    if (!batchTextInput.trim()) {
      setErrorMsg("请输入单词列表（如：apple, banana 或一段文章）。");
      return;
    }
    setIsProcessing(true);
    setErrorMsg(null);
    try {
      const customKey = localStorage.getItem("lexis_custom_gemini_key") || "";
      let data;
      if (customKey) {
        try {
          data = await fetchGeminiFromWordsDirectly(customKey, batchTextInput);
        } catch (directErr: any) {
          console.warn("Direct batch API failed, falling back to server-side proxy...", directErr);
          data = await safeFetchJson("/api/generate-from-words", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: batchTextInput })
          });
        }
      } else {
        data = await safeFetchJson("/api/generate-from-words", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: batchTextInput })
        });
      }

      if (!data.success) {
        throw new Error(data.error || "解析单词词义失败。");
      }
      setPreviewImportWords(data.words);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "AI 词库解析出问题，请确认网络连接或刷新重试。");
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle image selection with automatic client-side resize and compression to prevent payload errors and timeout
  const handleImageChange = (file: File) => {
    if (!file.type.startsWith("image/")) {
      setErrorMsg("请导入有效的图片文件。");
      return;
    }
    setErrorMsg(null);
    setPreviewImportWords([]);
    
    const reader = new FileReader();
    reader.onload = () => {
      const img = new window.Image();
      img.src = reader.result as string;
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        const maxDim = 1200; // Optimal resolution for clear English characters while minimizing bandwidth/Vercel payload limits

        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          try {
            // Compress heavily into JPEG at 85% visual quality (reduces size by 90% while keeping words perfectly readable)
            const compressedDataUrl = canvas.toDataURL("image/jpeg", 0.85);
            setImagePreviewUrl(compressedDataUrl);
            setSelectedImageFile(file);
          } catch (e) {
            console.error("Canvas compression failed", e);
            setImagePreviewUrl(reader.result as string);
            setSelectedImageFile(file);
          }
        } else {
          setImagePreviewUrl(reader.result as string);
          setSelectedImageFile(file);
        }
      };
      img.onerror = () => {
        setImagePreviewUrl(reader.result as string);
        setSelectedImageFile(file);
      };
    };
    reader.onerror = () => {
      setErrorMsg("无法读取该图片，请重试。");
    };
    reader.readAsDataURL(file);
  };

  // Handle file drops
  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (addMethod === "photo") {
        handleImageChange(file);
      } else {
        // Txt file parsing
        handleTxtFileParse(file);
      }
    }
  };

  // Handle Txt file reading
  const handleTxtFileParse = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (text) {
        setBatchTextInput(text);
      }
    };
    reader.readAsText(file);
  };

  // Trigger Gemini or Tesseract OCR
  const handleProcessImageOCR = async () => {
    if (!selectedImageFile || !imagePreviewUrl) {
      setErrorMsg("请先导入待识词的图片。");
      return;
    }
    setIsProcessing(true);
    setErrorMsg(null);
    setTesseractProgress("准备识别...");
    
    try {
      if (ocrEngine === "tesseract") {
        setTesseractProgress("正在初始化网页本地文字识别(OCR)引擎...");
        
        // Use Tesseract to extract raw text content of English characters to bypass server sizes/timeouts
        const ocrResult = await Tesseract.recognize(
          imagePreviewUrl,
          "eng",
          {
            logger: (m) => {
              if (m.status === "recognizing") {
                const percent = Math.round(m.progress * 100);
                setTesseractProgress(`正在本地读取图片单词: ${percent}%`);
              }
            }
          }
        );
        
        const extractedText = ocrResult?.data?.text || "";
        if (!extractedText.trim()) {
          throw new Error("本地 OCR 引擎未能从当前图片中解析出任何文本缩影。请确保图片清晰或者单词较多。");
        }
        
        setTesseractProgress("文字识别成功！正在调度 AI 智能补全音标、核心释义与中英听写例句...");
        
        // Pass the extracted raw english text list to Gemini to translate/explain. 
        // This handles small payload & avoids 500 Vercel function timeout errors completely!
        const customKey = localStorage.getItem("lexis_custom_gemini_key") || "";
        let data;
        if (customKey) {
          try {
            data = await fetchGeminiFromWordsDirectly(customKey, extractedText);
          } catch (directErr: any) {
            console.warn("Direct enrich API failed, falling back to server proxy...", directErr);
            data = await safeFetchJson("/api/generate-from-words", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ text: extractedText })
            });
          }
        } else {
          data = await safeFetchJson("/api/generate-from-words", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: extractedText })
          });
        }
        
        if (!data.success) {
          throw new Error(data.error || "AI 解析整理提取出的单词失败。");
        }
        
        if (!data.words || data.words.length === 0) {
          setErrorMsg("未能从识别出的字符中整理出核心英文单词。您可以尝试手动输入。");
        } else {
          setPreviewImportWords(data.words);
        }
        
      } else {
        // Direct multi-modal API logic
        setTesseractProgress("正在压缩整图上传，并呼叫大模型多模态直接视像识别...");
        const base64Data = imagePreviewUrl.split(",")[1];
        const mimeType = imagePreviewUrl.startsWith("data:image/jpeg") ? "image/jpeg" : selectedImageFile.type;

        let data;
        const customKey = localStorage.getItem("lexis_custom_gemini_key") || "";
        if (customKey) {
          try {
            data = await fetchGeminiFromImageDirectly(customKey, base64Data, mimeType);
          } catch (directErr: any) {
            console.warn("Direct OCR API failed, falling back to server-side proxy...", directErr);
            data = await safeFetchJson("/api/generate-from-image", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ image: base64Data, mimeType })
            });
          }
        } else {
          data = await safeFetchJson("/api/generate-from-image", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image: base64Data, mimeType })
          });
        }

        if (!data.success) {
          throw new Error(data.error || "云端大模型接口超时或报错。由于 Vercel 免费级有 10 秒超时限制，强烈推荐您切换为“本地 OCR”再次尝试！");
        }

        if (data.words.length === 0) {
          setErrorMsg("大模型中没能搜出明显的英文单词，请尝试换一张或者用“本地 OCR”方式重新尝试。");
        } else {
          setPreviewImportWords(data.words);
        }
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "智能 OCR 识别遇到了阻碍，建议您优先使用“本地 OCR (本地引擎 100% 免超时)”模式。");
    } finally {
      setIsProcessing(false);
      setTesseractProgress("");
    }
  };

  // Complete Batch Import
  const handleSavePreviewWords = () => {
    if (previewImportWords.length === 0) return;
    onAddWords(previewImportWords);
    setShowAddModal(false);
    resetForms();
  };

  return (
    <div id="word-library-container" className="space-y-6">
      
      {/* 🚀 Statistics Bento Row */}
      <div id="bento-stats" className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div id="total-words-card" className="bg-white/90 backdrop-blur-md rounded-2xl p-5 border border-slate-100 shadow-sm flex items-center space-x-4">
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
            <BookOpen size={24} />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">词库总单词数</p>
            <h3 className="text-2xl font-bold text-slate-800">{totalCount} <span className="text-sm font-normal text-slate-400">个</span></h3>
          </div>
        </div>

        <div id="wrong-words-card" className="bg-white/90 backdrop-blur-md rounded-2xl p-5 border border-slate-100 shadow-sm flex items-center space-x-4">
          <div className="p-3 bg-rose-50 text-rose-500 rounded-xl">
            <AlertTriangle size={24} />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">错词本存量</p>
            <h3 className="text-2xl font-bold text-slate-800">{wrongListCount} <span className="text-sm font-normal text-slate-400">个</span></h3>
          </div>
        </div>

        <div id="master-rate-card" className="bg-white/90 backdrop-blur-md rounded-2xl p-5 border border-slate-100 shadow-sm flex items-center space-x-4">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <Award size={24} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-500">完美掌握率</p>
            <div className="flex items-baseline space-x-2">
              <h3 className="text-2xl font-bold text-slate-800">{masterPercentage}%</h3>
              <p className="text-xs text-slate-400">({masteredCount}个从无错误)</p>
            </div>
          </div>
        </div>
      </div>

      {/* 🔮 Search and Actions Line */}
      <div id="action-filters-bar" className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Toggle wrong words notebook */}
        <div id="library-tabs" className="flex bg-slate-100/80 p-1 rounded-xl w-full md:w-auto">
          <button
            id="tab-all"
            onClick={() => setActiveTab("all")}
            className={`flex-1 md:flex-none px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
              activeTab === "all"
                ? "bg-white text-slate-800 shadow-sm"
                : "text-slate-500 hover:text-slate-850"
            }`}
          >
            全部词库 ({words.length})
          </button>
          <button
            id="tab-wrong"
            onClick={() => setActiveTab("wrong")}
            className={`flex-1 md:flex-none px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 flex items-center justify-center space-x-1.5 ${
              activeTab === "wrong"
                ? "bg-rose-500 text-white shadow-sm"
                : "text-rose-600 hover:bg-rose-50/50"
            }`}
          >
            <span>错词本 ({wrongListCount})</span>
          </button>
        </div>

        {/* Search */}
        <div id="search-box" className="relative w-full md:w-80">
          <span className="absolute inset-y-0 left-3 flex items-center text-slate-400 pointer-events-none">
            <Search size={18} />
          </span>
          <input
            id="search-input"
            type="text"
            placeholder="搜索英文单词或中文释义..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-slate-50/50"
          />
        </div>

        {/* Open Import / Add Modal */}
        <button
          id="btn-add-word-modal"
          onClick={() => setShowAddModal(true)}
          className="w-full md:w-auto px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white font-medium text-sm rounded-xl flex items-center justify-center space-x-2 shadow-md transition-all active:scale-95"
        >
          <Plus size={18} />
          <span>录入单词 / OCR识图</span>
        </button>
      </div>

      {/* 📚 Words Table / Grid View */}
      <div id="word-vocabulary-list" className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {filteredWords.length === 0 ? (
          <div id="empty-vocabulary-state" className="p-16 text-center max-w-md mx-auto">
            <div className="inline-flex p-4 bg-slate-50 rounded-full text-slate-400 mb-4">
              <BookOpen size={40} />
            </div>
            <h3 className="text-lg font-bold text-slate-800 mb-2">未找到匹配单词</h3>
            <p className="text-slate-500 text-sm mb-6">
              {searchTerm ? "尝试换个搜索词，或者点击上方“录入单词”按钮添加新词。" : "您的单词库目前空空如也，赶快拍照上传或者输入单词来丰富词库吧！"}
            </p>
            {!searchTerm && (
              <button
                id="btn-empty-state-add"
                onClick={() => setShowAddModal(true)}
                className="inline-flex px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-705 font-medium text-sm rounded-xl items-center space-x-2 transition-colors"
              >
                <Plus size={16} />
                <span>立即录入第一个词</span>
              </button>
            )}
          </div>
        ) : (
          <div id="words-table-wrapper" className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/80 text-xs font-semibold uppercase text-slate-500 tracking-wider">
                  <th className="py-4 px-6">英文/音标</th>
                  <th className="py-4 px-6">中文释义</th>
                  <th className="py-4 px-6 hidden lg:table-cell">英/中例句</th>
                  <th className="py-4 px-6 text-center">听写战绩</th>
                  <th className="py-4 px-6 text-center">错词标记</th>
                  <th className="py-4 px-6 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <AnimatePresence initial={false}>
                  {filteredWords.map((item) => (
                    <motion.tr
                      key={item.id}
                      id={`row-${item.id}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.2 }}
                      className="group hover:bg-slate-50/50 transition-colors"
                    >
                      {/* Word & Phonetic */}
                      <td className="py-4 px-6 whitespace-nowrap">
                        <div id={`word-info-cell-${item.id}`} className="flex items-center space-x-3">
                          <button
                            id={`sound-btn-${item.id}`}
                            onClick={() => speakWord(item.word)}
                            className="p-2 bg-slate-100 hover:bg-indigo-100 hover:text-indigo-600 text-slate-600 rounded-lg transition-colors cursor-pointer"
                            title="点此发音"
                          >
                            <Volume2 size={16} />
                          </button>
                          <div>
                            <span className="font-bold text-slate-800 text-base">{item.word}</span>
                            <span className="block text-xs text-indigo-500 font-mono tracking-wide mt-0.5">{item.phonetic}</span>
                          </div>
                        </div>
                      </td>

                      {/* Meaning */}
                      <td className="py-4 px-6">
                        <span id={`meaning-${item.id}`} className="text-slate-700 text-sm font-medium">{item.meaning}</span>
                      </td>

                      {/* Example sentences */}
                      <td className="py-4 px-6 max-w-xs hidden lg:table-cell">
                        <div id={`example-${item.id}`} className="space-y-0.5">
                          <p className="text-sm font-medium text-slate-700 italic">“{item.example}”</p>
                          <p className="text-xs text-slate-400">{item.exampleTranslation}</p>
                        </div>
                      </td>

                      {/* Score Stats */}
                      <td className="py-4 px-6 text-center whitespace-nowrap">
                        {item.correctCount === 0 && item.wrongCount === 0 ? (
                          <span className="text-xs text-slate-400">暂无测试</span>
                        ) : (
                          <div id={`stats-badge-${item.id}`} className="inline-flex flex-col items-center">
                            <span className="text-xs font-semibold text-slate-600">
                              对 <span className="text-emerald-500 font-bold">{item.correctCount}</span> | 错 <span className="text-rose-500 font-bold">{item.wrongCount}</span>
                            </span>
                            <button
                              id={`clear-stats-btn-${item.id}`}
                              onClick={() => {
                                if (confirm(`确定要重置 "${item.word}" 的评测记录和对错次数吗？`)) {
                                  onClearStats(item.id);
                                }
                              }}
                              className="text-[10px] text-slate-400 hover:text-slate-600 mt-1 underline hidden group-hover:block transition-all"
                            >
                              重置数据
                            </button>
                          </div>
                        )}
                      </td>

                      {/* Wrong List Toggle */}
                      <td className="py-4 px-6 text-center whitespace-nowrap">
                        <button
                          id={`toggle-wrong-btn-${item.id}`}
                          onClick={() => onToggleWrongList(item.id)}
                          className={`inline-flex px-2.5 py-1 rounded-full text-xs font-bold transition-all ${
                            item.isWrongList 
                              ? "bg-rose-500/10 text-rose-600 border border-rose-300 hover:bg-rose-500/20" 
                              : "bg-slate-100 text-slate-400 hover:bg-slate-200"
                          }`}
                        >
                          {item.isWrongList ? "已入错词本" : "加入错词本"}
                        </button>
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-6 text-right whitespace-nowrap">
                        <button
                          id={`delete-btn-${item.id}`}
                          onClick={() => {
                            if (confirm(`确定要将单词 "${item.word}" 从词库中彻底删除吗？`)) {
                              onDeleteWord(item.id);
                            }
                          }}
                          className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                          title="删除单词"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 🔮 Record / OCR Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div id="add-word-modal-backdrop" className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              id="add-word-modal"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh]"
            >
              {/* Modal Header */}
              <div className="p-6 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-extrabold text-slate-800">录入新单词</h3>
                  <p className="text-slate-400 text-xs mt-1">扩展您的英语单词词库进行默写练习</p>
                </div>
                <button
                  id="modal-close"
                  onClick={() => setShowAddModal(false)}
                  className="p-2 hover:bg-slate-200 rounded-full text-slate-400 hover:text-slate-705 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Mode selector tab */}
              <div id="modal-tabs" className="flex border-b border-slate-100 bg-slate-50/50 p-2">
                <button
                  id="tab-manual"
                  onClick={() => setAddMethod("manual")}
                  className={`flex-1 py-3 text-sm font-semibold rounded-xl transition-all flex items-center justify-center space-x-1.5 ${
                    addMethod === "manual" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-705"
                  }`}
                >
                  <Plus size={16} />
                  <span>手动录入 / AI 词义补全</span>
                </button>
                <button
                  id="tab-text"
                  onClick={() => setAddMethod("text")}
                  className={`flex-1 py-3 text-sm font-semibold rounded-xl transition-all flex items-center justify-center space-x-1.5 ${
                    addMethod === "text" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-705"
                  }`}
                >
                  <FileText size={16} />
                  <span>批量文字 / 文件导入</span>
                </button>
                <button
                  id="tab-photo"
                  onClick={() => setAddMethod("photo")}
                  className={`flex-1 py-3 text-sm font-semibold rounded-xl transition-all flex items-center justify-center space-x-1.5 ${
                    addMethod === "photo" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-705"
                  }`}
                >
                  <Image size={16} />
                  <span>AI 拍照 / 图片识词</span>
                </button>
              </div>

              {/* Modal Content Scroll */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {errorMsg && (
                  <div id="modal-error" className="p-4 bg-rose-50 text-rose-650 rounded-2xl border border-rose-200/50 text-sm flex items-start space-x-2">
                    <AlertTriangle size={18} className="shrink-0 mt-0.5" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                {/* --- 1. MANUAL METHOD --- */}
                {addMethod === "manual" && (
                  <form id="manual-add-form" onSubmit={submitManualWord} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wide">English 英文单词*</label>
                        <div className="flex space-x-2">
                          <input
                            id="input-manual-word"
                            type="text"
                            required
                            placeholder="如: extraordinary"
                            value={manualWord}
                            onChange={(e) => setManualWord(e.target.value)}
                            className="flex-1 px-4 py-2 text-sm border border-slate-250 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                          />
                          <button
                            id="btn-ai-enrich"
                            type="button"
                            onClick={handleEnrichManualWord}
                            disabled={isEnrichingManual || !manualWord.trim()}
                            className="px-3.5 bg-indigo-50 hover:bg-indigo-100 disabled:bg-slate-100 text-indigo-600 disabled:text-slate-400 text-sm font-bold rounded-xl flex items-center space-x-1.5 transition-colors cursor-pointer"
                            title="AI 智丰智能补全音标、释义和例句"
                          >
                            {isEnrichingManual ? (
                              <RefreshCw size={14} className="animate-spin" />
                            ) : (
                              <Sparkles size={14} />
                            )}
                            <span className="hidden sm:inline">AI 智丰</span>
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wide">IPA 音标</label>
                        <input
                          id="input-manual-phonetic"
                          type="text"
                          placeholder="如: /ɪkˈstrɔːr.dən.er.i/"
                          value={manualPhonetic}
                          onChange={(e) => setManualPhonetic(e.target.value)}
                          className="w-full px-4 py-2 text-sm border border-slate-250 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-mono"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wide">中文释义*</label>
                      <input
                        id="input-manual-meaning"
                        type="text"
                        required
                        placeholder="如: adj. 非凡的，特别的"
                        value={manualMeaning}
                        onChange={(e) => setManualMeaning(e.target.value)}
                        className="w-full px-4 py-2 text-sm border border-slate-250 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                      />
                    </div>

                    <div className="border-t border-slate-100 pt-4">
                      <h4 className="text-xs font-bold text-slate-400 mb-3 uppercase tracking-wider">助记 / 默写例句配对</h4>
                      <div className="space-y-3">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-500 mb-1">英文句 (例句中请务必写上输入的核心单词)</label>
                          <textarea
                            id="input-manual-example"
                            rows={2}
                            placeholder="如: The performance was extraordinary."
                            value={manualExample}
                            onChange={(e) => setManualExample(e.target.value)}
                            className="w-full px-4 py-2 text-sm border border-slate-250 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-500 mb-1">例句中文翻译</label>
                          <input
                            id="input-manual-translation"
                            type="text"
                            placeholder="如: 演出是非凡的。"
                            value={manualExampleTr}
                            onChange={(e) => setManualExampleTr(e.target.value)}
                            className="w-full px-4 py-2 text-sm border border-slate-250 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end space-x-3 pt-4 border-t border-slate-100">
                      <button
                        id="btn-manual-cancel"
                        type="button"
                        onClick={() => { setShowAddModal(false); resetForms(); }}
                        className="px-4 py-2 text-sm font-medium text-slate-550 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                      >
                        取消
                      </button>
                      <button
                        id="btn-manual-submit"
                        type="submit"
                        className="px-5 py-2 bg-indigo-650 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl shadow-md transition-colors"
                      >
                        录入并保存
                      </button>
                    </div>
                  </form>
                )}

                {/* --- 2. TEXT BATCH / FILE METHOD --- */}
                {addMethod === "text" && (
                  <div id="text-add-panel" className="space-y-4">
                    <p className="text-xs text-slate-400">
                      支持输入由逗号、分号或换行分隔的多个单词，或者将整篇英文短文粘贴在此，AI 会智能帮解析、匹配音标、中文释义和生动例句。支持直接拖入 <b>.txt</b> 文件。
                    </p>

                    <div
                      id="txt-drop-zone"
                      onDragOver={(e) => { e.preventDefault(); setIsDraggingFile(true); }}
                      onDragLeave={() => setIsDraggingFile(false)}
                      onDrop={handleFileDrop}
                      onClick={() => fileInputRef.current?.click()}
                      className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all ${
                        isDraggingFile 
                          ? "border-indigo-500 bg-indigo-50/20" 
                          : "border-slate-200 hover:border-slate-350 bg-slate-50/50"
                      } cursor-pointer`}
                    >
                      <input
                        type="file"
                        ref={fileInputRef}
                        accept=".txt"
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            handleTxtFileParse(e.target.files[0]);
                          }
                        }}
                      />
                      <FileText className="mx-auto text-slate-400 mb-2" size={32} />
                      <p className="text-sm font-medium text-slate-700">点击上传或拖入文本文件 (.txt)</p>
                      <p className="text-xs text-slate-400 mt-1">也可以在下方直接输入/粘贴文本</p>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wide">文段输入 / 单词拼合</label>
                      <textarea
                        id="batch-input-textarea"
                        rows={5}
                        required
                        placeholder="如: resilient, perspective, extraordinary"
                        value={batchTextInput}
                        onChange={(e) => setBatchTextInput(e.target.value)}
                        className="w-full px-4 py-3 text-sm border border-slate-250 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-sans"
                      />
                    </div>

                    <div className="flex justify-between items-center-pt-1">
                      <span className="text-xs text-slate-450 italic">AI 将自动转换释义和例句</span>
                      <button
                        id="btn-process-batch-text"
                        onClick={handleProcessBatchText}
                        disabled={isProcessing || !batchTextInput.trim()}
                        className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-medium text-sm rounded-xl flex items-center space-x-2 transition-colors cursor-pointer"
                      >
                        {isProcessing ? (
                          <RefreshCw className="animate-spin" size={16} />
                        ) : (
                          <Sparkles size={16} />
                        )}
                        <span>AI 智能分析并生成例句音标</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* --- 3. PHOTO OCR AUTO RETRIEVAL --- */}
                {addMethod === "photo" && (
                  <div id="photo-add-panel" className="space-y-4">
                    <p className="text-xs text-slate-400">
                      上传包含英文词汇列表或书籍课本照片，系统会智能完成 OCR 识别，并帮每一个提取出的核心单词<b>精心配齐标准国际音标、中文核心释义以及双语例句。</b>
                    </p>

                    {/* OCR Mode Selector */}
                    <div className="bg-slate-50/80 p-3 rounded-xl border border-slate-150 flex flex-col space-y-2.5">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <span className="text-xs font-bold text-slate-600 flex items-center space-x-1">
                          <Sparkles size={14} className="text-indigo-600" />
                          <span>识词引擎模式：</span>
                        </span>
                        <div className="flex bg-slate-200/70 p-0.5 rounded-lg text-xs self-start sm:self-auto">
                          <button
                            type="button"
                            onClick={() => setOcrEngine("tesseract")}
                            className={`px-3 py-1 rounded-md font-medium transition-all cursor-pointer ${
                              ocrEngine === "tesseract"
                                ? "bg-white text-indigo-700 shadow-sm"
                                : "text-slate-500 hover:text-slate-800"
                            }`}
                          >
                            本地 OCR (推荐: 极速且免超时)
                          </button>
                          <button
                            type="button"
                            onClick={() => setOcrEngine("gemini")}
                            className={`px-3 py-1 rounded-md font-medium transition-all cursor-pointer ${
                              ocrEngine === "gemini"
                                ? "bg-white text-indigo-700 shadow-sm"
                                : "text-slate-500 hover:text-slate-800"
                            }`}
                          >
                            Gemini 原始识别
                          </button>
                        </div>
                      </div>
                      <p className="text-[10px] text-slate-400 leading-relaxed">
                        {ocrEngine === "tesseract" 
                          ? "👍 推荐理由：在您的浏览器本地进行端端文字识别，只将提取出的纯文字发送给 AI 指示补全。即使完全没有配置大模型中转或 API 密钥，也能 100% 成功，完美打通 Vercel 免费版的 500 载荷限制与 10s 秒级超时！" 
                          : "⚠️ 注意：直接把整张图片进行云端多模态分析。如果您的图片比较大，很可能会触发 Vercel 平台对免费后端函数 10s 的严重执行超时限制，或因为没设 Key 抛出 500 错误。"}
                      </p>
                    </div>

                    <div
                      id="photo-drop-zone"
                      onDragOver={(e) => { e.preventDefault(); setIsDraggingFile(true); }}
                      onDragLeave={() => setIsDraggingFile(false)}
                      onDrop={handleFileDrop}
                      onClick={() => fileInputRef.current?.click()}
                      className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all ${
                        isDraggingFile 
                          ? "border-indigo-500 bg-indigo-50/20" 
                          : "border-slate-200 hover:border-slate-350 bg-slate-50/50"
                      } cursor-pointer`}
                    >
                      <input
                        type="file"
                        ref={fileInputRef}
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            handleImageChange(e.target.files[0]);
                          }
                        }}
                      />
                      {imagePreviewUrl ? (
                        <div id="img-preview-container" className="relative inline-block max-w-[200px] max-h-[150px] overflow-hidden rounded-xl border border-slate-100 shadow-sm mx-auto">
                          <img 
                            src={imagePreviewUrl} 
                            alt="Preview" 
                            className="w-full h-auto object-contain"
                            referrerPolicy="no-referrer"
                          />
                          <span className="absolute bottom-1 right-1 bg-slate-900/60 text-white text-[10px] px-2 py-0.5 rounded-md">已选择</span>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <Image className="mx-auto text-slate-400 mb-2" size={36} />
                          <p className="text-sm font-medium text-slate-705">点击拍摄上传 或 拖放照片至此</p>
                          <p className="text-xs text-slate-400">支持 JPG, PNG, WEBP 网课截图、教材照片等</p>
                        </div>
                      )}
                    </div>

                    {imagePreviewUrl && (
                      <div className="flex justify-end space-x-3">
                        <button
                          id="btn-reselect-photo"
                          onClick={() => { setImagePreviewUrl(null); setSelectedImageFile(null); }}
                          className="px-4 py-2 mt-1 text-xs text-slate-500 hover:text-indigo-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-all cursor-pointer"
                        >
                          重新选图
                        </button>
                        <button
                          id="btn-ocr-process"
                          onClick={handleProcessImageOCR}
                          disabled={isProcessing}
                          className="px-5 py-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 disabled:from-slate-200 disabled:to-slate-200 disabled:text-slate-400 text-white text-sm font-bold rounded-xl shadow-md flex items-center space-x-2 transition-all cursor-pointer"
                        >
                          {isProcessing ? (
                            <RefreshCw className="animate-spin" size={16} />
                          ) : (
                            <Sparkles size={16} />
                          )}
                          <span>启动 {ocrEngine === "tesseract" ? "本地 OCR + AI 释义" : "AI 视觉整图识别"}</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* --- UNIVERSAL IMPORTING PREVIEW BAR --- */}
                {isProcessing && (
                  <div id="ocr-loader-animation" className="py-10 text-center flex flex-col items-center justify-center space-y-3 bg-indigo-50/50 rounded-2xl border border-indigo-100/50">
                    <RefreshCw className="text-indigo-600 animate-spin" size={32} />
                    <div className="px-6">
                      <h4 className="font-bold text-slate-800 text-sm">
                        {tesseractProgress ? "生词学伴正在全力运转..." : "正在召唤大语言模型魔法..."}
                      </h4>
                      <p className="text-indigo-700 text-xs font-semibold mt-1 bg-indigo-100/50 px-3 py-1.5 rounded-lg inline-block select-none border border-indigo-200/50 animate-pulse">
                        {tesseractProgress || "AI 正在分析单词定义与生成生动的双语例句..."}
                      </p>
                      <p className="text-slate-400 text-[10px] mt-2.5 max-w-xs mx-auto">
                        后台将自动对识别出的词汇进行校对，精心配齐标准国际音标（IPA）、核心中文释义及量身定制的听写英文例句。
                      </p>
                    </div>
                  </div>
                )}

                {previewImportWords.length > 0 && (
                  <div id="imported-preview-container" className="border border-indigo-100 bg-indigo-50/20 rounded-2xl p-4 mt-4 space-y-3">
                    <div className="flex items-center justify-between border-b border-indigo-100/60 pb-2">
                      <span className="font-bold text-slate-800 text-xs text-indigo-750 flex items-center space-x-1">
                        <FileCheck size={16} />
                        <span>AI 解析成功！已提取出 {previewImportWords.length} 个单词</span>
                      </span>
                      <button
                        onClick={() => setPreviewImportWords([])}
                        className="text-slate-450 hover:text-rose-500 text-xs flex items-center"
                      >
                        清空
                      </button>
                    </div>

                    <div id="preview-words-scroll" className="max-h-[220px] overflow-y-auto space-y-2.5 pr-1">
                      {previewImportWords.map((item, index) => (
                        <div id={`preview-word-card-${index}`} key={index} className="bg-white p-3 rounded-xl border border-slate-100 shadow-xs text-xs flex justify-between gap-3">
                          <div className="flex-1 space-y-1">
                            <div className="flex items-baseline space-x-2">
                              <span className="font-bold text-slate-800 text-sm">{item.word}</span>
                              <span className="text-indigo-500 font-mono text-[10px]">{item.phonetic}</span>
                            </div>
                            <span className="block text-slate-600 font-medium">{item.meaning}</span>
                            <div className="text-slate-400 text-[10px] leading-relaxed italic bg-slate-50 p-1.5 rounded-lg border border-slate-100">
                              <b>例句:</b> {item.example} <br/>
                              <span className="text-slate-500">{item.exampleTranslation}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="flex justify-end space-x-3 pt-2">
                      <button
                        id="btn-preview-cancel"
                        onClick={() => { setPreviewImportWords([]); }}
                        className="px-4 py-2 text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-all"
                      >
                        摒弃并重选
                      </button>
                      <button
                        id="btn-preview-confirm"
                        onClick={handleSavePreviewWords}
                        className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg shadow-sm transition-all"
                      >
                        一键保存和添加这 {previewImportWords.length} 个单词
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
