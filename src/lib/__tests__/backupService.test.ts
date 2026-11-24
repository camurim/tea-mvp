import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";

import {
  BACKUP_SCHEMA_VERSION,
  BACKUP_STORAGE_KEYS,
  BackupError,
  backupService,
  buildBackupFileName,
  collectBackupPayload,
  exportBackup,
  importBackup,
  parseAndValidateBackup,
  restoreBackupPayload,
} from "@/lib/backupService";
import { useCheckInStore } from "@/stores/checkInStore";
import { useCopingCardsStore } from "@/stores/copingCardsStore";
import { useCrisisStore } from "@/stores/crisisStore";
import { usePreferencesStore } from "@/stores/preferencesStore";
import { useRoutineStore } from "@/stores/routineStore";
import { useThemeStore } from "@/stores/themeStore";

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { version: "1.0.19" } },
}));

jest.mock("expo-file-system", () => ({
  cacheDirectory: "file:///cache/",
  documentDirectory: "file:///docs/",
  EncodingType: { UTF8: "utf8" },
  writeAsStringAsync: jest.fn(() => Promise.resolve()),
  readAsStringAsync: jest.fn(() => Promise.resolve("")),
}));

jest.mock("expo-sharing", () => ({
  isAvailableAsync: jest.fn(() => Promise.resolve(true)),
  shareAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock("expo-document-picker", () => ({
  getDocumentAsync: jest.fn(() => Promise.resolve({ canceled: true, assets: null })),
}));

const originalPlatformOS = Platform.OS;

function setPlatformOS(os: typeof Platform.OS) {
  Object.defineProperty(Platform, "OS", {
    configurable: true,
    value: os,
  });
}

async function resetAllStores() {
  await AsyncStorage.clear();
  useRoutineStore.getState().resetToDefaults();
  usePreferencesStore.setState({
    language: "pt-BR",
    hapticsEnabled: false,
    reduceMotion: false,
    showNextStep: false,
    routineStepSoundEnabled: false,
    keepScreenAwakeOnRoutine: false,
  });
  useThemeStore.setState({ mode: "dark" });
  useCheckInStore.getState().clearHistory();
  useCopingCardsStore.getState().resetToDefaults();
  useCrisisStore.getState().resetToDefaults();
}

describe("backupService", () => {
  beforeEach(async () => {
    setPlatformOS("android");
    jest.clearAllMocks();
    await resetAllStores();
  });

  afterAll(() => {
    setPlatformOS(originalPlatformOS);
  });

  it("gera o nome do arquivo com a data no formato AAAA-MM-DD", () => {
    const date = new Date(2026, 10, 5, 14, 30, 0); // 05/11/2026 local
    expect(buildBackupFileName(date)).toBe("tea-autonomia-backup-2026-11-05.json");
  });

  it("exportBackup no mobile grava o JSON com metadados e abre o compartilhamento nativo", async () => {
    const now = new Date(2026, 10, 24, 11, 20, 0);
    usePreferencesStore.getState().setLanguage("en-US");
    usePreferencesStore.getState().setRoutineStepSoundEnabled(true);
    useThemeStore.getState().setMode("light");

    const result = await exportBackup(now);

    expect(result.fileName).toBe("tea-autonomia-backup-2026-11-24.json");
    expect(result.method).toBe("native-share");
    expect(result.fileUri).toBe("file:///cache/tea-autonomia-backup-2026-11-24.json");
    expect(result.payload.appVersion).toBe("1.0.19");
    expect(result.payload.exportDate).toBe(now.toISOString());
    expect(result.payload.schemaVersion).toBe(BACKUP_SCHEMA_VERSION);
    expect(result.payload.data[BACKUP_STORAGE_KEYS.preferences].state.language).toBe("en-US");
    expect(result.payload.data[BACKUP_STORAGE_KEYS.preferences].state.routineStepSoundEnabled).toBe(true);
    expect(result.payload.data[BACKUP_STORAGE_KEYS.theme].state.mode).toBe("light");

    expect(FileSystem.writeAsStringAsync).toHaveBeenCalledWith(
      "file:///cache/tea-autonomia-backup-2026-11-24.json",
      expect.any(String),
      { encoding: FileSystem.EncodingType.UTF8 }
    );
    expect(Sharing.shareAsync).toHaveBeenCalledWith(
      "file:///cache/tea-autonomia-backup-2026-11-24.json",
      expect.objectContaining({
        mimeType: "application/json",
        dialogTitle: "tea-autonomia-backup-2026-11-24.json",
      })
    );
  });

  it("exportBackup na Web usa Web Share API com arquivos quando suportado", async () => {
    setPlatformOS("web");
    const mockShare = jest.fn(() => Promise.resolve());
    const mockCanShare = jest.fn(() => true);
    const originalNavigator = globalThis.navigator;
    const originalFile = globalThis.File;

    class MockFile {
      name: string;
      type: string;
      parts: unknown[];
      constructor(parts: unknown[], name: string, options?: { type?: string }) {
        this.parts = parts;
        this.name = name;
        this.type = options?.type ?? "";
      }
    }

    Object.defineProperty(globalThis, "File", { configurable: true, value: MockFile });
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { share: mockShare, canShare: mockCanShare },
    });

    try {
      const result = await exportBackup(new Date(2026, 10, 24, 12, 0, 0));
      expect(result.method).toBe("web-share");
      expect(mockCanShare).toHaveBeenCalledTimes(1);
      expect(mockShare).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "tea-autonomia-backup-2026-11-24.json",
          files: [expect.objectContaining({ name: "tea-autonomia-backup-2026-11-24.json" })],
        })
      );
    } finally {
      Object.defineProperty(globalThis, "navigator", { configurable: true, value: originalNavigator });
      Object.defineProperty(globalThis, "File", { configurable: true, value: originalFile });
    }
  });

  it("exportBackup na Web faz download direto quando Web Share API não está disponível", async () => {
    setPlatformOS("web");
    const originalNavigator = globalThis.navigator;
    const originalDocument = globalThis.document;
    const originalBlob = globalThis.Blob;
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;

    const click = jest.fn();
    const appendChild = jest.fn();
    const removeChild = jest.fn();
    const fakeLink = { href: "", download: "", style: { display: "" }, click };

    Object.defineProperty(globalThis, "navigator", { configurable: true, value: {} });
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        createElement: jest.fn(() => fakeLink),
        body: { appendChild, removeChild },
      },
    });
    if (typeof globalThis.Blob === "undefined") {
      Object.defineProperty(globalThis, "Blob", {
        configurable: true,
        value: class MockBlob {
          constructor(public parts: unknown[], public options?: { type?: string }) {}
        },
      });
    }
    URL.createObjectURL = jest.fn(() => "blob:backup-url");
    URL.revokeObjectURL = jest.fn();

    try {
      const result = await exportBackup(new Date(2026, 10, 24, 12, 0, 0));
      expect(result.method).toBe("web-download");
      expect(fakeLink.href).toBe("blob:backup-url");
      expect(fakeLink.download).toBe("tea-autonomia-backup-2026-11-24.json");
      expect(click).toHaveBeenCalledTimes(1);
      expect(removeChild).toHaveBeenCalledWith(fakeLink);
      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:backup-url");
    } finally {
      Object.defineProperty(globalThis, "navigator", { configurable: true, value: originalNavigator });
      Object.defineProperty(globalThis, "document", { configurable: true, value: originalDocument });
      Object.defineProperty(globalThis, "Blob", { configurable: true, value: originalBlob });
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
    }
  });

  it("importBackup restaura 100% do estado de todos os stores via seletor de arquivo", async () => {
    // Monta um estado completo customizado
    const customRoutine = useRoutineStore.getState().adicionarRotina({
      titulo: "Rotina da Noite",
      icone: "🌙",
      horarioOuPeriodo: "21:30",
      passos: [{ title: "Desligar telas", estimatedMinutes: 10 }],
    });
    useRoutineStore.getState().startExecution(customRoutine.id);
    usePreferencesStore.setState({
      language: "es-ES",
      hapticsEnabled: true,
      reduceMotion: true,
      showNextStep: true,
      routineStepSoundEnabled: true,
      keepScreenAwakeOnRoutine: true,
    });
    useThemeStore.getState().setMode("light");
    useCheckInStore.getState().addEntry({
      socialBattery: 40,
      sensoryLoad: 4,
      physicalEnergy: 2,
      triggers: ["Luz fluorescente"],
    });
    useCopingCardsStore.getState().addCard({
      title: "Meu cartão",
      description: "Descrição",
      category: "custom",
      steps: ["Passo A"],
      isFavorite: true,
    });
    useCrisisStore.getState().addContact({
      name: "Contato Teste",
      phone: "+5511999990000",
      relationship: "Família",
    });

    const exportedJson = JSON.stringify(collectBackupPayload(new Date(2026, 10, 24, 15, 0, 0)));

    // Zera tudo para simular um dispositivo limpo
    await resetAllStores();
    expect(useThemeStore.getState().mode).toBe("dark");
    expect(usePreferencesStore.getState().language).toBe("pt-BR");
    expect(useCheckInStore.getState().entries).toHaveLength(0);
    expect(useCrisisStore.getState().contacts).toHaveLength(0);

    // Simula seleção do arquivo via DocumentPicker + leitura via FileSystem
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: "file:///cache/backup.json", name: "backup.json" }],
    });
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValueOnce(exportedJson);

    const result = await importBackup();

    expect(result.status).toBe("restored");
    expect(useThemeStore.getState().mode).toBe("light");
    expect(usePreferencesStore.getState()).toMatchObject({
      language: "es-ES",
      hapticsEnabled: true,
      reduceMotion: true,
      showNextStep: true,
      routineStepSoundEnabled: true,
      keepScreenAwakeOnRoutine: true,
    });
    expect(useRoutineStore.getState().getRoutineById(customRoutine.id)?.name).toBe("Rotina da Noite");
    expect(useRoutineStore.getState().execution?.routineId).toBe(customRoutine.id);
    expect(useCheckInStore.getState().entries).toHaveLength(1);
    expect(useCheckInStore.getState().entries[0].triggers).toEqual(["Luz fluorescente"]);
    expect(useCopingCardsStore.getState().cards.some((c) => c.title === "Meu cartão" && c.isFavorite)).toBe(true);
    expect(useCrisisStore.getState().contacts).toHaveLength(1);
    expect(useCrisisStore.getState().contacts[0].name).toBe("Contato Teste");
  });

  it("importBackup retorna cancelled quando o usuário fecha o seletor de arquivo", async () => {
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValueOnce({
      canceled: true,
      assets: null,
    });

    const result = await importBackup();
    expect(result).toEqual({ status: "cancelled" });
  });

  it("rejeita arquivos corrompidos, inválidos ou com schemaVersion incompatível com erros amigáveis", () => {
    expect(() => parseAndValidateBackup("{json-invalido")).toThrow(BackupError);
    try {
      parseAndValidateBackup("{json-invalido");
    } catch (error) {
      expect((error as BackupError).code).toBe("INVALID_JSON");
    }

    try {
      parseAndValidateBackup(JSON.stringify({ hello: "world" }));
    } catch (error) {
      expect((error as BackupError).code).toBe("INVALID_FORMAT");
    }

    const futurePayload = collectBackupPayload();
    futurePayload.schemaVersion = BACKUP_SCHEMA_VERSION + 1;
    try {
      parseAndValidateBackup(JSON.stringify(futurePayload));
    } catch (error) {
      expect((error as BackupError).code).toBe("INCOMPATIBLE_SCHEMA");
    }

    const brokenTheme = collectBackupPayload();
    (brokenTheme.data[BACKUP_STORAGE_KEYS.theme].state as { mode: string }).mode = "neon";
    try {
      parseAndValidateBackup(JSON.stringify(brokenTheme));
    } catch (error) {
      expect((error as BackupError).code).toBe("INVALID_DATA");
    }
  });

  it("faz rollback no AsyncStorage caso a gravação falhe durante a restauração", async () => {
    const payload = collectBackupPayload();
    payload.data[BACKUP_STORAGE_KEYS.theme].state.mode = "light";
    const previousTheme = JSON.stringify({ version: 1, state: { mode: "dark" } });
    await AsyncStorage.setItem(BACKUP_STORAGE_KEYS.theme, previousTheme);

    const multiSetSpy = jest.spyOn(AsyncStorage, "multiSet");
    multiSetSpy.mockClear();
    multiSetSpy.mockRejectedValueOnce(new Error("disk full"));

    await expect(restoreBackupPayload(payload)).rejects.toMatchObject({
      code: "STORAGE_ERROR",
    });

    // 1ª chamada falhou; 2ª chamada é o rollback restaurando o valor anterior
    expect(multiSetSpy).toHaveBeenCalledTimes(2);
    expect(await AsyncStorage.getItem(BACKUP_STORAGE_KEYS.theme)).toBe(previousTheme);
    expect(backupService.SCHEMA_VERSION).toBe(BACKUP_SCHEMA_VERSION);
    multiSetSpy.mockRestore();
  });
});
