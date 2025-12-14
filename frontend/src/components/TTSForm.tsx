import { useState, useEffect, useRef } from 'react'
import { Card, Stack, Textarea, Select, Button, Group, ActionIcon, Tooltip, Collapse, Slider, Text } from '@mantine/core'
import { IconPlayerPlay, IconPlayerStop, IconSettings, IconChevronDown } from '@tabler/icons-react'
import { notifications } from '@mantine/notifications'

interface Voice {
  ShortName: string
  Locale: string
  Gender: string
  FriendlyName: string
}

interface TTSFormProps {
  onGenerate: (text: string, voice: string, rate: string, pitch: string, volume: string) => void
  loading: boolean
}

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) || '/api'

function TTSForm({ onGenerate, loading }: TTSFormProps) {
  const [text, setText] = useState('')
  const [language, setLanguage] = useState('en')
  const [voice, setVoice] = useState('')
  const [voices, setVoices] = useState<Voice[]>([])
  const [loadingVoices, setLoadingVoices] = useState(true)
  const [previewing, setPreviewing] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [settingsOpened, setSettingsOpened] = useState(false)
  const [rate, setRate] = useState(0) // -50 to +100
  const [pitch, setPitch] = useState(0) // -50 to +50
  const [volume, setVolume] = useState(0) // -50 to +100
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    loadVoices(language)
  }, [language])

  // Reset voice when language changes
  useEffect(() => {
    setVoice('')
  }, [language])

  const loadVoices = async (lang: string) => {
    setLoadingVoices(true)
    try {
      const response = await fetch(`${API_URL}/voices?language=${lang}`)
      if (response.ok) {
        const data = await response.json()
        // Show all voices, sorted by locale and gender
        const allVoices = data.voices
          .filter((v: Voice) => v.Locale.startsWith(lang))
          .sort((a: Voice, b: Voice) => {
            // Sort by locale first, then by gender
            const localeCompare = a.Locale.localeCompare(b.Locale)
            if (localeCompare !== 0) return localeCompare
            return a.Gender.localeCompare(b.Gender)
          })
        setVoices(allVoices)
        if (allVoices.length > 0 && !voice) {
          // Default: prefer neural voices, then by locale
          const neuralVoice = allVoices.find((v: Voice) => v.ShortName.includes('Neural'))
          setVoice(neuralVoice ? neuralVoice.ShortName : allVoices[0].ShortName)
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
    const rateStr = rate === 0 ? '+0%' : `${rate > 0 ? '+' : ''}${rate}%`
    const pitchStr = pitch === 0 ? '+0Hz' : `${pitch > 0 ? '+' : ''}${pitch}Hz`
    const volumeStr = volume === 0 ? '+0%' : `${volume > 0 ? '+' : ''}${volume}%`
    onGenerate(text, voice, rateStr, pitchStr, volumeStr)
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
      const rateStr = rate === 0 ? '+0%' : `${rate > 0 ? '+' : ''}${rate}%`
      const pitchStr = pitch === 0 ? '+0Hz' : `${pitch > 0 ? '+' : ''}${pitch}Hz`
      const volumeStr = volume === 0 ? '+0%' : `${volume > 0 ? '+' : ''}${volume}%`
      const response = await fetch(
        `${API_URL}/preview?voice=${encodeURIComponent(voice)}&language=${language}&rate=${encodeURIComponent(rateStr)}&pitch=${encodeURIComponent(pitchStr)}&volume=${encodeURIComponent(volumeStr)}`
      )
      
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
    label: `${v.FriendlyName} (${v.Locale}, ${v.Gender})`,
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

          <Button
            variant="subtle"
            leftSection={<IconSettings size={16} />}
            rightSection={<IconChevronDown size={16} style={{ transform: settingsOpened ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />}
            onClick={() => setSettingsOpened(!settingsOpened)}
            disabled={loading}
            fullWidth
          >
            Advanced Settings
          </Button>

          <Collapse in={settingsOpened} mt="md">
            <Card withBorder p="md" bg="dark.7">
              <Stack gap="md">
                <div>
                  <Group justify="space-between" mb="xs">
                    <Text size="sm" fw={500}>Speech Rate</Text>
                    <Text size="sm" c="dimmed">{rate === 0 ? 'Normal' : `${rate > 0 ? '+' : ''}${rate}%`}</Text>
                  </Group>
                  <Slider
                    value={rate}
                    onChange={setRate}
                    min={-50}
                    max={100}
                    step={5}
                    marks={[
                      { value: -50, label: '-50%' },
                      { value: 0, label: '0%' },
                      { value: 50, label: '+50%' },
                      { value: 100, label: '+100%' },
                    ]}
                  />
                </div>

                <div>
                  <Group justify="space-between" mb="xs">
                    <Text size="sm" fw={500}>Voice Pitch</Text>
                    <Text size="sm" c="dimmed">{pitch === 0 ? 'Normal' : `${pitch > 0 ? '+' : ''}${pitch}Hz`}</Text>
                  </Group>
                  <Slider
                    value={pitch}
                    onChange={setPitch}
                    min={-50}
                    max={50}
                    step={5}
                    marks={[
                      { value: -50, label: '-50Hz' },
                      { value: 0, label: '0Hz' },
                      { value: 50, label: '+50Hz' },
                    ]}
                  />
                </div>

                <div>
                  <Group justify="space-between" mb="xs">
                    <Text size="sm" fw={500}>Volume</Text>
                    <Text size="sm" c="dimmed">{volume === 0 ? 'Normal' : `${volume > 0 ? '+' : ''}${volume}%`}</Text>
                  </Group>
                  <Slider
                    value={volume}
                    onChange={setVolume}
                    min={-50}
                    max={100}
                    step={5}
                    marks={[
                      { value: -50, label: '-50%' },
                      { value: 0, label: '0%' },
                      { value: 50, label: '+50%' },
                      { value: 100, label: '+100%' },
                    ]}
                  />
                </div>
              </Stack>
            </Card>
          </Collapse>

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

