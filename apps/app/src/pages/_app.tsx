import { createTheme, CssBaseline, ThemeProvider } from '@mui/material'
import { AppCacheProvider } from '@mui/material-nextjs/v13-pagesRouter'
import { type AppProps } from 'next/app'
import Head from 'next/head'
import { type FC } from 'react'

const theme = createTheme()

const App: FC<AppProps> = props => {
  const { Component, pageProps } = props
  return (
    <AppCacheProvider {...props}>
      <Head>
        <title>Geovanni</title>
      </Head>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Component {...pageProps} />
      </ThemeProvider>
    </AppCacheProvider>
  )
}

export default App
