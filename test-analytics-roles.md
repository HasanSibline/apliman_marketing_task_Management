# Analytics & Roles Testing Guide

## Quick Test Checklist

### Test 1: EMPLOYEE Role Analytics Access
**Login as**: Any EMPLOYEE user

**Expected Behavior**:
- ✅ Can see only "My Analytics" tab
- ✅ Can view personal productivity score
- ✅ Can view personal task completion stats
- ✅ Can see 7-day productivity trend chart
- ❌ Cannot see "Overview" tab
- ❌ Cannot see "Team Analytics" tab
- ❌ API call to `/analytics/dashboard` returns 403 Forbidden
- ❌ API call to `/analytics/team` returns 403 Forbidden

**Test Steps**:
1. Login as employee
2. Navigate to Analytics page
3. Verify only 1 tab is visible
4. Check that personal stats are displayed
5. Open browser console and verify no 403 errors for `/analytics/user/me`

---

### Test 2: ADMIN Role Analytics Access
**Login as**: Any ADMIN user

**Expected Behavior**:
- ✅ Can see all 3 tabs: "Overview", "My Analytics", "Team Analytics"
- ✅ Can view dashboard statistics
- ✅ Can view team performance
- ✅ Can view individual employee analytics
- ✅ Can export tasks to Excel
- ❌ Cannot access super admin debug endpoints

**Test Steps**:
1. Login as admin
2. Navigate to Analytics page
3. Verify all 3 tabs are visible
4. Click "Overview" tab - should show dashboard stats
5. Click "My Analytics" tab - should show admin's personal stats
6. Click "Team Analytics" tab - should show team members table
7. Verify no console errors

---

### Test 3: SUPER_ADMIN Role Analytics Access
**Login as**: admin@system.com / Admin123!

**Expected Behavior**:
- ✅ Can see all 3 tabs: "Overview", "My Analytics", "Team Analytics"
- ✅ Can view dashboard statistics
- ✅ Can view team performance
- ✅ Can view any user's analytics
- ✅ Can export tasks to Excel
- ✅ Can access debug endpoints
- ✅ Can initialize analytics for all users

**Test Steps**:
1. Login as super admin
2. Navigate to Analytics page
3. Verify all 3 tabs are visible
4. Test all analytics features
5. Verify no console errors

---

## API Endpoint Testing

### Test with cURL or Postman

Replace `YOUR_TOKEN` with actual JWT token from login.

#### Test 1: Get Current User Analytics (All Roles)
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3001/api/analytics/user/me
```
**Expected**: 200 OK with analytics data

#### Test 2: Get Dashboard (Admin/Super Admin only)
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3001/api/analytics/dashboard
```
**Expected**: 
- Admin/Super Admin: 200 OK with dashboard data
- Employee: 403 Forbidden

#### Test 3: Get Team Analytics (Admin/Super Admin only)
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3001/api/analytics/team
```
**Expected**: 
- Admin/Super Admin: 200 OK with team data
- Employee: 403 Forbidden

#### Test 4: Get User Analytics by ID (Admin/Super Admin only)
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3001/api/analytics/user/USER_ID_HERE
```
**Expected**: 
- Admin/Super Admin: 200 OK with user data
- Employee: 403 Forbidden

---

## Common Issues & Solutions

### Issue 1: 500 Error on `/analytics/user/me`
**Cause**: User doesn't have analytics record
**Solution**: Analytics are auto-created now, but if issue persists, super admin can call:
```bash
curl -X POST -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3001/api/analytics/initialize
```

### Issue 2: Employee seeing admin tabs
**Cause**: Frontend role check not working
**Solution**: Check that `user.role` is correctly set in Redux store

### Issue 3: 403 Forbidden for valid admin
**Cause**: JWT token expired or role not properly set
**Solution**: Re-login to get fresh token

### Issue 4: Analytics showing 0 for all values
**Cause**: No tasks assigned/completed yet
**Solution**: Create and complete some tasks first

---

## Data Verification

### Productivity Score Formula
```
productivityScore = (completedTasks / totalAssigned) * 100
```

### Task Quality Formula
```
taskQuality = (onTimeCompleted / completedTasks) * 100
```

### Team Performance Formula
```
teamPerformance = average(all team members' productivityScores)
```

---

## Expected Data Flow

1. **User logs in** → JWT token stored in localStorage
2. **Navigate to Analytics** → Role check determines visible tabs
3. **Load analytics** → API call to appropriate endpoint
4. **Backend validates** → JwtAuthGuard + RolesGuard check permissions
5. **Fetch data** → Real-time calculation from database
6. **Return response** → Frontend displays charts and stats

---

## Success Criteria

✅ All 3 roles can access their permitted analytics
✅ No 403 errors for authorized requests
✅ No 500 errors (all users have analytics records)
✅ Analytics data is accurate and real-time
✅ Charts render without errors
✅ Role-based tabs display correctly
✅ Security guards prevent unauthorized access

---

## Production Testing

After deploying to production:

1. Test all 3 roles with real accounts
2. Verify analytics data matches database
3. Check browser console for errors
4. Test on different browsers
5. Test on mobile devices
6. Verify API response times are acceptable
7. Check that analytics update in real-time

---

## Monitoring

Monitor these metrics in production:

- API response times for analytics endpoints
- Error rates (should be 0%)
- 403 errors (indicates permission issues)
- 500 errors (indicates server issues)
- User engagement with analytics features

---

## Next Steps

1. ✅ Deploy fixed analytics controller
2. ✅ Test all roles locally
3. ✅ Verify no console errors
4. ✅ Deploy to production
5. ✅ Test in production environment
6. ✅ Monitor for issues

---

## Contact

If issues persist after following this guide, check:
- Backend logs for detailed error messages
- Browser console for frontend errors
- Network tab for API response details
- JWT token validity and expiration
