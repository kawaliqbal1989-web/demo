# Run staging locally (instructions)

Prerequisites:
- Docker & Docker Compose installed
- Ports 4001 (backend), 3307 (db) free on host

Start staging locally:

```powershell
# from repository root
docker compose -f docker-compose.staging.yml up --build -d

# follow logs (backend)
docker logs -f abacus_backend_staging
```

Notes:
- Backend listens on host port `4001` (mapped to container `4000`).
- Database is exposed on host port `3307` for debugging; the container DB hostname for services in compose is `db`.
- Use `./.env.staging` to provide secrets; the compose file already wires a default DB credential and environment.

Stopping and cleanup:

```powershell
docker compose -f docker-compose.staging.yml down -v
```
