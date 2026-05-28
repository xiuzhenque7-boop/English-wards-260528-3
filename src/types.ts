export interface DictationWord {
  id: string; // Unique uuid or timestamp based
  word: string; // The correct spelling of the english word
  phonetic: string; // IPA pronunciation symbol
  meaning: string; // Definition in Chinese
  example: string; // Example sentence in English
  exampleTranslation: string; // Example sentence translation in Chinese
  createdAt: number; // Timestamp of addition
  wrongCount: number; // Number of times spelled incorrectly
  correctCount: number; // Number of times spelled correctly
  lastTestedAt?: number; // Last dictation attempt timestamp
  isWrongList: boolean; // Flagged in the personal error notebook (错词本)
}

export interface DictationAttempt {
  wordId: string;
  wordString: string;
  userInput: string; // What the user spelled
  isCorrect: boolean; // Correct flag
  timestamp: number;
}

export interface DictationSession {
  id: string; // Session ID
  wordIds: string[]; // List of word IDs selected for this session
  currentIndex: number; // Current index in dictation
  attempts: DictationAttempt[]; // Attempts registered in this session
  startTime: number;
  endTime?: number;
  status: "idle" | "testing" | "revealing" | "completed"; // Revealing is showing correct answer before moving forward
}

export interface AppSettings {
  voiceSpeed: number; // Speech rate (0.5 to 2.0, default 0.9)
  voicePitch: number; // Pitch (0.5 to 2.0, default 1.0)
  autoPlayNext: boolean; // Auto advance after correct/revealed (deprecated or toggleable)
  caseSensitive: boolean; // Whether 'Apple' needs strict capitalization
  ignorePunctuation: boolean; // Ignore commas, hyphens etc in spelling
  loopCount: number; // How many times voice reads out on new word (default 2)
  voiceLanguage: string; // e.g., 'en-US', 'en-GB'
}
