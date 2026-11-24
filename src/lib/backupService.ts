import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";

import { ThemeMode } from "@/constants/theme";
import { isLanguage, Language } from "@/lib/i18n";
import { useCheckInStore } from "@/stores/checkInStore";
import { useCopingCardsStore } from "@/stores/copingCardsStore";
import { useCrisisStore } from "@/stores/crisisStore";
import { usePreferencesStore } from "@/stores/preferencesStore";
import { ROUTINE_STORAGE_KEY, useRoutineStore } from "@/stores/routineStore";
import { useThemeStore } from "@/stores/themeStore";
import { CheckInEntry } from "@/types/checkin";
import { CopingCard, CopingCardCategory } from "@/types/coping";
import { CrisisMessage, EmergencyContact } from "@/types/crisis";
import { Routine, RoutineExecutionState, RoutineStep } from "@/types/routine";

export const BACKUP_SCHEMA_VERSION = 1;

export const BACKUP_STORAGE_KEYS = {
  routines: ROUTINE_STORAGE_KEY,
  preferences: "preferences-storage",
  theme: "theme-storage",
  checkIns: "checkin-storage",
  copingCards: "coping-cards-storage",
  crisisCard: "crisis-card-storage",
} as const;

const ALL_STORAGE_KEYS = Object.values(BACKUP_STORAGE_KEYS);

const VALID_THEME_MODES: readonly ThemeMode[] = ["dark", "light", "auto"];
const VALID_COPING_CATEGORIES: readonly CopingCardCategory[] = [
  "grounding",
  "breathing",
  "custom",
];

export type BackupErrorCode =
  | "INVALID_JSON"
  | "INVALID_FORMAT"
  | "INCOMPATIBLE_SCHEMA"
  | "INVALID_DATA"
  | "STORAGE_ERROR"
  | "EXPORT_ERROR"
  | "PICK_ERROR";

export class BackupError extends Error {
  readonly code: BackupErrorCode;

  constructor(code: BackupErrorCode, message: string) {
    super(message);
    this.name = "BackupError";
    this.code = code;
  }
}

export interface PersistedStoreEnvelope<T> {
  version: number;
  state: T;
}

export interface RoutineBackupState {
  routines: Routine[];
  execution: RoutineExecutionState | null;
}

export interface PreferencesBackupState {
  language: Language;
  hapticsEnabled: boolean;
  reduceMotion: boolean;
  showNextStep: boolean;
  routineStepSoundEnabled: boolean;
  keepScreenAwakeOnRoutine: boolean;
  lastBackupAt?: number | null;
}

export interface ThemeBackupState {
  mode: ThemeMode;
}

export interface CheckInBackupState {
  entries: CheckInEntry[];
}

export interface CopingCardsBackupState {
  cards: CopingCard[];
}

export interface CrisisCardBackupState {
  messages: CrisisMessage[];
  contacts: EmergencyContact[];
  activeMessageId: string | null;
  primaryContactId: string | null;
}

export interface BackupDataMap {
  [BACKUP_STORAGE_KEYS.routines]: PersistedStoreEnvelope<RoutineBackupState>;
  [BACKUP_STORAGE_KEYS.preferences]: PersistedStoreEnvelope<PreferencesBackupState>;
  [BACKUP_STORAGE_KEYS.theme]: PersistedStoreEnvelope<ThemeBackupState>;
  [BACKUP_STORAGE_KEYS.checkIns]: PersistedStoreEnvelope<CheckInBackupState>;
  [BACKUP_STORAGE_KEYS.copingCards]: PersistedStoreEnvelope<CopingCardsBackupState>;
  [BACKUP_STORAGE_KEYS.crisisCard]: PersistedStoreEnvelope<CrisisCardBackupState>;
}

export interface BackupPayload {
  appVersion: string;
  exportDate: string;
  schemaVersion: number;
  data: BackupDataMap;
}

export interface ExportBackupResult {
  fileName: string;
  method: "native-share" | "web-share" | "web-download" | "file-saved";
  fileUri?: string;
  payload: BackupPayload;
}

export type ImportBackupResult =
  | { status: "restored"; payload: BackupPayload }
  | { status: "cancelled" };

