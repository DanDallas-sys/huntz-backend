# Huntz Backend API

Standalone REST API for the Huntz AI job matching platform.
Frontend-agnostic — works with any frontend hosted anywhere.

---

## Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 18+ with ES Modules |
| Framework | Express.js |
| Database | PostgreSQL 14+ |
| File Storage | AWS S3 (or any S3-compatible service) |
| Identity Verification | Prembly API (NIN + CAC) |
| AI (CV parsing + scoring) | OpenAI GPT-4o |
| Email | Resend |
| Auth | JWT (jsonwebtoken + bcryptjs) |

---

## Local Setup

### 1. Clone and install dependencies

```bash
git clone <your-repo>
cd huntz-backend
npm install
```

### 2. Set up environment variables

```bash
cp .env.example .env
# Fill in all values in .env
```

### 3. Set up PostgreSQL database

Create a database and user:
```sql
CREATE DATABASE huntz;
CREATE USER huntz_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE huntz TO huntz_user;
```

Run the schema:
```bash
psql -U huntz_user -d huntz -f schema.sql
```

### 4. Start the server

```bash
# Development (with auto-reload)
npm run dev

# Production
npm start
```

---

## Deployment (Railway / Render / VPS)

### Railway (recommended for quick start)
1. Push code to GitHub
2. Create new Railway project → Deploy from GitHub
3. Add environment variables in Railway dashboard
4. Add a PostgreSQL plugin in Railway — copy the DATABASE_URL
5. Update DB_ vars in .env to match Railway Postgres credentials

### Render
1. New Web Service → connect GitHub repo
2. Build command: `npm install`
3. Start command: `node src/index.js`
4. Add environment variables
5. Add a Render PostgreSQL database, copy credentials

### Self-hosted VPS (Ubuntu)
```bash
# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install PM2 for process management
sudo npm install -g pm2

# Run the app
pm2 start src/index.js --name huntz-api
pm2 save
pm2 startup
```

---

## Connecting the Frontend

The frontend makes standard HTTP requests to this API.
Set the base URL in your frontend to your deployed API URL.

Example (using fetch):
```javascript
const API = 'https://api.huntz.com'; // your deployed URL

// Login
const res = await fetch(`${API}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password })
});
const { token, user } = await res.json();

