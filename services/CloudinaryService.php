<?php
class CloudinaryService {

    /**
     * Upload a file to Cloudinary.
     * Images (JPEG/PNG) are compressed/resized before upload to minimise storage on the free plan.
     * PDFs are uploaded as raw resources.
     *
     * @return string The Cloudinary secure_url for the stored asset.
     */
    public static function upload(string $tmpPath, string $jobNumber, string $mime, string $ext): string {
        $cfg    = require __DIR__ . '/../config/config.php';
        $cloud  = $cfg['cloudinary'];

        $isImage      = in_array($mime, ['image/jpeg', 'image/png'], true);
        $resourceType = $isImage ? 'image' : 'raw';

        // Compress/resize images before upload to save Cloudinary storage
        $uploadPath   = $tmpPath;
        $didCompress  = false;
        if ($isImage) {
            $compressed = self::compressImage($tmpPath, $mime, $ext);
            if ($compressed !== $tmpPath) {
                $uploadPath  = $compressed;
                $didCompress = true;
            }
        }

        // public_id: images omit extension (Cloudinary manages format delivery);
        //            raw resources (PDF) include extension so the URL is correct.
        $publicId = $isImage ? $jobNumber : ($jobNumber . '.' . $ext);

        $timestamp = time();

        // Signature: alphabetically sorted param=value pairs joined by &, then append api_secret
        $sigParams = [
            'folder'     => $cloud['folder'],
            'overwrite'  => 'true',
            'public_id'  => $publicId,
            'timestamp'  => (string)$timestamp,
        ];
        ksort($sigParams);
        $sigStr    = implode('&', array_map(fn($k, $v) => "$k=$v", array_keys($sigParams), array_values($sigParams)));
        $signature = sha1($sigStr . $cloud['api_secret']);

        $postFields = [
            'file'      => new CURLFile($uploadPath, $mime),
            'api_key'   => $cloud['api_key'],
            'timestamp' => (string)$timestamp,
            'folder'    => $cloud['folder'],
            'public_id' => $publicId,
            'overwrite' => 'true',
            'signature' => $signature,
        ];

        $url = sprintf(
            'https://api.cloudinary.com/v1_1/%s/%s/upload',
            $cloud['cloud_name'],
            $resourceType
        );

        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $postFields);
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($didCompress) {
            @unlink($uploadPath);
        }

        if ($httpCode !== 200) {
            throw new RuntimeException('Cloudinary upload failed (HTTP ' . $httpCode . '): ' . $response);
        }

        $data = json_decode($response, true);
        if (empty($data['secure_url'])) {
            throw new RuntimeException('Cloudinary response missing secure_url: ' . $response);
        }

        return $data['secure_url'];
    }

    /**
     * Delete a Cloudinary asset by its stored secure_url.
     * Silently ignores unrecognised URLs.
     */
    public static function deleteByUrl(string $secureUrl): void {
        if ($secureUrl === '') return;

        $cfg   = require __DIR__ . '/../config/config.php';
        $cloud = $cfg['cloudinary'];

        // Extract resource type and public_id from URL
        // e.g. https://res.cloudinary.com/{cloud}/image/upload/v123/qc_jobs/JOB.png
        //      https://res.cloudinary.com/{cloud}/raw/upload/v123/qc_jobs/JOB.pdf
        if (!preg_match('#/(image|raw)/upload/(?:v\d+/)?(.+)$#', $secureUrl, $m)) {
            return;
        }

        $resourceType = $m[1];
        // Images: public_id has NO extension in Cloudinary's index (strip it from URL path)
        // Raw:    public_id INCLUDES the extension
        $publicId = $resourceType === 'image'
            ? preg_replace('/\.[^.\/]+$/', '', $m[2])
            : $m[2];

        $timestamp = time();
        $signature = sha1("public_id={$publicId}&timestamp={$timestamp}" . $cloud['api_secret']);

        $url = sprintf(
            'https://api.cloudinary.com/v1_1/%s/%s/destroy',
            $cloud['cloud_name'],
            $resourceType
        );

        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, [
            'public_id' => $publicId,
            'api_key'   => $cloud['api_key'],
            'timestamp' => (string)$timestamp,
            'signature' => $signature,
        ]);
        curl_exec($ch);
        curl_close($ch);
    }

    /**
     * Compress and optionally resize an image using PHP GD.
     * - JPEG: always re-encoded at 82% quality
     * - PNG:  only reprocessed when dimensions exceed 1920px (then saved at max compression)
     * - Oversized images (either dimension > 1920px) are scaled down proportionally.
     *
     * Returns the path to the compressed file, or the original path if GD is unavailable
     * or the image did not need processing.
     */
    private static function compressImage(string $tmpPath, string $mime, string $ext): string {
        if (!extension_loaded('gd')) {
            return $tmpPath;
        }

        $maxDim      = 1920;
        $jpegQuality = 82;

        $img = match ($mime) {
            'image/jpeg' => @imagecreatefromjpeg($tmpPath),
            'image/png'  => @imagecreatefrompng($tmpPath),
            default      => false,
        };

        if (!$img) return $tmpPath;

        $w = imagesx($img);
        $h = imagesy($img);

        $needsResize = ($w > $maxDim || $h > $maxDim);
        $isJpeg      = $mime === 'image/jpeg';

        // PNGs that fit within limits don't benefit enough from re-encoding to justify it
        if (!$needsResize && !$isJpeg) {
            imagedestroy($img);
            return $tmpPath;
        }

        if ($needsResize) {
            $ratio  = max($w, $h) / $maxDim;
            $nw     = (int)round($w / $ratio);
            $nh     = (int)round($h / $ratio);
            $canvas = imagecreatetruecolor($nw, $nh);
            if ($mime === 'image/png') {
                imagealphablending($canvas, false);
                imagesavealpha($canvas, true);
            }
            imagecopyresampled($canvas, $img, 0, 0, 0, 0, $nw, $nh, $w, $h);
            imagedestroy($img);
            $img = $canvas;
        }

        $outExt  = $isJpeg ? 'jpg' : 'png';
        $outPath = sys_get_temp_dir() . '/qc_compressed_' . uniqid() . '.' . $outExt;

        if ($isJpeg) {
            imagejpeg($img, $outPath, $jpegQuality);
        } else {
            imagepng($img, $outPath, 8); // 0–9; 8 = high compression
        }
        imagedestroy($img);

        return $outPath;
    }
}
