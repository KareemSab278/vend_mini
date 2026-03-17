import { useState, useEffect, useRef } from 'react';
import importedImages from '../imageImporter';

export { ScreenSaver };

const ScreenSaver = ({ images = Object.values(importedImages), onClose }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const pollRef = useRef(null);

  useEffect(() => {
    if (!images.length) return;

    pollRef.current = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % images.length);
    }, 30000);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
      }
    };
  }, [images]);

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
        zIndex: 9999, // ensure the screensaver overlays everything
      }}
      onClick={handleScreenTap}
    >
      {images.length > 0 && (
        <img
          src={images[currentIndex]}
          alt={`Slide ${currentIndex + 1}`}
          style={{ height: '100%', width: 'auto', objectFit: 'contain' }}
        />
      )}
    </div>
  );
};