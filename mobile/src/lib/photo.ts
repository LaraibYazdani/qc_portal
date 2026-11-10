/**
 * Getting a photo to the API: shrink to what the engine uses (longest side 4000 px; it would
 * shrink it anyway), always as JPEG (iPhone library photos can be HEIC), then upload with progress.
 */
import { Platform } from 'react-native';
import { File, UploadType } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { ApiError, handleSessionEnd, messageOf, readyToken } from './api';
import { API_URL } from './config';
import { Sensitivity } from './types';

const MAX_SIDE = 4000;

export interface PreparedPhoto { uri: string; width: number; height: number }

export async function preparePhoto(uri: string, width?: number, height?: number): Promise<PreparedPhoto> {
  const ctx = ImageManipulator.manipulate(uri);
  if (width && height && Math.max(width, height) > MAX_SIDE) {
    ctx.resize(width >= height ? { width: MAX_SIDE } : { height: MAX_SIDE });
  }
  const image = await ctx.renderAsync();
  const out = await image.saveAsync({ compress: 0.9, format: SaveFormat.JPEG });
  return { uri: out.uri, width: out.width, height: out.height };
}

/** Sends the photo for checking; returns the new check's id. `onProgress` gets 0..1. */
export async function uploadForCheck(jobId: number, photoUri: string, sensitivity: Sensitivity,
                                     onProgress?: (fraction: number) => void): Promise<number> {
  const url = `${API_URL}/api/jobs/${jobId}/inspections`;
  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = await readyToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let status: number;
  let body: string;
  try {
    if (Platform.OS === 'web') {
      // Web preview only: no native upload task in the browser
      const blob = await (await fetch(photoUri)).blob();
      const form = new FormData();
      form.append('photo', new Blob([blob], { type: 'image/jpeg' }), 'photo.jpg');
      form.append('sensitivity', sensitivity);
      form.append('source', 'mobile');
      const res = await fetch(url, { method: 'POST', headers, body: form });
      status = res.status;
      body = await res.text();
      onProgress?.(1);
    } else {
      const task = new File(photoUri).createUploadTask(url, {
        httpMethod: 'POST',
        uploadType: UploadType.MULTIPART,
        fieldName: 'photo',
        mimeType: 'image/jpeg',
        parameters: { sensitivity, source: 'mobile' },
        headers,
        sessionType: 'foreground',
        onProgress: ({ bytesSent, totalBytes }) => {
          if (totalBytes > 0) onProgress?.(Math.min(1, bytesSent / totalBytes));
        },
      });
      const result = await task.uploadAsync();
      status = result.status;
      body = result.body;
    }
  } catch {
    throw new ApiError(0, "The photo couldn't be sent. Check the Wi-Fi or mobile data and try again.");
  }

  let data: any = {};
  try { data = JSON.parse(body); } catch { /* not JSON */ }
  if (status < 200 || status >= 300 || data?.success === false) {
    handleSessionEnd(status, data, token);
    throw new ApiError(status, messageOf(data, `The photo couldn't be checked (${status}).`), data);
  }
  return data.data.id as number;
}
