import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  Routine,
  RoutineStep,
  RoutineExecutionState,
  NovaRotinaInput,
  DEFAULT_ROUTINES,
} from "@/types/routine";
import { createId } from "@/lib/id";

export const ROUTINE_STORAGE_KEY = "routine-storage";
const DEFAULT_STEP_MINUTES = 5;

/**
 * Store Zustand — Rotinas Visuais Sequenciais
 *
 * Gerencia rotinas, execução e progresso com persistência local.
 * Na primeira abertura (sem dados persistidos), faz seed das rotinas iniciais
 * como rotinas comuns do usuário — todas podem ser editadas ou excluídas.
 */
interface RoutineStore {
  routines: Routine[];
  execution: RoutineExecutionState | null;

  // Ações para rotinas (CRUD)
  adicionarRotina: (input: NovaRotinaInput) => Routine;
  excluirRotina: (id: string) => void;
  addRoutine: (routine: Omit<Routine, "id" | "createdAt">) => Routine;
  updateRoutine: (id: string, updates: Partial<Routine>) => void;
  deleteRoutine: (id: string) => void;

  // Ações para execução
  startExecution: (routineId: string, replaceExisting?: boolean) => boolean;
  pauseExecution: () => void;
  resumeExecution: () => void;
  completeStep: () => void;
  extendTime: (minutes: number) => void;
  stopExecution: () => void;

  // Utilitários
  getRoutineById: (id: string) => Routine | undefined;
  restaurarRotinasPadrao: () => void;
  resetToDefaults: () => void;
}

function normalizeRoutine(routine: Routine): Routine {
  const copy: Routine = {
    ...routine,
    steps: Array.isArray(routine.steps)
      ? routine.steps.map((step) => ({ ...step }))
      : [],
  };
  delete copy.isDefault;
  return copy;
}

function defaultRoutines(): Routine[] {
  return DEFAULT_ROUTINES.map((routine) => normalizeRoutine(routine));
}

function normalizeStep(step: NovaRotinaInput["passos"][number]): RoutineStep {
  const minutes =
    typeof step.estimatedMinutes === "number" &&
    Number.isFinite(step.estimatedMinutes) &&
    step.estimatedMinutes > 0
      ? step.estimatedMinutes
      : DEFAULT_STEP_MINUTES;
  return {
    id: step.id ?? createId("step"),
    title: step.title.trim(),
    ...(step.description?.trim() ? { description: step.description.trim() } : {}),
    ...(step.icon?.trim() ? { icon: step.icon.trim() } : {}),
    estimatedMinutes: minutes,
  };
}

