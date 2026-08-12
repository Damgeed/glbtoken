FROM python:3.11-slim

WORKDIR /app

# Install cloudflared for CF Tunnel
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
  && curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 \
     -o /usr/local/bin/cloudflared \
  && chmod +x /usr/local/bin/cloudflared \
  && apt-get clean && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .

RUN chmod +x /app/entrypoint.sh

EXPOSE 8000

CMD ["/app/entrypoint.sh"]
