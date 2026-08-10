import React from 'react';
import { useAppStore } from '../store';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';

export const Settings: React.FC = () => {
  const { settings, updateSettings } = useAppStore();

  return (
    <div className="p-8 max-w-4xl">
      <h2 className="text-3xl font-bold mb-6 text-foreground">Settings</h2>
      
      <div className="space-y-6">
        {/* Output Directory */}
        <section className="bg-card p-6 rounded-lg border border-border shadow-sm">
          <h3 className="text-xl font-semibold mb-4 text-card-foreground">Export & Output</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-muted-foreground mb-1">Default Output Directory</label>
              <div className="flex gap-2">
                <Input 
                  type="text" 
                  value={settings.outputDir} 
                  onChange={(e) => updateSettings({ outputDir: e.target.value })}
                  className="flex-1" 
                />
                <Button variant="secondary">
                  Browse...
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">All rendered MP4 files will be saved here by default. (e.g. ~/Downloads)</p>
            </div>
          </div>
        </section>

        {/* Text Appearance */}
        <section className="bg-card p-6 rounded-lg border border-border shadow-sm">
          <h3 className="text-xl font-semibold mb-4 text-card-foreground">Text & Appearance</h3>
          <div className="space-y-4">
            <div className="border-border">
              <label className="block text-sm text-muted-foreground mb-1">App Theme</label>
              <div className="flex gap-4 mt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="theme" value="dark" checked={settings.theme === 'dark'} onChange={() => updateSettings({ theme: 'dark' })} />
                  <span className="text-foreground">Dark</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="theme" value="light" checked={settings.theme === 'light'} onChange={() => updateSettings({ theme: 'light' })} />
                  <span className="text-foreground">Light</span>
                </label>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
