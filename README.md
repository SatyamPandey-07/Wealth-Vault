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
   Secure user registration and login powered by **JWT Authentication**.
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
| Backend      | Node.js, Express.js         |
| Database     | PostgreSQL                  |
| ORM          | Drizzle ORM                 |
| Auth         | JWT Authentication          |
| Charts       | Chart.js, React-Chartjs-2   |
| Icons        | Lucide React                |
| QR Scanning  | @zxing/browser              |
| AI           | Google Gemini API           |
| Caching      | Redis                       |

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

   - Copy `backend\.env.example` to `backend\.env`
   - Edit `backend\.env` and update:
     ```
     DATABASE_URL=postgresql://username:password@localhost:5432/wealth_vault
     DIRECT_URL=postgresql://username:password@localhost:5432/wealth_vault
     JWT_SECRET=your-super-secret-jwt-key-here
     PORT=5000
     NODE_ENV=development
     FRONTEND_URL=http://localhost:3000
     ```

2. **Frontend environment:**
   - Copy `frontend\.env.example` to `frontend\.env`
   - Edit `frontend\.env` and update:
     ```
     VITE_API_URL=http://localhost:5000
     ```

> **📝 Note:** For PostgreSQL setup, you can use a local PostgreSQL instance or a cloud provider like AWS RDS, Google Cloud SQL, or Azure Database.

#### Step 3: Set Up Database

The application uses PostgreSQL with Drizzle ORM for data storage. You have two options:

**Option A: Local PostgreSQL**
- Install PostgreSQL locally
- Create a database named `wealth_vault`
- Update the `DATABASE_URL` in `backend\.env`

**Option B: Docker PostgreSQL (Recommended for development)**
```bash
# Start PostgreSQL with Docker
docker run --name wealth-vault-db -e POSTGRES_DB=wealth_vault -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=password -p 5432:5432 -d postgres:16-alpine
```

**Option C: Cloud PostgreSQL**
- Use services like AWS RDS, Google Cloud SQL, Azure Database, or Supabase
- Update the `DATABASE_URL` in `backend\.env` with your cloud database URL

#### Step 4: Run Database Migrations

```bash
cd backend
npm run db:push  # Push schema to database
npm run db:migrate  # Run any pending migrations
```

#### Step 5: Start the Application

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

- **User Management**: JWT-based authentication with secure token handling
- **Expense Tracking**: Real-time expense management with categories
- **Goal Management**: Financial goals with progress tracking
- **Category Management**: Hierarchical categories with budgets

## Database Schema

The app uses PostgreSQL with Drizzle ORM and the following main tables:

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

### Backend Variables

| Variable          | Description                          | Required |
| ----------------- | ------------------------------------ | -------- |
| `DATABASE_URL`    | PostgreSQL connection string         | Yes      |
| `DIRECT_URL`      | Direct PostgreSQL connection string  | Yes      |
| `JWT_SECRET`      | Secret key for JWT signing           | Yes      |
| `JWT_EXPIRE`      | JWT token expiration time            | No       |
| `PORT`            | Backend server port                  | No       |
| `NODE_ENV`        | Environment (development/production) | No       |
| `FRONTEND_URL`    | Frontend application URL             | No       |
| `REDIS_URL`       | Redis connection string              | No       |
| `GEMINI_API_KEY`  | Google Gemini AI API key             | No       |

### Frontend Variables

| Variable      | Description              | Required |
| ------------- | ------------------------ | -------- |
| `VITE_API_URL`| Backend API URL          | Yes      |
| `VITE_DEBUG`  | Enable debug mode        | No       |

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

### Vercel (Recommended)

1. Connect your GitHub repository to Vercel
2. Set environment variables in the Vercel dashboard
3. Deploy automatically on push to `main` branch

---

## Troubleshooting

### Common Issues

1. **Environment Variables Not Loading**

   - Ensure `.env` file is in the correct directory (`backend/` for backend, `frontend/` for frontend)
   - Restart the development server after adding variables
   - Check variable naming (no spaces around `=`)

2. **Database Connection Errors**

   - Verify the PostgreSQL connection string is correct
   - Check if PostgreSQL server is running and accessible
   - Ensure database and user exist with proper permissions
   - Run `npm run db:push` to ensure schema is up to date

3. **Authentication Issues**
   - Verify `JWT_SECRET` is set and strong (at least 32 characters)
   - Check token expiration settings
   - Clear browser local storage if experiencing persistent auth issues

### Debug Mode

Enable debug mode by setting `VITE_DEBUG=true` in frontend environment to see detailed console logs.

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
