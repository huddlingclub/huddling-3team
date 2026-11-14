import { useCallback, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { GifPicker } from './gif-picker'
import { JjalkkakSplash } from './jjalkkak-splash'
import './picker.css'

function App() {
  const [intro, setIntro] = useState(!window.gifHost)
  const finishIntro = useCallback(() => setIntro(false), [])
  return intro ? <JjalkkakSplash onDone={finishIntro} /> : <GifPicker />
}

createRoot(document.getElementById('root')!).render(<App />)
