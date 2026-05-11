# GitHub CI/CD deployment

This repository has two GitHub Actions workflows:

- `CI`: runs on pull requests and pushes, installs dependencies, generates the Prisma client, builds TypeScript, and verifies both Docker images can build.
- `Deploy`: runs on pushes to `main` or `master`, or manually from GitHub Actions. It builds Docker images, pushes them to GitHub Container Registry, copies `docker-compose.prod.yml` to the server, and restarts the stack with `docker compose`.

## Server prerequisites

Install Docker Engine with the Docker Compose plugin on the target server. The deploy user must be able to run `docker compose`.

Create a directory for the app, for example:

```bash
sudo mkdir -p /opt/tasknova
sudo chown "$USER":"$USER" /opt/tasknova
```

## GitHub secrets

Add these secrets in GitHub: `Settings` -> `Secrets and variables` -> `Actions`.

Required:

- `DEPLOY_HOST`: server hostname or IP address.
- `DEPLOY_USER`: SSH user.
- `DEPLOY_SSH_KEY`: private SSH key for the deploy user.
- `DEPLOY_PATH`: server path, for example `/opt/tasknova`.
- `POSTGRES_PASSWORD`: production database password.
- `JWT_SECRET`: long random JWT secret.
- `JWT_REFRESH_SECRET`: long random refresh-token secret.
- `FRONTEND_URL`: public URL, for example `https://tasknova.example.com`.

Optional:

- `DEPLOY_PORT`: SSH port. Defaults to `22`.
- `POSTGRES_USER`: defaults to `tasknova`.
- `POSTGRES_DB`: defaults to `tasknova`.
- `FRONTEND_BIND`: frontend bind address. Defaults to `127.0.0.1`.
- `FRONTEND_PORT`: frontend host port for the local reverse proxy. Defaults to `8081`.
- `BACKEND_BIND`: backend bind address. Defaults to `127.0.0.1`.
- `BACKEND_PORT`: backend host port. Defaults to `3000`.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`.
- `GHCR_USERNAME`, `GHCR_TOKEN`: used by the deploy workflow to run `docker login ghcr.io` on the server when packages are private. The token needs package read access.

## Notes

On a shared server, terminate HTTPS in the existing host-level web server and proxy only `project-jre.com` to TaskNova. By default the frontend listens on `127.0.0.1:8081`, so configure the existing nginx, Apache, or Caddy virtual host to proxy `https://project-jre.com` to `http://127.0.0.1:8081`. Set `FRONTEND_URL` to the matching `https://...` URL so CORS, password reset links, and notification links use HTTPS.

Example nginx virtual host:

```nginx
server {
    listen 80;
    server_name project-jre.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name project-jre.com;

    ssl_certificate /path/to/fullchain.pem;
    ssl_certificate_key /path/to/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8081;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
}
```

Example Apache virtual host:

```apache
<VirtualHost *:80>
    ServerName project-jre.com
    Redirect permanent / https://project-jre.com/
</VirtualHost>

<VirtualHost *:443>
    ServerName project-jre.com

    SSLEngine on
    SSLCertificateFile /path/to/fullchain.pem
    SSLCertificateKeyFile /path/to/privkey.pem

    ProxyPreserveHost On
    RequestHeader set X-Forwarded-Proto "https"
    ProxyPass / http://127.0.0.1:8081/
    ProxyPassReverse / http://127.0.0.1:8081/
</VirtualHost>
```

The production compose file intentionally overrides the backend container command and does not use `--accept-data-loss`. This project currently has a Prisma schema but no checked-in migration history, so deploys run `prisma db push --skip-generate`. Before storing important production data, add Prisma migrations and switch the production command to `prisma migrate deploy`.

GitHub Container Registry packages may need to be visible to the repository or server. If the package is private, set `GHCR_USERNAME` and `GHCR_TOKEN` so the deploy workflow can log in before pulling images.
