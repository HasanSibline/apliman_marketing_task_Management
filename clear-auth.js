// Clear authentication tokens and redirect to login
// Run this in your browser console to fix authentication issues

console.log('🔄 Clearing authentication data...');

// Clear all localStorage items related to auth
localStorage.removeItem('token');
localStorage.removeItem('user');
localStorage.removeItem('persist:auth');
localStorage.removeItem('persist:root');

// Clear all sessionStorage
sessionStorage.clear();

// Clear any auth cookies
document.cookie.split(";").forEach(function(c) { 
  document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/"); 
});

console.log('✅ Authentication data cleared!');
console.log('🔄 Reloading page...');

// Reload the page
window.location.reload();
