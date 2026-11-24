import { useCallback, useEffect, useRef } from "react";
import { Audio } from "expo-av";
import { usePreferencesStore } from "@/stores/preferencesStore";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const STEP_COMPLETE_SOUND = require("../../assets/sounds/step-complete.wav");

/**
 * Hook para reproduzir um som breve e suave ao término de cada etapa de rotina.
 *
 * Princípios:
 * - 100% offline (asset WAV local)
 * - Opcional e controlado pela preferência `routineStepSoundEnabled`
 * - Respeita modo silencioso no iOS e faz ducking suave no Android
 * - Falhas de áudio são silenciosas para nunca interromper a rotina
 */
export function useStepCompleteSound() {
  const soundRef = useRef<Audio.Sound | null>(null);
  const audioModeConfiguredRef = useRef(false);

  useEffect(() => {
    return () => {
      const sound = soundRef.current;
      soundRef.current = null;
      if (sound) {
        void sound.unloadAsync().catch(() => {});
      }
    };
  }, []);

  const playStepCompleteSound = useCallback(() => {
    if (!usePreferencesStore.getState().routineStepSoundEnabled) return;

    const play = async () => {
      if (!audioModeConfiguredRef.current) {
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: false,
          shouldDuckAndroid: true,
        });
        audioModeConfiguredRef.current = true;
      }

      if (!soundRef.current) {
        const { sound } = await Audio.Sound.createAsync(STEP_COMPLETE_SOUND, {
          shouldPlay: true,
          volume: 0.7,
        });
        soundRef.current = sound;
        return;
      }

      await soundRef.current.replayAsync();
    };

    void play().catch(() => {
      // Silenciosamente ignora falhas de áudio para não interromper a rotina
    });
  }, []);

  return { playStepCompleteSound };
}

