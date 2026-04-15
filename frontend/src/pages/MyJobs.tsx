import React, { useState, useEffect } from 'react';
import { JobResponse } from '../types/Job';
import { useAuth } from '../contexts/AuthContext.tsx';

export const MyJobs: React.FC = () => {
  const { user, logout } = useAuth();
  const [jobs, setJobs] = useState<JobResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchMyJobs();
  }, []);

  const fetchMyJobs = async () => {
    try {
      const response = await fetch('/api/jobs/my-jobs', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      const data = await response.json();

      if (data.success) {
        setJobs(data.data);
      } else {
        setMessage({ type: 'error', text: 'Failed to fetch jobs' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Network error' });
    } finally {
      setLoading(false);
    }
  };

  const renderFilePreview = (job: JobResponse) => {
    const fileExtension = job.image_path.split('.').pop()?.toLowerCase();
    
    if (['jpg', 'jpeg', 'png'].includes(fileExtension || '')) {
      return (
        <img 
          src={job.image_path} 
          alt={job.design_name || job.job_number}
          className="w-20 h-20 object-cover rounded-lg shadow-md"
        />
      );
    }
    
    return (
      <div className="w-20 h-20 bg-gray-200 rounded-lg flex items-center justify-center shadow-md">
        <span className="text-sm text-gray-600 font-medium">PDF</span>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-blue-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-blue-50">
      <div className="max-w-6xl mx-auto p-6">
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-3xl font-bold text-blue-900 mb-2">My Jobs</h1>
              <p className="text-gray-600">Manage your uploaded designs</p>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">
                {user?.name} ({user?.role})
              </span>
              <button
                onClick={logout}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Logout
              </button>
            </div>
          </div>

          {message && (
            <div className={`p-4 rounded-lg mb-6 ${
              message.type === 'success' 
                ? 'bg-green-50 border border-green-200 text-green-800' 
                : 'bg-red-50 border border-red-200 text-red-800'
            }`}>
              {message.text}
            </div>
          )}

          <div className="mb-6">
            <a
              href="/upload"
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Upload New Design
            </a>
          </div>

          {jobs.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-gray-400 mb-4">
                <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No jobs uploaded yet</h3>
              <p className="text-gray-500 mb-4">Start by uploading your first design</p>
              <a
                href="/upload"
                className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Upload Your First Design
              </a>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {jobs.map((job) => (
                <div key={job.id} className="bg-white border border-gray-200 rounded-lg shadow-md hover:shadow-lg transition-shadow">
                  <div className="p-4">
                    <div className="flex justify-center mb-4">
                      {renderFilePreview(job)}
                    </div>
                    
                    <div className="space-y-2">
                      <div>
                        <span className="text-sm text-gray-500">Job Number</span>
                        <h3 className="font-semibold text-gray-900">{job.job_number}</h3>
                      </div>
                      
                      {job.po_number && (
                        <div>
                          <span className="text-sm text-gray-500">PO Number</span>
                          <p className="text-gray-700">{job.po_number}</p>
                        </div>
                      )}
                      
                      {job.design_name && (
                        <div>
                          <span className="text-sm text-gray-500">Design Name</span>
                          <p className="text-gray-700">{job.design_name}</p>
                        </div>
                      )}
                      
                      <div>
                        <span className="text-sm text-gray-500">Created</span>
                        <p className="text-gray-700">{new Date(job.created_at).toLocaleDateString()}</p>
                      </div>
                    </div>
                    
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <a
                        href={job.image_path}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block w-full text-center px-3 py-2 bg-blue-50 text-blue-700 rounded-md hover:bg-blue-100 transition-colors"
                      >
                        View Full Size
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4">Upload Guidelines</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600">
            <div>
              <h3 className="font-semibold text-gray-800 mb-2">File Requirements</h3>
              <ul className="list-disc list-inside space-y-1">
                <li>Formats: JPG, PNG, PDF</li>
                <li>Maximum size: 20MB</li>
                <li>Job numbers must be unique</li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-gray-800 mb-2">Best Practices</h3>
              <ul className="list-disc list-inside space-y-1">
                <li>Use clear, descriptive design names</li>
                <li>Include PO numbers when available</li>
                <li>Ensure high image quality</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
