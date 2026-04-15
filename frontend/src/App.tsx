import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext.tsx';
import { ProtectedRoute } from './components/ProtectedRoute.tsx';
import { Navbar } from './components/Navbar.tsx';
import { Login } from './pages/Login.tsx';
import { OperatorView } from './pages/OperatorView.tsx';
import { Upload } from './pages/Upload.tsx';
import { Admin } from './pages/Admin.tsx';
import { MyJobs } from './pages/MyJobs.tsx';
import './App.css';

function App() {
  return (
    <AuthProvider>
      <Router>
        <Navbar />
        <div className="App">
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/operator" element={<OperatorView />} />

            {/* Protected routes */}
            <Route path="/upload" element={
              <ProtectedRoute roles={['sales', 'admin']}>
                <Upload />
              </ProtectedRoute>
            } />

            <Route path="/admin" element={
              <ProtectedRoute roles={['admin']}>
                <Admin />
              </ProtectedRoute>
            } />

            <Route path="/my-jobs" element={
              <ProtectedRoute roles={['sales', 'admin']}>
                <MyJobs />
              </ProtectedRoute>
            } />

            <Route path="/operator-view" element={
              <ProtectedRoute roles={['operator']}>
                <OperatorView />
              </ProtectedRoute>
            } />

            {/* Default redirect */}
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
