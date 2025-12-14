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

  const handleGenerate = async (text: string, voice: string) => {
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
      <Container size="md" py="xl">
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
        </Stack>
      </Container>
    </Page>
  )
}

export default App

