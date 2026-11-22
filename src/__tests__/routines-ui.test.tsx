import React from "react";
import renderer, { act } from "react-test-renderer";
import { Modal, Pressable, TextInput } from "react-native";
import RoutinesListScreen from "@/app/routines";
import NovaRotinaScreen from "@/app/routines/new";
import { useRoutineStore } from "@/stores/routineStore";

const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: mockPush, back: mockBack }),
  useLocalSearchParams: () => ({}),
}));
jest.mock("react-native-safe-area-context", () => ({ SafeAreaView: "SafeAreaView" }));

beforeEach(() => {
  useRoutineStore.getState().resetToDefaults();
  mockPush.mockClear();
  mockBack.mockClear();
});

describe("RoutinesListScreen", () => {
  it("exibe botão '+ Nova Rotina' e permite excluir rotinas iniciais com modal de confirmação", () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<RoutinesListScreen />);
    });

    const newButton = tree.root
      .findAllByType(Pressable)
      .find((p) => p.props.accessibilityLabel === "Criar nova rotina");
    expect(newButton).toBeDefined();
    act(() => newButton!.props.onPress());
    expect(mockPush).toHaveBeenCalledWith("/routines/new");

    const firstRoutine = useRoutineStore.getState().routines[0];
    const deleteButton = tree.root
      .findAllByType(Pressable)
      .find((p) => p.props.accessibilityLabel === `Excluir rotina ${firstRoutine.name}`);
    expect(deleteButton).toBeDefined();

    // Abre o modal de confirmação
    act(() => deleteButton!.props.onPress());
    const visibleModals = tree.root.findAllByType(Modal).filter((m) => m.props.visible);
    expect(visibleModals).toHaveLength(1);

    // Cancelar não exclui
    const cancelBtn = tree.root
      .findAllByType(Pressable)
      .find((p) => p.props.accessibilityLabel === "Cancelar")!;
    act(() => cancelBtn.props.onPress());
    expect(useRoutineStore.getState().getRoutineById(firstRoutine.id)).toBeDefined();

    // Abrir novamente e confirmar exclusão
    act(() => deleteButton!.props.onPress());
    const confirmBtn = tree.root
      .findAllByType(Pressable)
      .find((p) => p.props.accessibilityLabel === "Confirmar exclusão")!;
    act(() => confirmBtn.props.onPress());
    expect(useRoutineStore.getState().getRoutineById(firstRoutine.id)).toBeUndefined();

    act(() => tree.unmount());
  });

  it("botão 'Restaurar rotinas padrão' readiciona padrões ausentes após confirmação sem remover personalizadas", () => {
    const custom = useRoutineStore.getState().adicionarRotina({
      titulo: "Rotina do Usuário",
      passos: [{ title: "Alongar", estimatedMinutes: 5 }],
    });
    useRoutineStore.getState().excluirRotina("default-work");
    expect(useRoutineStore.getState().getRoutineById("default-work")).toBeUndefined();

    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<RoutinesListScreen />);
    });

    const restoreBtn = tree.root
      .findAllByType(Pressable)
      .find((p) => p.props.accessibilityLabel === "Restaurar rotinas padrão")!;
    act(() => restoreBtn.props.onPress());

    const confirmRestoreBtn = tree.root
      .findAllByType(Pressable)
      .find((p) => p.props.accessibilityLabel === "Confirmar restauração")!;
    act(() => confirmRestoreBtn.props.onPress());

    expect(useRoutineStore.getState().getRoutineById("default-work")).toBeDefined();
    expect(useRoutineStore.getState().getRoutineById(custom.id)).toBeDefined();
    expect(useRoutineStore.getState().routines).toHaveLength(4);

    act(() => tree.unmount());
  });

  it("exibe estado vazio amigável quando todas as rotinas são excluídas", () => {
    const ids = useRoutineStore.getState().routines.map((r) => r.id);
    for (const id of ids) {
      useRoutineStore.getState().excluirRotina(id);
    }

    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<RoutinesListScreen />);
    });

    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain("Você ainda não tem rotinas");
    expect(json).toContain("Criar primeira rotina");

    const emptyCta = tree.root
      .findAllByType(Pressable)
      .find((p) => p.props.accessibilityLabel === "Criar primeira rotina")!;
    act(() => emptyCta.props.onPress());
    expect(mockPush).toHaveBeenCalledWith("/routines/new");

    act(() => tree.unmount());
  });
});

describe("NovaRotinaScreen", () => {
  it("cria rotina com nome, ícone, período e passos reordenados via adicionarRotina", () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<NovaRotinaScreen />);
    });

    const nameInput = tree.root
      .findAllByType(TextInput)
      .find((i) => i.props.accessibilityLabel === "Nome da rotina")!;
    act(() => nameInput.props.onChangeText("Hora de Dormir"));

    const iconChip = tree.root
      .findAllByType(Pressable)
      .find((p) => p.props.accessibilityLabel === "Ícone 🌙")!;
    act(() => iconChip.props.onPress());

    const periodChip = tree.root
      .findAllByType(Pressable)
      .find((p) => p.props.accessibilityLabel === "Noite")!;
    act(() => periodChip.props.onPress());

    // Preenche passo 1
    const step1Input = tree.root
      .findAllByType(TextInput)
      .find((i) => i.props.accessibilityLabel === "Título do passo 1")!;
    act(() => step1Input.props.onChangeText("Deitar na cama"));

    // Adiciona passo 2
    const addStepBtn = tree.root
      .findAllByType(Pressable)
      .find((p) => p.props.accessibilityLabel === "Adicionar passo à rotina")!;
    act(() => addStepBtn.props.onPress());

    const step2Input = tree.root
      .findAllByType(TextInput)
      .find((i) => i.props.accessibilityLabel === "Título do passo 2")!;
    act(() => step2Input.props.onChangeText("Escovar os dentes"));

    // Escolhe ícone para o passo 2
    const step2Icon = tree.root
      .findAllByType(Pressable)
      .find((p) => p.props.accessibilityLabel === "Ícone 💧 para o passo 2")!;
    act(() => step2Icon.props.onPress());

    // Move o passo 2 para cima (vira o passo 1)
    const moveUpBtn = tree.root
      .findAllByType(Pressable)
      .find((p) => p.props.accessibilityLabel === "Mover passo 2 para cima")!;
    act(() => moveUpBtn.props.onPress());

    // Salva
    const saveBtn = tree.root
      .findAllByType(Pressable)
      .find((p) => p.props.accessibilityLabel === "Criar rotina")!;
    act(() => saveBtn.props.onPress());

    expect(mockBack).toHaveBeenCalled();

    const created = useRoutineStore
      .getState()
      .routines.find((r) => r.name === "Hora de Dormir");
    expect(created).toBeDefined();
    expect(created?.icon).toBe("🌙");
    expect(created?.schedule).toBe("Noite");
    expect(created?.steps.map((s) => s.title)).toEqual([
      "Escovar os dentes",
      "Deitar na cama",
    ]);
    expect(created?.steps[0].icon).toBe("💧");

    act(() => tree.unmount());
  });
});
