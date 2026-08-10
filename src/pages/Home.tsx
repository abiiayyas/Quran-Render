import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store';
import { Button } from '../components/ui/button';
import { Play, FolderOpen } from 'lucide-react';

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
    <div className="flex-1 flex flex-col items-center justify-center p-8 relative overflow-hidden min-h-[calc(100vh-10rem)]">
      {/* Decorative background blur */}
      <div className="absolute top-[10%] left-[10%] w-96 h-96 bg-primary/20 rounded-full mix-blend-multiply filter blur-[128px] opacity-50 animate-blob"></div>
      <div className="absolute bottom-[10%] right-[10%] w-96 h-96 bg-secondary/20 rounded-full mix-blend-multiply filter blur-[128px] opacity-50 animate-blob animation-delay-2000"></div>

      <div className="z-10 text-center max-w-2xl w-full">
        <h1 className="text-6xl font-extrabold tracking-tight mb-6 drop-shadow-sm text-foreground">
          Quran Render
        </h1>
        <p className="text-xl text-muted-foreground mb-12">
          Create beautiful, high-quality Murottal videos with ease. Generates scenes with synchronized Arabic, translation, and audio.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
          <Button 
            size="lg"
            onClick={handleNewProject}
            className="w-full sm:w-auto text-base h-14 px-8 shadow-lg shadow-primary/20"
          >
            <Play className="w-5 h-5 mr-2" />
            Start New Project
          </Button>

          <Button 
            variant="outline"
            size="lg"
            onClick={handleOpenProject}
            className="w-full sm:w-auto text-base h-14 px-8 shadow-sm"
          >
            <FolderOpen className="w-5 h-5 mr-2" />
            Open Existing Project
          </Button>
        </div>

        <div className="mt-16 pt-8 border-t border-border">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-6">Features</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-left">
            <div className="bg-card p-4 rounded-xl border border-border shadow-sm">
              <h4 className="text-primary font-semibold mb-2">Auto Sync</h4>
              <p className="text-sm text-muted-foreground">Word-by-word highlight synchronization with karaoke mode support.</p>
            </div>
            <div className="bg-card p-4 rounded-xl border border-border shadow-sm">
              <h4 className="text-primary font-semibold mb-2">Beautiful Layouts</h4>
              <p className="text-sm text-muted-foreground">Multiple templates including cinematic, clean, and minimal themes.</p>
            </div>
            <div className="bg-card p-4 rounded-xl border border-border shadow-sm">
              <h4 className="text-primary font-semibold mb-2">Batch Render</h4>
              <p className="text-sm text-muted-foreground">Queue up multiple videos and process them efficiently in the background.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
