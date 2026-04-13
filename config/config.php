<?php
return [
    'db' => [
        'host'    => getenv('DB_HOST') ?: '127.0.0.1',
        'port'    => getenv('DB_PORT') ?: '3306',
        'name'    => getenv('DB_NAME') ?: 'qc_portal',
        'user'    => getenv('DB_USER') ?: 'root',
        'pass'    => getenv('DB_PASS') ?: '',
        'charset' => 'utf8mb4',
        // Set to the path of an Aiven CA .pem file, OR paste the full certificate
        // contents as the DB_SSL_CA environment variable. Leave unset for local dev.
        'ssl_ca'  => getenv('DB_SSL_CA') ?: null,
    ],
    'app' => [
        // Empty string on Vercel (served at root).
        // Set to e.g. '/qc_portal/public' for local XAMPP installs.
        'base_url'       => rtrim(getenv('APP_BASE_URL') ?: '', '/'),
        'max_upload_mb'  => 20,
    ],
    'cloudinary' => [
        'cloud_name' => getenv('CLOUDINARY_CLOUD_NAME') ?: '',
        'api_key'    => getenv('CLOUDINARY_API_KEY')    ?: '',
        'api_secret' => getenv('CLOUDINARY_API_SECRET') ?: '',
        'folder'     => getenv('CLOUDINARY_FOLDER')     ?: 'qc_jobs',
    ],
];
