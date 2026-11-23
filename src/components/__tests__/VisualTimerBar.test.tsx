import React from "react";
import renderer, { act } from "react-test-renderer";
import { Animated, AppState, View } from "react-native";
import { VisualTimerBar } from "@/components/VisualTimerBar";

let mockReduceMotion = false;
jest.mock("@/hooks/useReducedMotion", () => ({
  useReducedMotion: () => mockReduceMotion,
}));

describe("VisualTimerBar", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-01-01T10:00:00.000Z"));
    mockReduceMotion = false;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it("aguarda a medição da largura (onLayout) antes de iniciar Animated.timing com driver nativo", () => {
    const start = jest.fn();
    const stop = jest.fn();
    const timingSpy = jest
      .spyOn(Animated, "timing")
      .mockReturnValue({ start, stop } as unknown as Animated.CompositeAnimation);

    const now = Date.now();
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <VisualTimerBar
          startTime={now}
          endTime={now + 60_000}
          isPaused={false}
          pausedAt={null}
          color="#4A90E2"
          trackColor="#E0E0E0"
        />
      );
    });

    // Antes do onLayout, trackWidth é 0: não deve iniciar a animação nativa ainda
    expect(timingSpy).not.toHaveBeenCalled();

    const track = tree.root
      .findAllByType(View)
      .find((v) => typeof v.props.onLayout === "function")!;
    act(() => {
      track.props.onLayout({ nativeEvent: { layout: { width: 300 } } });
    });

    expect(timingSpy).toHaveBeenCalledTimes(1);
    expect(timingSpy).toHaveBeenCalledWith(
      expect.any(Animated.Value),
      expect.objectContaining({
        toValue: 0,
        duration: 60_000,
        useNativeDriver: true,
      })
    );
    expect(start).toHaveBeenCalledTimes(1);

    // Mesmo width no onLayout não reinicia a animação
    act(() => {
      track.props.onLayout({ nativeEvent: { layout: { width: 300 } } });
    });
    expect(timingSpy).toHaveBeenCalledTimes(1);

    act(() => tree.unmount());
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("ressincroniza a animação com o tempo real ao retornar do segundo plano", () => {
    const start = jest.fn();
    const stop = jest.fn();
    const timingSpy = jest
      .spyOn(Animated, "timing")
      .mockReturnValue({ start, stop } as unknown as Animated.CompositeAnimation);

    let appStateHandler: ((state: string) => void) | undefined;
    jest.spyOn(AppState, "addEventListener").mockImplementation((_type, handler) => {
      appStateHandler = handler as (state: string) => void;
      return { remove: jest.fn() };
    });

    const now = Date.now();
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <VisualTimerBar
          startTime={now}
          endTime={now + 60_000}
          isPaused={false}
          pausedAt={null}
          color="#4A90E2"
          trackColor="#E0E0E0"
        />
      );
    });

    const track = tree.root
      .findAllByType(View)
      .find((v) => typeof v.props.onLayout === "function")!;
    act(() => {
      track.props.onLayout({ nativeEvent: { layout: { width: 240 } } });
    });
    expect(timingSpy).toHaveBeenLastCalledWith(
      expect.any(Animated.Value),
      expect.objectContaining({ duration: 60_000 })
    );

    // Simula 25s em segundo plano e retorno ao estado "active"
    jest.setSystemTime(now + 25_000);
    act(() => {
      appStateHandler?.("active");
    });

    expect(timingSpy).toHaveBeenLastCalledWith(
      expect.any(Animated.Value),
      expect.objectContaining({ duration: 35_000 })
    );

    act(() => tree.unmount());
  });

  it("no modo reduceMotion atualiza por segundo e encerra o intervalo quando o tempo acaba", () => {
    mockReduceMotion = true;
    const timingSpy = jest.spyOn(Animated, "timing");
    const now = Date.now();

    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <VisualTimerBar
          startTime={now}
          endTime={now + 3_000}
          isPaused={false}
          pausedAt={null}
          color="#4A90E2"
          trackColor="#E0E0E0"
        />
      );
    });

    expect(timingSpy).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(1);

    act(() => {
      jest.advanceTimersByTime(3_000);
    });

    // O setInterval deve ser limpo automaticamente ao zerar
    expect(jest.getTimerCount()).toBe(0);

    act(() => tree.unmount());
  });
});

