import React from 'react'
import ReactDOM from 'react-dom/client'
import { Provider } from 'react-redux'
import { PersistGate } from 'redux-persist/integration/react'
import { BrowserRouter, UNSAFE_UNSAFE_useScrollRestoration } from 'react-router-dom'
import { UNSAFE_enhanceManualRouteObjects } from '@remix-run/router'

// Enable future flags
UNSAFE_UNSAFE_useScrollRestoration()
UNSAFE_enhanceManualRouteObjects()
import { Toaster } from 'react-hot-toast'
import { store, persistor } from '@/store'
import App from './App'
import LoadingScreen from '@/components/ui/LoadingScreen'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Provider store={store}>
      <PersistGate loading={<LoadingScreen />} persistor={persistor}>
        <BrowserRouter>
          <App />
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: {
                background: '#363636',
                color: '#fff',
              },
              success: {
                duration: 3000,
                iconTheme: {
                  primary: '#22c55e',
                  secondary: '#fff',
                },
              },
              error: {
                duration: 5000,
                iconTheme: {
                  primary: '#ef4444',
                  secondary: '#fff',
                },
              },
            }}
          />
        </BrowserRouter>
      </PersistGate>
    </Provider>
  </React.StrictMode>,
)
