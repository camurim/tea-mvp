import { localizeRoutine } from "@/lib/localizedContent";
import { useTranslation } from "@/hooks/useTranslation";
import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Alert,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { useRoutineStore } from "@/stores/routineStore";
import { useFontScale } from "@/hooks/useFontScale";
import { useThemeMode } from "@/hooks/useThemeMode";
import { ThemeColors } from "@/constants/theme";

/**
 * RoutinesListScreen — Listagem, edição, criação e exclusão de rotinas
 *
 * Permite visualizar todas as rotinas, criar novas, editar e excluir
 * qualquer rotina com confirmação segura.
 */
export default function RoutinesListScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { fontSize } = useFontScale();
  const { colors } = useThemeMode();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const routines = useRoutineStore((state) => state.routines);
  const execution = useRoutineStore((state) => state.execution);
  const startExecution = useRoutineStore((state) => state.startExecution);
  const excluirRotina = useRoutineStore((state) => state.excluirRotina);
  const restaurarRotinasPadrao = useRoutineStore((state) => state.restaurarRotinasPadrao);

  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);
  const [confirmRestoreVisible, setConfirmRestoreVisible] = useState(false);

  const handleStartRoutine = (routineId: string) => {
    const current = useRoutineStore.getState().execution;
    if (current && current.completedAt === null && current.routineId !== routineId) {
      Alert.alert(
        t("Substituir rotina em andamento?"),
        t("O progresso da rotina atual será encerrado para iniciar a outra."),
        [
          { text: t("Cancelar"), style: "cancel" },
          {
            text: t("Substituir"),
            style: "destructive",
            onPress: () => {
              if (startExecution(routineId, true)) router.push("/routine-execution");
            },
          },
        ]
      );
      return;
    }
    // Reopening a saved execution preserves the current step and paused timer.
    if (execution?.routineId === routineId || startExecution(routineId)) {
      router.push("/routine-execution");
    }
  };

  const handleConfirmDelete = () => {
    if (!pendingDelete) return;
    excluirRotina(pendingDelete.id);
    setPendingDelete(null);
  };

  const handleConfirmRestore = () => {
    restaurarRotinasPadrao();
    setConfirmRestoreVisible(false);
  };

  const localizedRoutines = useMemo(
    () => routines.map((routine) => localizeRoutine(routine, t)),
    [routines, t]
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: t("Minhas Rotinas"),
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
        }}
      />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <Pressable
          style={styles.newButton}
          onPress={() => router.push("/routines/new")}
          accessibilityRole="button"
          accessibilityLabel={t("Criar nova rotina")}
          accessibilityHint={t("Abre o formulário para montar uma rotina passo a passo")}
        >
          <Text style={[styles.newButtonText, { fontSize: fontSize(16) }]}>
            {t("+ Nova Rotina")}
          </Text>
        </Pressable>

        {localizedRoutines.length === 0 ? (
          <View style={styles.emptyStateCard}>
            <Text style={[styles.emptyStateIcon, { fontSize: fontSize(36) }]} accessibilityElementsHidden>
              📋
            </Text>
            <Text style={[styles.emptyStateTitle, { fontSize: fontSize(20) }]}>
              {t("Você ainda não tem rotinas")}
            </Text>
            <Text style={[styles.emptyStateDescription, { fontSize: fontSize(15) }]}>
              {t("Crie sua primeira rotina passo a passo para organizar o dia com mais previsibilidade.")}
            </Text>
            <Pressable
              style={styles.emptyStateButton}
              onPress={() => router.push("/routines/new")}
              accessibilityRole="button"
              accessibilityLabel={t("Criar primeira rotina")}
            >
              <Text style={[styles.emptyStateButtonText, { fontSize: fontSize(16) }]}>
                {t("Criar primeira rotina")}
              </Text>
            </Pressable>
          </View>
        ) : (
          localizedRoutines.map((routine) => (
            <View key={routine.id} style={styles.routineCard}>
              <View style={styles.cardHeader}>
                <View style={styles.cardTitleRow}>
                  {routine.icon ? (
                    <Text
                      style={[styles.routineIcon, { fontSize: fontSize(22) }]}
                      accessibilityElementsHidden
                    >
                      {routine.icon}
                    </Text>
                  ) : null}
                  <Text style={[styles.routineName, { fontSize: fontSize(20) }]}>
                    {routine.name}
                  </Text>
                </View>

                {routine.schedule ? (
                  <View style={styles.scheduleBadge}>
                    <Text style={[styles.scheduleText, { fontSize: fontSize(12) }]}>
                      {routine.schedule}
                    </Text>
                  </View>
                ) : null}
              </View>

              {routine.description ? (
                <Text style={[styles.routineDescription, { fontSize: fontSize(14) }]}>
                  {routine.description}
                </Text>
              ) : null}

              <View style={styles.stepsPreview}>
                {routine.steps.slice(0, 3).map((step, index) => (
                  <Text key={step.id} style={[styles.stepText, { fontSize: fontSize(14) }]}>
                    {index + 1}. {step.icon ? `${step.icon} ` : ""}
                    {step.title}
                  </Text>
                ))}
                {routine.steps.length > 3 && (
                  <Text style={[styles.moreSteps, { fontSize: fontSize(12) }]}>
                    {t(
                      routine.steps.length === 4 ? "+{0} passo" : "+{0} passos",
                      routine.steps.length - 3
                    )}
                  </Text>
                )}
              </View>

              <Pressable
                style={styles.startButton}
                onPress={() => handleStartRoutine(routine.id)}
                accessibilityRole="button"
                accessibilityLabel={
                  execution?.routineId === routine.id
                    ? t("Continuar rotina {0}", routine.name)
                    : t("Iniciar rotina {0}", routine.name)
                }
                accessibilityHint={t("Começa a execução passo a passo desta rotina")}
              >
                <Text style={[styles.startButtonText, { fontSize: fontSize(16) }]}>
                  {execution?.routineId === routine.id ? t("Voltar à rotina") : t("Iniciar Rotina")}
                </Text>
              </Pressable>

              <View style={styles.manageRow}>
                <Pressable
                  style={styles.manageButton}
                  onPress={() => router.push(`/routines/new?id=${routine.id}`)}
                  accessibilityRole="button"
                  accessibilityLabel={t("Editar rotina {0}", routine.name)}
                >
                  <Text style={[styles.manageButtonText, { fontSize: fontSize(14) }]}>
                    {t("Editar")}
                  </Text>
                </Pressable>
                <Pressable
                  style={styles.deleteButton}
                  onPress={() => setPendingDelete({ id: routine.id, name: routine.name })}
                  accessibilityRole="button"
                  accessibilityLabel={t("Excluir rotina {0}", routine.name)}
                  accessibilityHint={t("Abre uma confirmação antes de excluir esta rotina")}
                >
                  <Text style={[styles.manageButtonTextDelete, { fontSize: fontSize(14) }]}>
                    🗑️ {t("Excluir")}
                  </Text>
                </Pressable>
              </View>
            </View>
          ))
        )}

        {/* Botão discreto para restaurar rotinas padrão sem apagar as atuais */}
        <Pressable
          style={styles.resetButton}
          onPress={() => setConfirmRestoreVisible(true)}
          accessibilityRole="button"
          accessibilityLabel={t("Restaurar rotinas padrão")}
          accessibilityHint={t("Readiciona as rotinas padrão que estiverem faltando, mantendo suas rotinas atuais")}
        >
          <Text style={[styles.resetButtonText, { fontSize: fontSize(14) }]}>
            {t("Restaurar rotinas padrão")}
          </Text>
        </Pressable>
      </ScrollView>

      {/* Modal de confirmação para restaurar rotinas padrão */}
      <Modal
        visible={confirmRestoreVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmRestoreVisible(false)}
      >
        <View style={styles.modalOverlay} accessibilityViewIsModal>
          <View style={styles.modalCard}>
            <Text style={[styles.modalTitle, { fontSize: fontSize(20) }]}>
              {t("Restaurar rotinas padrão")}
            </Text>
            <Text style={[styles.modalMessage, { fontSize: fontSize(15) }]}>
              {t("As rotinas padrão que foram excluídas serão adicionadas novamente à sua lista, sem apagar suas rotinas atuais.")}
            </Text>
            <View style={styles.modalActions}>
              <Pressable
                style={styles.modalCancelButton}
                onPress={() => setConfirmRestoreVisible(false)}
                accessibilityRole="button"
                accessibilityLabel={t("Cancelar")}
              >
                <Text style={[styles.modalCancelText, { fontSize: fontSize(15) }]}>
                  {t("Cancelar")}
                </Text>
              </Pressable>
              <Pressable
                style={styles.modalRestoreButton}
                onPress={handleConfirmRestore}
                accessibilityRole="button"
                accessibilityLabel={t("Confirmar restauração")}
              >
                <Text style={[styles.modalRestoreText, { fontSize: fontSize(15) }]}>
                  {t("Restaurar")}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal de confirmação para exclusão segura */}
      <Modal
        visible={pendingDelete !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPendingDelete(null)}
      >
        <View style={styles.modalOverlay} accessibilityViewIsModal>
          <View style={styles.modalCard}>
            <Text style={[styles.modalTitle, { fontSize: fontSize(20) }]}>
              {t("Excluir rotina")}
            </Text>
            <Text style={[styles.modalMessage, { fontSize: fontSize(15) }]}>
              {pendingDelete
                ? t("Tem certeza que deseja excluir a rotina \"{0}\"?", pendingDelete.name)
                : ""}
            </Text>
            <View style={styles.modalActions}>
              <Pressable
                style={styles.modalCancelButton}
                onPress={() => setPendingDelete(null)}
                accessibilityRole="button"
                accessibilityLabel={t("Cancelar")}
              >
                <Text style={[styles.modalCancelText, { fontSize: fontSize(15) }]}>
                  {t("Cancelar")}
                </Text>
              </Pressable>
              <Pressable
                style={styles.modalConfirmButton}
                onPress={handleConfirmDelete}
                accessibilityRole="button"
                accessibilityLabel={t("Confirmar exclusão")}
              >
                <Text style={[styles.modalConfirmText, { fontSize: fontSize(15) }]}>
                  {t("Excluir")}
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
      gap: 16,
      paddingBottom: 80, // Espaço para o EmergencyFab
    },
    newButton: {
      backgroundColor: colors.accent,
      borderRadius: 10,
      paddingVertical: 16,
      paddingHorizontal: 20,
      alignItems: "center",
    },
    newButtonText: {
      color: colors.accentText,
      fontWeight: "600",
    },
    emptyStateCard: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 28,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      gap: 12,
    },
    emptyStateIcon: {
      marginBottom: 4,
    },
    emptyStateTitle: {
      color: colors.text,
      fontWeight: "600",
      textAlign: "center",
    },
    emptyStateDescription: {
      color: colors.textSecondary,
      textAlign: "center",
      lineHeight: 22,
    },
    emptyStateButton: {
      backgroundColor: colors.accentSoft,
      borderWidth: 1,
      borderColor: colors.accent,
      borderRadius: 8,
      paddingVertical: 12,
      paddingHorizontal: 20,
      marginTop: 8,
    },
    emptyStateButtonText: {
      color: colors.accent,
      fontWeight: "600",
    },
    routineCard: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 20,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 12,
    },
    cardHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 12,
    },
    cardTitleRow: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    routineIcon: {
      lineHeight: 28,
    },
    routineName: {
      flex: 1,
      color: colors.text,
      fontWeight: "600",
    },
    scheduleBadge: {
      backgroundColor: colors.accentSoft,
      borderRadius: 12,
      paddingVertical: 4,
      paddingHorizontal: 10,
    },
    scheduleText: {
      color: colors.accent,
      fontWeight: "600",
    },
    routineDescription: {
      color: colors.textMuted,
    },
    stepsPreview: {
      gap: 4,
    },
    stepText: {
      color: colors.textSecondary,
    },
    moreSteps: {
      color: colors.textMuted,
      fontStyle: "italic",
    },
    startButton: {
      backgroundColor: colors.accent,
      paddingVertical: 14,
      borderRadius: 8,
      alignItems: "center",
      marginTop: 4,
    },
    startButtonText: {
      color: colors.accentText,
      fontWeight: "600",
    },
    manageRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 12,
      paddingTop: 4,
      borderTopWidth: 1,
      borderTopColor: colors.borderSubtle,
    },
    manageButton: {
      paddingVertical: 8,
      paddingHorizontal: 12,
    },
    deleteButton: {
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 8,
    },
    manageButtonText: {
      color: colors.accent,
      fontWeight: "500",
    },
    manageButtonTextDelete: {
      color: colors.warm,
      fontWeight: "500",
    },
    resetButton: {
      backgroundColor: "transparent",
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 8,
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.border,
      marginTop: 8,
    },
    resetButtonText: {
      color: colors.textMuted,
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
    modalRestoreButton: {
      paddingVertical: 12,
      paddingHorizontal: 18,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.accent,
      backgroundColor: colors.accentSoft,
    },
    modalRestoreText: {
      color: colors.accent,
      fontWeight: "600",
    },
  });
