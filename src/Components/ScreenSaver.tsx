import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';

export { ScreenSaver };

type ImageListEntry = {
  name: string;
};

const INTERVAL: number = 5; // seconds

const imageContentType = (name: string) => {
  const extension = name.split('.').pop()?.toLowerCase();
  switch (extension) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    default:
      return 'application/octet-stream';
  }
};

const ScreenSaver = ({ images, onClose }: { images?: string[]; onClose: () => void }) => {
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const slides = images ?? uploadedImages;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    invoke<ImageListEntry[]>('list_images_command')
      .then((entries) => {
        if (cancelled) return;
        setUploadedImages(entries.map((entry) => entry.name));
      })
      .catch((error) => {
        if (cancelled) return;
        console.error('Failed to list screensaver images:', error);
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

  useEffect(() => {
    if (images) {
      setCurrentImageUrl(images[currentIndex] ?? null);
      return;
    }

    const imageName = uploadedImages[currentIndex];
    if (!imageName) {
      setCurrentImageUrl(null);
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;
    setCurrentImageUrl(null);

    invoke<Uint8Array>('get_image_command', { name: imageName })
      .then((bytes) => {
        if (cancelled) return;
        const buffer = new ArrayBuffer(bytes.byteLength);
        new Uint8Array(buffer).set(bytes);
        objectUrl = URL.createObjectURL(
          new Blob([buffer], { type: imageContentType(imageName) }),
        );
        setCurrentImageUrl(objectUrl);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error(`Failed to load screensaver image "${imageName}":`, error);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [currentIndex, images, uploadedImages]);

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
      {currentImageUrl && (
        <img
          src={currentImageUrl}
          alt={`Slide ${currentIndex + 1}`}
          style={{ height: '100%', width: 'auto', objectFit: 'contain' }}
        />
      )}
    </div>
  );
};