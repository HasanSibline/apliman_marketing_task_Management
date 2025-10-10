// Debug script to test CreateTaskModal
// Run this in browser console to check if modal works

console.log('🔍 Debugging CreateTaskModal...');

// Check if the modal trigger button exists
const createButton = document.querySelector('button[class*="gradient"]');
console.log('Create Task button found:', createButton);

// Check if modal is in DOM
const modal = document.querySelector('[class*="fixed inset-0 z-50"]');
console.log('Modal in DOM:', modal);

// Check if AI button exists in modal
const aiButton = document.querySelector('button[class*="Generate AI Content"]');
console.log('AI Generate button found:', aiButton);

// Try to click create task button if it exists
if (createButton) {
  console.log('🔄 Clicking Create Task button...');
  createButton.click();
  
  // Check again after click
  setTimeout(() => {
    const modalAfterClick = document.querySelector('[class*="fixed inset-0 z-50"]');
    console.log('Modal visible after click:', modalAfterClick);
    
    const aiButtonAfterClick = document.querySelector('span:contains("Generate AI Content")');
    console.log('AI button visible after modal open:', aiButtonAfterClick);
  }, 500);
} else {
  console.log('❌ Create Task button not found - check if you are logged in');
}

// Check authentication
const token = localStorage.getItem('token');
console.log('Auth token exists:', !!token);

if (!token) {
  console.log('🔑 No auth token found. Please login first with:');
  console.log('Email: admin@system.com');
  console.log('Password: Admin123!');
}
