# Authentication Backend API

Node.js/Express backend for user authentication with MongoDB.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file (optional, defaults are set in server.js):
```
MONGODB_URI=mongodb+srv://hetjani818_db_user:123@cluster0.ux8dqnc.mongodb.net/?appName=Cluster0
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
PORT=3000
```

3. Start the server:
```bash
# Development mode (with auto-reload)
npm run dev

# Production mode
npm start
```

## API Endpoints

### Health Check
- `GET /api/health` - Check if server is running

### Authentication
- `POST /api/auth/register` - Register a new user
  - Body: `{ name, email, password }`
  - Returns: `{ success, message, data: { token, user } }`

- `POST /api/auth/login` - Login user
  - Body: `{ email, password }`
  - Returns: `{ success, message, data: { token, user } }`

- `GET /api/auth/verify` - Verify JWT token
  - Headers: `Authorization: Bearer <token>`
  - Returns: `{ success, data: { user } }`

## Testing

The server runs on:
- Local: `http://localhost:3000`
- Network: `http://10.44.1.66:3000` (for mobile devices on same network)

## Important Notes

- Make sure your firewall allows connections on port 3000
- For mobile testing, ensure your phone and computer are on the same Wi-Fi network
- The IP address (10.44.1.66) should match your computer's current IP address

