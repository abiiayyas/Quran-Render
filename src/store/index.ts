import { create } from 'zustand';

export interface QuranAyah {
  surah: number;
  ayah: number;
  arabic: string;
  translation: string;
  translation_en?: string;
  words: {
    position: number;
    arabic: string;
    start_ms: number | null;
    end_ms: number | null;
  }[];
  audioPath?: string | null;
  audioDurationMs?: number;
}

export interface Slide {
  id: string;
  verseIndex: number;
  wordStartIndex: number;
  wordEndIndex: number;
  translation?: string;
  translation_en?: string;
}

interface AppState {
  currentProject: any | null;
  setCurrentProject: (project: any) => void;
  isExporting: boolean;
  setIsExporting: (isExporting: boolean) => void;
  
  renderQueue: any[];
  setRenderQueue: (queue: any[]) => void;
  updateRenderJob: (job: any) => void;

  
  audioPath: string | null;
  setAudioPath: (path: string | null) => void;
  bgPath: string | null;
  setBgPath: (path: string | null) => void;
  
  verses: QuranAyah[];
  setVerses: (verses: QuranAyah[]) => void;
  updateVerseAudio: (index: number, path: string, durationMs?: number) => void;
  
  slides: Slide[];
  setSlides: (slides: Slide[]) => void;
  updateSlideTranslation: (slideId: string, lang: 'id' | 'en', text: string) => void;
  splitSlide: (slideId: string, wordIndex: number) => void;
  removeSlide: (slideId: string) => void;
  activeSlideId: string | null;
  setActiveSlideId: (id: string | null) => void;
  
  selectedTemplate: string;
  setSelectedTemplate: (template: string) => void;

  settings: {
    font: string;
    outputDir: string;
    theme: string;
  };
  updateSettings: (newSettings: Partial<AppState['settings']>) => void;

  customization: {
    arabicTextSize: number;
    arabicFontFamily: string;
    arabicColor: string;
    translationTextSize: number;
    translationFontFamily: string;
    translationColor: string;
    translationBackground: boolean;
    showTranslation: boolean;
    translationLanguage: 'id' | 'en';
    showSeparator: boolean;
    textPositionY: number;
    karaokeMode: boolean;
    karaokeStyle: string;
    thumbnailPath: string | null;
    highlightWordIndex: number | null;
    watermarkType: 'none' | 'text' | 'image';
    watermarkText: string;
    watermarkImage: string | null;
    watermarkPositionY: number;
  };
  updateCustomization: (newCust: Partial<AppState['customization']>) => void;
  clearProject: () => void;
  addVerse: (verse: QuranAyah) => void;
}