export const useRoutineStore = create<RoutineStore>()(
  persist(
    (set, get) => ({
      routines: defaultRoutines(),
      execution: null,

      // === ROTINAS ===
      adicionarRotina: (input) => {
        const newRoutine: Routine = {
          id: createId("routine"),
          name: input.titulo.trim(),
          ...(input.descricao?.trim() ? { description: input.descricao.trim() } : {}),
          ...(input.icone?.trim() ? { icon: input.icone.trim() } : {}),
          ...(input.horarioOuPeriodo?.trim()
            ? { schedule: input.horarioOuPeriodo.trim() }
            : {}),
          steps: Array.isArray(input.passos) ? input.passos.map(normalizeStep) : [],
          createdAt: Date.now(),
        };
        set((state) => ({
          routines: [...state.routines, newRoutine],
        }));
        return newRoutine;
      },

      excluirRotina: (id) => {
        set((state) => ({
          routines: state.routines.filter((r) => r.id !== id),
          // Encerra a execução caso a rotina removida estivesse em andamento
          execution: state.execution?.routineId === id ? null : state.execution,
        }));
      },

      addRoutine: (routine) => {
        const newRoutine = normalizeRoutine({
          ...routine,
          id: createId("routine"),
          createdAt: Date.now(),
        });
        set((state) => ({
          routines: [...state.routines, newRoutine],
        }));
        return newRoutine;
      },

      updateRoutine: (id, updates) => {
        set((state) => {
          const routine = state.routines.find((r) => r.id === id);
          if (!routine || updates.steps?.length === 0) return state;
          const cleanUpdates: Partial<Routine> = { ...updates };
          delete cleanUpdates.isDefault;
          let execution = state.execution;
          if (cleanUpdates.steps && execution?.routineId === id) {
            const currentStep = routine.steps[execution.currentStepIndex];
            const preservedIndex = cleanUpdates.steps.findIndex((step) => step.id === currentStep?.id);
            const currentStepIndex = preservedIndex >= 0
              ? preservedIndex
              : Math.min(execution.currentStepIndex, cleanUpdates.steps.length - 1);
            execution = { ...execution, currentStepIndex };
            // Se o passo atual foi removido, o substituto recebe seu próprio
            // prazo. Uma execução pausada continua pausada, sem consumir tempo.
            if (preservedIndex < 0 && execution.completedAt === null) {
              const now = Date.now();
              execution = {
                ...execution,
                stepStartedAt: now,
                stepEndsAt: now + cleanUpdates.steps[currentStepIndex].estimatedMinutes * 60_000,
                pausedAt: execution.isPaused ? now : null,
              };
            }
          }
          return {
            routines: state.routines.map((r) =>
              r.id === id ? normalizeRoutine({ ...r, ...cleanUpdates }) : r
            ),
            execution,
          };
        });
      },

      deleteRoutine: (id) => {
        get().excluirRotina(id);
      },

      // === EXECUÇÃO ===
      startExecution: (routineId, replaceExisting = false) => {
        const current = get().execution;
        if (current && current.completedAt === null && !replaceExisting) {
          return current.routineId === routineId;
        }
        const routine = get().routines.find((r) => r.id === routineId);
        if (!routine || routine.steps.length === 0) return false;

        const now = Date.now();
        const firstStep = routine.steps[0];

        set({
          execution: {
            routineId,
            currentStepIndex: 0,
            isPaused: false,
            completedAt: null,
            stepStartedAt: now,
            stepEndsAt: now + firstStep.estimatedMinutes * 60 * 1000,
            pausedAt: null,
          },
        });
        return true;
      },

      pauseExecution: () => {
        set((state) => {
          if (!state.execution || state.execution.isPaused || state.execution.completedAt !== null) return state;
          return {
            execution: {
              ...state.execution,
              isPaused: true,
              pausedAt: Date.now(),
            },
          };
        });
      },

      resumeExecution: () => {
        set((state) => {
          const execution = state.execution;
          if (!execution || !execution.isPaused || execution.completedAt !== null) return state;

          const now = Date.now();
          const routine = get().routines.find((r) => r.id === execution.routineId);
          if (!routine) return state;

          // Deslocamento do tempo pausado: devolve ao passo o tempo em que ele
          // ficou parado, para que a pausa não consuma a duração do passo.
          const pausedFor = execution.pausedAt ? Math.max(0, now - execution.pausedAt) : 0;

          return {
            execution: {
              ...execution,
              isPaused: false,
              pausedAt: null,
              stepStartedAt: execution.stepStartedAt
                ? execution.stepStartedAt + pausedFor
                : now,
              stepEndsAt: execution.stepEndsAt ? execution.stepEndsAt + pausedFor : now,
            },
          };
        });
      },

      completeStep: () => {
        set((state) => {
          if (!state.execution || state.execution.completedAt !== null) return state;

          const routine = get().routines.find(
            (r) => r.id === state.execution!.routineId
          );
          if (!routine) return state;

          const nextIndex = state.execution.currentStepIndex + 1;

          // Verifica se é o último passo
          if (nextIndex >= routine.steps.length) {
            return {
              execution: {
                ...state.execution,
                completedAt: Date.now(),
              },
            };
          }

          // Avança para o próximo passo
          const nextStep = routine.steps[nextIndex];

          const now = Date.now();

          return {
            execution: {
              ...state.execution,
              currentStepIndex: nextIndex,
              stepStartedAt: now,
              stepEndsAt: now + nextStep.estimatedMinutes * 60 * 1000,
              pausedAt: state.execution.isPaused ? now : null,
            },
          };
        });
      },

      extendTime: (minutes) => {
        if (!Number.isFinite(minutes) || minutes <= 0) return;
        set((state) => {
          if (!state.execution || state.execution.completedAt !== null) return state;

          // Durante a pausa o relógio de referência permanece congelado.
          // Se o prazo acabou, os minutos novos começam agora.
          const now = state.execution.pausedAt ?? Date.now();
          const newEndTime = Math.max(state.execution.stepEndsAt ?? now, now) + minutes * 60 * 1000;

          return {
            execution: {
              ...state.execution,
              stepEndsAt: newEndTime,
            },
          };
        });
      },

      stopExecution: () => {
        set({ execution: null });
      },

      // === UTILITÁRIOS ===
      getRoutineById: (id) => {
        return get().routines.find((r) => r.id === id);
      },

      restaurarRotinasPadrao: () => {
        set((state) => {
          const existingIds = new Set(state.routines.map((r) => r.id));
          const missingDefaults = defaultRoutines().filter(
            (routine) => !existingIds.has(routine.id)
          );
          if (missingDefaults.length === 0) return state;
          return {
            routines: [...state.routines, ...missingDefaults],
          };
        });
      },

      resetToDefaults: () => {
        set({
          routines: defaultRoutines(),
          execution: null,
        });
      },
    }),
    {
      name: ROUTINE_STORAGE_KEY,
      storage: createJSONStorage(() => AsyncStorage),
      version: 3,
      migrate: (persisted) => {
        const state = (persisted ?? {}) as Partial<RoutineStore>;
        // v2 -> v3: remove a flag `isDefault` das rotinas persistidas para que
        // todas se comportem como rotinas comuns do usuário.
        const routines = Array.isArray(state.routines)
          ? state.routines.map(normalizeRoutine)
          : defaultRoutines();

        // v1 -> v2: execuções em andamento não tinham `pausedAt`. Se o app foi
        // fechado durante uma pausa, o tempo pausado é irrecuperável, então a
        // execução é encerrada para não exibir um passo com tempo inconsistente.
        const execution =
          state.execution &&
          typeof state.execution.pausedAt !== "undefined" &&
          routines.some((r) => r.id === state.execution?.routineId)
            ? state.execution
            : null;

        return { routines, execution };
      },
      merge: (persistedState, currentState) => {
        const persisted = (persistedState ?? {}) as Partial<RoutineStore>;
        const routines = Array.isArray(persisted.routines)
          ? persisted.routines.map(normalizeRoutine)
          : currentState.routines;
        const execution =
          persisted.execution &&
          routines.some((r) => r.id === persisted.execution?.routineId)
            ? persisted.execution
            : null;

        return {
          ...currentState,
          routines,
          execution,
        };
      },
      onRehydrateStorage: () => (state, error) => {
        if (error || !state) return;
        // Na primeira abertura (quando não há dados salvos no armazenamento local),
        // persiste as rotinas iniciais (seed) como rotinas comuns do usuário.
        void AsyncStorage.getItem(ROUTINE_STORAGE_KEY).then((raw) => {
          if (raw === null) {
            useRoutineStore.setState((current) => ({
              routines: current.routines.map(normalizeRoutine),
            }));
          }
        });
      },
    }
  )
);
