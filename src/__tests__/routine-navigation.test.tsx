import React from "react";
import renderer, { act } from "react-test-renderer";
import { AppState, Pressable } from "react-native";
import RoutineExecutionScreen from "../app/routine-execution";
import { useRoutineStore } from "../stores/routineStore";
import { usePreferencesStore } from "../stores/preferencesStore";

const mockActivateKeepAwakeAsync = jest.fn((..._args: unknown[]) => Promise.resolve());
const mockDeactivateKeepAwake = jest.fn((..._args: unknown[]) => Promise.resolve());
jest.mock("expo-keep-awake", () => ({
  activateKeepAwakeAsync: (...args: unknown[]) => mockActivateKeepAwakeAsync(...args),
  deactivateKeepAwake: (...args: unknown[]) => mockDeactivateKeepAwake(...args),
}));

const mockReplayAsync = jest.fn(() => Promise.resolve());
const mockUnloadAsync = jest.fn(() => Promise.resolve());
const mockCreateAsync = jest.fn((..._args: unknown[]) =>
  Promise.resolve({ sound: { replayAsync: mockReplayAsync, unloadAsync: mockUnloadAsync } })
);
const mockSetAudioModeAsync = jest.fn((..._args: unknown[]) => Promise.resolve());
jest.mock("expo-av", () => ({
  Audio: {
    setAudioModeAsync: (...args: unknown[]) => mockSetAudioModeAsync(...args),
    Sound: {
      createAsync: (...args: unknown[]) => mockCreateAsync(...args),
    },
  },
}));

let mockHistory: string[];
const mockBack = jest.fn(() => { mockHistory.pop(); });
const mockReplace = jest.fn((route: string) => {
  mockHistory[mockHistory.length - 1] = route;
});
const mockRouter = {
  back: mockBack,
  replace: mockReplace,
  canGoBack: () => mockHistory.length > 1,
};
jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  useRouter: () => mockRouter,
}));
jest.mock("../hooks/useThemeMode", () => ({
  useThemeMode: () => ({ colors: {
    background: "white", surface: "white", surfaceAlt: "gray",
    text: "black", textSecondary: "gray", accent: "blue",
  } }),
}));
jest.mock("../hooks/useFontScale", () => ({
  useFontScale: () => ({ fontSize: (size: number) => size }),
}));
jest.mock("../components/VisualTimerBar", () => ({ VisualTimerBar: () => null }));
jest.mock("react-native-safe-area-context", () => ({ SafeAreaView: "SafeAreaView" }));

beforeEach(() => {
  jest.useFakeTimers();
  mockHistory = ["/", "/routines"];
  mockBack.mockClear();
  mockReplace.mockClear();
  mockActivateKeepAwakeAsync.mockClear();
  mockDeactivateKeepAwake.mockClear();
  mockSetAudioModeAsync.mockClear();
  mockCreateAsync.mockClear();
  mockReplayAsync.mockClear();
  mockUnloadAsync.mockClear();
  useRoutineStore.getState().resetToDefaults();
  usePreferencesStore.setState({
    routineStepSoundEnabled: false,
    keepScreenAwakeOnRoutine: false,
  });
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

function readyToFinish() {
  const routine = useRoutineStore.getState().routines[0];
  useRoutineStore.getState().startExecution(routine.id);
  for (let i = 1; i < routine.steps.length; i++) {
    useRoutineStore.getState().completeStep();
  }
}

function renderExecution() {
  let tree!: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(<RoutineExecutionScreen />); });
  return tree;
}

function finish(tree: renderer.ReactTestRenderer) {
  const button = tree.root.findAllByType(Pressable).find(
    p => p.props.accessibilityLabel === "Concluir Rotina"
  )!;
  act(() => button.props.onPress());
}

test("repeated completions return to the original list without accumulating copies", () => {
  for (let run = 0; run < 3; run++) {
    readyToFinish();
    mockHistory.push("/routine-execution");
    const tree = renderExecution();
    finish(tree);
    act(() => jest.advanceTimersByTime(1499));
    expect(mockHistory).toEqual(["/", "/routines", "/routine-execution"]);
    act(() => jest.advanceTimersByTime(1));
    expect(mockHistory).toEqual(["/", "/routines"]);
    expect(useRoutineStore.getState().execution).toBeNull();
    act(() => tree.unmount());
  }
  expect(mockReplace).not.toHaveBeenCalled();
  expect(mockBack).toHaveBeenCalledTimes(3);
  mockRouter.back();
  expect(mockHistory).toEqual(["/"]);
});

test("a restored completed run without history replaces itself with the list", () => {
  readyToFinish();
  useRoutineStore.getState().completeStep();
  mockHistory = ["/routine-execution"];
  const tree = renderExecution();
  act(() => jest.advanceTimersByTime(1500));
  expect(mockHistory).toEqual(["/routines"]);
  expect(mockReplace).toHaveBeenCalledWith("/routines");
  expect(mockBack).not.toHaveBeenCalled();
  expect(useRoutineStore.getState().execution).toBeNull();
  act(() => tree.unmount());
});

