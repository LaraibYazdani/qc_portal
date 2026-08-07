import React, { useMemo, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { useAuth } from '../contexts/AuthContext.tsx';

const CHUNK_SIZE = 20;

interface ParsedFile {
  file: File;
  jobNumber: string | null;
  designName: string | null;
  valid: boolean;
  error?: string;
}

interface FileResult {
  filename: string;
  job_number: string | null;
  design_name: string | null;
  status: 'created' | 'updated' | 'failed';
  message: string;
}

function parseFilename(file: File): ParsedFile {
  const dotIndex = file.name.lastIndexOf('.');
  const nameWithoutExt = dotIndex > 0 ? file.name.slice(0, dotIndex) : file.name;
  const separatorIndex = nameWithoutExt.indexOf('_');

  if (separatorIndex <= 0) {
    return {
      file,
      jobNumber: null,
      designName: null,
      valid: false,
      error: 'Does not match JOBNUMBER_DESIGNNAME.ext'
    };
  }

  return {
    file,
    jobNumber: nameWithoutExt.slice(0, separatorIndex).toUpperCase(),
    designName: nameWithoutExt.slice(separatorIndex + 1),
    valid: true
  };
}

export const BulkUpload: React.FC = () => {
  const { user } = useAuth();
  const [parsedFiles, setParsedFiles] = useState<ParsedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [results, setResults] = useState<FileResult[] | null>(null);

  const onDrop = (acceptedFiles: File[]) => {
    setResults(null);
    setParsedFiles(acceptedFiles.map(parseFilename));
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'application/pdf': ['.pdf']
    },
    maxSize: 20 * 1024 * 1024
  });

  const validFiles = useMemo(() => parsedFiles.filter(p => p.valid), [parsedFiles]);
  const invalidFiles = useMemo(() => parsedFiles.filter(p => !p.valid), [parsedFiles]);

  const handleUpload = async () => {
    if (validFiles.length === 0) return;
    setUploading(true);
    setResults(null);

    const chunks: ParsedFile[][] = [];
    for (let i = 0; i < validFiles.length; i += CHUNK_SIZE) {
      chunks.push(validFiles.slice(i, i + CHUNK_SIZE));
    }
    setProgress({ done: 0, total: chunks.length });

    const allResults: FileResult[] = invalidFiles.map(p => ({
      filename: p.file.name,
      job_number: null,
      design_name: null,
      status: 'failed',
      message: p.error || 'Invalid filename'
    }));

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const formData = new FormData();
      chunk.forEach(p => formData.append('designs', p.file));

      try {
        const response = await fetch('/api/jobs/bulk', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
          body: formData
        });
        const data = await response.json();

        if (data.success && Array.isArray(data.results)) {
          allResults.push(...data.results);
        } else {
          chunk.forEach(p => allResults.push({
            filename: p.file.name,
            job_number: p.jobNumber,
            design_name: p.designName,
            status: 'failed',
            message: data.message || 'Batch request failed'
          }));
        }
      } catch {
        chunk.forEach(p => allResults.push({
          filename: p.file.name,
          job_number: p.jobNumber,
          design_name: p.designName,
          status: 'failed',
          message: 'Network error'
        }));
      }

      setProgress({ done: i + 1, total: chunks.length });
    }

    setResults(allResults);
    setParsedFiles([]);
    setUploading(false);
  };

  const statusStyle = (status: FileResult['status']) => {
    switch (status) {
      case 'created': return 'text-green-700 bg-green-50';
      case 'updated': return 'text-blue-700 bg-blue-50';
      default: return 'text-red-700 bg-red-50';
    }
  };

  return (
    <div className="min-h-screen bg-blue-50">
      <div className="max-w-5xl mx-auto p-6">
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold text-blue-900">Bulk Upload Designs</h1>
            <div className="text-sm text-gray-600">
              Logged in as: <span className="font-semibold">{user?.name}</span> ({user?.role})
            </div>
          </div>

          {/* Naming convention shown up front, before any files are selected */}
          <div className="mb-6 p-4 rounded-lg bg-yellow-50 border border-yellow-200 text-yellow-900">
            <p className="font-bold mb-1">File naming requirement</p>
            <p className="text-sm mb-2">
              Every file must be named <span className="font-mono font-semibold">JOBNUMBER_DESIGNNAME.ext</span> —
              everything before the first underscore becomes the Job Number, everything after it becomes the Design Name.
            </p>
            <p className="text-sm">
              Example: <span className="font-mono">267N2943_GMSAHOTMELTGLU_C[18].jpg</span> → Job Number{' '}
              <span className="font-semibold">267N2943</span>, Design Name{' '}
              <span className="font-semibold">GMSAHOTMELTGLU_C[18]</span>
            </p>
            <p className="text-sm mt-2">
              Files that don't follow this convention, or whose job number already exists, will be rejected —
              you'll see exactly which files failed and why after uploading.
            </p>
          </div>

          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors mb-6 ${
              isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
            }`}
          >
            <input {...getInputProps()} />
            <p className="text-lg text-gray-600">
              {isDragActive ? 'Drop the files here...' : 'Drag & drop design files here, or click to select (up to ~100 at once)'}
            </p>
            <p className="text-sm text-gray-500 mt-2">Supported formats: JPG, PNG, PDF (max 20MB each)</p>
          </div>

          {parsedFiles.length > 0 && (
            <div className="mb-6">
              <h2 className="text-lg font-bold text-gray-800 mb-2">
                {parsedFiles.length} file(s) selected — {validFiles.length} valid, {invalidFiles.length} will be rejected
              </h2>
              <div className="max-h-80 overflow-y-auto border border-gray-200 rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100 sticky top-0">
                    <tr>
                      <th className="text-left p-2">Filename</th>
                      <th className="text-left p-2">Job Number</th>
                      <th className="text-left p-2">Design Name</th>
                      <th className="text-left p-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedFiles.map((p, idx) => (
                      <tr key={idx} className="border-t border-gray-100">
                        <td className="p-2 font-mono">{p.file.name}</td>
                        <td className="p-2">{p.jobNumber ?? '—'}</td>
                        <td className="p-2">{p.designName ?? '—'}</td>
                        <td className="p-2">
                          {p.valid ? (
                            <span className="text-green-700">Ready</span>
                          ) : (
                            <span className="text-red-700">{p.error}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <button
            onClick={handleUpload}
            disabled={uploading || validFiles.length === 0}
            className="w-full bg-blue-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
          >
            {uploading
              ? `Uploading batch ${progress?.done ?? 0} of ${progress?.total ?? 0}...`
              : `Upload ${validFiles.length} Design(s)`}
          </button>
        </div>

        {results && (
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Results</h2>
            <div className="max-h-96 overflow-y-auto border border-gray-200 rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-gray-100 sticky top-0">
                  <tr>
                    <th className="text-left p-2">Filename</th>
                    <th className="text-left p-2">Job Number</th>
                    <th className="text-left p-2">Status</th>
                    <th className="text-left p-2">Message</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, idx) => (
                    <tr key={idx} className="border-t border-gray-100">
                      <td className="p-2 font-mono">{r.filename}</td>
                      <td className="p-2">{r.job_number ?? '—'}</td>
                      <td className="p-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${statusStyle(r.status)}`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="p-2">{r.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
