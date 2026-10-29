import imageCompression from 'browser-image-compression';

export async function compressEvidencePhoto(imageFile: File): Promise<File> {
  const options = {
    maxSizeMB: 0.35, // ~300-350 KB
    maxWidthOrHeight: 1600, // 1600px max dimension
    useWebWorker: true,
    fileType: 'image/jpeg',
    initialQuality: 0.8,
  };

  try {
    const compressedBlob = await imageCompression(imageFile, options);
    // Return as File with original name or timestamped name
    return new File([compressedBlob], `photo_${Date.now()}.jpg`, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
  } catch (err) {
    console.warn('Image compression fallback to original file:', err);
    return imageFile;
  }
}