export type PickedBackupResult =
  | { status: "selected"; rawJson: string; fileName?: string; payload: BackupPayload }
  | { status: "cancelled" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function isNullableFiniteNumber(value: unknown): value is number | null {
  return value === null || isFiniteNumber(value);
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * Gera o nome padronizado do arquivo de backup com a data local atual.
 * Exemplo: `tea-autonomia-backup-2026-11-24.json`
 */
export function buildBackupFileName(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  return `tea-autonomia-backup-${year}-${month}-${day}.json`;
}

/**
 * Coleta o snapshot completo de todos os stores locais e adiciona metadados.
 */
export function collectBackupPayload(now: Date = new Date()): BackupPayload {
  const routineState = useRoutineStore.getState();
  const preferencesState = usePreferencesStore.getState();
  const themeState = useThemeStore.getState();
  const checkInState = useCheckInStore.getState();
  const copingCardsState = useCopingCardsStore.getState();
  const crisisState = useCrisisStore.getState();

  return {
    appVersion: Constants.expoConfig?.version ?? "1.0.0",
    exportDate: now.toISOString(),
    schemaVersion: BACKUP_SCHEMA_VERSION,
    data: {
      [BACKUP_STORAGE_KEYS.routines]: {
        version: 3,
        state: {
          routines: routineState.routines.map((routine) => ({
            id: routine.id,
            name: routine.name,
            ...(routine.description !== undefined ? { description: routine.description } : {}),
            ...(routine.icon !== undefined ? { icon: routine.icon } : {}),
            ...(routine.schedule !== undefined ? { schedule: routine.schedule } : {}),
            createdAt: routine.createdAt,
            steps: routine.steps.map((step) => ({
              id: step.id,
              title: step.title,
              ...(step.description !== undefined ? { description: step.description } : {}),
              ...(step.icon !== undefined ? { icon: step.icon } : {}),
              estimatedMinutes: step.estimatedMinutes,
            })),
          })),
          execution: routineState.execution ? { ...routineState.execution } : null,
        },
      },
      [BACKUP_STORAGE_KEYS.preferences]: {
        version: 1,
        state: {
          language: preferencesState.language,
          hapticsEnabled: preferencesState.hapticsEnabled,
          reduceMotion: preferencesState.reduceMotion,
          showNextStep: preferencesState.showNextStep,
          routineStepSoundEnabled: preferencesState.routineStepSoundEnabled,
          keepScreenAwakeOnRoutine: preferencesState.keepScreenAwakeOnRoutine,
          lastBackupAt: preferencesState.lastBackupAt,
        },
      },
      [BACKUP_STORAGE_KEYS.theme]: {
        version: 1,
        state: {
          mode: themeState.mode,
        },
      },
      [BACKUP_STORAGE_KEYS.checkIns]: {
        version: 1,
        state: {
          entries: checkInState.entries.map((entry) => ({
            ...entry,
            triggers: [...entry.triggers],
          })),
        },
      },
      [BACKUP_STORAGE_KEYS.copingCards]: {
        version: 1,
        state: {
          cards: copingCardsState.cards.map((card) => ({
            ...card,
            steps: [...card.steps],
          })),
        },
      },
      [BACKUP_STORAGE_KEYS.crisisCard]: {
        version: 2,
        state: {
          messages: crisisState.messages.map((message) => ({ ...message })),
          contacts: crisisState.contacts.map((contact) => ({ ...contact })),
          activeMessageId: crisisState.activeMessageId,
          primaryContactId: crisisState.primaryContactId,
        },
      },
    },
  };
}

function validateEnvelope(
  data: Record<string, unknown>,
  key: string
): { version: number; state: Record<string, unknown> } {
  const raw = data[key];
  if (!isRecord(raw) || !isFiniteNumber(raw.version) || !isRecord(raw.state)) {
    throw new BackupError(
      "INVALID_DATA",
      "Os dados do backup estão incompletos ou corrompidos e não puderam ser restaurados."
    );
  }
  return { version: raw.version, state: raw.state };
}

function validateRoutineStep(step: unknown): RoutineStep {
  if (
    !isRecord(step) ||
    !isNonEmptyString(step.id) ||
    !isNonEmptyString(step.title) ||
    !isOptionalString(step.description) ||
    !isOptionalString(step.icon) ||
    !isFiniteNumber(step.estimatedMinutes) ||
    step.estimatedMinutes <= 0
  ) {
    throw new BackupError(
      "INVALID_DATA",
      "Os dados de rotinas no arquivo de backup estão inválidos."
    );
  }
  return {
    id: step.id,
    title: step.title,
    ...(step.description !== undefined ? { description: step.description } : {}),
    ...(step.icon !== undefined ? { icon: step.icon } : {}),
    estimatedMinutes: step.estimatedMinutes,
  };
}

function validateRoutinesState(rawState: Record<string, unknown>): RoutineBackupState {
  if (!Array.isArray(rawState.routines)) {
    throw new BackupError(
      "INVALID_DATA",
      "Os dados de rotinas no arquivo de backup estão inválidos."
    );
  }

  const routines: Routine[] = rawState.routines.map((item) => {
    if (
      !isRecord(item) ||
      !isNonEmptyString(item.id) ||
      !isNonEmptyString(item.name) ||
      !isOptionalString(item.description) ||
      !isOptionalString(item.icon) ||
      !isOptionalString(item.schedule) ||
      !isFiniteNumber(item.createdAt) ||
      !Array.isArray(item.steps)
    ) {
      throw new BackupError(
        "INVALID_DATA",
        "Os dados de rotinas no arquivo de backup estão inválidos."
      );
    }

    return {
      id: item.id,
      name: item.name,
      ...(item.description !== undefined ? { description: item.description } : {}),
      ...(item.icon !== undefined ? { icon: item.icon } : {}),
      ...(item.schedule !== undefined ? { schedule: item.schedule } : {}),
      createdAt: item.createdAt,
      steps: item.steps.map(validateRoutineStep),
    };
  });

  let execution: RoutineExecutionState | null = null;
  if (rawState.execution !== null && rawState.execution !== undefined) {
    const exec = rawState.execution;
    if (
      !isRecord(exec) ||
      !isNonEmptyString(exec.routineId) ||
      !isFiniteNumber(exec.currentStepIndex) ||
      !Number.isInteger(exec.currentStepIndex) ||
      exec.currentStepIndex < 0 ||
      typeof exec.isPaused !== "boolean" ||
      !isNullableFiniteNumber(exec.completedAt) ||
      !isNullableFiniteNumber(exec.stepStartedAt) ||
      !isNullableFiniteNumber(exec.stepEndsAt) ||
      !isNullableFiniteNumber(exec.pausedAt)
    ) {
      throw new BackupError(
        "INVALID_DATA",
        "O progresso da rotina no arquivo de backup está inválido."
      );
    }

    const targetRoutine = routines.find((r) => r.id === exec.routineId);
    if (targetRoutine && exec.currentStepIndex < targetRoutine.steps.length) {
      execution = {
        routineId: exec.routineId,
        currentStepIndex: exec.currentStepIndex,
        isPaused: exec.isPaused,
        completedAt: exec.completedAt,
        stepStartedAt: exec.stepStartedAt,
        stepEndsAt: exec.stepEndsAt,
        pausedAt: exec.pausedAt,
      };
    }
  }

  return { routines, execution };
}

function validateBooleanPreference(value: unknown, fallback = false): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") {
    throw new BackupError(
      "INVALID_DATA",
      "As preferências no arquivo de backup estão inválidas."
    );
  }
  return value;
}

