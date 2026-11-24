import { LANGUAGES, type Language } from "@/lib/i18n";
import { useTranslation } from "@/hooks/useTranslation";
import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Linking,
  Switch,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, Link } from "expo-router";
import Constants from "expo-constants";
import { useThemeMode } from "@/hooks/useThemeMode";
import { useHapticFeedback } from "@/hooks/useHapticFeedback";
import { useFontScale } from "@/hooks/useFontScale";
import { ThemeColors } from "@/constants/theme";
import {
  BackupError,
  exportBackup,
  importBackup,
  pickAndValidateBackup,
} from "@/lib/backupService";

import { usePreferencesStore } from "@/stores/preferencesStore";

const DEVELOPER_EMAIL = "valdenorsa@proton.me";

function formatBackupDateTime(timestamp: number, language: Language): string {
  const date = new Date(timestamp);
  try {
    return date.toLocaleString(language, {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return date.toLocaleString();
  }
}

/**
 * SettingsScreen — Configurações do App
 *
 * Princípios:
 * - Uma opção por vez
 * - Descrições claras
 * - Sem sobrecarga de opções
 */
export default function SettingsScreen() {
  const { t } = useTranslation();
  const { mode, changeMode, colors } = useThemeMode();
  const { trigger } = useHapticFeedback();
  const { fontSize } = useFontScale();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const preferences = usePreferencesStore();
  const options = [
    { label: t("Vibração"), description: t("Permitir feedback por vibração nas interações."), value: preferences.hapticsEnabled, onChange: preferences.setHapticsEnabled },
    { label: t("Reduzir movimento"), description: t("Desativar transições e a expansão do círculo de respiração. A preferência do sistema também é respeitada."), value: preferences.reduceMotion, onChange: preferences.setReduceMotion },
    { label: t("Mostrar próximo passo"), description: t("Exibir Agora / Depois durante as rotinas."), value: preferences.showNextStep, onChange: preferences.setShowNextStep },
    { label: t("Som ao finalizar etapa"), description: t("Emitir um som breve ao término de cada etapa da rotina."), value: preferences.routineStepSoundEnabled, onChange: preferences.setRoutineStepSoundEnabled },
    { label: t("Manter tela ligada na rotina"), description: t("Impedir que a tela desligue enquanto uma rotina estiver em andamento."), value: preferences.keepScreenAwakeOnRoutine, onChange: preferences.setKeepScreenAwakeOnRoutine },
  ];

  const appVersion = Constants.expoConfig?.version ?? "1.0.0";

  const themeOptions: { key: typeof mode; label: string; description: string }[] = [
    { key: "dark", label: t("Escuro"), description: t("Reduz fadiga visual (recomendado)") },
    { key: "light", label: t("Claro"), description: t("Para ambientes bem iluminados") },
    { key: "auto", label: t("Automático"), description: t("Segue o tema do sistema") },
  ];

  const [backupBusy, setBackupBusy] = useState(false);
  const [backupFeedback, setBackupFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [pendingRestore, setPendingRestore] = useState<{
    rawJson: string;
    fileName?: string;
  } | null>(null);

  const handleExportBackup = async () => {
    if (backupBusy) return;
    setBackupBusy(true);
    setBackupFeedback(null);
    try {
      const result = await exportBackup();
      trigger("success");
      setBackupFeedback({
        type: "success",
        message: t("Backup concluído com sucesso ({0}).", result.fileName),
      });
    } catch (error) {
      const message =
        error instanceof BackupError
          ? error.message
          : t("Ocorreu um problema inesperado. Tente novamente ou volte ao início.");
      setBackupFeedback({ type: "error", message });
    } finally {
      setBackupBusy(false);
    }
  };

  const handleStartRestore = async () => {
    if (backupBusy) return;
    setBackupBusy(true);
    setBackupFeedback(null);
    try {
      const picked = await pickAndValidateBackup();
      if (picked.status === "selected") {
        setPendingRestore({
          rawJson: picked.rawJson,
          fileName: picked.fileName,
        });
      }
    } catch (error) {
      const message =
        error instanceof BackupError
          ? error.message
          : t("Ocorreu um problema inesperado. Tente novamente ou volte ao início.");
      setBackupFeedback({ type: "error", message });
    } finally {
      setBackupBusy(false);
    }
  };

  const handleConfirmRestore = async () => {
    if (!pendingRestore || backupBusy) return;
    const { rawJson } = pendingRestore;
    setPendingRestore(null);
    setBackupBusy(true);
    setBackupFeedback(null);
    try {
      await importBackup(rawJson);
      trigger("success");
      setBackupFeedback({
        type: "success",
        message: t("Backup restaurado com sucesso."),
      });
    } catch (error) {
      const message =
        error instanceof BackupError
          ? error.message
          : t("Ocorreu um problema inesperado. Tente novamente ou volte ao início.");
      setBackupFeedback({ type: "error", message });
    } finally {
      setBackupBusy(false);
    }
  };

  const handleContactDeveloper = () => {
    Linking.openURL(
      `mailto:${DEVELOPER_EMAIL}?subject=${encodeURIComponent(t("TEA Autonomia - Feedback"))}`
    ).catch(() => {
      // Sem app de e-mail disponível: nada a abrir (o botão não é crítico)
    });
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: t("Configurações"),
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
        }}
      />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <View style={styles.section} accessibilityRole="radiogroup">
          <Text accessibilityRole="header" style={[styles.sectionTitle, { fontSize: fontSize(20) }]}>
            {t("Idioma")}
          </Text>
          {LANGUAGES.map(({ code, label }) => {
            const selected = preferences.language === code;
            return (
              <Pressable
                key={code}
                style={[
                  styles.optionButton,
                  selected && { borderColor: colors.accent, backgroundColor: colors.accentSoft },
                ]}
                onPress={() => {
                  trigger("light");
                  preferences.setLanguage(code);
                }}
                accessibilityRole="radio"
                accessibilityLabel={label}
                accessibilityLanguage={code}
                accessibilityState={{ selected, checked: selected }}
              >
                <Text style={[styles.optionContent, styles.optionLabel, { fontSize: fontSize(16) }]}>
                  {label}
                </Text>
                {selected && <Text style={[styles.checkmark, { fontSize: fontSize(20) }]}>✓</Text>}
              </Pressable>
            );
          })}
        </View>

        {/* Tema */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { fontSize: fontSize(20) }]}>{t("Tema")}</Text>
          <Text style={[styles.sectionDescription, { fontSize: fontSize(14) }]}>{t("Escolha como o app aparece")}</Text>

          {themeOptions.map((option) => {
            const selected = mode === option.key;
            return (
              <Pressable
                key={option.key}
                style={[
                  styles.optionButton,
                  selected && { borderColor: colors.accent, backgroundColor: colors.accentSoft },
                ]}
                onPress={() => {
                  trigger("light");
                  changeMode(option.key);
                }}
                accessibilityRole="radio"
                accessibilityLabel={option.label}
                accessibilityHint={option.description}
                accessibilityState={{ selected }}
              >
                <View style={styles.optionContent}>
                  <Text style={[styles.optionLabel, { fontSize: fontSize(16) }]}>
                    {option.label}
                  </Text>
                  <Text style={[styles.optionDescription, { fontSize: fontSize(13) }]}>
                    {option.description}
                  </Text>
                </View>
                {selected && (
                  <Text style={[styles.checkmark, { fontSize: fontSize(20) }]}>✓</Text>
                )}
              </Pressable>
            );
          })}
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { fontSize: fontSize(20) }]}>{t("Preferências")}</Text>
          {options.map((option) => (
            <View key={option.label} style={styles.preferenceRow}>
              <View style={styles.optionContent}>
                <Text style={[styles.optionLabel, { fontSize: fontSize(16) }]}>{option.label}</Text>
                <Text style={[styles.optionDescription, { fontSize: fontSize(14) }]}>{option.description}</Text>
              </View>
              <Switch value={option.value} onValueChange={option.onChange} accessibilityLabel={option.label} accessibilityHint={option.description} />
            </View>
          ))}
        </View>
        <Link href="/crisis-settings" asChild>
          <Pressable style={styles.optionButton} accessibilityRole="button" accessibilityLabel={t("Configurar cartão de comunicação")}>
            <Text style={[styles.optionLabel, { fontSize: fontSize(16) }]}>{t("Configurar cartão de comunicação")}</Text>
          </Pressable>
        </Link>

        {/* Backup e Restauração */}
        <View style={styles.section}>
          <Text accessibilityRole="header" style={[styles.sectionTitle, { fontSize: fontSize(20) }]}>
            {t("Backup e Restauração")}
          </Text>
          <Text style={[styles.sectionDescription, { fontSize: fontSize(14) }]}>
            {t("Salve uma cópia local ou na nuvem das suas rotinas, preferências, cartões e histórico, ou restaure um arquivo .json.")}
          </Text>
          <Text style={[styles.backupMetaText, { fontSize: fontSize(13) }]}>
            {preferences.lastBackupAt !== null
              ? t("Último backup: {0}", formatBackupDateTime(preferences.lastBackupAt, preferences.language))
              : t("Nenhum backup realizado ainda.")}
          </Text>

          {backupFeedback && (
            <View
              style={[
                styles.feedbackBanner,
                backupFeedback.type === "error"
                  ? styles.feedbackBannerError
                  : styles.feedbackBannerSuccess,
              ]}
              accessibilityRole={backupFeedback.type === "error" ? "alert" : "text"}
              accessibilityLiveRegion="polite"
            >
              <Text
                style={[
                  styles.feedbackText,
                  backupFeedback.type === "error"
                    ? styles.feedbackTextError
                    : styles.feedbackTextSuccess,
                  { fontSize: fontSize(14) },
                ]}
              >
                {backupFeedback.message}
              </Text>
            </View>
          )}

          <Pressable
            style={[styles.backupPrimaryButton, backupBusy && styles.buttonDisabled]}
            onPress={handleExportBackup}
            disabled={backupBusy}
            accessibilityRole="button"
            accessibilityLabel={t("Fazer Backup (Salvar na Nuvem / Arquivo)")}
            accessibilityHint={t("Gera um arquivo .json com todos os dados do aplicativo para salvar no aparelho ou na nuvem")}
            accessibilityState={{ disabled: backupBusy }}
          >
            <Text style={[styles.backupPrimaryButtonText, { fontSize: fontSize(15) }]}>
              {t("Fazer Backup (Salvar na Nuvem / Arquivo)")}
            </Text>
          </Pressable>

          <Pressable
            style={[styles.backupSecondaryButton, backupBusy && styles.buttonDisabled]}
            onPress={handleStartRestore}
            disabled={backupBusy}
            accessibilityRole="button"
            accessibilityLabel={t("Restaurar Backup")}
            accessibilityHint={t("Abre o seletor de arquivos para importar um backup .json e substituir os dados atuais")}
            accessibilityState={{ disabled: backupBusy }}
          >
            <Text style={[styles.backupSecondaryButtonText, { fontSize: fontSize(15) }]}>
              {t("Restaurar Backup")}
            </Text>
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text accessibilityRole="header" style={[styles.sectionTitle, { fontSize: fontSize(20) }]}>
            {t("Privacidade")}
          </Text>
          <Text style={[styles.sectionDescription, { fontSize: fontSize(14) }]}>
            {t("O app salva check-ins, rotinas, cartões, contatos de apoio e preferências no aparelho. O desenvolvedor não recebe esses registros pelo app. O app solicita ao Android que exclua seus dados de backups e transferências entre aparelhos.")}
          </Text>
          <Text style={[styles.sectionDescription, { fontSize: fontSize(14) }]}>
            {t("Para apagar registros, use o Histórico de Check-ins e as configurações do Cartão de Crise. Para apagar todos os dados locais, limpe o armazenamento do app nas configurações do Android.")}
          </Text>
          <Text style={[styles.sectionDescription, { fontSize: fontSize(14) }]}>
            {t("Ao abrir o telefone ou o SMS pelo cartão, o app passa o número e, no caso do SMS, o texto do cartão ao aplicativo escolhido. Você decide se quer ligar ou enviar. Dúvidas sobre privacidade: {0}.", DEVELOPER_EMAIL)}
          </Text>
        </View>

        {/* Sobre */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { fontSize: fontSize(20) }]}>{t("Sobre")}</Text>
          <Text style={[styles.aboutText, { fontSize: fontSize(14) }]}>
            TEA Autonomia v{appVersion}
            {"\n"}
            {t("App para autonomia e regulação de adultos no Espectro Autista.")}
          </Text>
        </View>

        {/* Desenvolvedor */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { fontSize: fontSize(20) }]}>{t("Desenvolvedor")}</Text>
          <Text style={[styles.developerName, { fontSize: fontSize(14) }]}>Valdenor Tavares</Text>
          <Text style={[styles.developerEmail, { fontSize: fontSize(13) }]}>
            {DEVELOPER_EMAIL}
          </Text>
          <Pressable
            style={[styles.contactButton, { backgroundColor: colors.accent }]}
            onPress={handleContactDeveloper}
            accessibilityRole="button"
            accessibilityLabel={t("Enviar e-mail ao desenvolvedor")}
            accessibilityHint={t("Abre seu aplicativo de e-mail")}
          >
            <Text style={[styles.contactButtonText, { fontSize: fontSize(14) }]}>{t("Enviar e-mail")}</Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* Modal de confirmação para restaurar backup */}
      <Modal
        visible={pendingRestore !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPendingRestore(null)}
      >
        <View style={styles.modalOverlay} accessibilityViewIsModal>
          <View style={styles.modalCard}>
            <Text style={[styles.modalTitle, { fontSize: fontSize(20) }]}>
              {t("Confirmar restauração do backup")}
            </Text>
            <Text style={[styles.modalMessage, { fontSize: fontSize(15) }]}>
              {t("Os dados atuais do aplicativo serão substituídos pelos dados do arquivo selecionado. Deseja continuar?")}
            </Text>
            {pendingRestore?.fileName ? (
              <Text style={[styles.modalFileName, { fontSize: fontSize(13) }]}>
                {t("Arquivo: {0}", pendingRestore.fileName)}
              </Text>
            ) : null}
            <View style={styles.modalActions}>
              <Pressable
                style={styles.modalCancelButton}
                onPress={() => setPendingRestore(null)}
                accessibilityRole="button"
                accessibilityLabel={t("Cancelar")}
              >
                <Text style={[styles.modalCancelText, { fontSize: fontSize(15) }]}>
                  {t("Cancelar")}
                </Text>
              </Pressable>
              <Pressable
                style={styles.modalConfirmButton}
                onPress={handleConfirmRestore}
                accessibilityRole="button"
                accessibilityLabel={t("Confirmar substituição dos dados")}
              >
                <Text style={[styles.modalConfirmText, { fontSize: fontSize(15) }]}>
                  {t("Substituir dados")}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    scrollView: {
      flex: 1,
    },
    content: {
      padding: 24,
      gap: 24,
      paddingBottom: 80, // Espaço para o EmergencyFab
    },
    section: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 20,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 12,
    },
    sectionTitle: {
      color: colors.text,
      fontWeight: "600",
    },
    sectionDescription: {
      color: colors.textMuted,
      marginBottom: 8,
    },
    optionButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      padding: 16,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      marginBottom: 8,
    },
    preferenceRow: { flexDirection: "row", alignItems: "center", gap: 12 },
    optionContent: {
      flex: 1,
    },
    optionLabel: {
      color: colors.text,
      fontWeight: "600",
    },
    optionDescription: {
      color: colors.textMuted,
      marginTop: 2,
    },
    checkmark: {
      color: colors.accent,
      fontWeight: "700",
    },
    aboutText: {
      color: colors.textSecondary,
      lineHeight: 20,
    },
    developerName: {
      color: colors.text,
      fontWeight: "600",
    },
    developerEmail: {
      color: colors.accent,
    },
    contactButton: {
      paddingVertical: 12,
      paddingHorizontal: 24,
      borderRadius: 8,
      alignItems: "center",
      marginTop: 8,
    },
    contactButtonText: {
      color: colors.accentText,
      fontWeight: "600",
    },
    backupMetaText: {
      color: colors.textSecondary,
    },
    feedbackBanner: {
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 8,
      borderWidth: 1,
    },
    feedbackBannerSuccess: {
      backgroundColor: colors.surfaceAlt,
      borderColor: colors.success,
    },
    feedbackBannerError: {
      backgroundColor: colors.warmSurface,
      borderColor: colors.warm,
    },
    feedbackText: {
      lineHeight: 20,
    },
    feedbackTextSuccess: {
      color: colors.success,
      fontWeight: "500",
    },
    feedbackTextError: {
      color: colors.warm,
      fontWeight: "500",
    },
    backupPrimaryButton: {
      backgroundColor: colors.accent,
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderRadius: 8,
      alignItems: "center",
    },
    backupPrimaryButtonText: {
      color: colors.accentText,
      fontWeight: "600",
      textAlign: "center",
    },
    backupSecondaryButton: {
      backgroundColor: colors.surfaceAlt,
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderRadius: 8,
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.borderStrong,
    },
    backupSecondaryButtonText: {
      color: colors.text,
      fontWeight: "600",
      textAlign: "center",
    },
    buttonDisabled: {
      opacity: 0.6,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: colors.shadow,
      justifyContent: "center",
      alignItems: "center",
      padding: 24,
    },
    modalCard: {
      width: "100%",
      maxWidth: 400,
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 24,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 16,
    },
    modalTitle: {
      color: colors.text,
      fontWeight: "600",
    },
    modalMessage: {
      color: colors.textSecondary,
      lineHeight: 22,
    },
    modalFileName: {
      color: colors.textMuted,
    },
    modalActions: {
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: 12,
      marginTop: 4,
    },
    modalCancelButton: {
      paddingVertical: 12,
      paddingHorizontal: 18,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceAlt,
    },
    modalCancelText: {
      color: colors.textSecondary,
      fontWeight: "500",
    },
    modalConfirmButton: {
      paddingVertical: 12,
      paddingHorizontal: 18,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.warm,
      backgroundColor: colors.warmSurface,
    },
    modalConfirmText: {
      color: colors.warm,
      fontWeight: "600",
    },
  });