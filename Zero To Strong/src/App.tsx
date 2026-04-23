import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'sonner';
import Index from './pages/Index';
import NotFound from './pages/NotFound';

export default function App() {
  return (
    <BrowserRouter>
      <Toaster
        theme="dark"
        toastOptions={{
          style: {
            background: 'hsl(0 0% 14%)',
            border: '2px solid hsl(0 0% 45%)',
            color: 'hsl(40 20% 90%)',
          },
        }}
      />
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
