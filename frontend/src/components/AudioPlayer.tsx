import { useRef, useEffect } from 'react'
import { Group, Button, Slider } from '@mantine/core'
import { IconPlayerPlay, IconPlayerPause, IconVolume } from '@tabler/icons-react'
import { useState } from 'react'

interface AudioPlayerProps {
  src: string
}

function AudioPlayer({ src }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const updateTime = () => setCurrentTime(audio.currentTime)
    const updateDuration = () => setDuration(audio.duration)
    const handleEnded = () => setPlaying(false)

    audio.addEventListener('timeupdate', updateTime)
    audio.addEventListener('loadedmetadata', updateDuration)
    audio.addEventListener('ended', handleEnded)

    return () => {
      audio.removeEventListener('timeupdate', updateTime)
      audio.removeEventListener('loadedmetadata', updateDuration)
      audio.removeEventListener('ended', handleEnded)
    }
  }, [])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    if (playing) {
      audio.play()
    } else {
      audio.pause()
    }
  }, [playing])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.volume = volume
  }, [volume])

  const togglePlay = () => {
    setPlaying(!playing)
  }

  const handleSeek = (value: number) => {
    const audio = audioRef.current
    if (audio) {
      audio.currentTime = value
      setCurrentTime(value)
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div>
      <audio ref={audioRef} src={src} preload="metadata" />
      
      <Group gap="md" align="center" mb="md">
        <Button
          variant="light"
          onClick={togglePlay}
          leftSection={playing ? <IconPlayerPause size={16} /> : <IconPlayerPlay size={16} />}
        >
          {playing ? 'Pause' : 'Play'}
        </Button>

        <div style={{ flex: 1 }}>
          <Slider
            value={currentTime}
            max={duration || 100}
            onChange={handleSeek}
            label={formatTime(currentTime)}
            disabled={!duration}
          />
        </div>

        <Group gap="xs" style={{ width: 120 }}>
          <IconVolume size={16} />
          <Slider
            value={volume}
            onChange={setVolume}
            min={0}
            max={1}
            step={0.1}
            style={{ flex: 1 }}
          />
        </Group>

        <span style={{ minWidth: 50, textAlign: 'right' }}>
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      </Group>
    </div>
  )
}

export default AudioPlayer

