import React, { useState } from 'react';
import { JobResponse } from '../types/Job';

export const OperatorView: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState({ job_number: '', po_number: '' });
  const [results, setResults] = useState<JobResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (searchTerm.job_number) params.append('job_number', searchTerm.job_number);
      if (searchTerm.po_number) params.append('po_number', searchTerm.po_number);

      const response = await fetch(`/api/jobs/search?${params}`);
      const data = await response.json();

      if (data.success) {
        setResults(data.data);
        if (data.data.length === 0) {
          setError('No design found for this job');
        }
      } else {
        setError('Search failed');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  const renderFileViewer = (job: JobResponse) => {
    const fileExtension = job.image_path.split('.').pop()?.toLowerCase();
    
    if (['jpg', 'jpeg', 'png'].includes(fileExtension || '')) {
      return (
        <img 
          src={job.image_path} 
          alt="Design" 
          className="max-w-full h-auto"
        />
      );
    } else if (fileExtension === 'pdf') {
      return (
        <object
          data={job.image_path}
          type="application/pdf"
          width="100%"
          height="700px"
          className="border rounded"
        >
          <p className="text-center py-4">
            PDF cannot be displayed. 
            <a href={job.image_path} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline ml-2">
              Download
            </a>
          </p>
        </object>
      );
    }
    
    return <p className="text-center py-4 text-gray-500">Unsupported file type.</p>;
  };

  return (
    <div className="min-h-screen bg-blue-50">
      <div className="max-w-6xl mx-auto p-6">
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h1 className="text-3xl font-bold text-blue-900 mb-2">
            <span className="font-black">Packages QC Assistant</span> - Operator Design Lookup
          </h1>
          <p className="text-gray-600">Search and verify carton designs by job or PO number</p>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <form onSubmit={handleSearch} className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-64">
              <input
                type="text"
                placeholder="Job Number"
                value={searchTerm.job_number}
                onChange={(e) => setSearchTerm({ ...searchTerm, job_number: e.target.value.toUpperCase() })}
                className="w-full px-4 py-3 text-lg border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div className="flex-1 min-w-64">
              <input
                type="text"
                placeholder="PO Number"
                value={searchTerm.po_number}
                onChange={(e) => setSearchTerm({ ...searchTerm, po_number: e.target.value })}
                className="w-full px-4 py-3 text-lg border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="px-8 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
            >
              {loading ? 'Searching...' : 'Search'}
            </button>
          </form>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        {results.map((job) => (
          <div key={job.id} className="bg-white rounded-lg shadow-lg p-6 mb-6">
            <div className="mb-4">
              <div className="text-lg mb-2">
                <span className="text-gray-600">Job Number:</span>{' '}
                <span className="font-bold text-xl">{job.job_number}</span>
              </div>
              {job.po_number && (
                <div className="text-lg mb-2">
                  <span className="text-gray-600">PO Number:</span> {job.po_number}
                </div>
              )}
              {job.design_name && (
                <div className="text-lg mb-2">
                  <span className="text-gray-600">Design Name:</span> {job.design_name}
                </div>
              )}
              {job.uploaded_by_name && (
                <div className="text-sm text-gray-500">
                  Uploaded by: {job.uploaded_by_name} on {new Date(job.created_at).toLocaleDateString()}
                </div>
              )}
            </div>
            
            <div className="bg-gray-50 rounded-lg p-4 overflow-auto max-h-screen">
              {renderFileViewer(job)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