function validatePreferencesState(
  rawState: Record<string, unknown>
): PreferencesBackupState {
  if (!isLanguage(rawState.language)) {
    throw new BackupError(
      "INVALID_DATA",
      "As preferências de idioma no arquivo de backup estão inválidas."
    );
  }

  const lastBackupAt =
    rawState.lastBackupAt === undefined || rawState.lastBackupAt === null
      ? null
      : isFiniteNumber(rawState.lastBackupAt)
        ? rawState.lastBackupAt
        : (() => {
            throw new BackupError(
              "INVALID_DATA",
              "As preferências no arquivo de backup estão inválidas."
            );
          })();

  return {
    language: rawState.language,
    hapticsEnabled: validateBooleanPreference(rawState.hapticsEnabled),
    reduceMotion: validateBooleanPreference(rawState.reduceMotion),
    showNextStep: validateBooleanPreference(rawState.showNextStep),
    routineStepSoundEnabled: validateBooleanPreference(
      rawState.routineStepSoundEnabled
    ),
    keepScreenAwakeOnRoutine: validateBooleanPreference(
      rawState.keepScreenAwakeOnRoutine
    ),
    lastBackupAt,
  };
}

function validateThemeState(rawState: Record<string, unknown>): ThemeBackupState {
  if (
    typeof rawState.mode !== "string" ||
    !VALID_THEME_MODES.includes(rawState.mode as ThemeMode)
  ) {
    throw new BackupError(
      "INVALID_DATA",
      "As configurações de tema no arquivo de backup estão inválidas."
    );
  }

  return { mode: rawState.mode as ThemeMode };
}

