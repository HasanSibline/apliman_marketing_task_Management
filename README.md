# AI-Powered Task Management System

A comprehensive, enterprise-grade task management web application with AI-powered features, real-time collaboration, and advanced analytics. Built with modern technologies and best practices for scalability and maintainability.

## 🚀 Features

### Core Features
- **User Management**: Role-based access control (Super Admin, Admin, Employee, Retired)
- **Task Lifecycle**: Complete workflow from creation to completion with approval system
- **File Attachments**: Document and image uploads with automatic compression
- **Real-time Presence**: Live user status tracking (Active, Away, Offline)
- **Analytics Dashboard**: Comprehensive insights with interactive charts
- **Export Functionality**: Export tasks to Excel/CSV with detailed reporting

### AI-Powered Features
- **Task Summarization**: Automatic summarization of task descriptions and documents
- **Priority Analysis**: AI-suggested task prioritization
- **Completeness Checking**: Automated task completion validation
- **Performance Insights**: AI-generated performance analytics

## 🏗️ Architecture

### Frontend (React + TypeScript)
- **Framework**: React 18 with Vite
- **Styling**: TailwindCSS with custom components
- **State Management**: Redux Toolkit with persistence
- **Routing**: React Router DOM
- **Charts**: Recharts for data visualization
- **Real-time**: Socket.IO client for live updates

### Backend (NestJS + TypeScript)
- **Framework**: NestJS with Express
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: JWT with Passport.js
- **File Upload**: Multer with Sharp compression
- **WebSockets**: Socket.IO for real-time features
- **API Documentation**: Swagger/OpenAPI

### AI Service (Python + FastAPI)
- **Framework**: FastAPI
- **AI Models**: Flan-T5 for text processing
- **OCR**: Tesseract for document text extraction
- **ML Libraries**: Transformers, PyTorch

### Database Schema
- **Users**: Authentication and profile management
- **Tasks**: Complete task lifecycle with phases
- **Files**: Attachment management with compression
- **Comments**: Task collaboration and communication
- **Analytics**: Performance tracking and insights

## 🛠️ Technology Stack

### Frontend Dependencies
```json
{
  "react": "^18.2.0",
  "react-dom": "^18.2.0",
  "react-router-dom": "^6.16.0",
  "@reduxjs/toolkit": "^1.9.7",
  "react-redux": "^8.1.3",
  "redux-persist": "^6.0.0",
  "axios": "^1.5.1",
  "socket.io-client": "^4.7.2",
  "@headlessui/react": "^1.7.17",
  "@heroicons/react": "^2.0.18",
  "recharts": "^2.8.0",
  "react-hook-form": "^7.46.2",
  "@hookform/resolvers": "^3.3.1",
  "yup": "^1.3.3",
  "react-hot-toast": "^2.4.1",
  "react-dropzone": "^14.2.3",
  "date-fns": "^2.30.0",
  "clsx": "^2.0.0",
  "framer-motion": "^10.16.4",
  "react-loading-skeleton": "^3.3.1"
}
```

### Backend Dependencies
```json
{
  "@nestjs/common": "^10.0.0",
  "@nestjs/core": "^10.0.0",
  "@nestjs/platform-express": "^10.0.0",
  "@nestjs/config": "^3.1.1",
  "@nestjs/jwt": "^10.1.1",
  "@nestjs/passport": "^10.0.2",
  "@nestjs/platform-socket.io": "^10.2.7",
  "@nestjs/axios": "^3.0.1",
  "@nestjs/swagger": "^7.1.13",
  "@nestjs/schedule": "^4.0.0",
  "prisma": "^6.16.2",
  "@prisma/client": "^6.16.2",
  "bcrypt": "^5.1.1",
  "class-validator": "^0.14.0",
  "class-transformer": "^0.5.1",
  "multer": "^1.4.5-lts.1",
  "sharp": "^0.32.6",
  "xlsx": "^0.18.5",
  "passport-jwt": "^4.0.1",
  "socket.io": "^4.7.2"
}
```

### AI Service Dependencies
```txt
fastapi==0.104.1
uvicorn[standard]==0.24.0
transformers==4.35.2
torch==2.1.1
pytesseract==0.3.10
Pillow==10.1.0
python-multipart==0.0.6
pydantic==2.5.0
numpy==1.24.3
```

## 📋 Prerequisites

- **Node.js** 18+ 
- **Python** 3.8+
- **PostgreSQL** 12+
- **Docker** (optional, for containerized deployment)

