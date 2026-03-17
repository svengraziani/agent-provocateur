import { useVoiceInput } from './useVoiceInput'

interface Props {
  onTranscript: (text: string) => void
  /** Use 'construct' variant for the C&C battlefield theme, 'default' for regular modals */
  variant?: 'default' | 'construct'
  title?: string
}

export function VoiceButton({ onTranscript, variant = 'default', title }: Props) {
  const { isListening, isSupported, startListening, stopListening } = useVoiceInput(onTranscript)

  if (!isSupported) return null

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    if (isListening) {
      stopListening()
    } else {
      startListening()
    }
  }

  if (variant === 'construct') {
    return (
      <button
        type="button"
        className={`voice-btn voice-btn-construct${isListening ? ' recording' : ''}`}
        onClick={handleClick}
        title={title ?? (isListening ? 'Stop recording' : 'Voice input')}
      >
        {isListening ? '[ ◉ REC ]' : '[ ◎ VOICE ]'}
      </button>
    )
  }

  return (
    <button
      type="button"
      className={`voice-btn${isListening ? ' recording' : ''}`}
      onClick={handleClick}
      title={title ?? (isListening ? 'Stop recording' : 'Voice input')}
    >
      {isListening ? '◉' : '◎'}
    </button>
  )
}
