import React, { useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { useAuth } from '../contexts/AuthContext.tsx';

export const Upload: React.FC = () => {
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    job_number: '',
    po_number: '',
    design_name: ''
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const onDrop = (acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setSelectedFile(acceptedFiles[0]);
      setMessage(null);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'application/pdf': ['.pdf']
    },
    maxFiles: 1,
    maxSize: 20 * 1024 * 1024 // 20MB
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedFile) {
      setMessage({ type: 'error', text: 'Please select a design file' });
      return;
    }

    if (!formData.job_number.trim()) {
      setMessage({ type: 'error', text: 'Job number is required' });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const formDataToSend = new FormData();
      formDataToSend.append('job_number', formData.job_number.toUpperCase());
      formDataToSend.append('po_number', formData.po_number);
      formDataToSend.append('design_name', formData.design_name);
      formDataToSend.append('design', selectedFile);

      const response = await fetch('/api/jobs', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: formDataToSend
      });

      const data = await response.json();

      if (data.success) {
        setMessage({ type: 'success', text: 'Design uploaded successfully!' });
        setFormData({ job_number: '', po_number: '', design_name: '' });
        setSelectedFile(null);
      } else {
        setMessage({ type: 'error', text: data.message || 'Upload failed' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Network error. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-blue-50">
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold text-blue-900">Upload Design</h1>
            <div className="text-sm text-gray-600">
              Logged in as: <span className="font-semibold">{user?.name}</span> ({user?.role})
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

          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div>
                <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="job_number">
                  Job Number *
                </label>
                <input
                  id="job_number"
                  type="text"
                  value={formData.job_number}
                  onChange={(e) => setFormData({ ...formData, job_number: e.target.value.toUpperCase() })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter job number"
                  required
                />
              </div>

              <div>
                <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="po_number">
                  PO Number
                </label>
                <input
                  id="po_number"
                  type="text"
                  value={formData.po_number}
                  onChange={(e) => setFormData({ ...formData, po_number: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter PO number (optional)"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="design_name">
                  Design Name
                </label>
                <input
                  id="design_name"
                  type="text"
                  value={formData.design_name}
                  onChange={(e) => setFormData({ ...formData, design_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter design description (optional)"
                />
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-gray-700 text-sm font-bold mb-2">
                Design File *
              </label>
              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                  isDragActive
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-300 hover:border-gray-400'
                }`}
              >
                <input {...getInputProps()} />
                {selectedFile ? (
                  <div>
                    <p className="text-lg font-semibold text-green-600">{selectedFile.name}</p>
                    <p className="text-sm text-gray-500">
                      {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="text-lg text-gray-600">
                      {isDragActive
                        ? 'Drop the file here...'
                        : 'Drag & drop a design file here, or click to select'}
                    </p>
                    <p className="text-sm text-gray-500 mt-2">
                      Supported formats: JPG, PNG, PDF (max 20MB)
                    </p>
                  </div>
                )}
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
            >
              {loading ? 'Uploading...' : 'Upload Design'}
            </button>
          </form>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4">Upload Guidelines</h2>
          <ul className="list-disc list-inside space-y-2 text-gray-600">
            <li>Job number must be unique</li>
            <li>File formats accepted: JPG, JPEG, PNG, PDF</li>
            <li>Maximum file size: 20MB</li>
            <li>Design files will be automatically optimized</li>
            <li>You can only view and manage your own uploads</li>
          </ul>
        </div>
      </div>
    </div>
  );
};
