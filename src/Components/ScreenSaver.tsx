import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';

export { ScreenSaver };

type ImageListEntry = {
  name: string;
  url: string;
};

const INTERVAL: number = 8; // seconds

const BASE_URL = 'http://127.0.0.1:8000';

const ScreenSaver = ({ images, onClose }: { images?: string[]; onClose: () => void }) => {
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const slides = images ?? uploadedImages;

  const [currentIndex, setCurrentIndex] = useState(0);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    invoke<ImageListEntry[]>('list_images_command')
      .then((entries) => {
        if (cancelled) return;
        const urls = entries.map((e) => `${BASE_URL}${e.url}`);
        setUploadedImages(urls);
      })
      .catch(() => {
        if (cancelled) return;
        setUploadedImages([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

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