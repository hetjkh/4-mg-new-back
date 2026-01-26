# Quick ngrok Setup

## Option 1: Using npx (No Installation)

```bash
# In backend folder, start server first
npm start

# In another terminal, run:
npx ngrok http 3000
```

## Option 2: Install ngrok Globally

1. Download: https://ngrok.com/download
2. Extract to a folder
3. Add to PATH or use full path
4. Run: `ngrok http 3000`

## After Starting ngrok:

1. You'll see a Forwarding URL like: `https://abc123.ngrok-free.app`
2. Copy this URL
3. Update `constants/api.ts`:
   ```typescript
   export const API_BASE_URL = __DEV__ 
     ? 'https://abc123.ngrok-free.app/api'
     : 'https://your-production-api.com/api';
   ```
4. Restart Expo app

## Note:
- Free ngrok URLs expire when you close ngrok
- URLs change each time you restart
- For static URL, upgrade to paid plan