## 🚀 Quick Start

### Option 1: Automated Setup (Recommended)

#### Windows (PowerShell)
```powershell
.\setup-complete.ps1
```

#### Linux/Mac (Bash)
```bash
chmod +x setup.sh
./setup.sh
```

### Option 2: Manual Setup

#### 1. Clone and Install Dependencies

```bash
# Install backend dependencies
cd backend
npm install
npx prisma generate

# Install frontend dependencies
cd ../frontend
npm install

# Setup AI service
cd ../ai-service
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

#### 2. Environment Configuration

Copy the example environment files and update them:

```bash
# Backend environment
cp backend/env.example backend/.env
# Update DATABASE_URL and JWT_SECRET

# Frontend environment
cp frontend/env.example frontend/.env

# AI service environment
cp ai-service/env.example ai-service/.env
```

#### 3. Database Setup

```bash
cd backend
npx prisma migrate dev
npx prisma db seed
```

#### 4. Start Development Servers

```bash
# Terminal 1: Backend
cd backend
npm run start:dev

# Terminal 2: Frontend
cd frontend
npm run dev

# Terminal 3: AI Service
cd ai-service
source venv/bin/activate  # On Windows: venv\Scripts\activate
python main.py
```

### Option 3: Docker Deployment

```bash
# Build and start all services
docker-compose up --build

# Or run in background
docker-compose up -d
```

## 🌐 Access Points

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3001
- **API Documentation**: http://localhost:3001/api
- **AI Service**: http://localhost:8000
- **AI Service Docs**: http://localhost:8000/docs

## 👥 User Roles & Permissions

### Super Admin
- Full system access
- User management (create, update, delete users)
- System configuration
- All analytics and reports

### Admin
- Task management (create, assign, review)
- User oversight (view all users, limited editing)
- Department analytics
- Export capabilities

### Employee
- Personal task management
- File uploads and comments
- Personal analytics
- Profile management

### Retired
- Read-only access to historical data
- Limited profile updates

## 📊 Task Lifecycle

1. **Pending Approval**: Initial task creation awaiting admin review
2. **Approved**: Task approved by admin, ready for assignment
3. **Assigned**: Task assigned to specific employee(s)
4. **In Progress**: Active work on the task
5. **Completed**: Task finished, awaiting final review
6. **Archived**: Task completed and archived for records

## 🤖 AI Features

### Text Summarization
- Automatic task description summarization
- Document content extraction and summary
- Multi-language support

### Priority Analysis
- AI-suggested task prioritization based on:
  - Deadline urgency
  - Task complexity
  - Resource availability
  - Historical patterns

### Completeness Checking
- Automated validation of task requirements
- Missing information detection
- Quality assurance suggestions

### Performance Insights
- Employee productivity analysis
- Task completion patterns
- Workload optimization recommendations

## 📈 Analytics & Reporting

### Dashboard Metrics
- Active users and tasks
- Task completion rates
- Performance trends
- Resource utilization

### Export Options
- Excel/CSV export with custom filters
- Date range selection
- User-specific reports
- Task phase analysis

### Real-time Updates
- Live user presence tracking
- Instant task status updates
- Real-time notifications

## 🔧 Development

### Project Structure
```
├── backend/                 # NestJS backend
│   ├── src/
│   │   ├── auth/           # Authentication module
│   │   ├── users/          # User management
│   │   ├── tasks/          # Task management
│   │   ├── files/          # File upload handling
│   │   ├── analytics/      # Analytics and reporting
│   │   ├── presence/       # Real-time presence
│   │   ├── ai/             # AI service integration
│   │   └── types/          # Custom type definitions
│   ├── prisma/             # Database schema and migrations
│   └── uploads/            # File storage
├── frontend/               # React frontend
│   ├── src/
│   │   ├── components/     # Reusable components
│   │   ├── pages/          # Page components
│   │   ├── store/          # Redux store and slices
│   │   ├── services/       # API services
│   │   └── hooks/          # Custom hooks
│   └── public/             # Static assets
├── ai-service/             # Python AI microservice
│   ├── services/           # AI processing services
│   └── models/             # AI model configurations
├── docker-compose.yml      # Container orchestration
├── setup.sh               # Linux/Mac setup script
└── setup-complete.ps1     # Windows setup script
```

### API Documentation

The backend provides comprehensive API documentation via Swagger UI:
- **Local**: http://localhost:3001/api
- **Production**: https://your-domain.com/api

### Database Migrations

```bash
# Create new migration
npx prisma migrate dev --name migration_name

