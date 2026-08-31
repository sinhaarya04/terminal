import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Desk from './pages/Desk';

// Standalone E[X] Terminal — the full-screen demo desk is the whole app.
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/terminal" element={<Desk />} />
        <Route path="*" element={<Navigate to="/terminal" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