function validateCheckInState(rawState: Record<string, unknown>): CheckInBackupState {
  if (!Array.isArray(rawState.entries)) {
    throw new BackupError(
      "INVALID_DATA",
      "O histórico de check-ins no arquivo de backup está inválido."
    );
  }

  const entries: CheckInEntry[] = rawState.entries.map((entry) => {
    if (
      !isRecord(entry) ||
      !isNonEmptyString(entry.id) ||
      !isFiniteNumber(entry.timestamp) ||
      !isFiniteNumber(entry.socialBattery) ||
      entry.socialBattery < 0 ||
      entry.socialBattery > 100 ||
      !isFiniteNumber(entry.sensoryLoad) ||
      entry.sensoryLoad < 0 ||
      entry.sensoryLoad > 5 ||
      !isFiniteNumber(entry.physicalEnergy) ||
      entry.physicalEnergy < 0 ||
      entry.physicalEnergy > 5 ||
      !Array.isArray(entry.triggers) ||
      !entry.triggers.every((t) => typeof t === "string")
    ) {
      throw new BackupError(
        "INVALID_DATA",
        "O histórico de check-ins no arquivo de backup está inválido."
      );
    }

    return {
      id: entry.id,
      timestamp: entry.timestamp,
      socialBattery: entry.socialBattery,
      sensoryLoad: entry.sensoryLoad,
      physicalEnergy: entry.physicalEnergy,
      triggers: [...entry.triggers],
    };
  });

  return { entries };
}

function validateCopingCardsState(
  rawState: Record<string, unknown>
): CopingCardsBackupState {
  if (!Array.isArray(rawState.cards)) {
    throw new BackupError(
      "INVALID_DATA",
      "Os cartões de regulação no arquivo de backup estão inválidos."
    );
  }

  const cards: CopingCard[] = rawState.cards.map((card) => {
    if (
      !isRecord(card) ||
      !isNonEmptyString(card.id) ||
      !isNonEmptyString(card.title) ||
      typeof card.description !== "string" ||
      typeof card.category !== "string" ||
      !VALID_COPING_CATEGORIES.includes(card.category as CopingCardCategory) ||
      !Array.isArray(card.steps) ||
      !card.steps.every((s) => typeof s === "string") ||
      typeof card.isDefault !== "boolean" ||
      typeof card.isFavorite !== "boolean" ||
      !isFiniteNumber(card.createdAt)
    ) {
      throw new BackupError(
        "INVALID_DATA",
        "Os cartões de regulação no arquivo de backup estão inválidos."
      );
    }

    return {
      id: card.id,
      title: card.title,
      description: card.description,
      category: card.category as CopingCardCategory,
      steps: [...card.steps],
      isDefault: card.isDefault,
      isFavorite: card.isFavorite,
      createdAt: card.createdAt,
    };
  });

  return { cards };
}

