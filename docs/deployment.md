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
- `FRONTEND_PORT`: host port for nginx. Defaults to `80`.
- `BACKEND_BIND`: backend bind address. Defaults to `127.0.0.1`.
- `BACKEND_PORT`: backend host port. Defaults to `3000`.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`.
- `GHCR_USERNAME`, `GHCR_TOKEN`: used by the deploy workflow to run `docker login ghcr.io` on the server when packages are private. The token needs package read access.

## Notes

The production compose file intentionally overrides the backend container command and does not use `--accept-data-loss`. This project currently has a Prisma schema but no checked-in migration history, so deploys run `prisma db push --skip-generate`. Before storing important production data, add Prisma migrations and switch the production command to `prisma migrate deploy`.

GitHub Container Registry packages may need to be visible to the repository or server. If the package is private, set `GHCR_USERNAME` and `GHCR_TOKEN` so the deploy workflow can log in before pulling images.
