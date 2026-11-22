import { useTranslation } from "@/hooks/useTranslation";
import React, { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useRoutineStore } from "@/stores/routineStore";
import { RoutineStep } from "@/types/routine";
import { useFontScale } from "@/hooks/useFontScale";
import { useThemeMode } from "@/hooks/useThemeMode";
import { ThemeColors } from "@/constants/theme";
import { createId } from "@/lib/id";

const MINUTES_OPTIONS = [1, 2, 3, 5, 10, 15, 20, 30];
const ROUTINE_ICONS = ["🌅", "☀️", "🌙", "💼", "🏠", "🚶", "🧘", "🍽️", "📚", "🎧"];
const STEP_ICONS = ["✅", "💧", "🧹", "📋", "🎧", "🔕", "🚶", "🛏️"];
const PERIOD_PRESETS = ["Manhã", "Tarde", "Noite"] as const;

/**
 * NovaRotinaScreen — Criação e edição de rotina
 *
 * Com `?id=<routineId>` a mesma tela edita uma rotina existente.
 * Permite definir nome, ícone, horário/período, descrição e uma lista
 * dinâmica de passos com ícone, tempo estimado, remoção e reordenação.
 */
export default function NovaRotinaScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { fontSize } = useFontScale();
  const { colors } = useThemeMode();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const adicionarRotina = useRoutineStore((state) => state.adicionarRotina);
  const updateRoutine = useRoutineStore((state) => state.updateRoutine);
  const existingRoutine = useRoutineStore((state) =>
    id ? state.getRoutineById(id) : undefined
  );

  const isEditing = Boolean(id && existingRoutine);

  const [name, setName] = useState(existingRoutine?.name ?? "");
  const [description, setDescription] = useState(existingRoutine?.description ?? "");
  const [icon, setIcon] = useState(existingRoutine?.icon ?? "");
  const [schedule, setSchedule] = useState(existingRoutine?.schedule ?? "");
  const [steps, setSteps] = useState<RoutineStep[]>(
    existingRoutine?.steps ?? [
      { id: createId("step"), title: "", description: "", estimatedMinutes: 5 },
    ]
  );
  const [formError, setFormError] = useState<string | null>(null);

  // A store é hidratada de forma assíncrona: em deep link ou abertura fria o
  // primeiro render não encontra a rotina. Ressincroniza quando ela chega
  // (ou quando o id editado muda), para não exibir um formulário vazio.
  useEffect(() => {
    if (!existingRoutine) return;
    setName(existingRoutine.name);
    setDescription(existingRoutine.description ?? "");
    setIcon(existingRoutine.icon ?? "");
    setSchedule(existingRoutine.schedule ?? "");
    setSteps(existingRoutine.steps);
    setFormError(null);
    // Ressincroniza apenas quando o id editado muda (ou a store hidrata)
    // para não sobrescrever o que o usuário já digitou.
  }, [existingRoutine?.id]);

  const handleAddStep = () => {
    setSteps((prev) => [
      ...prev,
      { id: createId("step"), title: "", description: "", estimatedMinutes: 5 },
    ]);
  };

  const handleRemoveStep = (index: number) => {
    setSteps((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  };

  const handleMoveStep = (index: number, direction: -1 | 1) => {
    setSteps((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      return next;
    });
  };

  const handleUpdateStep = (index: number, updates: Partial<RoutineStep>) => {
    setSteps((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...updates };
      return next;
    });
  };

  const handleSave = () => {
    const validSteps = steps
      .filter((s) => s.title.trim() !== "")
      .map((s) => ({
        ...s,
        title: s.title.trim(),
        ...(s.description?.trim() ? { description: s.description.trim() } : { description: undefined }),
        ...(s.icon?.trim() ? { icon: s.icon.trim() } : { icon: undefined }),
      }));
    if (!name.trim() || validSteps.length === 0) {
      setFormError(t("Preencha o nome e pelo menos um passo com título para salvar."));
      return;
    }
    setFormError(null);

    if (isEditing && existingRoutine) {
      updateRoutine(existingRoutine.id, {
        name: name.trim(),
        description: description.trim() || undefined,
        icon: icon.trim() || undefined,
        schedule: schedule.trim() || undefined,
        steps: validSteps,
      });
    } else {
      adicionarRotina({
        titulo: name.trim(),
        descricao: description.trim() || undefined,
        icone: icon.trim() || undefined,
        horarioOuPeriodo: schedule.trim() || undefined,
        passos: validSteps,
      });
    }

    router.back();
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: isEditing ? t("Editar Rotina") : t("Nova Rotina"),
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerBackTitle: t("Voltar"),
        }}
      />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Nome */}
        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { fontSize: fontSize(20) }]}>{t("Nome da rotina")}</Text>
          <TextInput
            style={[styles.input, { fontSize: fontSize(16) }]}
            placeholder={t("Ex: Hora de Dormir")}
            placeholderTextColor={colors.placeholder}
            value={name}
            onChangeText={(text) => {
              setName(text);
              setFormError(null);
            }}
            accessibilityLabel={t("Nome da rotina")}
          />
        </View>

        {/* Ícone da rotina */}
        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { fontSize: fontSize(16) }]}>
            {t("Ícone (opcional)")}
          </Text>
          <View style={styles.chipsWrap}>
            {ROUTINE_ICONS.map((emoji) => {
              const selected = icon === emoji;
              return (
                <Pressable
                  key={emoji}
                  style={[styles.iconChip, selected && styles.iconChipActive]}
                  onPress={() => setIcon(selected ? "" : emoji)}
                  accessibilityRole="radio"
                  accessibilityLabel={t("Ícone {0}", emoji)}
                  accessibilityState={{ selected }}
                >
                  <Text style={{ fontSize: fontSize(20) }}>{emoji}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Horário ou período */}
        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { fontSize: fontSize(16) }]}>
            {t("Horário ou período (opcional)")}
          </Text>
          <View style={styles.chipsWrap}>
            {PERIOD_PRESETS.map((period) => {
              const localizedPeriod = t(period);
              const selected = schedule === localizedPeriod;
              return (
                <Pressable
                  key={period}
                  style={[styles.periodChip, selected && styles.periodChipActive]}
                  onPress={() => setSchedule(selected ? "" : localizedPeriod)}
                  accessibilityRole="radio"
                  accessibilityLabel={localizedPeriod}
                  accessibilityState={{ selected }}
                >
                  <Text
                    style={[
                      styles.periodChipText,
                      selected && styles.periodChipTextActive,
                      { fontSize: fontSize(14) },
                    ]}
                  >
                    {localizedPeriod}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <TextInput
            style={[styles.input, { fontSize: fontSize(16) }]}
            placeholder={t("Ex: 21:00 ou Noite")}
            placeholderTextColor={colors.placeholder}
            value={schedule}
            onChangeText={setSchedule}
            accessibilityLabel={t("Horário ou período (opcional)")}
          />
        </View>

        {/* Descrição */}
        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { fontSize: fontSize(16) }]}>
            {t("Descrição (opcional)")}
          </Text>
          <TextInput
            style={[styles.input, styles.textArea, { fontSize: fontSize(16) }]}
            placeholder={t("Por que esta rotina é importante?")}
            placeholderTextColor={colors.placeholder}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
            accessibilityLabel={t("Descrição da rotina (opcional)")}
          />
        </View>

        {/* Passos */}
        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { fontSize: fontSize(20) }]}>{t("Passos")}</Text>
          {steps.map((step, index) => (
            <View key={step.id} style={styles.stepCard}>
              <View style={styles.stepHeader}>
                <Text style={[styles.stepNumber, { fontSize: fontSize(14) }]}>
                  {t("Passo {0}", index + 1)}
                </Text>
                <View style={styles.stepControls}>
                  {steps.length > 1 && (
                    <>
                      <Pressable
                        style={[styles.orderButton, index === 0 && styles.orderButtonDisabled]}
                        onPress={() => handleMoveStep(index, -1)}
                        disabled={index === 0}
                        accessibilityRole="button"
                        accessibilityLabel={t("Mover passo {0} para cima", index + 1)}
                        accessibilityState={{ disabled: index === 0 }}
                      >
                        <Text style={[styles.orderButtonText, { fontSize: fontSize(16) }]}>↑</Text>
                      </Pressable>
                      <Pressable
                        style={[
                          styles.orderButton,
                          index === steps.length - 1 && styles.orderButtonDisabled,
                        ]}
                        onPress={() => handleMoveStep(index, 1)}
                        disabled={index === steps.length - 1}
                        accessibilityRole="button"
                        accessibilityLabel={t("Mover passo {0} para baixo", index + 1)}
                        accessibilityState={{ disabled: index === steps.length - 1 }}
                      >
                        <Text style={[styles.orderButtonText, { fontSize: fontSize(16) }]}>↓</Text>
                      </Pressable>
                      <Pressable
                        style={styles.removeStepButton}
                        onPress={() => handleRemoveStep(index)}
                        accessibilityRole="button"
                        accessibilityLabel={t("Remover passo {0}", index + 1)}
                      >
                        <Text style={[styles.removeStepText, { fontSize: fontSize(18) }]}>×</Text>
                      </Pressable>
                    </>
                  )}
                </View>
              </View>

              <TextInput
                style={[styles.input, { fontSize: fontSize(16) }]}
                placeholder={t("Título do passo")}
                placeholderTextColor={colors.placeholder}
                value={step.title}
                onChangeText={(title) => handleUpdateStep(index, { title })}
                accessibilityLabel={t("Título do passo {0}", index + 1)}
              />

              <TextInput
                style={[styles.input, styles.textArea, { fontSize: fontSize(16) }]}
                placeholder={t("Descrição opcional")}
                placeholderTextColor={colors.placeholder}
                value={step.description}
                onChangeText={(stepDescription) =>
                  handleUpdateStep(index, { description: stepDescription })
                }
                multiline
                numberOfLines={2}
                accessibilityLabel={t("Descrição do passo {0} (opcional)", index + 1)}
              />

              {/* Ícone opcional do passo */}
              <View style={styles.minutesRow}>
                <Text style={[styles.minutesLabel, { fontSize: fontSize(14) }]}>
                  {t("Ícone do passo (opcional):")}
                </Text>
                <View style={styles.chipsWrap}>
                  {STEP_ICONS.map((emoji) => {
                    const selected = step.icon === emoji;
                    return (
                      <Pressable
                        key={emoji}
                        style={[styles.stepIconChip, selected && styles.iconChipActive]}
                        onPress={() =>
                          handleUpdateStep(index, { icon: selected ? undefined : emoji })
                        }
                        accessibilityRole="radio"
                        accessibilityLabel={t("Ícone {0} para o passo {1}", emoji, index + 1)}
                        accessibilityState={{ selected }}
                      >
                        <Text style={{ fontSize: fontSize(16) }}>{emoji}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={styles.minutesRow}>
                <Text style={[styles.minutesLabel, { fontSize: fontSize(14) }]}>
                  {t("Minutos estimados:")}
                </Text>
                <View style={styles.minutesButtons}>
                  {MINUTES_OPTIONS.map((m) => (
                    <Pressable
                      key={m}
                      style={[
                        styles.minutesChip,
                        step.estimatedMinutes === m && styles.minutesChipActive,
                      ]}
                      onPress={() => handleUpdateStep(index, { estimatedMinutes: m })}
                      accessibilityRole="radio"
                      accessibilityLabel={t(m === 1 ? "{0} minuto" : "{0} minutos", m)}
                      accessibilityState={{ selected: step.estimatedMinutes === m }}
                    >
                      <Text
                        style={[
                          styles.minutesChipText,
                          step.estimatedMinutes === m && styles.minutesChipTextActive,
                          { fontSize: fontSize(14) },
                        ]}
                      >
                        {m}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>
          ))}
          <Pressable
            style={styles.addStepButton}
            onPress={handleAddStep}
            accessibilityRole="button"
            accessibilityLabel={t("Adicionar passo à rotina")}
          >
            <Text style={[styles.addStepText, { fontSize: fontSize(16) }]}>
              {t("Adicionar passo")}
            </Text>
          </Pressable>
        </View>

        {/* Salvar */}
        {formError && (
          <Text
            style={styles.formError}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
          >
            {formError}
          </Text>
        )}
        <Pressable
          style={styles.saveButton}
          onPress={handleSave}
          accessibilityRole="button"
          accessibilityLabel={isEditing ? t("Salvar alterações da rotina") : t("Criar rotina")}
        >
          <Text style={[styles.saveButtonText, { fontSize: fontSize(18) }]}>
            {isEditing ? t("Salvar Rotina") : t("Criar Rotina")}
          </Text>
        </Pressable>
      </ScrollView>
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
    field: {
      gap: 12,
    },
    fieldLabel: {
      color: colors.text,
      fontWeight: "600",
    },
    formError: {
      color: colors.warm,
      lineHeight: 20,
    },
    input: {
      backgroundColor: colors.input,
      borderRadius: 8,
      padding: 12,
      color: colors.text,
      borderWidth: 1,
      borderColor: colors.border,
    },
    textArea: {
      minHeight: 60,
      textAlignVertical: "top",
    },
    chipsWrap: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    iconChip: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      minWidth: 44,
      minHeight: 44,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 8,
    },
    stepIconChip: {
      backgroundColor: colors.input,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      minWidth: 38,
      minHeight: 38,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 6,
    },
    iconChipActive: {
      backgroundColor: colors.accentSoft,
      borderColor: colors.accent,
      borderWidth: 2,
    },
    periodChip: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      paddingVertical: 8,
      paddingHorizontal: 14,
    },
    periodChipActive: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    periodChipText: {
      color: colors.textSecondary,
      fontWeight: "500",
    },
    periodChipTextActive: {
      color: colors.accentText,
    },
    stepCard: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 12,
    },
    stepHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    stepNumber: {
      color: colors.textMuted,
      fontWeight: "600",
    },
    stepControls: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    orderButton: {
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: 6,
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1,
      borderColor: colors.border,
    },
    orderButtonDisabled: {
      opacity: 0.35,
    },
    orderButtonText: {
      color: colors.textSecondary,
      fontWeight: "600",
    },
    removeStepButton: {
      paddingVertical: 6,
      paddingHorizontal: 10,
    },
    removeStepText: {
      color: colors.warm,
    },
    minutesRow: {
      gap: 8,
    },
    minutesLabel: {
      color: colors.textMuted,
    },
    minutesButtons: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
    },
    minutesChip: {
      backgroundColor: colors.input,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      minWidth: 44,
      alignItems: "center",
    },
    minutesChipActive: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    minutesChipText: {
      color: colors.textSecondary,
    },
    minutesChipTextActive: {
      color: colors.accentText,
    },
    addStepButton: {
      backgroundColor: "transparent",
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      padding: 14,
      alignItems: "center",
      marginTop: 4,
    },
    addStepText: {
      color: colors.accent,
      fontWeight: "600",
    },
    saveButton: {
      backgroundColor: colors.accent,
      paddingVertical: 18,
      borderRadius: 8,
      alignItems: "center",
    },
    saveButtonText: {
      color: colors.accentText,
      fontWeight: "600",
    },
  });
