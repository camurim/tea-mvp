import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRoutineStore, ROUTINE_STORAGE_KEY } from "@/stores/routineStore";

describe("routineStore", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    useRoutineStore.getState().resetToDefaults();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("startExecution inicia no primeiro passo e retorna true", () => {
    const ok = useRoutineStore.getState().startExecution("default-work");
    expect(ok).toBe(true);

    const execution = useRoutineStore.getState().execution;
    expect(execution).not.toBeNull();
    expect(execution?.routineId).toBe("default-work");
    expect(execution?.currentStepIndex).toBe(0);
    expect(execution?.isPaused).toBe(false);
    expect(execution?.completedAt).toBeNull();
    expect(execution?.stepEndsAt).toBeGreaterThan(Date.now());
  });

  it("startExecution retorna false para rotina inexistente", () => {
    expect(useRoutineStore.getState().startExecution("nope")).toBe(false);
    expect(useRoutineStore.getState().execution).toBeNull();
  });

  it("startExecution retorna false para rotina sem passos", () => {
    useRoutineStore.getState().addRoutine({
      name: "Vazia",
      steps: [],
      isDefault: false,
    });
    const empty = useRoutineStore
      .getState()
      .routines.find((r) => r.name === "Vazia");
    expect(empty).toBeDefined();

    expect(useRoutineStore.getState().startExecution(empty!.id)).toBe(false);
    expect(useRoutineStore.getState().execution).toBeNull();
  });

  it("reabrir a mesma rotina preserva passo, pausa e prazo", () => {
    useRoutineStore.getState().startExecution("default-work");
    useRoutineStore.getState().completeStep();
    useRoutineStore.getState().pauseExecution();
    const execution = useRoutineStore.getState().execution;
    expect(useRoutineStore.getState().startExecution("default-work")).toBe(true);
    expect(useRoutineStore.getState().execution).toBe(execution);
  });

  it("substituir uma rotina exige autorização explícita", () => {
    useRoutineStore.getState().startExecution("default-work");
    const execution = useRoutineStore.getState().execution;
    expect(useRoutineStore.getState().startExecution("default-leaving")).toBe(false);
    expect(useRoutineStore.getState().execution).toBe(execution);
    expect(useRoutineStore.getState().startExecution("default-leaving", true)).toBe(true);
    expect(useRoutineStore.getState().execution?.routineId).toBe("default-leaving");
  });

  it("completeStep avança os passos e conclui no último", () => {
    useRoutineStore.getState().startExecution("default-work"); // 3 passos

    useRoutineStore.getState().completeStep();
    expect(useRoutineStore.getState().execution?.currentStepIndex).toBe(1);

    useRoutineStore.getState().completeStep();
    expect(useRoutineStore.getState().execution?.currentStepIndex).toBe(2);

    useRoutineStore.getState().completeStep();
    const execution = useRoutineStore.getState().execution;
    expect(execution?.currentStepIndex).toBe(2);
    expect(execution?.completedAt).not.toBeNull();
  });

  it("pausa congela e retoma devolve ao passo o tempo pausado", () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-01-01T10:00:00.000Z"));
    useRoutineStore.getState().startExecution("default-work");
    const before = useRoutineStore.getState().execution!.stepEndsAt!;

    useRoutineStore.getState().pauseExecution();
    expect(useRoutineStore.getState().execution?.isPaused).toBe(true);

    jest.setSystemTime(new Date("2026-01-01T10:05:00.000Z")); // 5 min pausado
    useRoutineStore.getState().resumeExecution();

    const execution = useRoutineStore.getState().execution!;
    expect(execution.isPaused).toBe(false);
    expect(execution.pausedAt).toBeNull();
    expect(execution.stepEndsAt).toBe(before + 5 * 60 * 1000);
  });

  it("deleteRoutine encerra a execução da rotina excluída", () => {
    useRoutineStore.getState().addRoutine({
      name: "Personalizada",
      steps: [{ id: "s1", title: "Passo", estimatedMinutes: 1 }],
      isDefault: false,
    });
    const custom = useRoutineStore
      .getState()
      .routines.find((r) => r.name === "Personalizada");

    useRoutineStore.getState().startExecution(custom!.id);
    expect(useRoutineStore.getState().execution).not.toBeNull();

    useRoutineStore.getState().deleteRoutine(custom!.id);
    expect(useRoutineStore.getState().execution).toBeNull();
    expect(
      useRoutineStore.getState().routines.find((r) => r.id === custom!.id)
    ).toBeUndefined();
  });

  it("avançar durante a pausa preserva a duração completa do próximo passo", () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-01-01T10:00:00Z"));
    useRoutineStore.getState().startExecution("default-work");
    useRoutineStore.getState().pauseExecution();
    jest.setSystemTime(new Date("2026-01-01T10:10:00Z"));
    useRoutineStore.getState().completeStep();
    expect(useRoutineStore.getState().execution?.pausedAt).toBe(Date.now());
    jest.setSystemTime(new Date("2026-01-01T10:12:00Z"));
    useRoutineStore.getState().resumeExecution();
    expect(useRoutineStore.getState().execution?.stepEndsAt).toBe(Date.now() + 3 * 60_000);
  });

  it("estender um passo vencido adiciona minutos a partir de agora", () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-01-01T10:00:00Z"));
    useRoutineStore.getState().startExecution("default-work");
    jest.setSystemTime(new Date("2026-01-01T10:20:00Z"));
    useRoutineStore.getState().extendTime(5);
    expect(useRoutineStore.getState().execution?.stepEndsAt).toBe(Date.now() + 5 * 60_000);
  });

  it("estender durante a pausa não conta o tempo transcorrido pausado", () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-01-01T10:00:00Z"));
    useRoutineStore.getState().startExecution("default-work");
    useRoutineStore.getState().pauseExecution();
    jest.setSystemTime(new Date("2026-01-01T10:20:00Z"));
    useRoutineStore.getState().extendTime(5);
    useRoutineStore.getState().resumeExecution();
    expect(useRoutineStore.getState().execution?.stepEndsAt).toBe(Date.now() + 10 * 60_000);
  });

  it("ações não alteram uma execução já concluída", () => {
    useRoutineStore.getState().startExecution("default-work");
    for (let i = 0; i < 3; i++) useRoutineStore.getState().completeStep();
    const completed = useRoutineStore.getState().execution;
    useRoutineStore.getState().completeStep();
    useRoutineStore.getState().pauseExecution();
    useRoutineStore.getState().extendTime(5);
    expect(useRoutineStore.getState().execution).toBe(completed);
  });

  it("ignora extensões inválidas", () => {
    useRoutineStore.getState().startExecution("default-work");
    const execution = useRoutineStore.getState().execution;
    for (const minutes of [0, -5, NaN, Infinity]) {
      useRoutineStore.getState().extendTime(minutes);
    }
    expect(useRoutineStore.getState().execution).toBe(execution);
  });

  it("rotinas iniciais (seed) podem ser excluídas como qualquer rotina comum", () => {
    const initial = useRoutineStore.getState().routines.find((r) => r.id === "default-work");
    expect(initial).toBeDefined();
    expect(initial?.isDefault).toBeUndefined();

    useRoutineStore.getState().excluirRotina("default-work");
    expect(
      useRoutineStore.getState().routines.find((r) => r.id === "default-work")
    ).toBeUndefined();
  });

  it("adicionarRotina cria rotina com título, ícone, horário/período e passos", () => {
    const created = useRoutineStore.getState().adicionarRotina({
      titulo: "Rotina Matinal",
      descricao: "Começar o dia com calma",
      icone: "☀️",
      horarioOuPeriodo: "07:30",
      passos: [
        { title: "Beber água", estimatedMinutes: 2 },
        { title: "Tomar café da manhã", description: "Sem pressa" },
      ],
    });

    expect(created.id).toMatch(/^routine-/);
    expect(created.name).toBe("Rotina Matinal");
    expect(created.description).toBe("Começar o dia com calma");
    expect(created.icon).toBe("☀️");
    expect(created.schedule).toBe("07:30");
    expect(created.isDefault).toBeUndefined();
    expect(created.steps).toHaveLength(2);
    expect(created.steps[0].estimatedMinutes).toBe(2);
    expect(created.steps[1].estimatedMinutes).toBe(5);
    expect(created.steps[1].id).toMatch(/^step-/);

    const saved = useRoutineStore.getState().getRoutineById(created.id);
    expect(saved).toEqual(created);
  });

  it("permite excluir todas as rotinas (estado vazio []) sem quebrar e mantém vazio após reidratação", async () => {
    const ids = useRoutineStore.getState().routines.map((r) => r.id);
    useRoutineStore.getState().startExecution(ids[0]);

    for (const id of ids) {
      useRoutineStore.getState().excluirRotina(id);
    }

    expect(useRoutineStore.getState().routines).toEqual([]);
    expect(useRoutineStore.getState().execution).toBeNull();
    expect(useRoutineStore.getState().getRoutineById(ids[0])).toBeUndefined();
    expect(useRoutineStore.getState().startExecution(ids[0])).toBe(false);

    // Simula reabertura do app: não deve restaurar rotinas built-in
    await useRoutineStore.persist.rehydrate();
    expect(useRoutineStore.getState().routines).toEqual([]);
    expect(useRoutineStore.getState().execution).toBeNull();

    // Adicionar rotina a partir do estado vazio funciona normalmente
    const nova = useRoutineStore.getState().adicionarRotina({
      titulo: "Primeira rotina nova",
      icone: "🧘",
      horarioOuPeriodo: "Noite",
      passos: [{ title: "Respirar fundo", estimatedMinutes: 3 }],
    });
    expect(useRoutineStore.getState().routines).toHaveLength(1);
    expect(useRoutineStore.getState().startExecution(nova.id)).toBe(true);
  });

  it("na primeira abertura sem dados salvos, persiste o seed como rotinas comuns do usuário", async () => {
    await AsyncStorage.clear();
    expect(await AsyncStorage.getItem(ROUTINE_STORAGE_KEY)).toBeNull();

    await useRoutineStore.persist.rehydrate();
    // Aguarda o callback assíncrono de onRehydrateStorage
    await new Promise((resolve) => setTimeout(resolve, 0));

    const raw = await AsyncStorage.getItem(ROUTINE_STORAGE_KEY);
    expect(raw).not.toBeNull();
    const persisted = JSON.parse(raw!);
    expect(persisted.state.routines).toHaveLength(3);
    expect(persisted.state.routines.every((r: { isDefault?: boolean }) => r.isDefault === undefined)).toBe(true);
  });

  it("migra dados v2 removendo isDefault das rotinas salvas", async () => {
    await AsyncStorage.setItem(
      ROUTINE_STORAGE_KEY,
      JSON.stringify({
        version: 2,
        state: {
          routines: [
            {
              id: "default-work",
              name: "Início de Expediente",
              isDefault: true,
              createdAt: 1000,
              steps: [{ id: "work-1", title: "Organizar mesa", estimatedMinutes: 5 }],
            },
          ],
          execution: null,
        },
      })
    );

    await useRoutineStore.persist.rehydrate();
    const routines = useRoutineStore.getState().routines;
    expect(routines).toHaveLength(1);
    expect(routines[0].isDefault).toBeUndefined();

    useRoutineStore.getState().excluirRotina("default-work");
    expect(useRoutineStore.getState().routines).toEqual([]);
  });

  it("restaurarRotinasPadrao readiciona apenas as rotinas padrão ausentes sem duplicar nem apagar as personalizadas", () => {
    const custom = useRoutineStore.getState().adicionarRotina({
      titulo: "Minha Rotina",
      passos: [{ title: "Ler", estimatedMinutes: 10 }],
    });
    useRoutineStore.getState().excluirRotina("default-work");
    expect(useRoutineStore.getState().routines.map((r) => r.id)).not.toContain("default-work");

    // Restaura apenas a que faltava, mantendo a personalizada e sem duplicar as outras
    useRoutineStore.getState().restaurarRotinasPadrao();
    const ids = useRoutineStore.getState().routines.map((r) => r.id);
    expect(ids).toContain("default-work");
    expect(ids).toContain("default-debrief");
    expect(ids).toContain("default-leaving");
    expect(ids).toContain(custom.id);
    expect(ids).toHaveLength(4);

    // Chamar novamente não cria duplicatas
    useRoutineStore.getState().restaurarRotinasPadrao();
    expect(useRoutineStore.getState().routines).toHaveLength(4);
  });
  describe("edição da rotina em execução", () => {
    function startCustom() {
      const store = useRoutineStore.getState();
      store.addRoutine({ name: "Edição", isDefault: false, steps: [1, 2, 3].map((i) => ({ id: `edit-${i}`, title: `Passo ${i}`, estimatedMinutes: i })) });
      const routine = useRoutineStore.getState().routines.slice(-1)[0];
      store.startExecution(routine.id);
      store.completeStep();
      store.completeStep();
      return routine;
    }

    it("preserva o passo atual e seu prazo quando ele muda de posição", () => {
      const routine = startCustom();
      const before = useRoutineStore.getState().execution!;
      useRoutineStore.getState().updateRoutine(routine.id, { steps: [routine.steps[2], routine.steps[0]] });
      const after = useRoutineStore.getState().execution!;
      expect(after.currentStepIndex).toBe(0);
      expect(after.stepEndsAt).toBe(before.stepEndsAt);
      expect(after.stepStartedAt).toBe(before.stepStartedAt);
    });

    it("seleciona um passo válido e reinicia seu prazo se o atual for removido", () => {
      const routine = startCustom();
      useRoutineStore.getState().updateRoutine(routine.id, { steps: [routine.steps[0]] });
      const after = useRoutineStore.getState().execution!;
      expect(after.currentStepIndex).toBe(0);
      expect(after.stepEndsAt! - after.stepStartedAt!).toBe(60_000);
    });

    it("preserva a pausa e o tempo do passo substituto ao retomar", () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date("2026-01-01T10:00:00Z"));
      const routine = startCustom();
      useRoutineStore.getState().pauseExecution();
      jest.setSystemTime(new Date("2026-01-01T10:05:00Z"));
      useRoutineStore.getState().updateRoutine(routine.id, { steps: [routine.steps[0]] });
      expect(useRoutineStore.getState().execution?.isPaused).toBe(true);
      jest.setSystemTime(new Date("2026-01-01T10:15:00Z"));
      useRoutineStore.getState().resumeExecution();
      expect(useRoutineStore.getState().execution?.stepEndsAt).toBe(Date.now() + 60_000);
    });

    it("não aceita uma edição sem passos", () => {
      const routine = startCustom();
      const before = useRoutineStore.getState();
      before.updateRoutine(routine.id, { steps: [] });
      expect(useRoutineStore.getState().execution).toBe(before.execution);
      expect(useRoutineStore.getState().getRoutineById(routine.id)).toBe(routine);
    });
  });

});