export const useAppStore = create<AppState>((set) => ({
  isExporting: false,
  setIsExporting: (isExporting) => set({ isExporting }),
  currentProject: null,
  setCurrentProject: (project) => set({ currentProject: project }),
  renderQueue: [],
  setRenderQueue: (queue) => set({ renderQueue: queue }),
  updateRenderJob: (updatedJob) => set((state) => {
    const existingIdx = state.renderQueue.findIndex(j => j.id === updatedJob.job_id);
    if (existingIdx !== -1) {
      const newQ = [...state.renderQueue];
      newQ[existingIdx] = { ...newQ[existingIdx], status: updatedJob.status, progress: updatedJob.progress, error: updatedJob.error };
      return { renderQueue: newQ };
    } else {
      return { renderQueue: [...state.renderQueue, {
        id: updatedJob.job_id,
        title: `Job ${updatedJob.job_id}`,
        status: updatedJob.status,
        progress: updatedJob.progress,
        error: updatedJob.error,
        jobData: updatedJob.jobData // Added job data for pending queue
      }] };
    }
  }),
  
  audioPath: null,
  setAudioPath: (path) => set({ audioPath: path }),
  bgPath: null,
  setBgPath: (path) => set({ bgPath: path }),
  
  verses: [],
  setVerses: (verses) => {
    const slides = verses.map((v, i) => ({
      id: `slide_${i}_${Date.now()}`,
      verseIndex: i,
      wordStartIndex: 0,
      wordEndIndex: v.words ? v.words.length : 0,
      translation: v.translation,
      translation_en: v.translation_en
    }));
    set({ verses, slides });
  },
  addVerse: (verse) => set((state) => {
    const newVerses = [...state.verses, verse];
    const newSlide = {
      id: `slide_${state.verses.length}_${Date.now()}`,
      verseIndex: state.verses.length,
      wordStartIndex: 0,
      wordEndIndex: verse.words ? verse.words.length : 0,
      translation: verse.translation,
      translation_en: verse.translation_en
    };
    return { verses: newVerses, slides: [...state.slides, newSlide] };
  }),
  updateVerseAudio: (index, path, durationMs) => set((state) => {
    const newVerses = [...state.verses];
    if (newVerses[index]) {
      newVerses[index].audioPath = path;
      newVerses[index].audioDurationMs = durationMs;
    }
    return { verses: newVerses };
  }),
  
  slides: [],
  setSlides: (slides) => set({ slides }),
  updateSlideTranslation: (slideId, lang, text) => set((state) => {
    const idx = state.slides.findIndex(s => s.id === slideId);
    if (idx === -1) return state;
    const newSlides = [...state.slides];
    if (lang === 'id') {
      newSlides[idx].translation = text;
    } else {
      newSlides[idx].translation_en = text;
    }
    return { slides: newSlides };
  }),
  splitSlide: (slideId, wordIndex) => set((state) => {
    const idx = state.slides.findIndex(s => s.id === slideId);
    if (idx === -1) return state;
    const slide = state.slides[idx];
    if (wordIndex <= slide.wordStartIndex || wordIndex >= slide.wordEndIndex) return state;
    
    const newSlides = [...state.slides];
    
    // Split translations in half by space
    const splitText = (text?: string) => {
      if (!text) return ['', ''];
      const words = text.split(' ');
      const mid = Math.floor(words.length / 2);
      return [words.slice(0, mid).join(' '), words.slice(mid).join(' ')];
    };
    
    const [transA, transB] = splitText(slide.translation);
    const [transEnA, transEnB] = splitText(slide.translation_en);

    newSlides.splice(idx, 1, 
      { ...slide, id: `${slide.id}_a`, wordEndIndex: wordIndex, translation: transA, translation_en: transEnA },
      { ...slide, id: `${slide.id}_b`, wordStartIndex: wordIndex, translation: transB, translation_en: transEnB }
    );
    return { slides: newSlides };
  }),
  removeSlide: (slideId) => set((state) => ({
    slides: state.slides.filter(s => s.id !== slideId)
  })),
  activeSlideId: null,
  setActiveSlideId: (id) => set({ activeSlideId: id }),
  
  selectedTemplate: 'cinematic',
  setSelectedTemplate: (template) => set({ selectedTemplate: template }),

  settings: {
    font: 'amiri',
    outputDir: '/Users/user/Downloads',
    theme: 'dark'
  },
  updateSettings: (newSettings) => set((state) => ({
    settings: { ...state.settings, ...newSettings }
  })),

  customization: {
    arabicTextSize: 100,
    arabicFontFamily: 'Uthmanic',
    arabicColor: '#ffffff',
    translationTextSize: 100,
    translationFontFamily: 'sans-serif',
    translationColor: '#ffffff',
    translationBackground: true,
    showTranslation: true,
    translationLanguage: 'id',
    showSeparator: false,
    textPositionY: 50, // percentage (50 = center)
    karaokeMode: false,
    karaokeStyle: 'pop',
    thumbnailPath: null,
    highlightWordIndex: null,
    watermarkType: 'none',
    watermarkText: 'Quran Render',
    watermarkImage: null,
    watermarkPositionY: 12,
  },
  updateCustomization: (newCust) => set((state) => ({
    customization: { ...state.customization, ...newCust }
  })),
  clearProject: () => set({
    audioPath: null,
    bgPath: null,
    verses: [],
    slides: [],
    activeSlideId: null,
    customization: {
      arabicTextSize: 100,
      arabicFontFamily: 'Uthmanic',
      arabicColor: '#ffffff',
      translationTextSize: 100,
      translationFontFamily: 'sans-serif',
      translationColor: '#ffffff',
      translationBackground: true,
      showTranslation: true,
      translationLanguage: 'id',
      showSeparator: false,
      textPositionY: 50,
      karaokeMode: false,
      karaokeStyle: 'pop',
      thumbnailPath: null,
      highlightWordIndex: null,
      watermarkType: 'none',
      watermarkText: 'Quran Render',
      watermarkImage: null,
      watermarkPositionY: 12,
    }
  })
}));
