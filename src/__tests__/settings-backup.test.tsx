import React from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Modal, Pressable } from "react-native";
import renderer, { act } from "react-test-renderer";
import SettingsScreen from "@/app/settings";
import { BackupError, collectBackupPayload } from "@/lib/backupService";
import { usePreferencesStore } from "@/stores/preferencesStore";
import { useThemeStore } from "@/stores/themeStore";

const mockExportBackup = jest.fn();
const mockPickAndValidateBackup = jest.fn();
const mockImportBackup = jest.fn();

jest.mock("@/lib/backupService", () => {
  const actual = jest.requireActual("@/lib/backupService");
  return {
    ...actual,
    exportBackup: (...args: unknown[]) => mockExportBackup(...args),
    pickAndValidateBackup: (...args: unknown[]) => mockPickAndValidateBackup(...args),
    importBackup: (...args: unknown[]) => mockImportBackup(...args),
  };
});

jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  Link: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock("react-native-safe-area-context", () => ({ SafeAreaView: "View" }));

let screen: renderer.ReactTestRenderer | undefined;

describe("SettingsScreen — Backup e Restauração", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    mockExportBackup.mockReset();
    mockPickAndValidateBackup.mockReset();
    mockImportBackup.mockReset();
    usePreferencesStore.setState({
      language: "pt-BR",
      hapticsEnabled: false,
      reduceMotion: false,
      showNextStep: false,
      routineStepSoundEnabled: false,
      keepScreenAwakeOnRoutine: false,
      lastBackupAt: null,
    });
    useThemeStore.setState({ mode: "dark" });
  });

  afterEach(() => {
    act(() => screen?.unmount());
    screen = undefined;
  });

  it("exibe estado inicial sem backup e atualiza feedback e data após exportar", async () => {
    const exportedAt = new Date(2026, 10, 24, 11, 45, 0).getTime();
    mockExportBackup.mockImplementation(async () => {
      usePreferencesStore.getState().setLastBackupAt(exportedAt);
      return {
        fileName: "tea-autonomia-backup-2026-11-24.json",
        method: "native-share",
        payload: collectBackupPayload(new Date(exportedAt)),
      };
    });

    act(() => {
      screen = renderer.create(<SettingsScreen />);
    });

    expect(JSON.stringify(screen!.toJSON())).toContain("Nenhum backup realizado ainda.");

    const exportBtn = screen!.root
      .findAllByType(Pressable)
      .find((p) => p.props.accessibilityLabel === "Fazer Backup (Salvar na Nuvem / Arquivo)")!;

    await act(async () => {
      await exportBtn.props.onPress();
    });

    expect(mockExportBackup).toHaveBeenCalledTimes(1);
    const json = JSON.stringify(screen!.toJSON());
    expect(json).toContain("Backup concluído com sucesso (tea-autonomia-backup-2026-11-24.json).");
    expect(json).toContain("Último backup:");
    expect(json).not.toContain("Nenhum backup realizado ainda.");
  });

  it("abre seletor, pede confirmação no modal e restaura o backup ao confirmar", async () => {
    const payload = collectBackupPayload();
    const rawJson = JSON.stringify(payload);
    mockPickAndValidateBackup.mockResolvedValueOnce({
      status: "selected",
      rawJson,
      fileName: "tea-autonomia-backup-2026-11-24.json",
      payload,
    });
    mockImportBackup.mockResolvedValueOnce({
      status: "restored",
      payload,
    });

    act(() => {
      screen = renderer.create(<SettingsScreen />);
    });

    const restoreBtn = screen!.root
      .findAllByType(Pressable)
      .find((p) => p.props.accessibilityLabel === "Restaurar Backup")!;

    await act(async () => {
      await restoreBtn.props.onPress();
    });

    // Modal deve estar visível e importBackup ainda NÃO foi chamado
    const visibleModals = screen!.root.findAllByType(Modal).filter((m) => m.props.visible);
    expect(visibleModals).toHaveLength(1);
    expect(mockImportBackup).not.toHaveBeenCalled();

    // Confirma substituição dos dados
    const confirmBtn = screen!.root
      .findAllByType(Pressable)
      .find((p) => p.props.accessibilityLabel === "Confirmar substituição dos dados")!;

    await act(async () => {
      await confirmBtn.props.onPress();
    });

    expect(mockImportBackup).toHaveBeenCalledWith(rawJson);
    expect(JSON.stringify(screen!.toJSON())).toContain("Backup restaurado com sucesso.");
  });

  it("não executa importBackup se o usuário cancelar no modal de confirmação", async () => {
    const payload = collectBackupPayload();
    mockPickAndValidateBackup.mockResolvedValueOnce({
      status: "selected",
      rawJson: JSON.stringify(payload),
      fileName: "backup.json",
      payload,
    });

    act(() => {
      screen = renderer.create(<SettingsScreen />);
    });

    const restoreBtn = screen!.root
      .findAllByType(Pressable)
      .find((p) => p.props.accessibilityLabel === "Restaurar Backup")!;

    await act(async () => {
      await restoreBtn.props.onPress();
    });

    const cancelBtn = screen!.root
      .findAllByType(Pressable)
      .find((p) => p.props.accessibilityLabel === "Cancelar")!;

    act(() => {
      cancelBtn.props.onPress();
    });

    expect(mockImportBackup).not.toHaveBeenCalled();
    const visibleModals = screen!.root.findAllByType(Modal).filter((m) => m.props.visible);
    expect(visibleModals).toHaveLength(0);
  });

  it("exibe mensagem de erro amigável quando o arquivo selecionado está corrompido", async () => {
    mockPickAndValidateBackup.mockRejectedValueOnce(
      new BackupError("INVALID_JSON", "O arquivo selecionado não é um JSON válido ou está corrompido.")
    );

    act(() => {
      screen = renderer.create(<SettingsScreen />);
    });

    const restoreBtn = screen!.root
      .findAllByType(Pressable)
      .find((p) => p.props.accessibilityLabel === "Restaurar Backup")!;

    await act(async () => {
      await restoreBtn.props.onPress();
    });

    expect(JSON.stringify(screen!.toJSON())).toContain(
      "O arquivo selecionado não é um JSON válido ou está corrompido."
    );
    expect(mockImportBackup).not.toHaveBeenCalled();
  });
});
