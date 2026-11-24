import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, StyleSheet, Animated, Easing, AppState } from "react-native";

import { useReducedMotion } from "@/hooks/useReducedMotion";

interface VisualTimerBarProps {
  startTime: number;
  endTime: number;
  isPaused: boolean;
  pausedAt?: number | null;
  color: string;
  trackColor: string;
}

/**
 * VisualTimerBar — Timer visual de preenchimento suave
 *
 * Em vez de contagem regressiva numérica, mostra uma barra que esvazia
 * progressivamente com animação suave. Sem números estressantes.
 *
 * A barra sempre parte da fração de tempo restante real. Isso faz a pausa
 * congelar a barra no ponto em que ela estava (sem voltar a 100%) e a
 * retomada continuar de onde parou, em vez de reiniciar o passo.
 *
 * A animação usa `transform` (scaleX + translateX) no driver nativo: antes
 * animava `width` no driver JS, que consome CPU por frame durante o passo
 * inteiro (até 30 min). Como o scale tem origem no centro, o translateX
 * compensa para a barra encher sempre da esquerda.
 */
export function VisualTimerBar({
  startTime,
  endTime,
  isPaused,
  pausedAt,
  color,
  trackColor,
}: VisualTimerBarProps) {
  const reduceMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(1)).current;
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);
  const [trackWidth, setTrackWidth] = useState(0);
  const [appActiveTick, setAppActiveTick] = useState(0);

  // Ressincroniza a barra ao retornar do segundo plano para refletir o tempo real.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        setAppActiveTick((tick) => tick + 1);
      }
    });
    return () => subscription?.remove();
  }, []);

  useEffect(() => {
    const totalDuration = endTime - startTime;
    if (totalDuration <= 0) {
      progress.setValue(0);
      return;
    }

    const now = isPaused ? pausedAt ?? Date.now() : Date.now();
    const remaining = Math.max(0, endTime - now);
    const fromValue = Math.min(Math.max(remaining / totalDuration, 0), 1);

    // Parte do que realmente resta do passo — evita salto visual ao retomar.
    progress.setValue(fromValue);

    if (isPaused || remaining === 0) return;

    if (reduceMotion) {
      const timer = setInterval(() => {
        const nextRemaining = Math.max(0, endTime - Date.now());
        progress.setValue(Math.min(1, nextRemaining / totalDuration));
        if (nextRemaining === 0) {
          clearInterval(timer);
        }
      }, 1000);
      return () => clearInterval(timer);
    }

    // Aguarda a medição da largura da barra antes de iniciar a animação nativa
    // para que `translateX` já esteja conectado com o deslocamento real.
    if (trackWidth <= 0) return;

    const animation = Animated.timing(progress, {
      toValue: 0,
      duration: remaining,
      easing: Easing.linear,
      useNativeDriver: true,
    });
    animationRef.current = animation;
    animation.start();

    return () => {
      animation.stop();
      if (animationRef.current === animation) {
        animationRef.current = null;
      }
    };
  }, [
    startTime,
    endTime,
    isPaused,
    pausedAt,
    progress,
    reduceMotion,
    trackWidth,
    appActiveTick,
  ]);

  // progress=1 → scaleX 1, translateX 0 (barra cheia, esquerda em 0);
  // progress=0 → scaleX 0, translateX -W/2 (zero largura, esquerda em 0).
  const translateX = useMemo(
    () =>
      progress.interpolate({
        inputRange: [0, 1],
        outputRange: [-trackWidth / 2, 0],
      }),
    [progress, trackWidth]
  );

  return (
    <View style={styles.container}>
      <View
        style={[styles.track, { backgroundColor: trackColor }]}
        onLayout={(event) => {
          const width = event.nativeEvent.layout.width;
          setTrackWidth((prev) => (prev === width ? prev : width));
        }}
      >
        <Animated.View
          style={[
            styles.fill,
            {
              backgroundColor: color,
              transform: [{ translateX }, { scaleX: progress }],
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    paddingHorizontal: 24,
  },
  track: {
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
  },
  fill: {
    width: "100%",
    height: "100%",
    borderRadius: 4,
  },
});