// Authenticated request
const jobs = await fetch(`${API}/api/jobs`, {
  headers: { 'Authorization': `Bearer ${token}` }
});
```

Store the JWT token in `localStorage` or a React context.
Pass it as `Authorization: Bearer <token>` on every authenticated request.

---

## API Reference

### Auth
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | /api/auth/signup | No | Create account |
| POST | /api/auth/login | No | Login |
| GET | /api/auth/me | Yes | Get current user |
| GET | /api/auth/verify-email/:token | No | Verify email |
| POST | /api/auth/forgot-password | No | Request password reset |
| POST | /api/auth/reset-password | No | Reset password |

### Verification
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | /api/verify/nin | Yes (seeker) | Verify NIN |
| POST | /api/verify/id-document | Yes (seeker) | Upload ID document |
| POST | /api/verify/cac | Yes (employer) | Verify CAC number |
| GET | /api/verify/status | Yes | Get verification status |

### Seeker
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | /api/seeker/profile | Yes | Get seeker profile |
| PUT | /api/seeker/profile | Yes | Update seeker profile |
| POST | /api/seeker/upload-cv | Yes | Upload CV (PDF/DOCX) |
| POST | /api/seeker/upload-certificates | Yes | Upload certificates |
| GET | /api/seeker/completion | Yes | Profile completion % |

### Employer
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | /api/employer/profile | Yes | Get employer profile |
| PUT | /api/employer/profile | Yes | Update employer profile |
| POST | /api/employer/upload-cac | Yes | Upload CAC document |
| POST | /api/employer/jobs | Yes | Post a new job |
| GET | /api/employer/jobs | Yes | Get own job listings |
| PATCH | /api/employer/jobs/:id/toggle | Yes | Toggle job active/inactive |
| GET | /api/employer/jobs/:id/applicants | Yes | View applicants with scores |
| PATCH | /api/employer/applications/:id/status | Yes | Update application status |
| GET | /api/employer/dashboard | Yes | Dashboard stats |

### Jobs (Public Feed)
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | /api/jobs | No | Browse jobs (with filters) |
| GET | /api/jobs/:id | No | Single job detail |

Query params for GET /api/jobs:
- `search` — keyword search on title / company
- `location_type` — remote / on-site / hybrid
- `job_type` — full-time / part-time / contract
- `salary_min`, `salary_max` — salary range filter
- `page`, `limit` — pagination

### Applications
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | /api/applications/apply/:jobId | Yes (seeker) | Apply to a job |
| GET | /api/applications/mine | Yes (seeker) | Get own applications |

### AI Matching (Find Me a Job)
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | /api/matching/find | Yes (seeker) | Trigger AI job scan |
| GET | /api/matching/my-matches | Yes (seeker) | Get AI match results |
| POST | /api/matching/approve/:matchId | Yes (seeker) | Approve a match |
| POST | /api/matching/dismiss/:matchId | Yes (seeker) | Dismiss a match |

### Notifications
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | /api/notifications | Yes | Get all notifications |
| GET | /api/notifications/unread-count | Yes | Get unread count |
| PATCH | /api/notifications/read-all | Yes | Mark all as read |
| PATCH | /api/notifications/:id/read | Yes | Mark one as read |

---

## File Upload Guide

All uploads use `multipart/form-data`.

```javascript
// CV upload example
const formData = new FormData();
formData.append('cv', file); // file is a File object from an <input type="file">

await fetch(`${API}/api/seeker/upload-cv`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` },
  // Do NOT set Content-Type manually — browser sets it with the boundary
  body: formData
});
```

Field names:
- CV upload → field name: `cv`
- Certificates → field name: `certificates` (multiple allowed)
- ID document → field name: `id_document`
- CAC document → field name: `cac_document`

---

## Signup Payload Reference

### Job Seeker
```json
{
  "email": "amaka@example.com",
  "password": "securepassword",
  "full_name": "Amaka Okonkwo",
  "user_type": "seeker",
  "state": "Lagos"
}
```

### Employer
```json
{
  "email": "hr@flutterwave.com",
  "password": "securepassword",
  "full_name": "Tunde Adeyemi",
  "user_type": "employer",
  "state": "Lagos",
  "company_name": "Flutterwave",
  "company_location": "Lagos"
}
```

---

## Environment Variables Reference

| Variable | Description |
|---|---|
| PORT | Server port (default 3000) |
| NODE_ENV | development or production |
| FRONTEND_URL | Full URL of your frontend app |
| DB_HOST / DB_PORT / DB_NAME / DB_USER / DB_PASSWORD | PostgreSQL connection details |
| JWT_SECRET | Long random string for signing tokens |
| JWT_EXPIRES_IN | e.g. 7d |
| AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_REGION / AWS_BUCKET_NAME | S3 file storage |
| PREMBLY_API_KEY / PREMBLY_APP_ID | Prembly identity verification |
| OPENAI_API_KEY | OpenAI for CV parsing + scoring |
| RESEND_API_KEY | Resend for transactional email |
| EMAIL_FROM | e.g. Huntz <noreply@huntz.com> |
| API_URL | Full URL of this backend API |

---

## Moving the Frontend

Because the frontend only talks to `API_URL`, you can:
- Move it from Lovable to Vercel → just update `FRONTEND_URL` in .env
- Move it to Netlify → same
- Self-host it on a VPS → same
- Completely rebuild the frontend in a different framework → same API, nothing breaks

The backend has zero dependency on Lovable or any frontend framework.
