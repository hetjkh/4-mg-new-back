# Debugging Registration Error

## Check Backend Terminal

When you try to register, check the backend terminal for error messages. You should see:

1. **MongoDB Connection Status:**
   - ✅ `MongoDB Connected Successfully` - Good
   - ❌ `MongoDB connection error` - Problem

2. **Registration Error Details:**
   - The actual error message will be logged
   - Check for MongoDB errors, validation errors, etc.

## Common Issues:

### 1. MongoDB Not Connected
**Symptoms:** Error mentions "Database connection error"

**Fix:**
- Check MongoDB Atlas cluster is running
- Check network access (IP whitelist in MongoDB Atlas)
- Verify connection string is correct

### 2. Database Name Missing
**Symptoms:** Connection works but can't save data

**Fix:**
- Connection string should include database name: `mongodb+srv://.../myapp?appName=Cluster0`
- Already fixed in server.js

### 3. Duplicate Email
**Symptoms:** "User with this email already exists"

**Fix:**
- Try a different email address
- Or delete the existing user from database

### 4. Network/Firewall
**Symptoms:** Connection timeout

**Fix:**
- Check MongoDB Atlas IP whitelist (should allow all IPs: 0.0.0.0/0 for testing)
- Check if MongoDB Atlas cluster is paused (free tier pauses after inactivity)

## Test Steps:

1. **Check MongoDB Connection:**
   - Look in backend terminal for "MongoDB Connected Successfully"
   - If not connected, fix connection first

2. **Try Registration:**
   - Fill in all fields
   - Submit
   - Check backend terminal for error details

3. **Check Error Message:**
   - The app will now show the actual error message
   - Not just "Server error during registration"

