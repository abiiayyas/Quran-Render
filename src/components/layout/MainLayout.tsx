import React, { useEffect } from 'react';
import { Link, Outlet } from 'react-router-dom';
import { Home, Settings, ListVideo, PlaySquare } from 'lucide-react';
import { listen } from '@tauri-apps/api/event';
import { useAppStore } from '../../store';

export const MainLayout: React.FC = () => {
  const updateRenderJob = useAppStore(state => state.updateRenderJob);

  useEffect(() => {
    const unlisten = listen('render-status', (event: any) => {
      console.log('Render Status Update:', event.payload);
      updateRenderJob(event.payload);
    });

    return () => {
      unlisten.then(f => f());
    };
  }, [updateRenderJob]);

  return (
    <div className="flex h-screen bg-gray-900 text-gray-100 font-sans">
      <aside className="w-64 bg-gray-800 border-r border-gray-700 flex flex-col">
        <div className="p-4 border-b border-gray-700">
          <h1 className="text-xl font-bold">Quran Render</h1>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          <Link to="/" className="flex items-center space-x-3 p-2 rounded hover:bg-gray-700 transition">
            <Home size={20} />
            <span>Home</span>
          </Link>
          <Link to="/editor" className="flex items-center space-x-3 p-2 rounded hover:bg-gray-700 transition">
            <PlaySquare size={20} />
            <span>Editor</span>
          </Link>
          <Link to="/queue" className="flex items-center space-x-3 p-2 rounded hover:bg-gray-700 transition">
            <ListVideo size={20} />
            <span>Render Queue</span>
          </Link>
          <Link to="/settings" className="flex items-center space-x-3 p-2 rounded hover:bg-gray-700 transition">
            <Settings size={20} />
            <span>Settings</span>
          </Link>
        </nav>
      </aside>
      
      <main className="flex-1 flex flex-col h-full overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
};