function validateCrisisCardState(
  rawState: Record<string, unknown>
): CrisisCardBackupState {
  if (!Array.isArray(rawState.messages) || !Array.isArray(rawState.contacts)) {
    throw new BackupError(
      "INVALID_DATA",
      "Os dados do cartão de crise no arquivo de backup estão inválidos."
    );
  }

  const messages: CrisisMessage[] = rawState.messages.map((message) => {
    if (
      !isRecord(message) ||
      !isNonEmptyString(message.id) ||
      typeof message.title !== "string" ||
      typeof message.content !== "string" ||
      typeof message.isDefault !== "boolean" ||
      (message.hidden !== undefined && typeof message.hidden !== "boolean")
    ) {
      throw new BackupError(
        "INVALID_DATA",
        "As mensagens do cartão de crise no arquivo de backup estão inválidas."
      );
    }

    return {
      id: message.id,
      title: message.title,
      content: message.content,
      isDefault: message.isDefault,
      ...(message.hidden !== undefined ? { hidden: message.hidden } : {}),
    };
  });

  const contacts: EmergencyContact[] = rawState.contacts.map((contact) => {
    if (
      !isRecord(contact) ||
      !isNonEmptyString(contact.id) ||
      typeof contact.name !== "string" ||
      typeof contact.phone !== "string" ||
      typeof contact.relationship !== "string"
    ) {
      throw new BackupError(
        "INVALID_DATA",
        "Os contatos de apoio no arquivo de backup estão inválidos."
      );
    }

    return {
      id: contact.id,
      name: contact.name,
      phone: contact.phone,
      relationship: contact.relationship,
    };
  });

  if (
    rawState.activeMessageId !== null &&
    typeof rawState.activeMessageId !== "string"
  ) {
    throw new BackupError(
      "INVALID_DATA",
      "Os dados do cartão de crise no arquivo de backup estão inválidos."
    );
  }

  if (
    rawState.primaryContactId !== null &&
    typeof rawState.primaryContactId !== "string"
  ) {
    throw new BackupError(
      "INVALID_DATA",
      "Os dados do cartão de crise no arquivo de backup estão inválidos."
    );
  }

  const activeMessageId =
    rawState.activeMessageId &&
    messages.some((m) => m.id === rawState.activeMessageId && !m.hidden)
      ? rawState.activeMessageId
      : messages.find((m) => !m.hidden)?.id ?? null;

  const primaryContactId =
    rawState.primaryContactId &&
    contacts.some((c) => c.id === rawState.primaryContactId)
      ? rawState.primaryContactId
      : contacts[0]?.id ?? null;

  return {
    messages,
    contacts,
    activeMessageId,
    primaryContactId,
  };
}

/**
 * Faz o parse e valida a estrutura, versão de schema e integridade de um JSON de backup.
 */
export function parseAndValidateBackup(rawJson: string): BackupPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new BackupError(
      "INVALID_JSON",
      "O arquivo selecionado não é um JSON válido ou está corrompido."
    );
  }

  if (
    !isRecord(parsed) ||
    !isNonEmptyString(parsed.appVersion) ||
    !isNonEmptyString(parsed.exportDate) ||
    Number.isNaN(Date.parse(parsed.exportDate)) ||
    !isFiniteNumber(parsed.schemaVersion) ||
    !Number.isInteger(parsed.schemaVersion) ||
    parsed.schemaVersion < 1 ||
    !isRecord(parsed.data)
  ) {
    throw new BackupError(
      "INVALID_FORMAT",
      "Este arquivo não parece ser um backup válido do TEA Autonomia."
    );
  }

  if (parsed.schemaVersion > BACKUP_SCHEMA_VERSION) {
    throw new BackupError(
      "INCOMPATIBLE_SCHEMA",
      "Este backup foi criado por uma versão mais recente do aplicativo e não é compatível com esta versão."
    );
  }

  const routinesEnv = validateEnvelope(parsed.data, BACKUP_STORAGE_KEYS.routines);
  const preferencesEnv = validateEnvelope(
    parsed.data,
    BACKUP_STORAGE_KEYS.preferences
  );
  const themeEnv = validateEnvelope(parsed.data, BACKUP_STORAGE_KEYS.theme);
  const checkInsEnv = validateEnvelope(parsed.data, BACKUP_STORAGE_KEYS.checkIns);
  const copingCardsEnv = validateEnvelope(
    parsed.data,
    BACKUP_STORAGE_KEYS.copingCards
  );
  const crisisCardEnv = validateEnvelope(
    parsed.data,
    BACKUP_STORAGE_KEYS.crisisCard
  );

  return {
    appVersion: parsed.appVersion,
    exportDate: parsed.exportDate,
    schemaVersion: parsed.schemaVersion,
    data: {
      [BACKUP_STORAGE_KEYS.routines]: {
        version: 3,
        state: validateRoutinesState(routinesEnv.state),
      },
      [BACKUP_STORAGE_KEYS.preferences]: {
        version: 1,
        state: validatePreferencesState(preferencesEnv.state),
      },
      [BACKUP_STORAGE_KEYS.theme]: {
        version: 1,
        state: validateThemeState(themeEnv.state),
      },
      [BACKUP_STORAGE_KEYS.checkIns]: {
        version: 1,
        state: validateCheckInState(checkInsEnv.state),
      },
      [BACKUP_STORAGE_KEYS.copingCards]: {
        version: 1,
        state: validateCopingCardsState(copingCardsEnv.state),
      },
      [BACKUP_STORAGE_KEYS.crisisCard]: {
        version: 2,
        state: validateCrisisCardState(crisisCardEnv.state),
      },
    },
  };
}

