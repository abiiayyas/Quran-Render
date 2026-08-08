import React from 'react';
import { Link } from 'react-router-dom';

export const Home: React.FC = () => {
  return (
    <div className="p-8">
      <h2 className="text-3xl font-bold mb-6">Quran Render</h2>
      
      <div className="mb-8">
        <Link to="/editor" className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-6 rounded-lg shadow transition">
          + New Project
        </Link>
      </div>

      <div>
        <h3 className="text-xl font-semibold mb-4 border-b border-gray-700 pb-2">Recent Projects</h3>
        <div className="text-gray-400">
          No recent projects found.
        </div>
      </div>
    </div>
  );
};
