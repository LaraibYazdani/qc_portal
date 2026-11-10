import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext.tsx';
import { HomeRedirect, ProtectedRoute } from './components/ProtectedRoute.tsx';
import { AppShell, PublicLayout } from './components/AppShell.tsx';
import { Login } from './pages/Login.tsx';
import { OperatorView } from './pages/OperatorView.tsx';
import { Upload } from './pages/Upload.tsx';
import { BulkUpload } from './pages/BulkUpload.tsx';
import { Admin } from './pages/Admin.tsx';
import { MyJobs } from './pages/MyJobs.tsx';
import { Users } from './pages/Users.tsx';

const UPLOADERS = ['sales', 'company_admin', 'admin'];
const MANAGERS = ['company_admin', 'admin'];

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />

          {/* Public lookup for shop-floor terminals */}
          <Route element={<PublicLayout />}>
            <Route path="/operator" element={<OperatorView />} />
          </Route>

          {/* Signed in */}
          <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
            <Route path="/operator-view" element={<OperatorView />} />
            <Route path="/upload" element={<ProtectedRoute roles={UPLOADERS}><Upload /></ProtectedRoute>} />
            <Route path="/bulk-upload" element={<ProtectedRoute roles={UPLOADERS}><BulkUpload /></ProtectedRoute>} />
            <Route path="/my-jobs" element={<ProtectedRoute roles={UPLOADERS}><MyJobs /></ProtectedRoute>} />
            <Route path="/admin" element={<ProtectedRoute roles={MANAGERS}><Admin /></ProtectedRoute>} />
            <Route path="/admin/users" element={<ProtectedRoute roles={MANAGERS}><Users /></ProtectedRoute>} />
          </Route>

          <Route path="/" element={<HomeRedirect />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