async function exportOnWeb(
  json: string,
  fileName: string,
  payload: BackupPayload
): Promise<ExportBackupResult> {
  const nav =
    typeof navigator !== "undefined"
      ? (navigator as Navigator & {
          canShare?: (data?: ShareData) => boolean;
          share?: (data?: ShareData) => Promise<void>;
        })
      : undefined;

  // Tenta Web Share API com arquivos quando disponível no navegador
  if (
    nav &&
    typeof nav.share === "function" &&
    typeof nav.canShare === "function" &&
    typeof File === "function"
  ) {
    const file = new File([json], fileName, { type: "application/json" });
    if (nav.canShare({ files: [file] })) {
      try {
        await nav.share({
          files: [file],
          title: fileName,
        });
        return { fileName, method: "web-share", payload };
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return { fileName, method: "web-share", payload };
        }
        // Falha inesperada no compartilhamento web: cai para download direto
      }
    }
  }

  // Fallback: download direto do arquivo .json no navegador
  if (
    typeof document === "undefined" ||
    typeof Blob === "undefined" ||
    typeof URL === "undefined" ||
    typeof URL.createObjectURL !== "function"
  ) {
    throw new BackupError(
      "EXPORT_ERROR",
      "Não foi possível gerar o arquivo de backup neste navegador."
    );
  }

  const blob = new Blob([json], { type: "application/json" });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  link.style.display = "none";
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    document.body.removeChild(link);
    URL.revokeObjectURL(objectUrl);
  }

  return { fileName, method: "web-download", payload };
}

/**
 * Exporta todos os dados locais do app em um arquivo `.json` nomeado com a data atual.
 *
 * - Mobile (Android/iOS): grava o JSON em cache e abre o menu nativo de compartilhamento
 *   (`expo-sharing`) para o usuário salvar no Google Drive, iCloud, Arquivos, etc.
 * - Web: usa Web Share API com arquivos quando suportado; caso contrário, faz download direto.
 */
export async function exportBackup(
  now: Date = new Date()
): Promise<ExportBackupResult> {
  const payload = collectBackupPayload(now);
  const fileName = buildBackupFileName(now);
  const json = JSON.stringify(payload, null, 2);

  if (Platform.OS === "web") {
    const webResult = await exportOnWeb(json, fileName, payload);
    usePreferencesStore.getState().setLastBackupAt(now.getTime());
    return webResult;
  }

  const baseDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!baseDir) {
    throw new BackupError(
      "EXPORT_ERROR",
      "Não foi possível acessar o armazenamento temporário para gerar o backup."
    );
  }

  const fileUri = `${baseDir}${fileName}`;
  try {
    await FileSystem.writeAsStringAsync(fileUri, json, {
      encoding: FileSystem.EncodingType.UTF8,
    });
  } catch {
    throw new BackupError(
      "EXPORT_ERROR",
      "Não foi possível salvar o arquivo de backup no dispositivo."
    );
  }

  const canShare = await Sharing.isAvailableAsync().catch(() => false);
  if (canShare) {
    await Sharing.shareAsync(fileUri, {
      mimeType: "application/json",
      dialogTitle: fileName,
      UTI: "public.json",
    });
    usePreferencesStore.getState().setLastBackupAt(now.getTime());
    return { fileName, method: "native-share", fileUri, payload };
  }

  usePreferencesStore.getState().setLastBackupAt(now.getTime());
  return { fileName, method: "file-saved", fileUri, payload };
}

