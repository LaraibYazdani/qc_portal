import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

export interface FileCompressionResult {
  success: boolean;
  filePath?: string;
  originalSize?: number;
  compressedSize?: number;
  error?: string;
}

/**
 * Compresses and saves an uploaded image file
 * @param file - Uploaded file buffer
 * @param filename - Original filename
 * @returns Promise<FileCompressionResult>
 */
export const compressAndSaveImage = async (
  file: Buffer,
  filename: string
): Promise<FileCompressionResult> => {
  try {
    // Create uploads directory if it doesn't exist
    const uploadsDir = path.join(process.cwd(), '..', 'uploads', 'jobs');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    // Generate unique filename
    const fileExtension = path.extname(filename).toLowerCase();
    const baseName = path.basename(filename, fileExtension);
    const timestamp = Date.now();
    const compressedFilename = `${baseName}_${timestamp}${fileExtension}`;
    const filePath = path.join(uploadsDir, compressedFilename);

    // Get original size
    const originalSize = file.length;

    // Compress image based on type
    let compressedBuffer: Buffer;

    if (['.jpg', '.jpeg'].includes(fileExtension)) {
      compressedBuffer = await sharp(file)
        .jpeg({ quality: 85, progressive: true })
        .toBuffer();
    } else if (fileExtension === '.png') {
      compressedBuffer = await sharp(file)
        .png({ compressionLevel: 8, progressive: true })
        .toBuffer();
    } else if (fileExtension === '.webp') {
      compressedBuffer = await sharp(file)
        .webp({ quality: 85 })
        .toBuffer();
    } else {
      // For non-image files (PDFs), save as-is
      compressedBuffer = file;
    }

    // Save compressed file
    fs.writeFileSync(filePath, compressedBuffer);

    const compressedSize = compressedBuffer.length;
    const compressionRatio = ((originalSize - compressedSize) / originalSize * 100).toFixed(2);

    console.log(`File compressed: ${filename}`);
    console.log(`Original size: ${(originalSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Compressed size: ${(compressedSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Compression: ${compressionRatio}%`);

    return {
      success: true,
      filePath: path.join('uploads', 'jobs', compressedFilename),
      originalSize,
      compressedSize
    };
  } catch (error) {
    console.error('Error compressing file:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

/**
 * Validates file type and size
 * @param file - Uploaded file
 * @returns boolean
 */
export const validateFile = (file: Express.Multer.File): boolean => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
  const maxSize = 20 * 1024 * 1024; // 20MB

  return allowedTypes.includes(file.mimetype) && file.size <= maxSize;
};

/**
 * Generates a unique filename to avoid conflicts
 * @param originalName - Original filename
 * @returns string
 */
export const generateUniqueFilename = (originalName: string): string => {
  const fileExtension = path.extname(originalName);
  const baseName = path.basename(originalName, fileExtension);
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  
  return `${baseName}_${timestamp}_${randomSuffix}${fileExtension}`;
};
