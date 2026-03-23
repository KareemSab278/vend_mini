import { useState, useEffect, useRef, useMemo } from 'react';
import importedImages from '../imageImporter';

export { ScreenSaver };

const INTERVAL: number = 8; // seconds

const ScreenSaver = ({ images, onClose }: { images?: string[]; onClose: () => void }) => {
  const defaultImages = useMemo(() => Object.values(importedImages), []);
  const slides = images ?? defaultImages;

  const [currentIndex, setCurrentIndex] = useState(0);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    if (!slides.length) return;

    pollRef.current = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % slides.length);
    }, INTERVAL * 1000);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
      }
    };
  }, [slides]);

  const handleScreenTap = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        backgroundColor: 'black',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 9999, 
      }}
      onClick={handleScreenTap}
    >
      {slides.length > 0 && (
        <img
          src={slides[currentIndex]}
          alt={`Slide ${currentIndex + 1}`}
          style={{ height: '100%', width: 'auto', objectFit: 'contain' }}
        />
      )}
    </div>
  );
};