test("leaving the completion screen cancels its delayed navigation", () => {
  readyToFinish();
  const tree = renderExecution();
  finish(tree);
  act(() => tree.unmount());
  act(() => jest.advanceTimersByTime(2000));
  expect(mockBack).not.toHaveBeenCalled();
  expect(mockReplace).not.toHaveBeenCalled();
});

test("an empty restored execution has a safe route back without history", () => {
  mockHistory = ["/routine-execution"];
  const tree = renderExecution();
  const button = tree.root.findAllByType(Pressable).find(
    p => p.props.accessibilityLabel === "Voltar para Minhas Rotinas"
  )!;
  act(() => button.props.onPress());
  expect(mockHistory).toEqual(["/routines"]);
  expect(mockBack).not.toHaveBeenCalled();
  act(() => tree.unmount());
});

 test.each([false, true])("Próximo Passo advances the rendered routine while paused=%s", (paused) => {
  const routine = useRoutineStore.getState().routines[0];
  useRoutineStore.getState().startExecution(routine.id);
  if (paused) useRoutineStore.getState().pauseExecution();
  const tree = renderExecution();
  const button = tree.root.findAllByType(Pressable).find(p => p.props.accessibilityLabel === "Próximo Passo")!;
  act(() => button.props.onPress());
  expect(useRoutineStore.getState().execution?.currentStepIndex).toBe(1);
  expect(useRoutineStore.getState().execution?.isPaused).toBe(paused);
  expect(JSON.stringify(tree.toJSON())).toContain(routine.steps[1].title);
  act(() => tree.unmount());
});

test("avança automaticamente para a próxima tarefa e conclui a rotina quando os timers se esgotam", () => {
  jest.setSystemTime(new Date("2026-01-01T10:00:00.000Z"));
  const routine = useRoutineStore.getState().routines[0]; // passos: 5min, 3min, 15min
  useRoutineStore.getState().startExecution(routine.id);
  mockHistory.push("/routine-execution");
  const tree = renderExecution();

  // Ainda no passo 1 faltando 1ms
  act(() => jest.advanceTimersByTime(5 * 60_000 - 1));
  expect(useRoutineStore.getState().execution?.currentStepIndex).toBe(0);

  // Esgota passo 1 -> avança automaticamente para o passo 2
  act(() => jest.advanceTimersByTime(1));
  expect(useRoutineStore.getState().execution?.currentStepIndex).toBe(1);
  expect(JSON.stringify(tree.toJSON())).toContain(routine.steps[1].title);

  // Esgota passo 2 (3 min) -> avança automaticamente para o passo 3
  act(() => jest.advanceTimersByTime(3 * 60_000));
  expect(useRoutineStore.getState().execution?.currentStepIndex).toBe(2);
  expect(JSON.stringify(tree.toJSON())).toContain(routine.steps[2].title);

  // Esgota passo 3 (15 min) -> conclui a rotina automaticamente
  act(() => jest.advanceTimersByTime(15 * 60_000));
  expect(useRoutineStore.getState().execution?.completedAt).not.toBeNull();
  expect(JSON.stringify(tree.toJSON())).toContain("Rotina concluída. Bom trabalho.");

  // Após 1500ms retorna para a lista de rotinas
  act(() => jest.advanceTimersByTime(1500));
  expect(useRoutineStore.getState().execution).toBeNull();
  expect(mockBack).toHaveBeenCalledTimes(1);

  act(() => tree.unmount());
});

test("não avança automaticamente enquanto pausado e retoma com o tempo restante", () => {
  jest.setSystemTime(new Date("2026-01-01T10:00:00.000Z"));
  const routine = useRoutineStore.getState().routines[0]; // passo 1: 5 min
  useRoutineStore.getState().startExecution(routine.id);
  const tree = renderExecution();

  // Passam 2 minutos, depois pausa
  act(() => jest.advanceTimersByTime(2 * 60_000));
  const pauseBtn = tree.root
    .findAllByType(Pressable)
    .find((p) => p.props.accessibilityLabel === "Pausar rotina")!;
  act(() => pauseBtn.props.onPress());

  // Passam 10 minutos pausado: não deve avançar
  act(() => jest.advanceTimersByTime(10 * 60_000));
  expect(useRoutineStore.getState().execution?.currentStepIndex).toBe(0);

  // Retoma: devem restar 3 minutos
  const resumeBtn = tree.root
    .findAllByType(Pressable)
    .find((p) => p.props.accessibilityLabel === "Continuar rotina")!;
  act(() => resumeBtn.props.onPress());

  act(() => jest.advanceTimersByTime(3 * 60_000 - 1));
  expect(useRoutineStore.getState().execution?.currentStepIndex).toBe(0);

  act(() => jest.advanceTimersByTime(1));
  expect(useRoutineStore.getState().execution?.currentStepIndex).toBe(1);

  act(() => tree.unmount());
});

