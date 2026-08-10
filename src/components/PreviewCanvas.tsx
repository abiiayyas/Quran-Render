import { forwardRef, useRef, useImperativeHandle, useState, useEffect } from 'react';
import { useAppStore } from '../store';
import { convertFileSrc } from '@tauri-apps/api/core';

export interface PreviewCanvasHandle extends HTMLDivElement {
  playPreview: () => void;
  pausePreview: () => void;
}

export const PreviewCanvas = forwardRef<PreviewCanvasHandle>((_, ref) => {
  const { verses, slides, activeSlideId, bgPath, audioPath, isExporting, selectedTemplate } = useAppStore();
  const customization = useAppStore(state => state.customization);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);

  useEffect(() => {
    if (!wrapperRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const { width, height } = entry.contentRect;
        const scaleW = width / 1080;
        const scaleH = height / 1920;
        setScale(Math.min(scaleW, scaleH));
      }
    });
    observer.observe(wrapperRef.current);
    return () => observer.disconnect();
  }, []);

  // Expose methods to parent
  useImperativeHandle(ref, () => {
    const el = containerRef.current as any;
    if (el) {
      el.playPreview = () => {
        if (videoRef.current) videoRef.current.play();
        if (audioRef.current) {
          // Sync audio to the first word of the slide if it's starting from the beginning
          if (audioRef.current.currentTime < 0.1 && displayWords.length > 0 && displayWords[0].start_ms !== null) {
            audioRef.current.currentTime = displayWords[0].start_ms / 1000;
          }
          audioRef.current.play();
          if (customization.karaokeMode && verse && verse.words) {
            audioRef.current.ontimeupdate = () => {
              const timeMs = audioRef.current!.currentTime * 1000;
              const localIndex = displayWords.findIndex(w => 
                w.start_ms !== null && w.end_ms !== null && 
                timeMs >= w.start_ms && timeMs <= w.end_ms
              );
              
              const globalIndex = localIndex !== -1 && activeSlide ? activeSlide.wordStartIndex + localIndex : -1;
              
              if (globalIndex !== -1 && customization.highlightWordIndex !== globalIndex) {
                useAppStore.getState().updateCustomization({ highlightWordIndex: globalIndex });
              } else if (globalIndex === -1 && customization.highlightWordIndex !== null) {
                useAppStore.getState().updateCustomization({ highlightWordIndex: null });
              }
            };
          }
        }
      };
      el.pausePreview = () => {
        if (videoRef.current) videoRef.current.pause();
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.ontimeupdate = null;
        }
        if (customization.karaokeMode) {
          useAppStore.getState().updateCustomization({ highlightWordIndex: null });
        }
      };
    }
    return el;
  });
  
  const activeSlide = slides.find(s => s.id === activeSlideId) || slides[0];
  const verse = activeSlide ? verses[activeSlide.verseIndex] : null;

  const displayWords = verse && verse.words ? verse.words.slice(activeSlide.wordStartIndex, activeSlide.wordEndIndex) : [];
  const displayArabic = (verse && verse.words && verse.words.length > 0) ? displayWords.map(w => w.arabic).join(' ') : (verse ? verse.arabic : '');
  
  const currentAudioPath = verse?.audioPath || audioPath;

  const fontMap: Record<string, string> = {
    'amiri': 'Amiri, serif',
    'Uthmanic': 'Uthmanic, serif',
    'LPMQ': 'LPMQ, serif',
    'sans-serif': 'sans-serif',
    'serif': 'serif',
    'monospace': 'monospace'
  };

  // Convert percentage slider to actual CSS values
  const arabicFontSizeFactor = customization.arabicTextSize / 100;
  const translationFontSizeFactor = customization.translationTextSize / 100;
  const arabicFontSize = `${5 * arabicFontSizeFactor}rem`; // base 5rem (was text-7xl)
  const transFontSize = `${2.25 * translationFontSizeFactor}rem`; // base 2.25rem (was text-4xl)

  // Map 0-100% to absolute top position
  const topPosition = `${customization.textPositionY}%`;

  // Detect background type
  const isVideoBg = bgPath?.toLowerCase().match(/\.(mp4|mov|webm)$/);
  const isImageBg = bgPath?.toLowerCase().match(/\.(jpg|jpeg|png|webp)$/);

  // Template styles
  const getTemplateOverlayClass = () => {
    switch (selectedTemplate) {
      case 'cinematic':
        return 'bg-gradient-to-t from-black/80 via-black/30 to-transparent pb-32 pt-16';
      case 'clean':
        return 'bg-black/40 backdrop-blur-sm rounded-3xl p-8';
      case 'minimal':
      default:
        return '';
    }
  };

  const isFading = customization.animationStyle === 'fade' && !isExporting;

  return (
    <div ref={wrapperRef} className="w-full h-full flex justify-center items-center overflow-hidden bg-black">
      <div className="relative flex-shrink-0 bg-zinc-900" style={{ width: `${1080 * scale}px`, height: `${1920 * scale}px` }}>
        <div 
          ref={containerRef}
          className="preview-canvas-container absolute top-0 left-0 flex flex-col items-center justify-center overflow-hidden"
          style={{
            width: '1080px',
            height: '1920px',
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
        >
        {/* Background Layer - Hidden during export by html-to-image filter logic in Editor.tsx */}
        <div id="preview-bg-layer" className="absolute inset-0 w-full h-full object-cover -z-10">
          {isVideoBg && bgPath && <video ref={videoRef} src={convertFileSrc(bgPath)} className="w-full h-full object-cover" loop muted playsInline />}
          {isImageBg && bgPath && <img src={convertFileSrc(bgPath)} className="w-full h-full object-cover" />}
          {currentAudioPath && <audio ref={audioRef} src={convertFileSrc(currentAudioPath)} />}
        </div>

        {/* Logo Watermark Layer */}
        {customization.watermarkType !== 'none' && (
          <div 
            className="absolute left-0 right-0 flex justify-center opacity-80 z-20"
            style={{ top: `${customization.watermarkPositionY}%` }}
          >
            {customization.watermarkType === 'text' ? (
              <div className="text-white text-3xl font-bold drop-shadow-xl bg-black/30 px-6 py-2 rounded-xl border border-white/20">
                {customization.watermarkText}
              </div>
            ) : (
              customization.watermarkImage && (
                <img src={convertFileSrc(customization.watermarkImage)} alt="Watermark" className="h-24 drop-shadow-xl" />
              )
            )}
          </div>
        )}

        {/* Text Overlay Layer */}
        {verse ? (
          <div 
            key={`${activeSlideId}-${customization.animationStyle}`}
            className={`absolute w-full px-16 flex flex-col items-center gap-12 ${getTemplateOverlayClass()} ${isFading ? 'animate-in fade-in duration-500' : ''}`}
            style={{ 
              top: topPosition, 
              transform: 'translateY(-50%)',
              animation: isFading ? 'fadeIn 0.5s ease-in-out' : 'none'
            }}
          >
            <style>{`
              @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
              }
            `}</style>
            <div 
              dir="rtl" 
              className="font-bold leading-normal text-center w-full flex justify-center flex-wrap gap-x-4 py-4" 
              style={{ fontFamily: fontMap[customization.arabicFontFamily] || 'Uthmanic, serif', fontSize: arabicFontSize, textShadow: '0px 4px 12px rgba(0,0,0,0.8)' }}
            >
              {customization.karaokeMode && displayWords.length > 0 ? (
                displayWords.map((word, index) => {
                  const globalIndex = activeSlide ? activeSlide.wordStartIndex + index : index;
                  const isHighlighted = customization.highlightWordIndex === globalIndex;
                  let color = customization.arabicColor;
                  let backgroundColor = 'transparent';
                  let padding = '0';
                  let borderRadius = '0';
                  let textShadow = '0px 4px 12px rgba(0,0,0,0.8)';
                  let scale = 1;
                  let fontWeight = 'bold';

                  if (isHighlighted) {
                    if (customization.karaokeStyle === 'pop') {
                      color = '#FCD34D'; // Yellow
                    } else if (customization.karaokeStyle === 'hormozi') {
                      color = '#22c55e'; // Green
                    } else if (customization.karaokeStyle === 'neon') {
                      color = '#22d3ee'; // Cyan
                      textShadow = '0 0 10px #22d3ee, 0 0 20px #22d3ee, 0 0 30px #22d3ee';
                    } else if (customization.karaokeStyle === 'punch') {
                      color = '#000000'; // Black
                      backgroundColor = '#FCD34D'; // Yellow box
                      padding = '0 12px';
                      borderRadius = '8px';
                      scale = 1.05;
                    } else if (customization.karaokeStyle === 'tiktok') {
                      color = '#ef4444'; // Red
                      textShadow = '-2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000';
                    }
                  } else {
                    if (customization.karaokeStyle === 'neon') {
                      color = '#bae6fd'; // Light blue
                    } else if (customization.karaokeStyle === 'tiktok') {
                      textShadow = '-2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000';
                    }
                  }

                  return (
                    <span 
                      key={index} 
                      className={`inline-block ${customization.karaokeStyle === 'hormozi' ? 'uppercase' : ''}`}
                      style={{ 
                        color,
                        backgroundColor,
                        padding,
                        borderRadius,
                        textShadow,
                        transform: `scale(${scale})`,
                        fontWeight,
                        transition: isExporting ? 'none' : 'all 0.15s ease-in-out' 
                      }}
                    >
                      {word.arabic}
                    </span>
                  );
                })
              ) : (
                <span style={{ color: customization.arabicColor }}>{displayArabic}</span>
              )}
            </div>
            {customization.showSeparator && (
              <div className="w-16 h-1 bg-yellow-500/80 rounded-full" />
            )}

            {customization.showTranslation && (
              <div 
                className={`text-center px-8 p-4 rounded-xl max-w-[90%] ${customization.translationBackground ? 'bg-black/60' : ''}`}
                style={{ 
                  fontSize: transFontSize,
                  fontFamily: fontMap[customization.translationFontFamily] || 'sans-serif',
                  color: customization.translationColor
                }}
              >
                {customization.translationLanguage === 'en' 
                  ? (activeSlide?.translation_en || verse.translation_en)
                  : (activeSlide?.translation || verse.translation)}
              </div>
            )}
          </div>
        ) : (
          <div className="text-gray-400 text-5xl font-bold bg-black/50 p-8 rounded-xl z-10">
            No Verse Selected
          </div>
        )}
      </div>
    </div>
  </div>
);
});
