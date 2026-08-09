import React, { useRef, useState } from 'react';
import { useAppStore } from '../store';
import { open } from '@tauri-apps/plugin-dialog';
import { toPng } from 'html-to-image';
import { PreviewCanvas, PreviewCanvasHandle } from '../components/PreviewCanvas';
import { getAudioDuration } from '../utils/audio';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { SURAH_LIST } from '../utils/surahList';
import { RECITER_LIST } from '../utils/reciterList';

export const Editor: React.FC = () => {
  const store = useAppStore();
  const previewRef = useRef<PreviewCanvasHandle>(null);
  
  const [surah, setSurah] = useState('1');
  const [ayatStart, setAyatStart] = useState('1');
  const [ayatEnd, setAyatEnd] = useState('2');
  const [loading, setLoading] = useState(false);
  const [autoFetchAudio, setAutoFetchAudio] = useState(false);
  const [reciterId, setReciterId] = useState('7'); // Default Mishary
  const [useQuranApi, setUseQuranApi] = useState(true);
  const [manualArabic, setManualArabic] = useState('');
  const [manualTranslation, setManualTranslation] = useState('');

  const handleSetManualText = () => {
    store.setVerses([{
      surah: 1,
      ayah: 1,
      arabic: manualArabic || 'بسم الله الرحمن الرحيم',
      translation: manualTranslation || 'Dengan menyebut nama Allah Yang Maha Pengasih lagi Maha Penyayang.',
      words: []
    }]);
  };
  const handleFetchAyat = async () => {
    try {
      setLoading(true);
      const verses = await invoke('fetch_quran_verses', {
        surah: parseInt(surah),
        ayatStart: parseInt(ayatStart),
        ayatEnd: parseInt(ayatEnd),
        reciterId: parseInt(reciterId) // Pass reciterId to fetch words correctly from Rust
      }) as any[];
      store.setVerses(verses);

      if (autoFetchAudio && verses.length > 0) {
        for (let i = 0; i < verses.length; i++) {
          const v = verses[i];
          const audioUrlReq = await fetch(`https://api.quran.com/api/v4/recitations/${reciterId}/by_ayah/${surah}:${v.ayah}`);
          const audioData = await audioUrlReq.json();
          
          if (audioData && audioData.audio_files && audioData.audio_files.length > 0) {
            let url = audioData.audio_files[0].url;
            if (url.startsWith('//')) {
              url = `https:${url}`;
            } else if (!url.startsWith('http')) {
              url = `https://verses.quran.com/${url}`;
            }
            const filename = `quran_${surah}_${v.ayah}_${reciterId}.mp3`;
            
            const localPath = await invoke('download_audio', {
              url,
              filename
            }) as string;
            
            const dur = await getAudioDuration(convertFileSrc(localPath));
            store.updateVerseAudio(i, localPath, dur);
            
            if (i === 0) {
              store.setAudioPath(localPath);
            }
          }
        }
      }
    } catch (err) {
      console.error(err);
      alert('Failed to fetch ayat or audio');
    } finally {
      setLoading(false);
    }
  };

  const handleImportAudio = async () => {
    const file = await open({
      multiple: false,
      filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'm4a'] }]
    });
    if (file) {
      store.setAudioPath(file as string);
    }
  };

  const handleImportBackground = async () => {
    const file = await open({
      multiple: false,
      filters: [{ name: 'Media', extensions: ['mp4', 'mov', 'jpg', 'jpeg', 'png', 'webp'] }]
    });
    if (file) {
      store.setBgPath(file as string);
    }
  };

  const handleImportThumbnail = async () => {
    const file = await open({
      multiple: false,
      filters: [{ name: 'Image', extensions: ['jpg', 'jpeg', 'png'] }]
    });
    if (file) {
      store.updateCustomization({ thumbnailPath: file as string });
    }
  };

  const handleGenerate = async () => {
    if (!store.audioPath || !store.bgPath || store.verses.length === 0) {
      alert("Please ensure audio, background, and verses are loaded.");
      return;
    }

    if (!previewRef.current) return;

    try {
      setLoading(true);
      store.setIsExporting(true);
      
      const dir = store.settings.outputDir.replace(/\/$/, '');
      
      // We need to render the canvas at 1080x1920 without scaling for the export.
      const el = previewRef.current;

      if (store.slides.length === 0) {
        throw new Error("No slides to render. Fetch data first.");
      }

      let audioPaths: string[] = [];
      let overlaySequence: any[] = [];
      let cumulativeAudioDurationMs = 0;

      const uniqueVerseIndices = Array.from(new Set(store.slides.map(s => s.verseIndex)));
      uniqueVerseIndices.sort((a,b) => a - b);
      
      for (const vIndex of uniqueVerseIndices) {
        const verse = store.verses[vIndex];
        const vAudioPath = verse.audioPath || store.audioPath;
        if (!vAudioPath) {
           throw new Error("Missing audio for verse " + verse.ayah);
        }
        audioPaths.push(vAudioPath);
        
        const verseSlides = store.slides.filter(s => s.verseIndex === vIndex);
        
        for (const slide of verseSlides) {
          store.setActiveSlideId(slide.id);
          // Wait for React to render the active slide text
          await new Promise(res => setTimeout(res, 200)); 
          
          if (store.customization.karaokeMode && verse.words && verse.words.length > 0) {
            const displayWords = verse.words.slice(slide.wordStartIndex, slide.wordEndIndex);
            for (let i = 0; i < displayWords.length; i++) {
              const word = displayWords[i];
              const actualWordIndex = slide.wordStartIndex + i;
              if (word.start_ms === null || word.end_ms === null) continue;
              
              store.updateCustomization({ highlightWordIndex: actualWordIndex });
              await new Promise(res => setTimeout(res, 50));
              
              const frameDataUrl = await toPng(el, {
                width: 1080, height: 1920, cacheBust: true, backgroundColor: 'transparent',
                style: { transform: 'scale(1)', transformOrigin: 'top left', background: 'transparent' },
                pixelRatio: 1, filter: (node) => node.id !== 'preview-bg-layer'
              });
              
              overlaySequence.push({
                base64: frameDataUrl.replace(/^data:image\/png;base64,/, ""),
                start_ms: Math.round(cumulativeAudioDurationMs + (word.start_ms || 0)),
                end_ms: Math.round(cumulativeAudioDurationMs + (word.end_ms || verse.audioDurationMs || 5000))
              });
            }
            store.updateCustomization({ highlightWordIndex: null });
          } else {
             // Static slide
             const frameDataUrl = await toPng(el, {
               width: 1080, height: 1920, cacheBust: true, backgroundColor: 'transparent',
               style: { transform: 'scale(1)', transformOrigin: 'top left', background: 'transparent' },
               pixelRatio: 1, filter: (node) => node.id !== 'preview-bg-layer'
             });
             
             const displayWords = verse.words ? verse.words.slice(slide.wordStartIndex, slide.wordEndIndex) : [];
             const firstWord = displayWords.length > 0 ? displayWords[0] : null;
             const lastWord = displayWords.length > 0 ? displayWords[displayWords.length-1] : null;
             
             const startMs = firstWord?.start_ms ?? 0;
             const endMs = lastWord?.end_ms ?? (verse.audioDurationMs || 5000);
             
             overlaySequence.push({
                base64: frameDataUrl.replace(/^data:image\/png;base64,/, ""),
                start_ms: Math.round(cumulativeAudioDurationMs + startMs),
                end_ms: Math.round(cumulativeAudioDurationMs + endMs)
             });
          }
        }
        
        cumulativeAudioDurationMs += verse.audioDurationMs || 0;
      }
      
      const jobId = `job_${Date.now()}`;
      const outputPath = `${dir}/quran_project_${Date.now()}.mp4`;

      store.updateRenderJob({
        job_id: jobId,
        status: 'pending',
        progress: 0,
        error: null,
        jobData: {
          id: jobId,
          title: `Render Project (${store.slides.length} slides)`,
          audio_paths: audioPaths,
          bg_path: store.bgPath,
          output_path: outputPath,
          overlay_base64: null,
          overlay_sequence: overlaySequence.length > 0 ? overlaySequence : null,
          thumbnail_path: store.customization.thumbnailPath
        }
      });
      
      alert(`Render job added to queue! Head over to the Render Queue tab to process it.`);
    } catch (err) {
      console.error(err);
      alert(`Render failed: ${err}`);
    } finally {
      setLoading(false);
      store.setIsExporting(false);
    }
  };

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Left panel: Controls */}
      <div className="w-1/3 bg-gray-800 border-r border-gray-700 flex flex-col p-4 overflow-y-auto">
        <h2 className="text-xl font-bold mb-4">Project Editor</h2>
        
        <div className="space-y-6">
          <section>
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Quran Data</h3>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">Use API</span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" checked={useQuranApi} onChange={e => setUseQuranApi(e.target.checked)} />
                  <div className="w-7 h-4 bg-gray-500 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
            </div>
            
            <div className="bg-gray-700 p-3 rounded">
              {useQuranApi ? (
                <>
                  <div className="flex flex-col gap-2">
                    <div className="w-full">
                      <label className="block text-xs text-gray-400 mb-1">Surah</label>
                      <select 
                        value={surah} 
                        onChange={e => {
                          const newSurah = e.target.value;
                          setSurah(newSurah);
                          const surahData = SURAH_LIST.find(s => s.id.toString() === newSurah);
                          if (surahData) {
                            if (parseInt(ayatStart) > surahData.count) setAyatStart("1");
                            if (parseInt(ayatEnd) > surahData.count) setAyatEnd(surahData.count.toString());
                          }
                        }} 
                        className="w-full p-2 bg-gray-900 border border-gray-600 rounded text-white text-sm"
                      >
                        {SURAH_LIST.map(s => (
                          <option key={s.id} value={s.id.toString()}>{s.id}. {s.name} ({s.trans})</option>
                        ))}
                      </select>
                    </div>
                    <div className="w-full">
                      <label className="block text-xs text-gray-400 mb-1">Qari (Reciter)</label>
                      <select 
                        value={reciterId} 
                        onChange={e => setReciterId(e.target.value)}
                        className="w-full p-2 bg-gray-900 border border-gray-600 rounded text-white text-sm"
                      >
                        {RECITER_LIST.map(r => (
                          <option key={r.id} value={r.id.toString()}>{r.name} ({r.style})</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <div className="w-1/2">
                        <label className="block text-xs text-gray-400 mb-1">Mulai Ayat</label>
                        <input type="number" min="1" max={SURAH_LIST.find(s => s.id.toString() === surah)?.count || 286} value={ayatStart} onChange={e => setAyatStart(e.target.value)} placeholder="Start" className="w-full p-2 bg-gray-900 border border-gray-600 rounded text-white" />
                      </div>
                      <div className="w-1/2">
                        <label className="block text-xs text-gray-400 mb-1">Sampai Ayat</label>
                        <input type="number" min="1" max={SURAH_LIST.find(s => s.id.toString() === surah)?.count || 286} value={ayatEnd} onChange={e => setAyatEnd(e.target.value)} placeholder="End" className="w-full p-2 bg-gray-900 border border-gray-600 rounded text-white" />
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center mt-3 mb-2 gap-2">
                    <input 
                      type="checkbox" 
                      id="autoFetchAudio"
                      checked={autoFetchAudio}
                      onChange={e => setAutoFetchAudio(e.target.checked)}
                      className="rounded bg-gray-900 border-gray-600"
                    />
                    <label htmlFor="autoFetchAudio" className="text-xs text-gray-300">
                      Auto-Fetch Audio & Enable Batch Mode
                    </label>
                  </div>
                  <button onClick={handleFetchAyat} disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 py-2 rounded text-white font-medium transition disabled:opacity-50">
                    {loading ? 'Processing...' : (autoFetchAudio ? 'Fetch & Auto-Audio' : 'Fetch Quran Text')}
                  </button>
                </>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Teks Arab (Manual)</label>
                    <textarea value={manualArabic} onChange={e => setManualArabic(e.target.value)} className="w-full p-2 bg-gray-900 border border-gray-600 rounded text-white text-right text-lg" rows={3} placeholder="Teks Arab..." dir="rtl" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Terjemahan (Manual)</label>
                    <textarea value={manualTranslation} onChange={e => setManualTranslation(e.target.value)} className="w-full p-2 bg-gray-900 border border-gray-600 rounded text-white text-sm" rows={2} placeholder="Terjemahan..." />
                  </div>
                  <button onClick={handleSetManualText} className="w-full bg-green-600 hover:bg-green-700 py-2 rounded text-white font-medium transition">
                    Set Text
                  </button>
                </div>
              )}
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400 mb-2">Slides / Scenes</h3>
            {store.slides.length === 0 ? (
              <div className="text-xs text-gray-500 italic">No slides available. Fetch Quran data first.</div>
            ) : (
              <div className="space-y-2">
                {store.slides.map((slide, idx) => {
                  const verse = store.verses[slide.verseIndex];
                  if (!verse) return null;
                  const totalWords = verse.words ? verse.words.length : 0;
                  const canSplit = useQuranApi && totalWords > 1 && (slide.wordEndIndex - slide.wordStartIndex > 1);
                  return (
                    <div 
                      key={slide.id} 
                      className={`p-2 rounded cursor-pointer transition ${store.activeSlideId === slide.id ? 'bg-blue-900 border border-blue-500' : 'bg-gray-700 hover:bg-gray-600'}`} 
                      onClick={() => store.setActiveSlideId(slide.id)}
                    >
                      <div className="flex justify-between items-start">
                        <div className="text-xs text-white font-semibold">Slide {idx + 1} (Ayah {verse.ayah})</div>
                        <button onClick={(e) => { e.stopPropagation(); store.removeSlide(slide.id); }} className="text-xs text-red-400 hover:text-red-300">Remove</button>
                      </div>
                      <div className="text-xs text-gray-400 mt-1">Words: {slide.wordStartIndex + 1} to {slide.wordEndIndex} of {totalWords}</div>
                      {canSplit && (
                        <button 
                          onClick={(e) => { 
                            e.stopPropagation(); 
                            const mid = slide.wordStartIndex + Math.floor((slide.wordEndIndex - slide.wordStartIndex) / 2);
                            store.splitSlide(slide.id, mid); 
                          }} 
                          className="text-xs bg-gray-800 hover:bg-gray-700 text-blue-400 px-2 py-1 rounded mt-2 border border-gray-600 w-full"
                        >
                          Split in half
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400 mb-2">Assets & Thumbnail</h3>
            <div className="space-y-2">
              <button onClick={handleImportAudio} className="w-full bg-gray-700 hover:bg-gray-600 py-2 rounded transition flex flex-col items-center justify-center p-2 text-sm">
                <span className="font-semibold text-white">Import Audio</span>
                {store.audioPath && <span className="text-xs text-gray-400 mt-1 break-all px-2">{store.audioPath}</span>}
              </button>
              <button onClick={handleImportBackground} className="w-full bg-gray-700 hover:bg-gray-600 py-2 rounded transition flex flex-col items-center justify-center p-2 text-sm">
                <span className="font-semibold text-white">Import Background</span>
                {store.bgPath && <span className="text-xs text-gray-400 mt-1 break-all px-2">{store.bgPath}</span>}
              </button>
              <button onClick={handleImportThumbnail} className="w-full bg-gray-700 hover:bg-gray-600 py-2 rounded transition flex flex-col items-center justify-center p-2 text-sm">
                <span className="font-semibold text-white">Import Thumbnail (Optional)</span>
                {store.customization.thumbnailPath && <span className="text-xs text-gray-400 mt-1 break-all px-2">{store.customization.thumbnailPath}</span>}
              </button>
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400 mb-2">Customize</h3>
            <div className="bg-gray-700 p-4 rounded space-y-4">
              {/* Arabic Settings */}
              <div className="pt-2">
                <h4 className="text-xs font-semibold text-gray-400 mb-2 uppercase">Arabic Text</h4>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-gray-300">Font</span>
                    <select 
                      value={store.customization.arabicFontFamily}
                      onChange={e => store.updateCustomization({ arabicFontFamily: e.target.value })}
                      className="bg-gray-900 border border-gray-600 rounded text-white text-xs p-1"
                    >
                      <option value="Uthmanic">Uthmanic (Hafs)</option>
                      <option value="LPMQ">LPMQ (Kemenag)</option>
                      <option value="amiri">Amiri</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-gray-300">Color</span>
                    <input type="color" value={store.customization.arabicColor} onChange={e => store.updateCustomization({ arabicColor: e.target.value })} className="w-full h-[26px] bg-transparent border-0 cursor-pointer rounded" />
                  </div>
                </div>
                <div className="flex justify-between text-xs text-gray-300 mb-1">
                  <span>Size</span>
                  <span>{store.customization.arabicTextSize}%</span>
                </div>
                <input 
                  type="range" min="50" max="250" 
                  value={store.customization.arabicTextSize} 
                  onChange={e => store.updateCustomization({ arabicTextSize: parseInt(e.target.value) })}
                  className="w-full h-1"
                />
              </div>

              {/* Translation Settings */}
              <div className="pt-2 border-t border-gray-600 mt-2">
                <h4 className="text-xs font-semibold text-gray-400 mb-2 uppercase">Translation Text</h4>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-gray-300">Font</span>
                    <select 
                      value={store.customization.translationFontFamily}
                      onChange={e => store.updateCustomization({ translationFontFamily: e.target.value })}
                      className="bg-gray-900 border border-gray-600 rounded text-white text-xs p-1"
                    >
                      <option value="sans-serif">Sans Serif</option>
                      <option value="serif">Serif</option>
                      <option value="monospace">Monospace</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-gray-300">Color</span>
                    <input type="color" value={store.customization.translationColor} onChange={e => store.updateCustomization({ translationColor: e.target.value })} className="w-full h-[26px] bg-transparent border-0 cursor-pointer rounded" />
                  </div>
                </div>
                <div className="flex justify-between text-xs text-gray-300 mb-1">
                  <span>Size</span>
                  <span>{store.customization.translationTextSize}%</span>
                </div>
                <input 
                  type="range" min="50" max="250" 
                  value={store.customization.translationTextSize} 
                  onChange={e => store.updateCustomization({ translationTextSize: parseInt(e.target.value) })}
                  className="w-full h-1"
                />
                
                <div className="flex flex-col gap-2 mt-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-300">Background Box</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="sr-only peer" 
                        checked={store.customization.translationBackground}
                        onChange={e => store.updateCustomization({ translationBackground: e.target.checked })}
                      />
                      <div className="w-7 h-4 bg-gray-500 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-300">Show Separator</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="sr-only peer" 
                        checked={store.customization.showSeparator}
                        onChange={e => store.updateCustomization({ showSeparator: e.target.checked })}
                      />
                      <div className="w-7 h-4 bg-gray-500 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>
                </div>
              </div>

              {/* Position */}
              <div className="pt-2 border-t border-gray-600 mt-2">
                <div className="flex justify-between text-sm text-gray-300 mb-1">
                  <span>Global Y Position</span>
                  <span>{store.customization.textPositionY}%</span>
                </div>
                <input 
                  type="range" min="0" max="100" 
                  value={store.customization.textPositionY} 
                  onChange={e => store.updateCustomization({ textPositionY: parseInt(e.target.value) })}
                  className="w-full h-1"
                />
              </div>

              <div className="flex flex-col gap-2 mt-2 pt-2 border-t border-gray-600">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-300">Watermark</span>
                  <select 
                    value={store.customization.watermarkType}
                    onChange={e => store.updateCustomization({ watermarkType: e.target.value as any })}
                    className="bg-gray-900 border border-gray-600 rounded text-white text-xs px-2 py-1"
                  >
                    <option value="none">None</option>
                    <option value="text">Text</option>
                    <option value="image">Image (PNG)</option>
                  </select>
                </div>
                {store.customization.watermarkType === 'text' && (
                  <input 
                    type="text" 
                    value={store.customization.watermarkText} 
                    onChange={e => store.updateCustomization({ watermarkText: e.target.value })}
                    className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-sm text-white"
                    placeholder="Enter watermark text"
                  />
                )}
                {store.customization.watermarkType === 'image' && (
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={async () => {
                        const { open } = await import('@tauri-apps/plugin-dialog');
                        const selected = await open({ filters: [{ name: 'Image', extensions: ['png'] }], multiple: false });
                        if (selected && typeof selected === 'string') {
                          store.updateCustomization({ watermarkImage: selected });
                        }
                      }}
                      className="bg-gray-700 hover:bg-gray-600 text-xs px-2 py-1 rounded text-white"
                    >
                      Browse Logo...
                    </button>
                    <span className="text-xs text-gray-400 truncate flex-1">
                      {store.customization.watermarkImage ? store.customization.watermarkImage.split(/[\\/]/).pop() : 'No image selected'}
                    </span>
                  </div>
                )}
                
                {store.customization.watermarkType !== 'none' && (
                  <div className="mt-2">
                    <div className="flex justify-between text-xs text-gray-400 mb-1">
                      <span>Watermark Y Pos</span>
                      <span>{store.customization.watermarkPositionY}%</span>
                    </div>
                    <input 
                      type="range" min="0" max="100" 
                      value={store.customization.watermarkPositionY} 
                      onChange={e => store.updateCustomization({ watermarkPositionY: parseInt(e.target.value) })}
                      className="w-full h-1"
                    />
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-600">
                <span className="text-sm text-gray-300">Karaoke Mode</span>
                <div className="flex items-center gap-4">
                  {store.customization.karaokeMode && (
                    <select 
                      value={store.customization.karaokeStyle}
                      onChange={e => store.updateCustomization({ karaokeStyle: e.target.value })}
                      className="bg-gray-900 border border-gray-600 rounded text-white text-xs px-2 py-1"
                    >
                      <option value="pop">Pop (Yellow)</option>
                      <option value="hormozi">Hormozi (Green)</option>
                      <option value="neon">Neon Glow</option>
                      <option value="punch">Word Punch</option>
                      <option value="tiktok">TikTok Bold</option>
                    </select>
                  )}
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="sr-only peer" 
                      checked={store.customization.karaokeMode}
                      onChange={e => store.updateCustomization({ karaokeMode: e.target.checked })}
                    />
                    <div className="w-9 h-5 bg-gray-500 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400 mb-2">Template</h3>
            <select 
              value={store.selectedTemplate}
              onChange={e => store.setSelectedTemplate(e.target.value)}
              className="w-full p-2 bg-gray-900 border border-gray-600 rounded text-white"
            >
              <option value="minimal">Minimal</option>
              <option value="cinematic">Cinematic</option>
              <option value="clean">Clean</option>
            </select>
          </section>
        </div>
      </div>

      {/* Right panel: Preview & Actions */}
      <div className="flex-1 bg-gray-900 flex flex-col p-4">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-4">
            <h3 className="font-semibold text-gray-300">Preview (1080x1920)</h3>
            <div className="flex items-center bg-gray-800 rounded overflow-hidden">
              <button 
                onClick={() => { (previewRef.current as any)?.playPreview?.(); }}
                className="px-3 py-1 hover:bg-gray-700 text-sm font-medium transition border-r border-gray-700 text-green-400"
              >
                Play
              </button>
              <button 
                onClick={() => { (previewRef.current as any)?.pausePreview?.(); }}
                className="px-3 py-1 hover:bg-gray-700 text-sm font-medium transition text-yellow-400"
              >
                Pause
              </button>
            </div>
          </div>
          <div className="space-x-2">
            <button onClick={() => store.clearProject()} className="bg-red-700 hover:bg-red-600 px-4 py-2 rounded transition text-white text-sm">Clear</button>
            <button onClick={async () => {
              try {
                const { saveProject } = await import('../utils/project');
                await saveProject();
                alert('Project saved successfully!');
              } catch (e) {
                alert('Failed to save project');
              }
            }} className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded transition text-white">Save</button>
            <button onClick={handleGenerate} disabled={loading} className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded transition font-medium text-white disabled:opacity-50">
              {loading ? 'Processing...' : 'Add to Queue'}
            </button>
          </div>
        </div>
        
        <div className="flex-1 flex justify-center items-center bg-black rounded-lg overflow-hidden border border-gray-700 p-4">
          <PreviewCanvas ref={previewRef} />
        </div>
      </div>
    </div>
  );
};