/**
 * Sobrescreve os dados locais de forma segura (com rollback em caso de erro de escrita)
 * e reidrata todos os stores Zustand em memória.
 */
export async function restoreBackupPayload(payload: BackupPayload): Promise<void> {
  const previousPairs = await AsyncStorage.multiGet(ALL_STORAGE_KEYS);
  const nextPairs: [string, string][] = ALL_STORAGE_KEYS.map((key) => [
    key,
    JSON.stringify(payload.data[key]),
  ]);

  try {
    await AsyncStorage.multiSet(nextPairs);
  } catch {
    // Tenta reverter o armazenamento local ao estado anterior
    const toRestore: [string, string][] = [];
    const toRemove: string[] = [];
    for (const [key, value] of previousPairs) {
      if (value === null) toRemove.push(key);
      else toRestore.push([key, value]);
    }
    if (toRestore.length > 0) {
      await AsyncStorage.multiSet(toRestore).catch(() => {});
    }
    if (toRemove.length > 0) {
      await AsyncStorage.multiRemove(toRemove).catch(() => {});
    }
    throw new BackupError(
      "STORAGE_ERROR",
      "Não foi possível salvar os dados restaurados no aparelho."
    );
  }

  // Recarrega todos os stores em memória a partir do AsyncStorage atualizado
  await Promise.all([
    useRoutineStore.persist.rehydrate(),
    usePreferencesStore.persist.rehydrate(),
    useThemeStore.persist.rehydrate(),
    useCheckInStore.persist.rehydrate(),
    useCopingCardsStore.persist.rehydrate(),
    useCrisisStore.persist.rehydrate(),
  ]);
}

async function pickBackupFile(): Promise<{ content: string; fileName?: string } | null> {
  let result: DocumentPicker.DocumentPickerResult;
  try {
    result = await DocumentPicker.getDocumentAsync({
      type: ["application/json", "text/plain", "*/*"],
      copyToCacheDirectory: true,
      multiple: false,
    });
  } catch {
    throw new BackupError(
      "PICK_ERROR",
      "Não foi possível abrir o seletor de arquivos."
    );
  }

  if (result.canceled || !result.assets || result.assets.length === 0) {
    return null;
  }

  const asset = result.assets[0];
  try {
    if (asset.file && typeof asset.file.text === "function") {
      return { content: await asset.file.text(), fileName: asset.name };
    }
    const content = await FileSystem.readAsStringAsync(asset.uri, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    return { content, fileName: asset.name };
  } catch {
    throw new BackupError(
      "PICK_ERROR",
      "Não foi possível ler o arquivo selecionado."
    );
  }
}

/**
 * Abre o seletor de arquivos, lê e valida o backup sem ainda sobrescrever os dados locais.
 * Útil para exibir confirmação ao usuário antes de chamar `importBackup(rawJson)`.
 */
export async function pickAndValidateBackup(): Promise<PickedBackupResult> {
  const picked = await pickBackupFile();
  if (!picked) {
    return { status: "cancelled" };
  }

  const payload = parseAndValidateBackup(picked.content);
  return {
    status: "selected",
    rawJson: picked.content,
    fileName: picked.fileName,
    payload,
  };
}

/**
 * Importa e restaura um backup a partir de uma string JSON (opcional) ou abrindo
 * o seletor de arquivos do sistema para que o usuário escolha um `.json`.
 */
export async function importBackup(
  rawJson?: string
): Promise<ImportBackupResult> {
  const content =
    rawJson !== undefined ? rawJson : (await pickBackupFile())?.content ?? null;
  if (content === null) {
    return { status: "cancelled" };
  }

  const payload = parseAndValidateBackup(content);
  await restoreBackupPayload(payload);
  return { status: "restored", payload };
}

export const backupService = {
  SCHEMA_VERSION: BACKUP_SCHEMA_VERSION,
  STORAGE_KEYS: BACKUP_STORAGE_KEYS,
  buildBackupFileName,
  collectBackupPayload,
  parseAndValidateBackup,
  pickAndValidateBackup,
  restoreBackupPayload,
  exportBackup,
  importBackup,
};
