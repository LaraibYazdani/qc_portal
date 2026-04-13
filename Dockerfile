FROM php:8.2-cli

# Install system dependencies and PHP extensions
RUN apt-get update && apt-get install -y \
    libpng-dev \
    libjpeg-dev \
    libcurl4-openssl-dev \
    libonig-dev \
    libxml2-dev \
    && docker-php-ext-configure gd --with-jpeg \
    && docker-php-ext-install pdo pdo_mysql gd curl mbstring fileinfo \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .

# Railway injects $PORT at runtime
CMD ["sh", "-c", "php -S 0.0.0.0:${PORT:-8080} -t public/"]
