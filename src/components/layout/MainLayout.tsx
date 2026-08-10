import React, { useEffect } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { Home, Settings, ListVideo, PlaySquare, Search, Menu } from 'lucide-react';
import { listen } from '@tauri-apps/api/event';
import { useAppStore } from '../../store';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Sheet, SheetContent, SheetTrigger } from '../ui/sheet';
import { ScrollArea } from '../ui/scroll-area';

export const MainLayout: React.FC = () => {
  const updateRenderJob = useAppStore(state => state.updateRenderJob);
  const location = useLocation();

  useEffect(() => {
    const unlisten = listen('render-status', (event: any) => {
      console.log('Render Status Update:', event.payload);
      updateRenderJob(event.payload);
    });

    return () => {
      unlisten.then(f => f());
    };
  }, [updateRenderJob]);

  const NavLinks = () => (
    <div className="w-full">
      <div className="pb-4">
        <h4 className="mb-1 rounded-md px-2 py-1 text-sm font-semibold">Overview</h4>
        <div className="grid grid-flow-row auto-rows-max text-sm">
          <Link to="/" className={`group flex w-full items-center gap-2 rounded-md border border-transparent px-2 py-2 hover:bg-muted ${location.pathname === '/' ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground'}`}>
            <Home size={16} /> Home
          </Link>
          <Link to="/editor" className={`group flex w-full items-center gap-2 rounded-md border border-transparent px-2 py-2 hover:bg-muted ${location.pathname === '/editor' ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground'}`}>
            <PlaySquare size={16} /> Editor
          </Link>
          <Link to="/queue" className={`group flex w-full items-center gap-2 rounded-md border border-transparent px-2 py-2 hover:bg-muted ${location.pathname === '/queue' ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground'}`}>
            <ListVideo size={16} /> Render Queue
          </Link>
          <Link to="/settings" className={`group flex w-full items-center gap-2 rounded-md border border-transparent px-2 py-2 hover:bg-muted ${location.pathname === '/settings' ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground'}`}>
            <Settings size={16} /> Settings
          </Link>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-14 items-center px-4">
          <div className="mr-4 hidden md:flex">
            <Link to="/" className="mr-6 flex items-center space-x-2">
              <span className="hidden font-bold sm:inline-block">Quran Render</span>
            </Link>
          </div>
          
          <Sheet>
            <SheetTrigger 
              render={<Button variant="ghost" className="mr-2 px-0 text-base hover:bg-transparent focus-visible:bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 md:hidden" />}
            >
              <Menu className="h-6 w-6" />
              <span className="sr-only">Toggle Menu</span>
            </SheetTrigger>
            <SheetContent side="left" className="pr-0">
              <Link to="/" className="flex items-center space-x-2">
                <span className="font-bold">Quran Render</span>
              </Link>
              <ScrollArea className="my-4 h-[calc(100vh-8rem)] pb-10 pl-6">
                <NavLinks />
              </ScrollArea>
            </SheetContent>
          </Sheet>

          <div className="flex flex-1 items-center justify-between space-x-2 md:justify-end">
            <div className="w-full flex-1 md:w-auto md:flex-none relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search..."
                className="h-9 w-full rounded-md border-input bg-muted/50 pl-9 md:w-[300px] lg:w-[300px]"
              />
            </div>
          </div>
        </div>
      </header>
      
      <div className="container mx-auto flex-1 items-start md:grid md:grid-cols-[220px_minmax(0,1fr)] md:gap-6 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-10 px-4">
        <aside className="fixed top-14 z-30 -ml-2 hidden h-[calc(100vh-3.5rem)] w-full shrink-0 overflow-y-auto border-r md:sticky md:block">
          <ScrollArea className="h-full py-6 pr-6 lg:py-8">
            <NavLinks />
          </ScrollArea>
        </aside>
        
        <main className="relative py-6 lg:gap-10 lg:py-8 w-full overflow-hidden">
          <div className="mx-auto w-full min-w-0">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};
