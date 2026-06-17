import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuth } from './store';
import Login from './pages/Login';
import Register from './pages/Register';
import DocumentList from './pages/DocumentList';
import DocumentEditor from './pages/DocumentEditor';
import PublicDocument from './pages/PublicDocument';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';

export default function App() {
  const init = useAuth((s) => s.init);

  useEffect(() => {
    init();
  }, [init]);

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/public/:id" element={<PublicDocument />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="/" element={<DocumentList />} />
          <Route path="/doc/:id" element={<DocumentEditor />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
