import React, { useState, useRef, useEffect } from "react";
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

  // Handle manual enrich with Gemini API
  const handleEnrichManualWord = async () => {
    if (!manualWord.trim()) {
      setErrorMsg("请先输入待补全的英文单词。");
      return;
    }
    setIsEnrichingManual(true);
    setErrorMsg(null);
    try {
      const response = await fetch("/api/generate-from-words", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: manualWord.trim() })
      });
      const data = await response.json();
      if (!response.ok || !data.success || !data.words || data.words.length === 0) {
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
      const response = await fetch("/api/generate-from-words", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: batchTextInput })
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
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

  // Handle image selection
  const handleImageChange = (file: File) => {
    if (!file.type.startsWith("image/")) {
      setErrorMsg("请导入有效的图片文件。");
      return;
    }
    setSelectedImageFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      setImagePreviewUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
    setErrorMsg(null);
    setPreviewImportWords([]);
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

  // Trigger Gemini OCR
  const handleProcessImageOCR = async () => {
    if (!selectedImageFile || !imagePreviewUrl) {
      setErrorMsg("请先导入待识词的图片。");
      return;
    }
    setIsProcessing(true);
    setErrorMsg(null);
    try {
      // Extract base64
      const base64Data = imagePreviewUrl.split(",")[1];
      const mimeType = selectedImageFile.type;

      const response = await fetch("/api/generate-from-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64Data, mimeType })
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "提取图片词汇失败，请确保图片清晰或手动添加。");
      }

      if (data.words.length === 0) {
        setErrorMsg("图片中没能识别出明显的英文单词，请尝试拍摄得更清晰，或者手动输入单词。");
      } else {
        setPreviewImportWords(data.words);
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "图片智能识词失败。");
    } finally {
      setIsProcessing(false);
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
                      上传包含英文词汇列表或书籍课本照片，Gemini 会智能完成 OCR 识别，并帮每一个提取出的核心单词<b>精心配齐标准国际音标、中文核心释义以及双语例句。</b>
                    </p>

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
                          className="px-4 py-2 mt-1 text-xs text-slate-500 hover:text-indigo-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-all"
                        >
                          重新选图
                        </button>
                        <button
                          id="btn-ocr-process"
                          onClick={handleProcessImageOCR}
                          disabled={isProcessing}
                          className="px-5 py-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white text-sm font-bold rounded-xl shadow-md flex items-center space-x-2 transition-all"
                        >
                          {isProcessing ? (
                            <RefreshCw className="animate-spin" size={16} />
                          ) : (
                            <Sparkles size={16} />
                          )}
                          <span>启动 AI 视觉分词识别</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* --- UNIVERSAL IMPORTING PREVIEW BAR --- */}
                {isProcessing && (
                  <div id="ocr-loader-animation" className="py-12 text-center flex flex-col items-center justify-center space-y-3 bg-indigo-50/50 rounded-2xl border border-indigo-100/50">
                    <RefreshCw className="text-indigo-600 animate-spin" size={32} />
                    <div>
                      <h4 className="font-bold text-slate-800 text-sm">正在施展 AI 魔法...</h4>
                      <p className="text-slate-500 text-xs mt-1 max-w-xs">正在分析单词形态，加载国际音标、录入字典定义并为您个性化定制听写例句...</p>
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