# Reset database
npx prisma migrate reset

# Deploy to production
npx prisma migrate deploy
```

### Testing

```bash
# Backend tests
cd backend
npm run test
npm run test:e2e

# Frontend tests
cd frontend
npm run test
```

## 🚀 Deployment

### Cloudflare Pages (Frontend)
1. Connect your GitHub repository
2. Set build command: `npm run build`
3. Set output directory: `dist`
4. Configure environment variables

### Render (Backend & AI Service)
1. Create new web service
2. Connect GitHub repository
3. Set build and start commands
4. Configure environment variables
5. Add PostgreSQL database

### Environment Variables

#### Backend (.env)
```env
DATABASE_URL="postgresql://username:password@localhost:5432/taskmanagement"
JWT_SECRET="your-super-secret-jwt-key-minimum-32-characters-long"
JWT_EXPIRES_IN="7d"
PORT=3001
NODE_ENV="development"
AI_SERVICE_URL="http://localhost:8000"
UPLOAD_PATH="./uploads"
MAX_FILE_SIZE=5242880
```

#### Frontend (.env)
```env
VITE_API_URL=http://localhost:3001
VITE_WS_URL=http://localhost:3001
```

#### AI Service (.env)
```env
HOST=0.0.0.0
PORT=8000
MODEL_NAME=google/flan-t5-base
MAX_LENGTH=512
CACHE_DIR=./models
```

## 🔒 Security Features

- **JWT Authentication**: Secure token-based authentication
- **Password Hashing**: bcrypt for secure password storage
- **Role-Based Access Control**: Granular permissions system
- **File Upload Security**: Type validation and size limits
- **CORS Configuration**: Secure cross-origin requests
- **Input Validation**: Comprehensive request validation
- **SQL Injection Protection**: Prisma ORM with parameterized queries
- **XSS Protection**: Input sanitization and validation

## 🐛 Troubleshooting

### Common Issues

#### Database Connection
```bash
# Check PostgreSQL status
sudo systemctl status postgresql

# Reset database
npx prisma migrate reset
```

#### Node Modules Issues
```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install
```

#### TypeScript Errors
- Restart your IDE/TypeScript server
- Check for missing type definitions
- Verify import paths
- Run `npm install @types/node` if needed

#### AI Service Issues
```bash
# Reinstall Python dependencies
pip install --upgrade -r requirements.txt

# Check Python version
python --version  # Should be 3.8+

# Clear model cache
rm -rf ./models
```

#### Prisma Issues
```bash
# Regenerate Prisma client
npx prisma generate

# Update Prisma to latest
npm install prisma@latest @prisma/client@latest
```

### Performance Optimization

#### Frontend
- Enable code splitting
- Optimize bundle size
- Use React.memo for expensive components
- Implement virtual scrolling for large lists

#### Backend
- Database indexing
- Query optimization
- Caching strategies
- Connection pooling

#### AI Service
- Model caching
- Batch processing
- GPU acceleration (if available)

## 📝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

### Code Style
- **TypeScript**: Strict mode enabled
- **ESLint**: Airbnb configuration
- **Prettier**: Automatic code formatting
- **Husky**: Pre-commit hooks

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **NestJS** - Progressive Node.js framework
- **React** - User interface library
- **Prisma** - Next-generation ORM
- **TailwindCSS** - Utility-first CSS framework
- **Hugging Face** - AI model hosting and transformers
- **Heroicons** - Beautiful SVG icons

## 📞 Support

For support and questions:
- Create an issue on GitHub
- Check the documentation
- Review troubleshooting guide

---

**Built with ❤️ using modern web technologies**

## 🎯 Recent Updates

### Version 1.0.0 - Initial Release
- ✅ Complete backend API with NestJS
- ✅ React frontend with modern UI
- ✅ AI service with FastAPI
- ✅ Real-time features with WebSockets
- ✅ Comprehensive authentication system
- ✅ File upload and compression
- ✅ Analytics dashboard
- ✅ Docker deployment configuration
- ✅ Complete documentation and setup scripts

### Fixed Issues
- ✅ Prisma enum imports resolved with custom types
- ✅ TypeScript configuration optimized
- ✅ All linting errors resolved
- ✅ Dependencies properly configured
- ✅ WebSocket interface compatibility fixed
- ✅ File upload compression implemented
- ✅ Database schema optimized