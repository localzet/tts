import { useState, useEffect, useRef } from 'react'
import { Card, Stack, Textarea, Select, Button, Group, ActionIcon, Tooltip } from '@mantine/core'
import { IconPlayerPlay, IconPlayerStop } from '@tabler/icons-react'
import { notifications } from '@mantine/notifications'

interface Voice {
  ShortName: string
  Locale: string
  Gender: string
  FriendlyName: string
}

interface TTSFormProps {
  onGenerate: (text: string, voice: string) => void
  loading: boolean
}

function TTSForm({ onGenerate, loading }: TTSFormProps) {
  const [text, setText] = useState('')
  const [language, setLanguage] = useState('en')
  const [voice, setVoice] = useState('en-US-DavisNeural')
  const [voices, setVoices] = useState<Voice[]>([])
  const [loadingVoices, setLoadingVoices] = useState(true)
  const [previewing, setPreviewing] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    loadVoices(language)
  }, [language])

  const loadVoices = async (lang: string) => {
    setLoadingVoices(true)
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '/api'
      const response = await fetch(`${apiUrl}/voices?language=${lang}`)
      if (response.ok) {
        const data = await response.json()
        const maleVoices = data.voices
          .filter((v: Voice) => v.Gender === 'Male' && v.Locale.startsWith(lang))
          .sort((a: Voice, b: Voice) => a.Locale.localeCompare(b.Locale))
        setVoices(maleVoices)
        if (maleVoices.length > 0) {
          setVoice(maleVoices[0].ShortName)
        } else {
          // Fallback to any voice if no male voices found
          const allVoices = data.voices
            .filter((v: Voice) => v.Locale.startsWith(lang))
            .sort((a: Voice, b: Voice) => a.Locale.localeCompare(b.Locale))
          if (allVoices.length > 0) {
            setVoices(allVoices)
            setVoice(allVoices[0].ShortName)
          }
        }
      }
    } catch (error) {
      notifications.show({
        title: 'Warning',
        message: 'Failed to load voices, using default',
        color: 'yellow',
      })
    } finally {
      setLoadingVoices(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onGenerate(text, voice)
  }

  const handlePreview = async () => {
    if (previewing) {
      // Stop preview
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.currentTime = 0
      }
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl)
        setPreviewUrl(null)
      }
      setPreviewing(false)
      return
    }

    setPreviewing(true)
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '/api'
      const response = await fetch(`${apiUrl}/preview?voice=${encodeURIComponent(voice)}&language=${language}`)
      
      if (!response.ok) {
        throw new Error('Failed to generate preview')
      }

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      setPreviewUrl(url)

      // Play audio
      if (audioRef.current) {
        audioRef.current.src = url
        audioRef.current.play().catch((error) => {
          console.error('Error playing preview:', error)
          notifications.show({
            title: 'Error',
            message: 'Failed to play preview',
            color: 'red',
          })
          setPreviewing(false)
        })
      }
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: error instanceof Error ? error.message : 'Failed to generate preview',
        color: 'red',
      })
      setPreviewing(false)
    }
  }

  useEffect(() => {
    // Cleanup audio URL on unmount
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl)
      }
    }
  }, [previewUrl])

  useEffect(() => {
    // Stop preview when voice changes
    if (previewing && audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      setPreviewing(false)
    }
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
      setPreviewUrl(null)
    }
  }, [voice])

  const voiceOptions = voices.map((v) => ({
    value: v.ShortName,
    label: `${v.FriendlyName} (${v.Locale})`,
  }))

  const languageOptions = [
    { value: 'en', label: 'English' },
    { value: 'ru', label: 'Русский' },
  ]

  return (
    <Card withBorder p="xl">
      <form onSubmit={handleSubmit}>
        <Stack gap="md">
          <Select
            label="Language"
            placeholder="Select language"
            value={language}
            onChange={(value) => value && setLanguage(value)}
            data={languageOptions}
            disabled={loading || loadingVoices}
          />

          <Textarea
            label="Text to convert"
            placeholder="Enter your text here..."
            value={text}
            onChange={(e) => setText(e.currentTarget.value)}
            minRows={6}
            maxRows={12}
            required
            disabled={loading}
          />

          <div>
            <Group justify="space-between" mb="xs">
              <label style={{ fontSize: '14px', fontWeight: 500 }}>Voice</label>
              <Tooltip label={previewing ? "Stop preview" : "Preview voice"}>
                <ActionIcon
                  variant="light"
                  color={previewing ? "red" : "blue"}
                  onClick={handlePreview}
                  disabled={loading || loadingVoices || !voice}
                  loading={previewing}
                >
                  {previewing ? <IconPlayerStop size={16} /> : <IconPlayerPlay size={16} />}
                </ActionIcon>
              </Tooltip>
            </Group>
            <Select
              placeholder="Select a voice"
              value={voice}
              onChange={(value) => value && setVoice(value)}
              data={voiceOptions}
              disabled={loading || loadingVoices}
              searchable
            />
            <audio
              ref={audioRef}
              onEnded={() => {
                setPreviewing(false)
                if (previewUrl) {
                  URL.revokeObjectURL(previewUrl)
                  setPreviewUrl(null)
                }
              }}
              style={{ display: 'none' }}
            />
          </div>

          <Group justify="flex-end">
            <Button
              type="submit"
              loading={loading}
              disabled={!text.trim()}
              size="md"
            >
              Generate Audio
            </Button>
          </Group>
        </Stack>
      </form>
    </Card>
  )
}

export default TTSForm

