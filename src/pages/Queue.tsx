import React from 'react';
import { useAppStore } from '../store';

export const Queue: React.FC = () => {
  const { renderQueue } = useAppStore();

  return (
    <div className="p-8">
      <h2 className="text-3xl font-bold mb-6">Render Queue</h2>
      
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
                </div>
                <div>
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
