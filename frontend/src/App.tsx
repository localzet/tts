import { useState } from 'react'
import { Page, PageHeader } from '@localzet/ui-kit'
import { IconMicrophone } from '@tabler/icons-react'
import { Container, Stack, Button, Group, Card, Text, Loader, Anchor } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import TTSForm from './components/TTSForm'
import AudioPlayer from './components/AudioPlayer'

interface TTSResponse {
  file_id: string
  download_url: string
  expires_at: string
}

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) || '/api'

function App() {
  const [loading, setLoading] = useState(false)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [fileId, setFileId] = useState<string | null>(null)

  const handleGenerate = async (text: string, voice: string, rate: string, pitch: string, volume: string) => {
    if (!text.trim()) {
      notifications.show({
        title: 'Error',
        message: 'Please enter some text',
        color: 'red',
      })
      return
    }

    setLoading(true)
    setAudioUrl(null)
    setFileId(null)

    try {
      const response = await fetch(`${API_URL}/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          voice,
          rate,
          pitch,
          volume,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.detail || 'Failed to generate audio')
      }

      const data: TTSResponse = await response.json()
      setFileId(data.file_id)
      setAudioUrl(`${API_URL}/download/${data.file_id}`)

      notifications.show({
        title: 'Success',
        message: 'Audio generated successfully!',
        color: 'green',
      })
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: error instanceof Error ? error.message : 'Failed to generate audio',
        color: 'red',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Page title="Text to Speech" appName="TTS Service">
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: `
          radial-gradient(circle at 20% 30%, rgba(139, 92, 246, 0.15) 0%, transparent 50%),
          radial-gradient(circle at 80% 70%, rgba(6, 182, 212, 0.15) 0%, transparent 50%),
          radial-gradient(circle at 50% 50%, rgba(99, 102, 241, 0.1) 0%, transparent 70%),
          linear-gradient(135deg, #0f0c29 0%, #1a1a3a 50%, #0f172a 100%)
        `,
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Atom pattern background */}
        <svg
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            opacity: 0.15,
            pointerEvents: 'none',
          }}
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <pattern id="atom-pattern" x="0" y="0" width="200" height="200" patternUnits="userSpaceOnUse">
              <circle cx="100" cy="100" r="2" fill="rgba(139, 92, 246, 0.3)" />
              <circle cx="100" cy="100" r="40" fill="none" stroke="rgba(6, 182, 212, 0.2)" strokeWidth="1" />
              <circle cx="100" cy="100" r="60" fill="none" stroke="rgba(139, 92, 246, 0.2)" strokeWidth="1" />
              <ellipse cx="100" cy="100" rx="40" ry="20" fill="none" stroke="rgba(99, 102, 241, 0.2)" strokeWidth="1" transform="rotate(45 100 100)" />
              <ellipse cx="100" cy="100" rx="40" ry="20" fill="none" stroke="rgba(6, 182, 212, 0.2)" strokeWidth="1" transform="rotate(-45 100 100)" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#atom-pattern)" />
        </svg>

        {/* Grid overlay */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundImage: `
            repeating-linear-gradient(0deg, transparent, transparent 40px, rgba(139, 92, 246, 0.05) 40px, rgba(139, 92, 246, 0.05) 41px),
            repeating-linear-gradient(90deg, transparent, transparent 40px, rgba(6, 182, 212, 0.05) 40px, rgba(6, 182, 212, 0.05) 41px)
          `,
          pointerEvents: 'none',
        }} />

        <Container size="md" py="xl" style={{ position: 'relative', zIndex: 1, width: '100%' }}>
          <Stack gap="xl">
            <PageHeader
              icon={<IconMicrophone size={32} />}
              title="Text to Speech"
              description="Convert your text into natural-sounding speech"
            />

            <TTSForm onGenerate={handleGenerate} loading={loading} />

            {loading && (
              <Card withBorder p="xl">
                <Group justify="center">
                  <Loader size="lg" />
                  <Text>Generating audio...</Text>
                </Group>
              </Card>
            )}

            {audioUrl && fileId && !loading && (
              <Card withBorder p="xl">
                <Stack gap="md">
                  <Text size="lg" fw={500}>Generated Audio</Text>
                  <AudioPlayer src={audioUrl} />
                  <Group>
                    <Anchor href={audioUrl} download={`${fileId}.mp3`}>
                      <Button variant="light">Download MP3</Button>
                    </Anchor>
                  </Group>
                </Stack>
              </Card>
            )}

            <Text size="sm" c="dimmed" ta="center" mt="auto" pt="xl" pb="md">
              © {new Date().getFullYear()} Zorin Projects. All rights reserved.
            </Text>
          </Stack>
        </Container>
      </div>
    </Page>
  )
}

export default App

