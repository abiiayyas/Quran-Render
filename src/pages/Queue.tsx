import React from 'react';
import { useAppStore } from '../store';
import { invoke } from '@tauri-apps/api/core';

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
        <h2 className="text-3xl font-bold">Render Queue</h2>
        {pendingJobs.length > 0 && (
          <button 
            onClick={() => pendingJobs.forEach(handleProcess)}
            className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded text-white font-medium transition"
          >
            Process All Pending
          </button>
        )}
      </div>
      
      <div className="bg-gray-800 rounded-lg shadow border border-gray-700 overflow-hidden">
        {renderQueue.length === 0 ? (
          <div className="p-6 text-center text-gray-400">
            The render queue is empty.
          </div>
        ) : (
          <ul className="divide-y divide-gray-700">
            {renderQueue.map((job, idx) => (
              <li key={idx} className="p-4 flex items-center justify-between">
                <div>
                  <h4 className="font-semibold">{job.title}</h4>
                  <p className="text-sm text-gray-400">Status: {job.status}</p>
                  {job.error && <p className="text-sm text-red-400 mt-1">{job.error}</p>}
                </div>
                <div>
                  {job.status === 'pending' && (
                    <button 
                      onClick={() => handleProcess(job)}
                      className="bg-green-600 hover:bg-green-700 px-4 py-1.5 rounded text-white text-sm font-medium transition"
                    >
                      Process
                    </button>
                  )}
                  {job.status === 'processing' && (
                    <div className="w-48 bg-gray-700 rounded-full h-2.5">
                      <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${job.progress}%` }}></div>
                    </div>
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
