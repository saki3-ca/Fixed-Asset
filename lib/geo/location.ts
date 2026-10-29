export interface GeoCoordinates {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
}

export async function getCurrentGPSLocation(): Promise<GeoCoordinates> {
  if (typeof window === 'undefined' || !navigator.geolocation) {
    return { latitude: null, longitude: null, accuracy: null };
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
      },
      (error) => {
        console.warn('GPS location unavailable or denied:', error.message);
        resolve({ latitude: null, longitude: null, accuracy: null });
      },
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 30000,
      }
    );
  });
}

