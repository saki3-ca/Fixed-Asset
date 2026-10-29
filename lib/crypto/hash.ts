// Computes SHA-256 hash string for an ArrayBuffer or Blob
export async function computeSHA256(data: Blob | ArrayBuffer): Promise<string> {
  try {
    let buffer: ArrayBuffer;
    if (data instanceof Blob) {
      buffer = await data.arrayBuffer();
    } else {
      buffer = data;
    }

    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
  } catch (err) {
    console.error('SHA-256 computation failed:', err);
    return '';
  }
}

