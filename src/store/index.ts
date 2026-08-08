import { create } from 'zustand';

export interface QuranAyah {
  surah: number;
  ayah: number;
  arabic: string;
  translation: string;
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
}

interface AppState {
  currentProject: any | null;
  setCurrentProject: (project: any) => void;
  
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
    textSize: number;
    textPositionY: number;
    karaokeMode: boolean;
    thumbnailPath: string | null;
    highlightWordIndex: number | null;
  };
  updateCustomization: (newCust: Partial<AppState['customization']>) => void;
  clearProject: () => void;
}

export const useAppStore = create<AppState>((set) => ({
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
      // Just in case we missed the insertion, we could append it, but we usually push to renderQueue first.
      return { renderQueue: [...state.renderQueue, {
        id: updatedJob.job_id,
        title: `Job ${updatedJob.job_id}`,
        status: updatedJob.status,
        progress: updatedJob.progress,
        error: updatedJob.error
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
      wordEndIndex: v.words ? v.words.length : 0
    }));
    set({ verses, slides });
  },
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
  splitSlide: (slideId, wordIndex) => set((state) => {
    const idx = state.slides.findIndex(s => s.id === slideId);
    if (idx === -1) return state;
    const slide = state.slides[idx];
    if (wordIndex <= slide.wordStartIndex || wordIndex >= slide.wordEndIndex) return state;
    
    const newSlides = [...state.slides];
    newSlides.splice(idx, 1, 
      { ...slide, id: `${slide.id}_a`, wordEndIndex: wordIndex },
      { ...slide, id: `${slide.id}_b`, wordStartIndex: wordIndex }
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
    textSize: 100, // percentage
    textPositionY: 50, // percentage (50 = center)
    karaokeMode: false,
    thumbnailPath: null,
    highlightWordIndex: null
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
      textSize: 100,
      textPositionY: 50,
      karaokeMode: false,
      thumbnailPath: null,
      highlightWordIndex: null
    }
  })
}));
