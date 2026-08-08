import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store';

export const Home: React.FC = () => {
  const navigate = useNavigate();
  const { clearProject } = useAppStore();

  const handleNewProject = () => {
    clearProject();
    navigate('/editor');
  };

  const handleOpenProject = async () => {
    try {
      const { loadProject } = await import('../utils/project');
      const loaded = await loadProject();
      if (loaded) {
        navigate('/editor');
      }
    } catch (e) {
      alert('Failed to load project: ' + e);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-gray-900 p-8 relative overflow-hidden">
      {/* Decorative background blur */}
      <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-blue-600 rounded-full mix-blend-multiply filter blur-[128px] opacity-20 animate-blob"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-purple-600 rounded-full mix-blend-multiply filter blur-[128px] opacity-20 animate-blob animation-delay-2000"></div>

      <div className="z-10 text-center max-w-2xl w-full">
        <h1 className="text-6xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500 mb-6 drop-shadow-sm">
          Quran Render
        </h1>
        <p className="text-xl text-gray-400 mb-12">
          Create beautiful, high-quality Murottal videos with ease. Generates scenes with synchronized Arabic, translation, and audio.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
          <button 
            onClick={handleNewProject}
            className="group relative inline-flex items-center justify-center px-8 py-4 font-bold text-white transition-all duration-200 bg-blue-600 border border-transparent rounded-xl hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-600 w-full sm:w-auto shadow-lg shadow-blue-600/30"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
            </svg>
            Start New Project
          </button>

          <button 
            onClick={handleOpenProject}
            className="group relative inline-flex items-center justify-center px-8 py-4 font-bold text-gray-200 transition-all duration-200 bg-gray-800 border border-gray-700 rounded-xl hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-600 w-full sm:w-auto shadow-lg hover:text-white"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z"></path>
            </svg>
            Open Existing Project
          </button>
        </div>

        <div className="mt-16 pt-8 border-t border-gray-800">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500 mb-6">Features</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-left">
            <div className="bg-gray-800/50 p-4 rounded-xl border border-gray-700/50 backdrop-blur-sm">
              <h4 className="text-blue-400 font-semibold mb-2">Auto Sync</h4>
              <p className="text-sm text-gray-400">Word-by-word highlight synchronization with karaoke mode support.</p>
            </div>
            <div className="bg-gray-800/50 p-4 rounded-xl border border-gray-700/50 backdrop-blur-sm">
              <h4 className="text-purple-400 font-semibold mb-2">Beautiful Layouts</h4>
              <p className="text-sm text-gray-400">Multiple templates including cinematic, clean, and minimal themes.</p>
            </div>
            <div className="bg-gray-800/50 p-4 rounded-xl border border-gray-700/50 backdrop-blur-sm">
              <h4 className="text-green-400 font-semibold mb-2">Batch Render</h4>
              <p className="text-sm text-gray-400">Queue up multiple videos and process them efficiently in the background.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
