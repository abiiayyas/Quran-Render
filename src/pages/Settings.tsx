import React from 'react';
import { useAppStore } from '../store';

export const Settings: React.FC = () => {
  const { settings, updateSettings } = useAppStore();

  return (
    <div className="p-8 max-w-4xl">
      <h2 className="text-3xl font-bold mb-6">Settings</h2>
      
      <div className="space-y-6">
        {/* Output Directory */}
        <section className="bg-gray-800 p-6 rounded-lg border border-gray-700">
          <h3 className="text-xl font-semibold mb-4 text-gray-200">Export & Output</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Default Output Directory</label>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={settings.outputDir} 
                  onChange={(e) => updateSettings({ outputDir: e.target.value })}
                  className="flex-1 bg-gray-900 border border-gray-600 rounded px-4 py-2 text-white" 
                />
                <button className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded transition text-white">
                  Browse...
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-2">All rendered MP4 files will be saved here by default. (e.g. ~/Downloads)</p>
            </div>
          </div>
        </section>

        {/* Text Appearance */}
        <section className="bg-gray-800 p-6 rounded-lg border border-gray-700">
          <h3 className="text-xl font-semibold mb-4 text-gray-200">Text & Appearance</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Arabic Font</label>
              <select 
                value={settings.font}
                onChange={(e) => updateSettings({ font: e.target.value })}
                className="w-full bg-gray-900 border border-gray-600 rounded px-4 py-2 text-white"
              >
                <option value="Uthmanic">Uthmanic (Hafs)</option>
                <option value="LPMQ">LPMQ (Kemenag)</option>
                <option value="amiri">Amiri</option>
              </select>
            </div>
            
            <div className="pt-4 border-t border-gray-700">
              <label className="block text-sm text-gray-400 mb-1">App Theme</label>
              <div className="flex gap-4 mt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="theme" value="dark" checked={settings.theme === 'dark'} onChange={() => updateSettings({ theme: 'dark' })} />
                  <span>Dark</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer opacity-50">
                  <input type="radio" name="theme" value="light" disabled />
                  <span>Light (Coming Soon)</span>
                </label>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
