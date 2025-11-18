# Fix: User Not Found (JWT Token Mismatch)

## Problem Identified

The JWT token in your browser contains a user ID (`24971ac0-2cdd-4f97-a25e-e94d1ba0af66`) that doesn't exist in the current database. This happened because:

1. You logged in on production (Render) which uses Neon database
2. A user was created in the Neon database
3. You received a JWT token for that user
4. The backend is now trying to validate that token against the database
5. But the user doesn't exist (possibly due to database reset/migration)

## Solution: Clear Browser Storage & Re-login

### Step 1: Clear Browser Storage

**Option A: Using Browser Console (Recommended)**
1. Open your browser's Developer Tools (F12)
2. Go to the Console tab
3. Run these commands:
```javascript
localStorage.clear();
sessionStorage.clear();
location.reload();
```

**Option B: Manual Clearing**
1. Open Developer Tools (F12)
2. Go to Application tab (Chrome) or Storage tab (Firefox)
3. Find "Local Storage" in the left sidebar
4. Right-click on your site's domain
5. Click "Clear"
6. Do the same for "Session Storage"
7. Refresh the page (F5)

**Option C: Use Incognito/Private Mode**
- Open a new Incognito/Private window
- This will have clean storage

### Step 2: Login as Super Admin

1. Go to: `https://your-app.onrender.com/admin/login`
2. Login with:
   - Email: `superadmin@apliman.com`
   - Password: `SuperAdmin123!` (or your custom password from env)

### Step 3: Check if Company Exists

1. After logging in, go to the Companies page
2. Check if "Apliman" (or your company) exists
3. If it exists, note the login credentials
4. If it doesn't exist, create it again

### Step 4: Login with Company Admin

1. Logout from Super Admin
2. Go to: `https://your-app.onrender.com/apliman/login` (or your company slug)
3. Login with the company admin credentials
4. You should now have a valid token!

## Verify the Fix

After logging in with fresh credentials:

1. Open Developer Tools Console
2. Check localStorage:
```javascript
console.log('Token:', localStorage.getItem('token'));
```

3. Try using the AI features:
   - Go to Tasks page
   - Click "Create Task"
   - Try "Generate with AI"
   - Try ApliChat

## Why This Happened

Looking at the deployment logs from November 17, 2025:
```
2025-11-17T15:25:46.539114051Z at UsersService.findById
User not found: 24971ac0-2cdd-4f97-a25e-e94d1ba0af66
```

This indicates that:
1. The database was likely reset or migrated after you logged in
2. Your old JWT token is still in browser storage
3. The token references a user that no longer exists

## Prevention

To prevent this in the future:
1. Always clear browser storage after database migrations
2. The backend should handle this better (we can add auto-logout on 404)
3. JWT tokens should have shorter expiration times

## Technical Details

**JWT Token Structure:**
- Contains: `{ userId: '24971ac0-2cdd-4f97-a25e-e94d1ba0af66', ... }`
- Stored in: `localStorage.getItem('token')`
- Used for: All authenticated API requests

**What Happens:**
1. Frontend sends token in `Authorization: Bearer <token>` header
2. Backend decodes token and extracts `userId`
3. Backend tries to find user in database: `prisma.user.findUnique({ where: { id: userId } })`
4. User doesn't exist → 404 Not Found → 401 Unauthorized

**The Fix:**
- Get a new token by logging in again
- New token will have the correct user ID from the current database

