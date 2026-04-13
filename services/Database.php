<?php
class Database {
    private static ?PDO $pdo = null;

    public static function conn(): PDO {
        if (self::$pdo === null) {
            $config = require __DIR__ . '/../config/config.php';
            $db     = $config['db'];

            $dsn = sprintf(
                'mysql:host=%s;port=%s;dbname=%s;charset=%s',
                $db['host'], $db['port'], $db['name'], $db['charset']
            );

            $options = [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
            ];

            // Aiven (and other managed MySQL) require SSL.
            // DB_SSL_CA can be either:
            //   (a) A filesystem path to the CA .pem file, or
            //   (b) The raw certificate contents — we write these to a temp file.
            if (!empty($db['ssl_ca'])) {
                $caValue = $db['ssl_ca'];

                if (is_file($caValue)) {
                    $caPath = $caValue;
                } else {
                    // Certificate contents provided directly (e.g. via Vercel env var).
                    // Write to a temp file so PDO can reference it as a path.
                    $caPath = sys_get_temp_dir() . '/aiven_ca_' . md5($caValue) . '.pem';
                    if (!file_exists($caPath)) {
                        file_put_contents($caPath, $caValue);
                    }
                }

                $options[PDO::MYSQL_ATTR_SSL_CA]                = $caPath;
                $options[PDO::MYSQL_ATTR_SSL_VERIFY_SERVER_CERT] = true;
            }

            self::$pdo = new PDO($dsn, $db['user'], $db['pass'], $options);
        }

        return self::$pdo;
    }
}
