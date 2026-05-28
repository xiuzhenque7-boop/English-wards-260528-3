import React, { useState, useEffect, useRef } from "react";
import {
  BarChart2,
  BookOpen,
  Settings,
  AlertTriangle,
  Volume2,
  CheckCircle,
  XCircle,
  RefreshCw,
  Sparkles,
  ArrowRight,
  Plus,
  HelpCircle,
  Play,
  RotateCcw,
  BookMarked
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import WordLibrary from "./components/WordLibrary";
import { DictationWord, AppSettings, DictationSession, DictationAttempt } from "./types";
import { INITIAL_WORDS } from "./data/initialWords";

export default function App() {
  // Navigation: "dashboard" | "library" | "mistakes" | "preferences"
  const [activeNav, setActiveNav] = useState<"dashboard" | "library" | "mistakes" | "preferences">("dashboard");

  // Load words from LocalStorage or base list
  const [words, setWords] = useState<DictationWord[]>(() => {
    const saved = localStorage.getItem("lexis_core_words");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse words from local storage", e);
      }
    }
    return INITIAL_WORDS;
  });

  // Settings
  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem("lexis_core_settings");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }
    return {
      voiceSpeed: 0.9,
      voicePitch: 1.0,
      autoPlayNext: true,
      caseSensitive: false,
      ignorePunctuation: true,
      loopCount: 2,
      voiceLanguage: "en-US",
    };
  });

  // Available client voices
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceName, setSelectedVoiceName] = useState<string>("");

  // Sync words & settings to local storage
  useEffect(() => {
    localStorage.setItem("lexis_core_words", JSON.stringify(words));
  }, [words]);

  useEffect(() => {
    localStorage.setItem("lexis_core_settings", JSON.stringify(settings));
  }, [settings]);

  // Load voices for speech synthesis
  useEffect(() => {
    const loadVoices = () => {
      if (typeof window !== "undefined" && window.speechSynthesis) {
        const voices = window.speechSynthesis.getVoices();
        const englishVoices = voices.filter(v => v.lang.startsWith("en"));
        setAvailableVoices(englishVoices);
        if (englishVoices.length > 0 && !selectedVoiceName) {
          // Look for US voice, or fallback to first english voice
          const usVoice = englishVoices.find(v => v.lang === "en-US") || englishVoices[0];
          setSelectedVoiceName(usVoice.name);
        }
      }
    };

    loadVoices();
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, []);

  // Speak pronunciation helper
  const handleSpeak = (text: string) => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel(); // Stop active queue
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = settings.voiceSpeed;
      utterance.pitch = settings.voicePitch;
      
      if (availableVoices.length > 0) {
        const found = availableVoices.find(v => v.name === selectedVoiceName);
        if (found) {
          utterance.voice = found;
          utterance.lang = found.lang;
        }
      } else {
        utterance.lang = settings.voiceLanguage;
      }
      window.speechSynthesis.speak(utterance);
    }
  };

  // Trigger quick scan / add from library button click
  const [triggerModalOpen, setTriggerModalOpen] = useState(false);

  // Active Dictation Session state
  const [session, setSession] = useState<DictationSession | null>(null);
  const [userInput, setUserInput] = useState("");
  const [feedback, setFeedback] = useState<"none" | "correct" | "incorrect">("none");
  const [isRevealed, setIsRevealed] = useState(false);
  const [streak, setStreak] = useState<number>(() => {
    return parseInt(localStorage.getItem("lexis_core_streak") || "0", 10);
  });

  // Tracking dynamic scores
  const totalSpellings = words.reduce((acc, w) => acc + w.correctCount + w.wrongCount, 0);
  const totalCorrectSpellings = words.reduce((acc, w) => acc + w.correctCount, 0);
  const accuracyPercent = totalSpellings > 0 ? Math.round((totalCorrectSpellings / totalSpellings) * 100) : 100;

  // Add words handler
  const handleAddWords = (newWords: Omit<DictationWord, "id" | "createdAt" | "wrongCount" | "correctCount" | "isWrongList">[]) => {
    const wordsWithMeta: DictationWord[] = newWords.map(w => ({
      ...w,
      id: "word-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6),
      createdAt: Date.now(),
      wrongCount: 0,
      correctCount: 0,
      isWrongList: false
    }));
    setWords(prev => [ ...wordsWithMeta, ...prev ]);
  };

  // Delete word handler
  const handleDeleteWord = (id: string) => {
    setWords(prev => prev.filter(w => w.id !== id));
    // If active session has this, cancel session to be safe
    if (session && session.wordIds.includes(id)) {
      setSession(null);
    }
  };

  // Toggle wrong list marker
  const handleToggleWrongList = (id: string) => {
    setWords(prev => prev.map(w => {
      if (w.id === id) {
        return { ...w, isWrongList: !w.isWrongList };
      }
      return w;
    }));
  };

  // Clear single stats
  const handleClearStats = (id: string) => {
    setWords(prev => prev.map(w => {
      if (w.id === id) {
        return { ...w, correctCount: 0, wrongCount: 0 };
      }
      return w;
    }));
  };

  // Calculate daily progress based on vocabulary uploaded vs high target
  const dailyTarget = 15;
  const dailyProgressPercent = Math.min(100, Math.round((words.length / dailyTarget) * 100));

  // START DICTATION SESSION
  const startDictation = (mode: "all" | "mistakes" | "mixed") => {
    let list: DictationWord[] = [];
    if (mode === "mistakes") {
      list = words.filter(w => w.isWrongList);
    } else if (mode === "mixed") {
      // Prioritize words with mistakes or less tested
      list = [...words].sort((a,b) => (b.wrongCount - a.wrongCount));
    } else {
      list = [...words];
    }

    if (list.length === 0) {
      alert(mode === "mistakes" ? "您的错词本目前是空的！先去听写其他单词吧。" : "词库中目前还没有任何单词。请先在词库中手动录入或传图识别。");
      return;
    }

    // Shuffle a sub-section or take standard set
    const selectedIds = list.map(item => item.id);
    
    setSession({
      id: "session-" + Date.now(),
      wordIds: selectedIds,
      currentIndex: 0,
      attempts: [],
      startTime: Date.now(),
      status: "testing"
    });
    setUserInput("");
    setFeedback("none");
    setIsRevealed(false);

    // Speak first word after minor delay
    const firstWord = words.find(w => w.id === selectedIds[0]);
    if (firstWord) {
      setTimeout(() => {
        handleSpeak(firstWord.word);
      }, 300);
    }
  };

  // Current session variables
  const activeWordId = session && session.wordIds[session.currentIndex];
  const activeWordObj = words.find(w => w.id === activeWordId);

  // Automatically read loaded word multiple times in loop if configured
  useEffect(() => {
    if (activeWordObj && session?.status === "testing") {
      // Loop speak
      let count = 0;
      const readInterval = setInterval(() => {
        if (count < Math.min(3, settings.loopCount)) {
          handleSpeak(activeWordObj.word);
          count++;
        } else {
          clearInterval(readInterval);
        }
      }, 1800);
      return () => clearInterval(readInterval);
    }
  }, [activeWordId, session?.id]);

  // Normal spelling checking
  const handleValidateSpelling = () => {
    if (!activeWordObj || !session) return;

    const standardWord = activeWordObj.word.trim();
    const typedWord = userInput.trim();

    // Normalizing characters based on preferences
    let match = false;
    if (settings.caseSensitive) {
      match = standardWord === typedWord;
    } else {
      match = standardWord.toLowerCase() === typedWord.toLowerCase();
    }

    // Secondary parsing for ignore punctuations
    if (settings.ignorePunctuation && !match) {
      const cleanWord = standardWord.replace(/[.,\-\/#!$%\^&\*;:{}=\-_`~()]/g,"").replace(/\s{2,}/g," ").toLowerCase();
      const cleanTyped = typedWord.replace(/[.,\-\/#!$%\^&\*;:{}=\-_`~()]/g,"").replace(/\s{2,}/g," ").toLowerCase();
      match = cleanWord === cleanTyped;
    }

    // Register active attempt
    const isCorrect = match;
    const attempt: DictationAttempt = {
      wordId: activeWordObj.id,
      wordString: activeWordObj.word,
      userInput: userInput,
      isCorrect,
      timestamp: Date.now()
    };

    setWords(prev => prev.map(w => {
      if (w.id === activeWordObj.id) {
        return {
          ...w,
          correctCount: isCorrect ? w.correctCount + 1 : w.correctCount,
          wrongCount: !isCorrect ? w.wrongCount + 1 : w.wrongCount,
          isWrongList: !isCorrect ? true : w.isWrongList, // auto flag mistake
          lastTestedAt: Date.now()
        };
      }
      return w;
    }));

    if (isCorrect) {
      setFeedback("correct");
      setStreak(prev => {
        const next = prev + 1;
        localStorage.setItem("lexis_core_streak", next.toString());
        return next;
      });
      setIsRevealed(true);
    } else {
      setFeedback("incorrect");
      setStreak(0);
      localStorage.setItem("lexis_core_streak", "0");
      setIsRevealed(true);
    }
  };

  // Move forward after completed
  const handleNextWord = () => {
    if (!session) return;
    
    // Check if finished
    if (session.currentIndex + 1 >= session.wordIds.length) {
      setSession(prev => prev ? { ...prev, status: "completed", endTime: Date.now() } : null);
    } else {
      setSession(prev => prev ? { ...prev, currentIndex: prev.currentIndex + 1 } : null);
      setUserInput("");
      setFeedback("none");
      setIsRevealed(false);
    }
  };

  // Auto skip / reveal
  const handleRevealWord = () => {
    setIsRevealed(true);
    setStreak(0);
    localStorage.setItem("lexis_core_streak", "0");
    // also count as wrong to track it
    if (activeWordObj) {
      setWords(prev => prev.map(w => {
        if (w.id === activeWordObj.id) {
          return {
            ...w,
            wrongCount: w.wrongCount + 1,
            isWrongList: true,
            lastTestedAt: Date.now()
          };
        }
        return w;
      }));
    }
  };

  // Replace occurrences of target word with blanks in the example
  const getMaskedExample = (sentence: string, word: string) => {
    if (!sentence || !word) return "";
    const escapedWord = word.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regex = new RegExp(`\\b${escapedWord}\\w*\\b`, 'gi');
    return sentence.replace(regex, (m) => "_ ".repeat(m.length).trim());
  };

  return (
    <div id="app-root-container" className="min-h-screen bg-slate-50 flex font-sans text-slate-900 overflow-x-hidden">
      
      {/* 🔮 BEAUTIFUL SLEEK SIDEBAR */}
      <aside id="app-sidebar" className="w-64 bg-slate-900 text-white flex flex-col shrink-0">
        
        {/* LOGO */}
        <div id="sidebar-logo" className="p-8 text-2xl font-black tracking-tighter flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-tr from-indigo-500 to-violet-500 rounded-xl flex items-center justify-center font-bold text-white text-sm shadow-md shadow-indigo-500/20">
            L
          </div>
          <span className="bg-gradient-to-r from-white to-slate-200 bg-clip-text text-transparent">LEXIS.CORE</span>
        </div>

        {/* NAV MENUS */}
        <nav id="sidebar-nav" className="flex-1 px-4 py-2 space-y-2">
          <button
            id="nav-btn-dashboard"
            onClick={() => setActiveNav("dashboard")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer text-sm font-semibold transition-all ${
              activeNav === "dashboard"
                ? "bg-slate-800 text-white shadow-sm font-bold"
                : "text-slate-400 hover:bg-slate-800/50 hover:text-white"
            }`}
          >
            <BarChart2 size={18} className="opacity-70" />
            <span>默写控制台</span>
          </button>

          <button
            id="nav-btn-library"
            onClick={() => setActiveNav("library")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer text-sm font-semibold transition-all ${
              activeNav === "library"
                ? "bg-slate-800 text-white shadow-sm font-bold"
                : "text-slate-400 hover:bg-slate-800/50 hover:text-white"
            }`}
          >
            <BookOpen size={18} className="opacity-70" />
            <span>智能词库</span>
            <span className="ml-auto bg-slate-800 text-xs px-2 py-0.5 rounded-full border border-slate-700">{words.length}</span>
          </button>

          <button
            id="nav-btn-mistakes"
            onClick={() => {
              setActiveNav("mistakes");
            }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer text-sm font-semibold transition-all ${
              activeNav === "mistakes"
                ? "bg-rose-950/40 text-rose-200 shadow-sm border border-rose-900/40"
                : "text-slate-400 hover:bg-slate-800/50 hover:text-white"
            }`}
          >
            <AlertTriangle size={18} className="text-rose-450" />
            <span>错词本</span>
            <span className="ml-auto bg-rose-500/20 text-rose-300 text-xs px-2.5 py-0.5 rounded-full border border-rose-500/30">
              {words.filter(w => w.isWrongList).length}
            </span>
          </button>

          <button
            id="nav-btn-preferences"
            onClick={() => setActiveNav("preferences")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer text-sm font-semibold transition-all ${
              activeNav === "preferences"
                ? "bg-slate-800 text-white shadow-sm font-bold"
                : "text-slate-400 hover:bg-slate-800/50 hover:text-white"
            }`}
          >
            <Settings size={18} className="opacity-70" />
            <span>听写配置</span>
          </button>
        </nav>

        {/* SIDEBAR BOTTOM PROGRESS CARD */}
        <div id="sidebar-progress-panel" className="p-6">
          <div className="bg-gradient-to-br from-indigo-900/40 to-slate-800/40 border border-indigo-500/20 rounded-2xl p-4">
            <p className="text-[10px] text-indigo-300 font-extrabold uppercase tracking-widest mb-2">词库积累目标</p>
            <div className="h-2 bg-slate-850 rounded-full mb-3 overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-700" 
                style={{ width: `${dailyProgressPercent}%` }}
              ></div>
            </div>
            <div className="flex justify-between items-baseline text-xs text-slate-300">
              <span>{words.length} / {dailyTarget} 单词</span>
              <span className="text-slate-500 font-mono text-[10px]">{dailyProgressPercent}%</span>
            </div>
          </div>
        </div>
      </aside>

      {/* 🚀 MAIN PANELS AND CONTENT CANVAS */}
      <main id="app-main" className="flex-1 flex flex-col h-screen overflow-hidden bg-slate-50">
        
        {/* HEADER TOP BAR */}
        <header id="top-bar" className="h-20 bg-white border-b border-slate-200/80 px-8 flex items-center justify-between shrink-0">
          <div id="top-breadcrumbs" className="flex items-center gap-3 text-xs text-slate-400 font-semibold tracking-wide">
            <span className="uppercase text-indigo-600 font-bold">Vocabulary Builder</span>
            <span>/</span>
            <span className="text-slate-800 font-bold">
              {activeNav === "dashboard" && "默写控制台"}
              {activeNav === "library" && "智能词库中心"}
              {activeNav === "mistakes" && "错词纠错集"}
              {activeNav === "preferences" && "核心听写配置"}
            </span>
          </div>

          <div id="quick-add-actions" className="flex gap-3">
            <button
              id="btn-quick-import"
              onClick={() => {
                setActiveNav("library");
                // Timeout to wait for active library render, then show modal
                setTimeout(() => {
                  const modalBtn = document.getElementById("btn-add-word-modal");
                  if (modalBtn) modalBtn.click();
                }, 100);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-205 border border-slate-200 rounded-xl text-xs font-bold text-slate-705 transition-all shadow-xs cursor-pointer active:scale-95"
            >
              <Plus size={14} />
              <span>快速录入单词 / OCR拍照识词</span>
            </button>
          </div>
        </header>

        {/* VIEW SCREEN SCROLLER CONTAINER */}
        <div id="main-content-scroller" className="flex-1 overflow-y-auto p-8">
          
          {/* --- VIEW 1: DASHBOARD / DICTATION --- */}
          {activeNav === "dashboard" && (
            <div id="dashboard-view" className="grid grid-cols-12 gap-8 max-w-7xl mx-auto">
              
              {/* Left Column: Active Spelling Card */}
              <div className="col-span-12 xl:col-span-8 flex flex-col gap-6">
                
                {!session ? (
                  // Idle dashboard - Select test modes
                  <div id="dictation-start-options" className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm text-center py-16">
                    <div className="mx-auto w-16 h-16 bg-indigo-50 text-indigo-650 rounded-2xl flex items-center justify-center mb-6">
                      <BookMarked size={32} />
                    </div>
                    <h2 className="text-2xl font-extrabold text-slate-800 mb-2">欢迎来到英语单词默写空间</h2>
                    <p className="text-slate-500 text-sm max-w-md mx-auto mb-8">
                      在这里开始高效的英语默写，支持通过语音发音听写、自动提取词义配对。您可以选择以下模式开展测试：
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl mx-auto">
                      <button
                        id="start-all-btn"
                        onClick={() => startDictation("all")}
                        className="p-5 border border-slate-200 hover:border-indigo-500 bg-white hover:bg-indigo-50/10 text-left rounded-2xl transition-all group cursor-pointer"
                      >
                        <h4 className="font-bold text-slate-800 group-hover:text-indigo-650 mb-1 flex items-center gap-2">
                          <BookOpen size={16} />
                          <span>全部词库测试</span>
                        </h4>
                        <p className="text-xs text-slate-400 leading-relaxed">听写您录入词库的所有词，按序进行，夯实基础知识。</p>
                      </button>

                      <button
                        id="start-mistakes-btn"
                        onClick={() => startDictation("mistakes")}
                        className="p-5 border border-rose-200 hover:border-rose-500 bg-white hover:bg-rose-50/10 text-left rounded-2xl transition-all group cursor-pointer"
                      >
                        <h4 className="font-bold text-slate-850 group-hover:text-rose-650 mb-1 flex items-center gap-2">
                          <AlertTriangle className="text-rose-500" size={16} />
                          <span>错词强化测试</span>
                        </h4>
                        <p className="text-xs text-slate-400 leading-relaxed">专门针对错词本里的生疏单词，专项冲刺消消乐。</p>
                      </button>
                    </div>

                    <div className="mt-8">
                      <span className="text-xs text-slate-400 block border-t border-slate-100 max-w-xs mx-auto pt-4">目前词库盘点：<b>{words.length}</b> 个单词</span>
                    </div>
                  </div>
                ) : (
                  // Live testing panel
                  <div id="live-dictation-card" className="bg-white rounded-3xl p-8 shadow-sm border border-slate-200 flex-1 flex flex-col justify-between">
                    
                    {/* Progress details */}
                    <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6">
                      <div>
                        <span className="bg-indigo-50 text-indigo-755 text-xs font-extrabold px-3 py-1 rounded-full uppercase tracking-widest">
                          Word {session.currentIndex + 1} of {session.wordIds.length}
                        </span>
                      </div>
                      <div className="flex items-center space-x-4">
                        <span className="text-xs text-slate-400 font-medium">当前连对: <b className="text-indigo-600 text-sm">{streak}</b></span>
                        <button
                          id="btn-quit-session"
                          onClick={() => {
                            if (confirm("确定要终止这次听写测试吗？")) {
                              setSession(null);
                            }
                          }}
                          className="text-xs font-bold text-slate-400 hover:text-slate-705 px-2 py-1 rounded hover:bg-slate-100"
                        >
                          退出听写
                        </button>
                      </div>
                    </div>

                    {/* Word display / hint element */}
                    {activeWordObj ? (
                      <div className="flex flex-col items-center justify-center py-6 text-center space-y-6">
                        
                        {/* Word hints */}
                        <div className="space-y-2">
                          <div className="flex justify-center items-center space-x-2">
                            <span className="text-indigo-600 font-mono text-lg font-bold select-all tracking-wide bg-indigo-50/50 px-3 py-1 rounded-lg">
                              {activeWordObj.phonetic || "/暂无音标/"}
                            </span>
                            <button
                              id="btn-speak-active"
                              onClick={() => handleSpeak(activeWordObj.word)}
                              className="p-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-md transition-all scale-100 hover:scale-105"
                              title="播放发音"
                            >
                              <Volume2 size={20} />
                            </button>
                          </div>
                          
                          {/* Chinese description of the testing word */}
                          <div className="bg-slate-50 border border-slate-100 px-4 py-2 rounded-xl inline-block mt-2">
                            <span className="text-sm text-slate-500 mr-2">释义:</span>
                            <span className="font-bold text-slate-800 text-sm">{activeWordObj.meaning}</span>
                          </div>
                        </div>

                        {/* Masked spelling or input puzzle help */}
                        <div className="my-2">
                          <span className="text-[28px] font-extrabold font-mono text-slate-700 tracking-[0.2em] uppercase select-none">
                            {isRevealed ? (
                              <span className="text-emerald-500 font-black">{activeWordObj.word}</span>
                            ) : (
                              // Reveal template letters helper
                              activeWordObj.word.split("").map((letter, i) => {
                                // Show first, last, and every other 3rd character as helpful scaffolding,
                                // others as underscores.
                                if (i === 0 || i === activeWordObj.word.length - 1 || i % 3 === 0) {
                                  return letter; // scaffolding
                                }
                                return "_";
                              }).join(" ")
                            )}
                          </span>
                        </div>

                        {/* Typing form */}
                        <div className="w-full max-w-md space-y-4">
                          <div className="relative">
                            <input
                              id="dictation-input"
                              type="text"
                              disabled={isRevealed}
                              placeholder="在次拼写该单词并按回车..."
                              value={userInput}
                              onChange={(e) => setUserInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && userInput.trim() && !isRevealed) {
                                  handleValidateSpelling();
                                }
                              }}
                              className={`w-full px-6 py-4 bg-slate-50 border-2 rounded-2xl text-xl focus:outline-none transition-all text-center font-bold tracking-wider ${
                                feedback === "correct" 
                                  ? "border-emerald-400 bg-emerald-50/10 focus:ring-2 focus:ring-emerald-500/20" 
                                  : feedback === "incorrect" 
                                  ? "border-rose-400 bg-rose-50/10 focus:ring-2 focus:ring-rose-500/20" 
                                  : "border-indigo-100 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10"
                              }`}
                              autoFocus
                              autoComplete="off"
                            />

                            {/* Verification symbols */}
                            {feedback !== "none" && (
                              <div className="absolute right-4 top-1/2 -translate-y-1/2">
                                {feedback === "correct" ? (
                                  <CheckCircle className="text-emerald-500" size={24} />
                                ) : (
                                  <XCircle className="text-rose-500" size={24} />
                                )}
                              </div>
                            )}
                          </div>

                          {/* Control action buttons */}
                          <div className="flex justify-between items-center text-sm px-1">
                            <div>
                              {!isRevealed ? (
                                <button
                                  id="btn-reveal-spelling"
                                  onClick={handleRevealWord}
                                  className="text-indigo-650 font-bold hover:underline transition-all flex items-center gap-1.5 cursor-pointer"
                                >
                                  <span>不知道 / 揭晓答案</span>
                                </button>
                              ) : (
                                <div className="text-left">
                                  <p className="text-xs text-slate-400">正确拼写：</p>
                                  <span className="font-mono font-bold text-slate-800 text-base">{activeWordObj.word}</span>
                                </div>
                              )}
                            </div>

                            <div className="flex gap-2">
                              {!isRevealed ? (
                                <button
                                  id="btn-submit-verify"
                                  disabled={!userInput.trim()}
                                  onClick={handleValidateSpelling}
                                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-100 text-white disabled:text-slate-400 font-bold text-xs rounded-xl shadow-md transition-colors cursor-pointer"
                                >
                                  提交核对
                                </button>
                              ) : (
                                <button
                                  id="btn-next-word"
                                  onClick={handleNextWord}
                                  className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 font-bold text-xs text-white rounded-xl shadow-md flex items-center gap-1.5 transition-all cursor-pointer"
                                >
                                  <span>继续下一个</span>
                                  <ArrowRight size={14} />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Associated Example sentence with dynamic masking */}
                        <div className="w-full p-4 bg-slate-50/50 rounded-2xl border border-slate-100 text-left mt-6">
                          <span className="inline-flex px-2 py-0.5 bg-indigo-50 text-indigo-700 text-[10px] font-extrabold rounded-md uppercase mb-2">
                            辅助默写例句
                          </span>
                          <p className="text-slate-700 leading-relaxed font-medium">
                            "{getMaskedExample(activeWordObj.example, activeWordObj.word)}"
                          </p>
                          <p className="text-xs text-slate-400 mt-1">
                            意思：{activeWordObj.exampleTranslation}
                          </p>
                        </div>

                      </div>
                    ) : (
                      <div className="p-8 text-center text-slate-400 italic">加载单词发生异常</div>
                    )}

                    {/* Footer progress tracker */}
                    <div className="h-2 bg-slate-100 rounded-full w-full overflow-hidden mt-6">
                      <div 
                        className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-300"
                        style={{ width: `${((session.currentIndex + 1) / session.wordIds.length) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column: Mini widgets and state trackers */}
              <div className="col-span-12 xl:col-span-4 flex flex-col gap-6">
                
                {/* 1. Mistake list tracker */}
                <div id="dashboard-wrong-tracker" className="bg-rose-50/90 rounded-3xl p-6 border border-rose-100 shadow-xs flex flex-col justify-between">
                  <div>
                    <h3 className="text-rose-900 font-bold text-sm mb-3 flex items-center gap-2">
                      <AlertTriangle size={18} className="text-rose-500" />
                      <span>生疏错词极速消退</span>
                    </h3>
                    
                    {words.filter(w => w.isWrongList).length === 0 ? (
                      <div className="py-6 text-center text-slate-400 text-xs">
                        目前非常完美，错词本中没有任何记录。继续保持！
                      </div>
                    ) : (
                      <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
                        {words.filter(w => w.isWrongList).slice(0, 4).map(item => (
                          <div id={`mis-badge-${item.id}`} key={item.id} className="flex items-center justify-between p-3 bg-white rounded-xl shadow-xs border border-rose-100">
                            <div>
                              <div className="text-slate-800 font-bold text-xs flex items-center gap-1">
                                <span>{item.word}</span>
                              </div>
                              <div className="text-[10px] font-mono text-indigo-500">{item.phonetic}</div>
                            </div>
                            <span className="text-rose-500 font-bold text-xs bg-rose-50 px-20 py-0.5 rounded-full">
                              重试 {item.wrongCount}次
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <button
                    id="trigger-mistake-set"
                    onClick={() => {
                      if (words.filter(w => w.isWrongList).length === 0) {
                        alert("错词本是空的哦，多听写积累可以强化错词。");
                        return;
                      }
                      setActiveNav("mistakes");
                    }}
                    className="w-full mt-4 py-2.5 text-rose-600 text-xs font-bold bg-white/50 border border-rose-200 rounded-xl hover:bg-rose-100/40 transition-all active:scale-95 cursor-pointer text-center"
                  >
                    查看全部错词本 ({words.filter(w => w.isWrongList).length}个)
                  </button>
                </div>

                {/* 2. Performance metrics tracker */}
                <div id="dashboard-performance-widget" className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 flex-1 flex flex-col justify-between">
                  <div>
                    <h3 className="text-slate-800 font-extrabold text-sm mb-4">学习指标和效能</h3>
                    
                    <div className="grid grid-cols-2 gap-4 mb-6">
                      <div className="p-4 bg-slate-50/80 rounded-2xl text-center">
                        <div className="text-2xl font-black text-indigo-650">{accuracyPercent}%</div>
                        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wide mt-1">听写准确率</div>
                      </div>
                      <div className="p-4 bg-slate-50/80 rounded-2xl text-center">
                        <div className="text-2xl font-black text-slate-800">{streak}</div>
                        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wide mt-1">当前连对</div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">内置基础词库</span>
                      
                      <div className="flex items-center gap-3 p-3 bg-indigo-50/20 border border-indigo-150/40 rounded-xl">
                        <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center text-lg font-bold">📖</div>
                        <div className="overflow-hidden">
                          <div className="text-xs font-bold text-slate-850 truncate">默认经典词库.xls</div>
                          <div className="text-[10px] text-slate-400">已内置 5 个高级词汇及AI双语例句</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 border-t border-slate-100 pt-4 text-center">
                    <button
                      id="guide-tour"
                      onClick={() => alert("默写使用建议：您可以先通过“智能词库”上传单词图片、粘贴文本分词或手动拼写，让 AI 帮您一键补全标准国际音标以及贴合生活的主题例句。再回到本页听写，巩固提升英语水平。")}
                      className="text-xs text-indigo-600 font-bold hover:underline"
                    >
                      如何高效掌握词汇？
                    </button>
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* --- VIEW 2: WORD LIBRARY --- */}
          {activeNav === "library" && (
            <div id="word-library-panel" className="max-w-7xl mx-auto">
              <WordLibrary
                words={words}
                onAddWords={handleAddWords}
                onDeleteWord={handleDeleteWord}
                onToggleWrongList={handleToggleWrongList}
                onClearStats={handleClearStats}
                speakWord={handleSpeak}
              />
            </div>
          )}

          {/* --- VIEW 3: WRONG WORDS LIST (错词本) --- */}
          {activeNav === "mistakes" && (
            <div id="mistakes-bank-panel" className="max-w-7xl mx-auto space-y-6">
              <div className="bg-gradient-to-br from-rose-500/10 via-rose-500/5 to-transparent border border-rose-200/50 rounded-3xl p-6 flex flex-col md:flex-row items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-black text-rose-900 flex items-center gap-2">
                    <AlertTriangle className="text-rose-500" size={20} />
                    <span>错词强化营 / 个人错词本</span>
                  </h3>
                  <p className="text-xs text-rose-700 mt-1 max-w-xl">
                    这里记录了所有在英语默写过程中，拼错过的词。AI 会在这里将其分类管理，您可以点击一键专项听写错词进行针对性学习。
                  </p>
                </div>

                <button
                  id="retest-mistakes-btn"
                  onClick={() => startDictation("mistakes")}
                  disabled={words.filter(w => w.isWrongList).length === 0}
                  className="px-6 py-3 bg-rose-500 hover:bg-rose-600 disabled:bg-slate-200 disabled:text-slate-400 text-white font-extrabold text-sm rounded-xl shadow-md flex items-center gap-2 transition-all cursor-pointer active:scale-95 shrink-0"
                >
                  <Play size={16} />
                  <span>专项强化听写 ({words.filter(w => w.isWrongList).length}个)</span>
                </button>
              </div>

              {/* Mistake list grid layout */}
              <div className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-xs">
                {words.filter(w => w.isWrongList).length === 0 ? (
                  <div className="p-16 text-center max-w-sm mx-auto">
                    <div className="w-16 h-16 bg-emerald-50 text-emerald-650 rounded-full flex items-center justify-center mx-auto mb-4">
                      <CheckCircle size={32} />
                    </div>
                    <h4 className="font-bold text-slate-800 text-base mb-1">棒极了！错词本空空的</h4>
                    <p className="text-xs text-slate-400 leading-relaxed">您的默写基础相当稳，或者是还在努力累积中。赶紧去控制台开启默写吧！</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {words.filter(w => w.isWrongList).map(item => (
                      <div id={`mis-card-detailed-${item.id}`} key={item.id} className="p-5 border border-slate-100 hover:border-rose-200/60 bg-slate-50/30 rounded-2xl flex flex-col justify-between space-y-3 hover:shadow-xs transition-colors">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center space-x-3">
                            <button
                              onClick={() => handleSpeak(item.word)}
                              className="p-2 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg transition-colors cursor-pointer"
                              title="点击发音"
                            >
                              <Volume2 size={16} />
                            </button>
                            <div>
                              <span className="font-black text-slate-800 text-base">{item.word}</span>
                              <span className="block text-xs text-indigo-500 font-mono tracking-wide">{item.phonetic}</span>
                            </div>
                          </div>

                          <button
                            id={`remove-mis-${item.id}`}
                            onClick={() => handleToggleWrongList(item.id)}
                            className="text-xs font-bold text-rose-500 hover:text-rose-700 bg-rose-100/50 hover:bg-rose-100 px-2.5 py-1 rounded-full transition-all"
                            title="消灭这个错词"
                          >
                            移出
                          </button>
                        </div>

                        <div className="text-xs text-slate-650 font-medium">释义: {item.meaning}</div>

                        <div className="bg-white p-3 rounded-xl border border-slate-100/80 text-[11px] leading-relaxed">
                          <p className="font-semibold text-slate-800 italic">Example: "{item.example}"</p>
                          <p className="text-slate-400 mt-0.5">{item.exampleTranslation}</p>
                        </div>

                        <div className="text-[10px] text-slate-400 flex items-center justify-between border-t border-slate-100 pt-2.5">
                          <span>错误频率: <b className="text-rose-500 font-extrabold">{item.wrongCount} 次</b></span>
                          <span>正确率: {item.correctCount + item.wrongCount > 0 ? `${Math.round((item.correctCount / (item.correctCount + item.wrongCount)) * 100)}%` : "0%"}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* --- VIEW 4: PREFERENCES / SETTINGS --- */}
          {activeNav === "preferences" && (
            <div id="preferences-panel" className="max-w-3xl mx-auto bg-white rounded-3xl border border-slate-200 p-8 shadow-sm space-y-6">
              
              <div>
                <h3 className="text-lg font-black text-slate-800 mb-1">听写核心偏好配置</h3>
                <p className="text-xs text-slate-400">调整听写引擎的朗读速度、忽略设置等进行自定义练习</p>
              </div>

              <div className="space-y-5 border-t border-slate-100 pt-6">
                
                {/* Speech voice picker */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">默认朗读人/美音/英音</label>
                  {availableVoices.length === 0 ? (
                    <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded-lg">浏览器中没有找到可用的内置发音人，将默认采用系统引擎进行中英转换。</p>
                  ) : (
                    <select
                      id="voice-select"
                      value={selectedVoiceName}
                      onChange={(e) => setSelectedVoiceName(e.target.value)}
                      className="w-full px-4 py-2 border border-slate-250 rounded-xl text-xs bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    >
                      {availableVoices.map(voice => (
                        <option key={voice.name} value={voice.name}>
                          {voice.name} ({voice.lang})
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Speed Rates Slider */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <div className="flex justify-between items-baseline mb-2">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">语音发音速度 ({settings.voiceSpeed}x)</label>
                      <button 
                        onClick={() => setSettings(prev => ({...prev, voiceSpeed: 0.9}))}
                        className="text-[10px] text-indigo-650 font-semibold"
                      >
                        重置默认
                      </button>
                    </div>
                    <input
                      id="voice-speed-slider"
                      type="range"
                      min="0.5"
                      max="1.8"
                      step="0.1"
                      value={settings.voiceSpeed}
                      onChange={(e) => setSettings(prev => ({ ...prev, voiceSpeed: parseFloat(e.target.value) }))}
                      className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between items-baseline mb-2">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">循环播放遍数</label>
                    </div>
                    <select
                      id="loop-count-select"
                      value={settings.loopCount}
                      onChange={(e) => setSettings(prev => ({ ...prev, loopCount: parseInt(e.target.value, 10) }))}
                      className="w-full px-4 py-2 border border-slate-250 rounded-xl text-xs bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    >
                      <option value="1">朗读 1 遍</option>
                      <option value="2">朗读 2 遍 (推荐)</option>
                      <option value="3">朗读 3 遍</option>
                    </select>
                  </div>
                </div>

                {/* Ignores & Checks Toggle Switch */}
                <div className="space-y-4 pt-4 border-t border-slate-100">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">高级评测忽略规则</h4>
                  
                  <div className="flex items-center justify-between p-3 hover:bg-slate-50 rounded-xl transition-all">
                    <div>
                      <p className="text-xs font-bold text-slate-800">大小写敏感匹配</p>
                      <p className="text-[10px] text-slate-400">开启后 Apple 与 apple 会被判为不同的拼写。</p>
                    </div>
                    <input
                      id="case-sensitive-toggle"
                      type="checkbox"
                      checked={settings.caseSensitive}
                      onChange={(e) => setSettings(prev => ({ ...prev, caseSensitive: e.target.checked }))}
                      className="w-4 h-4 text-indigo-600 bg-slate-100 border-slate-300 rounded focus:ring-indigo-500 focus:ring-2"
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 hover:bg-slate-50 rounded-xl transition-all">
                    <div>
                      <p className="text-xs font-bold text-slate-800">自动忽略英文标点</p>
                      <p className="text-[10px] text-slate-400">核对时自动忽视复合词中的连词符或词组中逗号的影响。</p>
                    </div>
                    <input
                      id="punctuation-toggle"
                      type="checkbox"
                      checked={settings.ignorePunctuation}
                      onChange={(e) => setSettings(prev => ({ ...prev, ignorePunctuation: e.target.checked }))}
                      className="w-4 h-4 text-indigo-600 bg-slate-100 border-slate-300 rounded focus:ring-indigo-500 focus:ring-2"
                    />
                  </div>
                </div>

                <div className="border-t border-slate-150 pt-5 text-right">
                  <span className="text-xs text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-xl font-bold">听写配置引擎就绪，设置已自动实时保存。</span>
                </div>
              </div>

            </div>
          )}

        </div>

        {/* BOTTOM PROGRESS DECORATION BAR */}
        <footer id="global-bottom-bar" className="h-4 bg-slate-205 w-full relative shrink-0">
          <div 
            className="absolute left-0 top-0 h-full bg-indigo-505 bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-1000" 
            style={{ width: `${session ? ((session.currentIndex + 1) / session.wordIds.length) * 100 : 35}%` }}
          ></div>
        </footer>

      </main>

      {/* RENDER INJECTED MODAL IF DIRECT TRIGGER REQUIRED */}
      {/* (Handles bridging scan buttons to vocabulary component triggers directly to satisfy theme click flows) */}
    </div>
  );
}
