# 💰 Wealth Vault — Financial Wellness App

> **Take control of your money. Build healthier financial habits.**  
> Wealth Vault is a modern financial wellness platform that helps users understand spending behavior, set meaningful goals, and make smarter financial decisions using **AI-powered insights**.

## 📊 Badges



![GitHub stars](https://img.shields.io/github/stars/csxark/Wealth-Vault?style=social)
![GitHub forks](https://img.shields.io/github/forks/csxark/Wealth-Vault?style=social)
![Visitors](https://visitor-badge.laobi.icu/badge?page_id=csxark.Wealth-Vault)
![GitHub issues](https://img.shields.io/github/issues/csxark/Wealth-Vault)
![License](https://img.shields.io/github/license/csxark/Wealth-Vault)


---

## 🌐 Website Flow

Wealth Vault guides users through a **simple three-step flow**:

1. **Landing Page**  
   Introduces Wealth Vault, highlights features, and encourages users to sign up.  
   <div align="center">
     <img src="./assets/Home.png" alt="Home Page" width="80%" style="border-radius: 12px; box-shadow: 0 4px 16px rgba(0,0,0,0.2);" />
   </div>

2. **Authentication (Sign Up / Login)**  
   Secure user registration and login powered by **Supabase Auth**.
   <div align="center">
     <img src="./assets/Auth.png" alt="Dashboard" width="80%" style="border-radius: 12px; box-shadow: 0 4px 16px rgba(0,0,0,0.2);" />
   </div>

3. **Dashboard**  
   Personalized financial insights, expense tracking, goal management, and visual analytics.  
   <div align="center">
     <img src="./assets/Dashboard.png" alt="Dashboard" width="80%" style="border-radius: 12px; box-shadow: 0 4px 16px rgba(0,0,0,0.2);" />
   </div>

---

## ✨ What Makes Wealth Vault Different?

Wealth Vault goes beyond simple expense tracking. It focuses on **behavior-aware finance**, helping users understand _why_ they spend — not just _what_ they spend.

### 🔑 Key Features

- 🧠 **Smart Spending Analysis**  
  Categorizes expenses into **Safe**, **Impulsive**, and **Anxious** spending patterns

- 🎯 **Financial Goals Management**  
  Set, track, and visualize progress toward financial objectives

- 🤖 **AI Financial Coach**  
  Personalized insights and actionable recommendations

- 📷 **QR Code Expense Entry**  
  Log expenses instantly using QR codes and UPI

- 📊 **Visual Analytics Dashboard**  
  Interactive charts for clear spending insights

- 📁 **CSV Data Import**  
  Import historical financial data with ease

- 👤 **User Profiles**  
  Personalized financial preferences and income settings

- 🎨 **User-Friendly Interface**  
  Clean, responsive UI built for everyday use

---

## 🛠 Tech Stack

| Layer        | Technology                  |
| ------------ | --------------------------- |
| Frontend     | React 18, TypeScript, Vite  |
| Styling      | Tailwind CSS                |
| Backend & DB | Supabase (PostgreSQL)       |
| Auth         | Supabase Auth               |
| Charts       | Chart.js, React-Chartjs-2   |
| Icons        | Lucide React                |
| QR Scanning  | @zxing/browser              |

---

## ✅ Prerequisites

- Node.js **18+**
- npm
- Git

**OR** 

- Docker & Docker Compose ([see Docker setup](DOCKER_GUIDE.md))

---

## ⚡ Quick Setup

### 🚀 Automated Setup (Recommended)

Run this single command to set up everything automatically:

```bash
npm run sync
```

This will:

- Install all dependencies (root, backend, and frontend)
- Create environment configuration files
- Set up the database connection

---

### 🐳 Docker Setup

If you have Docker installed:

```bash
git clone https://github.com/csxark/Wealth-Vault.git
cd Wealth-Vault
docker-compose up
```

Access at http://localhost:3000 | [Full Docker docs →](DOCKER_GUIDE.md)


---

### 🔧 Manual Setup (Step by Step)

If you prefer manual control or the automated setup fails, follow these steps:

#### Step 1: Install Dependencies

```bash
# Install root dependencies and all sub-projects
npm install
```

**Or install individually:**

```bash
# Root dependencies
npm install

# Backend dependencies
cd .\backend\
npm install
cd ..

# Frontend dependencies
cd .\frontend\
npm install
cd ..
```

#### Step 2: Configure Environment Variables

**Automatic method:**

```bash
npm run setup
```

This creates `.env` files in both `backend/` and `frontend/` directories with template values.

**Manual method (Windows):**

1. **Backend environment:**

   - Copy `backend\env.example` to `backend\.env`
   - Edit `backend\.env` and update:
     ```
     DATABASE_URL=your_supabase_database_url
     DIRECT_URL=your_supabase_direct_url
     JWT_SECRET=your_secret_key_here
     ```

2. **Frontend environment:**
   - Copy `frontend\env.example` to `frontend\.env`
   - Edit `frontend\.env` and update:
     ```
     VITE_SUPABASE_URL=your_supabase_project_url
     VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
     VITE_API_URL=http://localhost:5000/api
     ```

> **📝 Note:** Get your Supabase credentials from your [Supabase Dashboard](https://supabase.com/dashboard) → Project Settings → API

#### Step 3: Set Up Database (if using Supabase)

The application uses Supabase (PostgreSQL) for data storage. Make sure:

- You have created a Supabase project
- Your database URL and credentials are configured in `backend\.env`
- Row Level Security (RLS) policies are set up (see project documentation)

#### Step 4: Start the Application

**Start both frontend and backend together:**

```bash
npm run dev
```

**Or start individually:**

```bash
#install this package first
npm install concurrently --save-dev
# Backend only (runs on port 5000)
npm run dev:backend

# Frontend only (runs on port 3000)
npm run dev:frontend
```

**For separate terminals:**

```powershell
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend
cd frontend
npm run dev
```

### 5️⃣ Access the Application

* **Frontend**: [http://localhost:3000](http://localhost:3000)
* **Backend API**: [http://localhost:5000/api](http://localhost:5000/api)
* **API Health Check**: [http://localhost:5000/api/health](http://localhost:5000/api/health)
* **API Documentation**: [http://localhost:5000/api-docs](http://localhost:5000/api-docs)

---

## 🔒 Security Features

* **Rate Limiting**

  * General API: 100 requests / 15 min
  * Authentication routes: 5 requests / 15 min
  * AI/Gemini routes: 20 requests / 15 min

* **Password Security**

  * Strong password enforcement
  * Real-time password strength meter
  * Requirements: ≥9 characters, uppercase, lowercase, number, special character

---

## 📚 API Documentation

Interactive API documentation is available via **Swagger UI** at `/api-docs` when the backend is running.

Includes:

* All available endpoints
* Request/response schemas
* Authentication requirements
* Try-it-out functionality

---

## API Synchronization

The frontend and backend are fully synchronized with matching data models:

- **User Management**: Authentication handled via Supabase Auth
- **Expense Tracking**: Real-time expense management with categories
- **Goal Management**: Financial goals with progress tracking
- **Category Management**: Hierarchical categories with budgets

## Database Schema

The app uses Supabase (PostgreSQL) with the following main tables:

- **profiles**: User profile information
- **transactions**: Financial transactions with spending categories
- **goals**: Financial goals and progress tracking

All tables have Row Level Security (RLS) enabled to ensure users can only access their own data.

---

## 📊 Dashboard & Key Components

### Dashboard

* Spending overview with charts
* Category breakdown: **Safe, Impulsive, Anxious**
* Budget tracking and safe spend zone

### Goals Management

* Create and track financial goals
* Visual progress indicators
* Goal completion tracking

### Profile Management

* Personal info & financial preferences
* Income and goal settings

### Expense Tracking

* QR code scanning for quick entry
* Manual expense logging
* Category classification

## Environment Variables

| Variable                 | Description                   | Required |
| ------------------------ | ----------------------------- | -------- |
| `VITE_SUPABASE_URL`      | Your Supabase project URL     | Yes      |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anon/public key | Yes      |
| `VITE_DEBUG`             | Enable debug mode             | No       |

## Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

---

## 🌱 Project Structure

```
frontend/
├── src/
│   ├── components/     # React components
│   ├── hooks/          # Custom React hooks
│   ├── lib/            # External library configurations
│   ├── types/          # TypeScript type definitions
│   └── utils/          # Utility functions
├── public/             # Static assets
└── package.json        # Dependencies and scripts
```

---

## 🚀 Deployment

This project can be deployed in several ways depending on your infrastructure and operational needs.

### 1. Docker + Nginx (Production, Recommended)

For a full-stack deployment (frontend, backend, and database) on your own infrastructure or a VM:

- Use the provided Docker configuration and compose files:
  - `docker-compose.yml` (development)
  - `docker-compose.prod.yml` (production)
  - `backend/Dockerfile`, `frontend/Dockerfile`
- Use Nginx as an HTTPS reverse proxy in front of the app:
  - `nginx/nginx.conf`
  - `nginx/ssl/` (place certificates here)

High-level production steps:

1. Review the full Docker documentation: [DOCKER_GUIDE.md](DOCKER_GUIDE.md)
2. Copy `.env.prod.example` to `.env.prod` (or similar) and set strong secrets and production URLs
3. Configure Nginx and SSL certificates (see [nginx/README.md](nginx/README.md))
4. Run the stack:
  ```bash
  docker-compose -f docker-compose.prod.yml up -d
  ```
5. Access the app via your Nginx HTTPS endpoint (for example, `https://yourdomain.com`)

### 2. Frontend on Vercel / Static Hosting

You can deploy the frontend as a static site to Vercel, Netlify, Cloudflare Pages, or similar platforms. The backend must be deployed separately (see the next section).

#### Frontend build

```bash
cd frontend
npm install
npm run build
```

This produces a static build in `frontend/dist`.

#### Vercel example

1. Connect your GitHub repository to Vercel
2. Set build settings:
  - Build command: `npm run build`
  - Output directory: `dist`
3. Configure environment variables in the Vercel dashboard, for example:
  - `VITE_API_URL=https://api.yourdomain.com`
4. Deploy automatically on push to `main` (or your chosen branch)

The same build output can be served by other static hosts (Netlify, Cloudflare Pages, S3 + CloudFront) by uploading `frontend/dist` and configuring SPA-style routing.

### 3. Backend on Container Platforms

The backend is a Node.js service that can be deployed as a container to platforms like:

- Render, Railway, Fly.io
- AWS ECS/Fargate, AWS App Runner
- Azure App Service (for Containers)
- Google Cloud Run or similar

Typical steps:

1. Build the backend image using `backend/Dockerfile`:
  ```bash
  cd backend
  docker build -t wealth-vault-backend:latest .
  ```
2. Push the image to your container registry (Docker Hub, ECR, ACR, GCR, etc.)
3. Create a service in your platform of choice, exposing port `5000`
4. Configure environment variables (see next section) and health checks on `/api/health`
5. Point your frontend `VITE_API_URL` to the backend URL (for example, `https://api.yourdomain.com`)

### 4. Production Environment Configuration

For a secure production setup, configure at minimum the following:

**Backend (examples):**

- `NODE_ENV=production`
- `PORT=5000`
- `DATABASE_URL` — connection string to your managed PostgreSQL instance
- `DIRECT_URL` — direct DB URL for migrations/maintenance
- `JWT_SECRET` — long, random secret key
- `JWT_EXPIRE` — token lifetime (for example, `24h`)
- `FRONTEND_URL` — public URL of the frontend (for example, `https://yourdomain.com`)
- `REDIS_URL` — Redis instance URL (for caching, if used)
- `GEMINI_API_KEY` — AI provider key (if using AI features)
- `SENDGRID_API_KEY` or other email provider keys

**Frontend (examples):**

- `VITE_API_URL` — public URL of the backend API (for example, `https://api.yourdomain.com`)
- `VITE_DEBUG` — set to `false` in production

Refer to [DOCKER_GUIDE.md](DOCKER_GUIDE.md) and `backend/.env.example` for a more complete list of environment variables and their roles.

### 5. SSL / HTTPS Configuration

For production, always terminate HTTPS in front of the application (for example, using Nginx, a cloud load balancer, or your hosting provider’s TLS termination).

Using the provided Nginx setup:

1. Obtain certificates from a trusted CA (for example, Let’s Encrypt) or generate self-signed certificates for testing
2. Place your certificates in `nginx/ssl/` (for example, `cert.pem`, `private.key`)
3. Update `nginx/nginx.conf` with your domain and certificate paths
4. Mount the Nginx config and SSL directory in `docker-compose.prod.yml` as documented in [nginx/README.md](nginx/README.md)
5. Expose port `443` from the Nginx container and route traffic to the backend/frontend services

If you are deploying to a managed platform (for example, Vercel, Netlify, Cloudflare, AWS ALB), you can usually enable HTTPS directly in that platform’s dashboard without managing certificates manually.

### 6. Monitoring, Logging, and Scaling

To operate Wealth Vault reliably in production, set up basic observability and scaling:

**Logging:**

- Collect container logs (`docker-compose logs -f` or platform log streams)
- Centralize logs using your cloud provider’s logging service or a stack like ELK/EFK

**Health checks:**

- Use the backend health endpoint at `/api/health` for container, load balancer, or uptime monitoring

**Metrics and monitoring:**

- Monitor CPU, memory, and response times for backend containers
- Track database health (connections, slow queries, storage)
- Optionally integrate with Prometheus/Grafana or your cloud provider’s monitoring tools

**Scaling:**

- Scale backend instances horizontally (increase replica count) when CPU or latency is high
- Ensure the database and Redis (if used) are sized appropriately and can handle increased connections
- For Docker Swarm/Kubernetes, configure resource limits/requests and autoscaling based on metrics

These practices help ensure smooth, secure, and predictable production deployments across different platforms.

---

## Troubleshooting

### Common Issues

1. **Environment Variables Not Loading**

   - Ensure `.env` file is in the `frontend` directory
   - Restart the development server after adding variables

2. **Database Connection Errors**

   - Verify the Supabase URL and key are correct
   - Check if the database schema is properly set up
   - Ensure RLS policies are configured

3. **Authentication Issues**
   - Verify Supabase Auth is enabled
   - Check Site URL configuration in Supabase
   - Clear browser cache and local storage

### Debug Mode

Enable debug mode by setting `VITE_DEBUG=true` to see detailed console logs.

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

---

## 👥 Contributors

<a href="https://github.com/csxark/Wealth-Vault/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=csxark/Wealth-Vault&max=300" />
</a>

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

## 🛠 Support

* Open an issue in the GitHub repository
* Review [Supabase documentation](https://supabase.com/docs) for database issues
