import React from 'react';
import { useAppStore } from '../store';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '../components/ui/button';

const FakeProgress = ({ status }: { status: string }) => {
  const [progress, setProgress] = React.useState(0);
  
  React.useEffect(() => {
    if (status === 'processing') {
      setProgress(10); // Start at 10%
      const interval = setInterval(() => {
        setProgress(p => {
          if (p >= 95) return p;
          // Increment randomly between 2 and 8
          return p + (Math.random() * 6 + 2);
        });
      }, 2000);
      return () => clearInterval(interval);
    } else if (status === 'done') {
      setProgress(100);
    }
  }, [status]);

  return (
    <div className="flex items-center gap-3 mt-2">
      <div className="w-48 bg-muted rounded-full h-2.5 overflow-hidden">
        <div 
          className={`h-2.5 rounded-full transition-all duration-500 ${status === 'done' ? 'bg-primary' : 'bg-primary/80 relative'}`} 
          style={{ width: `${Math.min(progress, 100)}%` }}
        >
          {status === 'processing' && (
            <div className="absolute top-0 left-0 right-0 bottom-0 bg-white/20 animate-pulse"></div>
          )}
        </div>
      </div>
      <span className="text-xs text-muted-foreground font-medium w-10 text-right">
        {Math.round(Math.min(progress, 100))}%
      </span>
    </div>
  );
};

export const Queue: React.FC = () => {
  const { renderQueue, updateRenderJob } = useAppStore();

  const handleProcess = async (job: any) => {
    try {
      updateRenderJob({ job_id: job.id, status: 'processing', progress: 0, error: null, jobData: job.jobData });
      await invoke('enqueue_render', { job: job.jobData });
    } catch (e) {
      updateRenderJob({ job_id: job.id, status: 'failed', progress: 0, error: String(e), jobData: job.jobData });
      alert(`Failed to start render: ${e}`);
    }
  };

  const pendingJobs = renderQueue.filter(j => j.status === 'pending');

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-3xl font-bold text-foreground">Render Queue</h2>
        {pendingJobs.length > 0 && (
          <Button onClick={() => pendingJobs.forEach(handleProcess)}>
            Process All Pending
          </Button>
        )}
      </div>
      
      <div className="bg-card rounded-lg shadow-sm border border-border overflow-hidden">
        {renderQueue.length === 0 ? (
          <div className="p-6 text-center text-muted-foreground">
            The render queue is empty.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {renderQueue.map((job, idx) => (
              <li key={idx} className="p-4 flex items-center justify-between hover:bg-muted/50 transition">
                <div>
                  <h4 className="font-semibold text-card-foreground">{job.title}</h4>
                  <p className="text-sm text-muted-foreground">Status: {job.status}</p>
                  {job.error && <p className="text-sm text-destructive mt-1">{job.error}</p>}
                </div>
                <div>
                  {job.status === 'pending' && (
                    <Button variant="secondary" size="sm" onClick={() => handleProcess(job)}>
                      Process
                    </Button>
                  )}
                  {(job.status === 'processing' || job.status === 'done') && (
                    <FakeProgress status={job.status} />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