test("adicionar +5 min adia o avanço automático do passo", () => {
  jest.setSystemTime(new Date("2026-01-01T10:00:00.000Z"));
  const routine = useRoutineStore.getState().routines[0]; // passo 1: 5 min
  useRoutineStore.getState().startExecution(routine.id);
  const tree = renderExecution();

  const extendBtn = tree.root
    .findAllByType(Pressable)
    .find((p) => p.props.accessibilityLabel === "Adicionar 5 minutos")!;
  act(() => extendBtn.props.onPress());

  // Passam os 5 minutos originais: ainda deve estar no passo 1
  act(() => jest.advanceTimersByTime(5 * 60_000));
  expect(useRoutineStore.getState().execution?.currentStepIndex).toBe(0);

  // Passam os 5 minutos extras: agora avança para o passo 2
  act(() => jest.advanceTimersByTime(5 * 60_000));
  expect(useRoutineStore.getState().execution?.currentStepIndex).toBe(1);

  act(() => tree.unmount());
});

test("avança automaticamente ao retornar do segundo plano se o prazo já venceu", () => {
  jest.setSystemTime(new Date("2026-01-01T10:00:00.000Z"));
  let appStateHandler: ((state: string) => void) | undefined;
  const appStateSpy = jest
    .spyOn(AppState, "addEventListener")
    .mockImplementation((_type, handler) => {
      appStateHandler = handler as (state: string) => void;
      return { remove: jest.fn() };
    });

  const routine = useRoutineStore.getState().routines[0]; // passo 1: 5 min
  useRoutineStore.getState().startExecution(routine.id);
  const tree = renderExecution();

  // Simula o relógio avançando 6 min sem disparar o setTimeout (app suspenso em background)
  jest.setSystemTime(new Date("2026-01-01T10:06:00.000Z"));
  act(() => {
    appStateHandler?.("active");
  });

  expect(useRoutineStore.getState().execution?.currentStepIndex).toBe(1);

  act(() => tree.unmount());
  appStateSpy.mockRestore();
});

test("emite som breve ao término de cada etapa somente quando a opção está ativada", async () => {
  jest.setSystemTime(new Date("2026-01-01T10:00:00.000Z"));
  const routine = useRoutineStore.getState().routines[0]; // passos: 5min, 3min, 15min
  useRoutineStore.getState().startExecution(routine.id);

  // Desativado por padrão: não toca ao avançar
  const treeOff = renderExecution();
  act(() => jest.advanceTimersByTime(5 * 60_000));
  await act(async () => { await Promise.resolve(); });
  expect(mockCreateAsync).not.toHaveBeenCalled();
  expect(mockReplayAsync).not.toHaveBeenCalled();
  act(() => treeOff.unmount());

  // Ativado: toca na 1ª etapa (createAsync com shouldPlay: true) e reaproveita na 2ª (replayAsync)
  useRoutineStore.getState().resetToDefaults();
  usePreferencesStore.getState().setRoutineStepSoundEnabled(true);
  useRoutineStore.getState().startExecution(routine.id);
  const treeOn = renderExecution();

  act(() => jest.advanceTimersByTime(5 * 60_000));
  await act(async () => { await Promise.resolve(); });
  expect(mockSetAudioModeAsync).toHaveBeenCalledTimes(1);
  expect(mockCreateAsync).toHaveBeenCalledTimes(1);

  // Avança manualmente a 2ª etapa -> reutiliza o som carregado via replayAsync
  const nextBtn = treeOn.root
    .findAllByType(Pressable)
    .find((p) => p.props.accessibilityLabel === "Próximo Passo")!;
  act(() => nextBtn.props.onPress());
  await act(async () => { await Promise.resolve(); });
  expect(mockReplayAsync).toHaveBeenCalledTimes(1);

  act(() => treeOn.unmount());
  expect(mockUnloadAsync).toHaveBeenCalledTimes(1);
});

test("mantém a tela ligada durante a rotina somente quando a opção está ativada", () => {
  const routine = useRoutineStore.getState().routines[0];
  useRoutineStore.getState().startExecution(routine.id);

  // Desativado por padrão
  const treeOff = renderExecution();
  expect(mockActivateKeepAwakeAsync).not.toHaveBeenCalled();
  act(() => treeOff.unmount());

  // Ativado: liga ao iniciar e desliga ao concluir a rotina
  usePreferencesStore.getState().setKeepScreenAwakeOnRoutine(true);
  readyToFinish();
  const treeOn = renderExecution();
  expect(mockActivateKeepAwakeAsync).toHaveBeenCalledWith("routine-execution");
  expect(mockDeactivateKeepAwake).not.toHaveBeenCalled();

  finish(treeOn);
  expect(mockDeactivateKeepAwake).toHaveBeenCalledWith("routine-execution");

  act(() => treeOn.unmount());
});
