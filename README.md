# GlbTOKEN — Global Token for Premium AI Models

**One balance. 340+ AI models. Pay-as-you-go.**

## Architecture

```
├── index.html         # Frontend SPA (GitHub Pages)
├── backend/
│   ├── main.py        # FastAPI server
│   ├── database.py    # SQLAlchemy models (SQLite)
│   ├── auth.py        # JWT + OAuth (Google, GitHub)
│   ├── requirements.txt
│   └── start.sh       # Start script
```

## Quick Start

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Frontend

Open `index.html` in browser or serve via:
```bash
python3 -m http.server 8080
```

The frontend defaults to `http://localhost:8000` for the API.
Update `API_BASE_URL` in the frontend to point to your deployed backend.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `GLBTOKEN_SECRET` | JWT signing secret (auto-generated) |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `GITHUB_CLIENT_ID` | GitHub OAuth client ID |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth client secret |
| `PORT` | Server port (default: 8000) |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/auth/register` | Register new user |
| `POST` | `/api/auth/login` | Login |
| `POST` | `/api/auth/google/callback` | Google OAuth |
| `POST` | `/api/auth/github/callback` | GitHub OAuth |
| `GET` | `/api/auth/me` | Current user |
| `GET` | `/api/dashboard` | Dashboard data |
| `GET` | `/api/keys` | List API keys |
| `POST` | `/api/keys` | Create API key |
| `PUT` | `/api/keys/:id` | Update API key |
| `DELETE` | `/api/keys/:id` | Delete API key |
| `GET` | `/api/transactions` | Transaction history |
| `POST` | `/api/topup` | Buy tokens |
| `GET` | `/api/models` | List AI models |
| `GET` | `/api/models/providers` | List providers |

## Deploy

### Railway (recommended)

```bash
# Set build command
cd backend && pip install -r requirements.txt

# Start command
uvicorn main:app --host 0.0.0.0 --port $PORT
```

### Frontend
Push to GitHub Pages. Set `API_BASE_URL` to your Railway backend URL.
