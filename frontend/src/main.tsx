import React from 'react'
import ReactDOM from 'react-dom/client'
import { MantineProvider, DirectionProvider } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import { NavigationProgress } from '@mantine/nprogress'

// Import Mantine styles
import '@mantine/core/styles.css'
import '@mantine/notifications/styles.css'
import '@mantine/nprogress/styles.css'

// Import UI-Kit styles
import '@localzet/ui-kit/styles'

// Import theme
import { theme } from '@localzet/ui-kit'

import App from './App'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <DirectionProvider>
      <MantineProvider theme={theme} defaultColorScheme="dark">
        <Notifications position="top-right" />
        <NavigationProgress />
        <App />
      </MantineProvider>
    </DirectionProvider>
  </React.StrictMode>
)

